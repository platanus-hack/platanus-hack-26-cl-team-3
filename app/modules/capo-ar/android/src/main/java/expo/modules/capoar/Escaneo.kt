package expo.modules.capoar

import com.google.ar.core.Pose
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Escaneo del vano: junta lo que el modelo ve desde VARIAS posiciones en un solo mapa del vano en el mundo real.
 *
 * Cada cuadro aporta sus puntos de profundidad (miles), ya ubicados en el mundo con la pose del teléfono, y la
 * respuesta del modelo para cada uno («vano» o «no vano»). Los puntos se proyectan sobre el plano del vano (fijado
 * con el primer cuadro) y votan en una grilla de N×N celdas. Así:
 *  - el vano se puede armar completo aunque en ningún cuadro quepa entero (lo normal al estar parado frente al auto);
 *  - un error del modelo en un cuadro se diluye entre los demás;
 *  - lo que está lejos del plano (el piso, 80 cm más abajo) no entra, aunque el modelo lo marque.
 */
internal class Escaneo {
  private var origen: FloatArray? = null
  private var eu = FloatArray(3) // eje X de la grilla (sobre el plano), en el mundo
  private var ev = FloatArray(3) // eje Y de la grilla
  private var en = FloatArray(3) // normal del plano
  private val vistos = IntArray(N * N)
  private val vano = IntArray(N * N)
  private val vistosCuadro = IntArray(N * N)
  private val vanoCuadro = IntArray(N * N)

  /** Cuadros acumulados. */
  var vistas = 0
    private set

  fun reiniciar() {
    origen = null
    vistos.fill(0)
    vano.fill(0)
    vistas = 0
  }

  /**
   * Suma un cuadro. `mascara`: N×N caracteres '0'/'1' (fila por fila) con la respuesta del modelo sobre el recorte
   * (rx, ry, lado) de la imagen derecha. Devuelve false si el cuadro no sirvió (pocos puntos, o sin vano para fijar el plano).
   */
  fun acumular(pose: Pose, p: Profundidad, grados: Int, mascara: String, rx: Float, ry: Float, lado: Float): Boolean {
    if (mascara.length != N * N || lado <= 0f) return false
    val paso = max(1, ceil(sqrt(p.w * p.h / MAX_PUNTOS.toFloat())).toInt())
    val puntos = ArrayList<FloatArray>() // x, y, z en cámara + 1 si el modelo dijo «vano»
    var y = 0
    while (y < p.h) {
      var x = 0
      while (x < p.w) {
        val mm = p.mm[y * p.w + x].toInt() and 0xFFFF
        if (mm in Profundidad.MIN_MM..Profundidad.MAX_MM) {
          val px = x + 0.5f
          val py = y + 0.5f
          val (u, v) = p.aImagen(px, py)
          val (gx, gy) = Imagen.girar(u, v, grados)
          val cx = (gx - rx) / lado
          val cy = (gy - ry) / lado
          if (cx >= 0f && cx < 1f && cy >= 0f && cy < 1f) { // solo lo que el modelo analizó
            val esVano = mascara[floor(cy * N).toInt() * N + floor(cx * N).toInt()] == '1'
            val z = mm / 1000f
            val dir = p.rayo(px, py)
            puntos.add(floatArrayOf(dir[0] * z, dir[1] * z, -z, if (esVano) 1f else 0f))
          }
        }
        x += paso
      }
      y += paso
    }
    if (puntos.size < MIN_PUNTOS) return false

    if (origen == null && !fijarPlano(pose, puntos.filter { it[3] > 0.5f })) return false
    val o = origen ?: return false

    vistosCuadro.fill(0)
    vanoCuadro.fill(0)
    for (q in puntos) {
      val w = pose.transformPoint(floatArrayOf(q[0], q[1], q[2]))
      val dx = w[0] - o[0]
      val dy = w[1] - o[1]
      val dz = w[2] - o[2]
      if (abs(dx * en[0] + dy * en[1] + dz * en[2]) > ALTURA_MAX) continue // lejos del plano del vano (p. ej. el piso)
      val i = floor(((dx * eu[0] + dy * eu[1] + dz * eu[2]) / LADO_M + 0.5f) * N).toInt()
      val j = floor(((dx * ev[0] + dy * ev[1] + dz * ev[2]) / LADO_M + 0.5f) * N).toInt()
      if (i < 0 || j < 0 || i >= N || j >= N) continue
      vistosCuadro[j * N + i]++
      if (q[3] > 0.5f) vanoCuadro[j * N + i]++
    }
    // Cada cuadro vota una sola vez por celda (mayoría de sus puntos), para que un cuadro cercano no pese más que otro.
    for (c in 0 until N * N) {
      if (vistosCuadro[c] == 0) continue
      vistos[c]++
      if (vanoCuadro[c] * 2 >= vistosCuadro[c]) vano[c]++
    }
    vistas++
    return true
  }

