package expo.modules.capoar

import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Mapa de profundidad de ARCore de un cuadro (milímetros por píxel, miles de puntos), con lo necesario para convertirlo
 * después en puntos 3D: está alineado con la textura de la cámara, así que se usan los intrínsecos de la textura
 * escalados al tamaño del mapa (igual que en el ejemplo oficial «raw depth» de ARCore).
 */
internal class Profundidad(
  val mm: ShortArray, val w: Int, val h: Int,
  val fx: Float, val fy: Float, val cx: Float, val cy: Float,
  /** Imagen del sensor normalizada → textura normalizada: los puntos (0,0), (1,0) y (0,1) ya transformados. */
  private val aTextura: FloatArray
) {
  /** Píxeles con una distancia utilizable. */
  val validos: Int = mm.count { (it.toInt() and 0xFFFF) in MIN_MM..MAX_MM }

  /** De coordenadas normalizadas de la imagen del sensor a píxeles de este mapa. */
  fun aPixel(u: Float, v: Float): Pair<Float, Float> {
    val tu = aTextura[0] + u * (aTextura[2] - aTextura[0]) + v * (aTextura[4] - aTextura[0])
    val tv = aTextura[1] + u * (aTextura[3] - aTextura[1]) + v * (aTextura[5] - aTextura[1])
    return Pair(tu * w, tv * h)
  }

  /**
   * Rayo de la cámara por el píxel (x, y), con z = -1 (la cámara mira hacia -Z, +X derecha, +Y arriba).
   * Multiplicado por la profundidad (que ARCore entrega a lo largo del eje óptico) da el punto 3D.
   */
  fun rayo(x: Float, y: Float): FloatArray = floatArrayOf((x - cx) / fx, (cy - y) / fy, -1f)

  companion object {
    const val MIN_MM = 150
    const val MAX_MM = 8000

    /** Copia el mapa de profundidad del cuadro. null si aún no está disponible (ARCore necesita algo de movimiento). */
    fun leer(frame: Frame): Profundidad? {
      val img = try { frame.acquireDepthImage16Bits() } catch (e: Exception) { return null }
      try {
        val w = img.width
        val h = img.height
        val plano = img.planes[0]
        val buf = plano.buffer.order(ByteOrder.nativeOrder())
        val filas = plano.rowStride
        val paso = plano.pixelStride
        val mm = ShortArray(w * h)
        for (y in 0 until h) for (x in 0 until w) mm[y * w + x] = buf.getShort(y * filas + x * paso)
        val intr = frame.camera.textureIntrinsics
        val dims = intr.imageDimensions
        val f = intr.focalLength
        val c = intr.principalPoint
        val sx = w.toFloat() / dims[0]
        val sy = h.toFloat() / dims[1]
        val destino = FloatArray(6)
        frame.transformCoordinates2d(
          Coordinates2d.IMAGE_NORMALIZED, floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f), Coordinates2d.TEXTURE_NORMALIZED, destino
        )
        return Profundidad(mm, w, h, f[0] * sx, f[1] * sy, c[0] * sx, c[1] * sy, destino)
      } catch (e: Exception) {
        return null
      } finally {
        img.close()
      }
    }
  }
}

/** Resultado de ubicar las esquinas con el mapa de profundidad. Los puntos están en el sistema de la cámara. */
internal class AnclajeDenso(
  val esquinas: List<FloatArray>,
  /** «plano»: la superficie es plana y las esquinas van sobre ese plano. «relieve»: cada esquina con su profundidad local. */
  val metodo: String,
  val puntos: Int, // puntos de profundidad usados
  val fraccionPlano: Float, // parte de los puntos que cae sobre el plano dominante
  val rms: Float, // m: dispersión de esos puntos respecto del plano
  val mediana: Float, // m: distancia mediana
  val normal: FloatArray? // normal del plano, apuntando hacia la cámara
)

internal object AnclajePorProfundidad {
  private const val MAX_PUNTOS = 16000
  private const val MIN_PUNTOS = 30
  private const val FRACCION_PLANA = 0.75f // sobre esto, la escena se trata como plana (una foto, una pantalla)
  private const val ITERACIONES = 120
  private const val MIN_LOCALES = 8

