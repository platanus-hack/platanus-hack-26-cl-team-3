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

  /** De un píxel de este mapa a coordenadas normalizadas de la imagen del sensor (inversa de [aPixel]). */
  fun aImagen(x: Float, y: Float): Pair<Float, Float> {
    val a11 = aTextura[2] - aTextura[0]
    val a12 = aTextura[4] - aTextura[0]
    val a21 = aTextura[3] - aTextura[1]
    val a22 = aTextura[5] - aTextura[1]
    val det = a11 * a22 - a12 * a21
    val du = x / w - aTextura[0]
    val dv = y / h - aTextura[1]
    return Pair((a22 * du - a12 * dv) / det, (-a21 * du + a11 * dv) / det)
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

/** Plano n·P = d en el sistema de la cámara, con la normal apuntando hacia la cámara. */
internal class PlanoAjustado(val n: FloatArray, val d: Float, val fraccion: Float, val rms: Float)

internal data class DepthRegistration(val points: List<FloatArray>, val method: String)

/**
 * Superficie medida con el mapa de profundidad dentro del contorno. Entrega el punto 3D (sistema de la cámara) que
 * corresponde a cualquier píxel del mapa: sirve para las esquinas del contorno y para registrar el mapa de piezas.
 */
internal class AnclajeDenso(
  private val p: Profundidad,
  private val pts: List<FloatArray>,
  private val plano: PlanoAjustado?,
  private val plana: Boolean,
  val insideBay: Boolean,
  val mediana: Float, // m: distancia mediana
  private val radio: Float
) {
  /** «plano»: superficie plana, los puntos van sobre el plano ajustado. «relieve»: profundidad local de cada zona. */
  val metodo: String get() = if (plana) "plano" else "relieve"
  val puntos: Int get() = pts.size // puntos de profundidad usados
  val fraccionPlano: Float get() = plano?.fraccion ?: 0f // parte de los puntos sobre el plano dominante
  val rms: Float get() = plano?.rms ?: 0f // m: dispersión respecto del plano
  val normal: FloatArray? get() = plano?.n

  fun punto(x: Float, y: Float): FloatArray {
    val dir = p.rayo(x, y)
    val enPlano = planeDepth(dir)
    val t = enPlano.takeIf { plana } ?: medianaLocal(x, y, radio * radio) ?: enPlano ?: mediana
    return floatArrayOf(dir[0] * t, dir[1] * t, dir[2] * t)
  }

  private fun planeDepth(ray: FloatArray): Float? =
    plano?.let {
      val den = it.n[0] * ray[0] + it.n[1] * ray[1] + it.n[2] * ray[2]
      if (abs(den) > 1e-6f) it.d / den else null
    }?.takeIf { it > 0.4f * mediana && it < 2.5f * mediana }

  /** The engine mesh needs measured depth near every corner, without floor or background fallbacks. */
  fun registrationPoints(corners: List<Pair<Float, Float>>): DepthRegistration? {
    if (!insideBay || corners.size != 4) return null
    val radiiSquared = cornerSupportRadiiSquared(corners, 0.065f * max(p.w, p.h))
    val localDepths = corners.mapIndexed { index, (x, y) ->
      medianaLocal(x, y, radiiSquared[index]) ?: return null
    }
    val rays = corners.map { (x, y) -> p.rayo(x, y) }
    val planeDepths = if (plana) {
      rays.mapIndexedNotNull { index, ray ->
        val measured = localDepths[index]
        planeDepth(ray)?.takeIf { abs(it - measured) <= max(0.03f, 0.035f * measured) }
      }.takeIf { it.size == corners.size }
    } else null
    val distances = planeDepths ?: localDepths
    val points = rays.mapIndexed { index, ray ->
      val distance = distances[index]
      floatArrayOf(ray[0] * distance, ray[1] * distance, ray[2] * distance)
    }
    return DepthRegistration(points, if (planeDepths != null) "plano" else "relieve")
  }

  /** Median optical depth within the given squared pixel radius, or null with too few samples. */
  private fun medianaLocal(x: Float, y: Float, radiusSquared: Float): Float? {
    val cerca = ArrayList<Float>()
    for (q in pts) {
      val dx = q[3] - x
      val dy = q[4] - y
      if (dx * dx + dy * dy <= radiusSquared) cerca.add(-q[2])
    }
    if (cerca.size < MIN_LOCALES) return null
    cerca.sort()
    return cerca[cerca.size / 2]
  }

  companion object {
    private const val MIN_LOCALES = 8
    const val MIN_REGISTRATION_POINTS = 4 * MIN_LOCALES
  }
}

internal object AnclajePorProfundidad {
  private const val MAX_PUNTOS = 16000
  private const val MIN_PUNTOS = 30
  private const val FRACCION_PLANA = 0.75f // sobre esto, la escena se trata como plana (una foto, una pantalla)
  private const val ITERACIONES = 120

  /** xs, ys: esquinas del polígono en píxeles del mapa de profundidad. null si hay muy pocos puntos con profundidad. */
  fun calcular(p: Profundidad, xs: FloatArray, ys: FloatArray): AnclajeDenso? {
    val paso = max(1, ceil(sqrt(p.w * p.h / MAX_PUNTOS.toFloat())).toInt())
    // Solo lo que cae DENTRO del polígono: fuera está el piso o el fondo, mucho más lejos.
    var pts = recolectar(p, paso) { x, y -> enPoligono(x, y, xs, ys) }
    val insideBay = pts.size >= MIN_PUNTOS
    if (!insideBay) pts = recolectar(p, paso) { _, _ -> true }
    if (pts.size < MIN_PUNTOS) return null

    val zs = FloatArray(pts.size) { -pts[it][2] }.also { it.sort() }
    val mediana = zs[zs.size / 2]
    val plano = ajustarPlano(pts, max(0.012f, 0.025f * mediana))
    val plana = plano != null && plano.fraccion >= FRACCION_PLANA
    return AnclajeDenso(p, pts, plano, plana, insideBay, mediana, 0.15f * max(p.w, p.h))
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
  fun ajustarPlano(pts: List<FloatArray>, umbral: Float): PlanoAjustado? {
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
    return PlanoAjustado(n, d, apoyo.toFloat() / pts.size, sqrt(suma / apoyo).toFloat())
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