  /** Mapa N×N (fila por fila): 0-100 = porcentaje de vistas que dijeron «vano» en esa celda; 0 si no se ha visto. */
  fun mapa(): List<Int> {
    val minimo = if (vistas >= 4) 2 else 1 // con varias vistas, una sola no basta para afirmar «vano»
    return List(N * N) { c -> if (vistos[c] >= minimo) (100f * vano[c] / vistos[c]).roundToInt() else 0 }
  }

  /** De coordenadas de la grilla (0..1) a un punto del mundo sobre el plano del vano. */
  fun aMundo(gx: Float, gy: Float): FloatArray? {
    val o = origen ?: return null
    val a = (gx - 0.5f) * LADO_M
    val b = (gy - 0.5f) * LADO_M
    return floatArrayOf(o[0] + a * eu[0] + b * ev[0], o[1] + a * eu[1] + b * ev[1], o[2] + a * eu[2] + b * ev[2])
  }

  /** De un punto del mundo a coordenadas de la grilla (0..1); null si aún no hay plano. */
  fun aGrilla(mundo: FloatArray): FloatArray? {
    val o = origen ?: return null
    val dx = mundo[0] - o[0]
    val dy = mundo[1] - o[1]
    val dz = mundo[2] - o[2]
    return floatArrayOf(
      (dx * eu[0] + dy * eu[1] + dz * eu[2]) / LADO_M + 0.5f,
      (dx * ev[0] + dy * ev[1] + dz * ev[2]) / LADO_M + 0.5f
    )
  }

  /** Plano del vano a partir de los puntos que el modelo marcó en el primer cuadro; la grilla queda centrada en ellos. */
  private fun fijarPlano(pose: Pose, delVano: List<FloatArray>): Boolean {
    if (delVano.size < MIN_PUNTOS) return false
    val zs = FloatArray(delVano.size) { -delVano[it][2] }.also { it.sort() }
    val plano = AnclajePorProfundidad.ajustarPlano(delVano, max(0.02f, 0.04f * zs[zs.size / 2])) ?: return false
    // Centro: promedio de los puntos del vano, llevado al plano.
    var cx = 0f; var cy = 0f; var cz = 0f
    for (q in delVano) { cx += q[0]; cy += q[1]; cz += q[2] }
    cx /= delVano.size; cy /= delVano.size; cz /= delVano.size
    val fuera = plano.n[0] * cx + plano.n[1] * cy + plano.n[2] * cz - plano.d
    val centro = floatArrayOf(cx - fuera * plano.n[0], cy - fuera * plano.n[1], cz - fuera * plano.n[2])
    val normal = pose.rotateVector(plano.n)
    // Eje X de la grilla: la derecha de la cámara, proyectada sobre el plano.
    val derecha = pose.rotateVector(floatArrayOf(1f, 0f, 0f))
    val k = derecha[0] * normal[0] + derecha[1] * normal[1] + derecha[2] * normal[2]
    val ux = derecha[0] - k * normal[0]
    val uy = derecha[1] - k * normal[1]
    val uz = derecha[2] - k * normal[2]
    val largo = sqrt(ux * ux + uy * uy + uz * uz)
    if (largo < 1e-3f) return false
    eu = floatArrayOf(ux / largo, uy / largo, uz / largo)
    en = normal
    ev = floatArrayOf(en[1] * eu[2] - en[2] * eu[1], en[2] * eu[0] - en[0] * eu[2], en[0] * eu[1] - en[1] * eu[0])
    origen = pose.transformPoint(centro)
    return true
  }

  companion object {
    const val N = 88 // igual que la grilla del modelo: el mismo código de la app saca el polígono
    const val LADO_M = 3.2f // la grilla cubre 3,2 m × 3,2 m sobre el plano del vano
    private const val ALTURA_MAX = 0.6f // m: lo que esté más lejos del plano no es parte del vano
    private const val MAX_PUNTOS = 9000
    private const val MIN_PUNTOS = 60
  }
}
