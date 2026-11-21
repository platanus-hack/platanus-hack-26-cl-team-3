package expo.modules.capoar

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Rectángulo en píxeles de la vista. */
internal data class HudBox(val left: Float, val top: Float, val right: Float, val bottom: Float) {
  val width get() = right - left
  val height get() = bottom - top
}

/**
 * Lleva a la pantalla los centros de las piezas del modelo 3D (en el sistema del ancla) con la matriz MVP del cuadro,
 * en orden de columnas como las de OpenGL. Devuelve pieza, x, y por cada centro que queda delante de la cámara.
 */
internal fun projectCenters(centers: Map<Int, EnginePoint>, mvp: FloatArray, width: Int, height: Int): FloatArray {
  val out = ArrayList<Float>(centers.size * 3)
  for ((part, p) in centers) {
    val w = mvp[3] * p.x + mvp[7] * p.y + mvp[11] * p.z + mvp[15]
    if (!w.isFinite() || w < .05f) continue
    val x = mvp[0] * p.x + mvp[4] * p.y + mvp[8] * p.z + mvp[12]
    val y = mvp[1] * p.x + mvp[5] * p.y + mvp[9] * p.z + mvp[13]
    out.add(part.toFloat())
    out.add((x / w + 1f) / 2f * width)
    out.add((1f - y / w) / 2f * height)
  }
  return out.toFloatArray()
}

/** Parte un nombre largo en dos líneas parejas, para que la etiqueta sea angosta. */
internal fun wrapLabel(text: String): List<String> {
  if (text.length <= 12 || ' ' !in text) return listOf(text)
  val middle = text.length / 2f
  val cut = text.indices.filter { text[it] == ' ' }.minBy { abs(it - middle) }
  return listOf(text.substring(0, cut), text.substring(cut + 1))
}

/**
 * Dónde va la etiqueta de la pieza elegida: centrada sobre su punto y `above` más arriba; si ahí no cabe, `below` más
 * abajo. Nunca sale de la zona libre. Devuelve x e y de la esquina superior izquierda.
 */
internal fun placeLabel(
  anchorX: Float, anchorY: Float, width: Float, height: Float, area: HudBox, above: Float, below: Float,
): FloatArray {
  val x = (anchorX - width / 2).coerceIn(area.left, max(area.left, area.right - width))
  val top = anchorY - above - height
  val y = if (top >= area.top) top else min(anchorY + below, max(area.top, area.bottom - height))
  return floatArrayOf(x, y)
}