  private class Plano(val n: FloatArray, val d: Float, val fraccion: Float, val rms: Float)

  /** xs, ys: esquinas del polígono en píxeles del mapa de profundidad. */
  fun calcular(p: Profundidad, xs: FloatArray, ys: FloatArray): AnclajeDenso? {
    val paso = max(1, ceil(sqrt(p.w * p.h / MAX_PUNTOS.toFloat())).toInt())
    // Solo lo que cae DENTRO del polígono: fuera está el piso o el fondo, mucho más lejos.
    var pts = recolectar(p, paso) { x, y -> enPoligono(x, y, xs, ys) }
    if (pts.size < MIN_PUNTOS) pts = recolectar(p, paso) { _, _ -> true }
    if (pts.size < MIN_PUNTOS) return null

    val zs = FloatArray(pts.size) { -pts[it][2] }.also { it.sort() }
    val mediana = zs[zs.size / 2]
    val plano = ajustarPlano(pts, max(0.012f, 0.025f * mediana))
    val plana = plano != null && plano.fraccion >= FRACCION_PLANA
    val radio = 0.15f * max(p.w, p.h)

    val esquinas = ArrayList<FloatArray>(xs.size)
    for (k in xs.indices) {
      val dir = p.rayo(xs[k], ys[k])
      // Profundidad si la esquina está sobre el plano: corte del rayo con el plano n·P = d.
      val enPlano = plano?.let {
        val den = it.n[0] * dir[0] + it.n[1] * dir[1] + it.n[2] * dir[2]
        if (abs(den) > 1e-6f) it.d / den else null
      }?.takeIf { it > 0.4f * mediana && it < 2.5f * mediana }
      val local = medianaLocal(pts, xs[k], ys[k], radio)
      val t = if (plana) (enPlano ?: local ?: mediana) else (local ?: enPlano ?: mediana)
      esquinas.add(floatArrayOf(dir[0] * t, dir[1] * t, dir[2] * t))
    }
    return AnclajeDenso(
      esquinas, if (plana) "plano" else "relieve", pts.size, plano?.fraccion ?: 0f, plano?.rms ?: 0f, mediana, plano?.n
    )
  }

  /** Puntos 3D (x, y, z de cámara) + su píxel (px, py), de los píxeles con profundidad válida que cumplen `filtro`. */
  private inline fun recolectar(p: Profundidad, paso: Int, filtro: (Float, Float) -> Boolean): ArrayList<FloatArray> {
    val pts = ArrayList<FloatArray>()
    var y = 0
    while (y < p.h) {
      var x = 0
      while (x < p.w) {
        val mm = p.mm[y * p.w + x].toInt() and 0xFFFF
        val px = x + 0.5f
        val py = y + 0.5f
        if (mm in Profundidad.MIN_MM..Profundidad.MAX_MM && filtro(px, py)) {
          val z = mm / 1000f
          val dir = p.rayo(px, py)
          pts.add(floatArrayOf(dir[0] * z, dir[1] * z, -z, px, py))
        }
        x += paso
      }
      y += paso
    }
    return pts
  }

