package expo.modules.capoar

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

// Geometría pura del análisis de una foto fija (sin Android ni OpenCV, para poder probarla en la JVM).

/** Recuadro normalizado (0..1) de una imagen. */
internal data class RecuadroNorm(val x0: Float, val y0: Float, val x1: Float, val y1: Float) {
  val ancho get() = x1 - x0
  val alto get() = y1 - y0
  fun contiene(x: Float, y: Float) = x in x0..x1 && y in y0..y1
}

/**
 * Equivalente a 35 mm que se supone cuando la foto no lo trae (un cuadro de video, una captura): la cámara principal de
 * un teléfono ronda los 24-28 mm. Pesa poco: con 24 o con 32 mm el registro encuentra los mismos puntos.
 */
internal const val FOCAL_35MM_POR_DEFECTO = 26f

/** El equivalente a 35 mm se define por la diagonal: 43,27 mm en el formato de 35 mm. */
internal fun focalEnPixeles(focal35mm: Float, ancho: Int, alto: Int): Float =
  focal35mm * hypot(ancho.toFloat(), alto.toFloat()) / 43.27f

/**
 * Recuadro alrededor del vano (x0, y0, x1, y1… normalizados) con un margen proporcional. Con el vano chico dentro de la
 * foto, buscar las marcas del modelo en el recorte ampliado es lo que hace que el registro funcione de lejos. Devuelve
 * null si el vano no sirve o si el recorte sería casi toda la imagen (no ganaría nada).
 */
internal fun recuadroAlrededor(vano: List<Double>, margen: Float = .25f): RecuadroNorm? {
  if (vano.size < 6 || vano.size % 2 != 0 || vano.any { !it.isFinite() }) return null
  var x0 = Float.MAX_VALUE; var y0 = Float.MAX_VALUE; var x1 = -Float.MAX_VALUE; var y1 = -Float.MAX_VALUE
  for (i in vano.indices step 2) {
    x0 = min(x0, vano[i].toFloat()); x1 = max(x1, vano[i].toFloat())
    y0 = min(y0, vano[i + 1].toFloat()); y1 = max(y1, vano[i + 1].toFloat())
  }
  if (x1 - x0 < .05f || y1 - y0 < .05f) return null
  val mx = (x1 - x0) * margen
  val my = (y1 - y0) * margen
  val r = RecuadroNorm(max(0f, x0 - mx), max(0f, y0 - my), min(1f, x1 + mx), min(1f, y1 + my))
  return if (r.ancho > .9f && r.alto > .9f) null else r
}

/** Envolvente convexa (cadena monótona de Andrew), en sentido antihorario con y hacia arriba. */
internal fun casco(puntos: List<Pair<Float, Float>>): List<Pair<Float, Float>> {
  val p = puntos.distinct().sortedWith(compareBy({ it.first }, { it.second }))
  if (p.size < 3) return p
  fun giro(o: Pair<Float, Float>, a: Pair<Float, Float>, b: Pair<Float, Float>) =
    (a.first - o.first) * (b.second - o.second) - (a.second - o.second) * (b.first - o.first)
  val abajo = ArrayList<Pair<Float, Float>>()
  for (q in p) { while (abajo.size >= 2 && giro(abajo[abajo.size - 2], abajo.last(), q) <= 0f) abajo.removeAt(abajo.size - 1); abajo.add(q) }
  val arriba = ArrayList<Pair<Float, Float>>()
  for (q in p.asReversed()) { while (arriba.size >= 2 && giro(arriba[arriba.size - 2], arriba.last(), q) <= 0f) arriba.removeAt(arriba.size - 1); arriba.add(q) }
  return abajo.dropLast(1) + arriba.dropLast(1)
}

/** Área con signo del polígono (fórmula del cordón). */
internal fun areaPoligono(p: List<Pair<Float, Float>>): Float {
  var s = 0f
  for (i in p.indices) { val a = p[i]; val b = p[(i + 1) % p.size]; s += a.first * b.second - b.first * a.second }
  return s / 2f
}

/** ¿Un cuadrilátero de esquinas ordenadas es convexo (todos los giros del mismo signo)? */
internal fun esConvexo(p: List<Pair<Float, Float>>): Boolean {
  if (p.size < 3) return false
  var signo = 0
  for (i in p.indices) {
    val a = p[i]; val b = p[(i + 1) % p.size]; val c = p[(i + 2) % p.size]
    val g = (b.first - a.first) * (c.second - b.second) - (b.second - a.second) * (c.first - b.first)
    if (abs(g) < 1e-9f) continue
    val s = if (g > 0) 1 else -1
    if (signo == 0) signo = s else if (s != signo) return false
  }
  return signo != 0
}

/**
 * ¿La pose encontrada es creíble? El cuadro del vano del modelo, proyectado a la imagen (en coordenadas normalizadas),
 * tiene que ser convexo, ocupar una parte razonable de la foto y caer donde el detector vio el vano (si se sabe).
 */
internal fun poseCreible(cuadro: List<Pair<Float, Float>>, donde: RecuadroNorm?): Boolean {
  if (cuadro.size != 4 || !esConvexo(cuadro)) return false
  val area = abs(areaPoligono(cuadro))
  if (area < .02f || area > 1.5f) return false
  val cx = cuadro.sumOf { it.first.toDouble() }.toFloat() / 4f
  val cy = cuadro.sumOf { it.second.toDouble() }.toFloat() / 4f
  return donde == null || donde.contiene(cx, cy)
}