  /** Plano dominante por RANSAC y reajuste por mínimos cuadrados sobre los puntos que lo apoyan. */
  private fun ajustarPlano(pts: List<FloatArray>, umbral: Float): Plano? {
    val azar = Random(7)
    var mejor: FloatArray? = null
    var mejorD = 0f
    var mejorCuenta = 0
    repeat(ITERACIONES) {
      val a = pts[azar.nextInt(pts.size)]
      val b = pts[azar.nextInt(pts.size)]
      val c = pts[azar.nextInt(pts.size)]
      val ux = b[0] - a[0]; val uy = b[1] - a[1]; val uz = b[2] - a[2]
      val vx = c[0] - a[0]; val vy = c[1] - a[1]; val vz = c[2] - a[2]
      var nx = uy * vz - uz * vy
      var ny = uz * vx - ux * vz
      var nz = ux * vy - uy * vx
      val norma = sqrt(nx * nx + ny * ny + nz * nz)
      if (norma < 1e-7f) return@repeat
      nx /= norma; ny /= norma; nz /= norma
      val d = nx * a[0] + ny * a[1] + nz * a[2]
      var cuenta = 0
      for (q in pts) if (abs(nx * q[0] + ny * q[1] + nz * q[2] - d) < umbral) cuenta++
      if (cuenta > mejorCuenta) { mejorCuenta = cuenta; mejor = floatArrayOf(nx, ny, nz); mejorD = d }
    }
    var n = mejor ?: return null
    var d = mejorD
    // Reajuste: z = a·x + b·y + c sobre los puntos de apoyo (ecuaciones normales 3×3, regla de Cramer).
    var sxx = 0.0; var sxy = 0.0; var sx = 0.0; var syy = 0.0; var sy = 0.0
    var sxz = 0.0; var syz = 0.0; var sz = 0.0
    var m = 0
    for (q in pts) {
      if (abs(n[0] * q[0] + n[1] * q[1] + n[2] * q[2] - d) >= umbral) continue
      val x = q[0].toDouble(); val y = q[1].toDouble(); val z = q[2].toDouble()
      sxx += x * x; sxy += x * y; sx += x; syy += y * y; sy += y
      sxz += x * z; syz += y * z; sz += z
      m++
    }
    if (m < 3) return null
    val det = sxx * (syy * m - sy * sy) - sxy * (sxy * m - sy * sx) + sx * (sxy * sy - syy * sx)
    if (abs(det) > 1e-12) {
      val a = (sxz * (syy * m - sy * sy) - sxy * (syz * m - sy * sz) + sx * (syz * sy - syy * sz)) / det
      val b = (sxx * (syz * m - sy * sz) - sxz * (sxy * m - sy * sx) + sx * (sxy * sz - syz * sx)) / det
      val c = (sxx * (syy * sz - sy * syz) - sxy * (sxy * sz - sx * syz) + sxz * (sxy * sy - syy * sx)) / det
      // a·x + b·y − z + c = 0  →  n = (a, b, −1)/L, d = −c/L
      val largo = sqrt(a * a + b * b + 1.0)
      n = floatArrayOf((a / largo).toFloat(), (b / largo).toFloat(), (-1.0 / largo).toFloat())
      d = (-c / largo).toFloat()
    }
    if (n[2] < 0f) { n = floatArrayOf(-n[0], -n[1], -n[2]); d = -d } // normal hacia la cámara (+Z)
    var suma = 0.0
    var apoyo = 0
    for (q in pts) {
      val e = n[0] * q[0] + n[1] * q[1] + n[2] * q[2] - d
      if (abs(e) < umbral) { suma += (e * e).toDouble(); apoyo++ }
    }
    if (apoyo < 3) return null
    return Plano(n, d, apoyo.toFloat() / pts.size, sqrt(suma / apoyo).toFloat())
  }

  /** Profundidad mediana de los puntos a menos de `radio` píxeles de (x, y); null si hay muy pocos. */
  private fun medianaLocal(pts: List<FloatArray>, x: Float, y: Float, radio: Float): Float? {
    val cerca = ArrayList<Float>()
    val r2 = radio * radio
    for (q in pts) {
      val dx = q[3] - x
      val dy = q[4] - y
      if (dx * dx + dy * dy <= r2) cerca.add(-q[2])
    }
    if (cerca.size < MIN_LOCALES) return null
    cerca.sort()
    return cerca[cerca.size / 2]
  }

  /** ¿El punto (x, y) cae dentro del polígono? (regla par-impar) */
  fun enPoligono(x: Float, y: Float, xs: FloatArray, ys: FloatArray): Boolean {
    var dentro = false
    var j = xs.size - 1
    for (i in xs.indices) {
      if ((ys[i] > y) != (ys[j] > y) && x < (xs[j] - xs[i]) * (y - ys[i]) / (ys[j] - ys[i]) + xs[i]) dentro = !dentro
      j = i
    }
    return dentro
  }
}
