package expo.modules.capoar

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Rectángulo en píxeles de la vista. */
internal data class HudBox(val left: Float, val top: Float, val right: Float, val bottom: Float) {
  val width get() = right - left
  val height get() = bottom - top
}

/** Etiqueta de una pieza: entra con su ancla (el centro de la pieza) y su tamaño; [HudLayout.place] la ubica. */
internal class HudLabel(val part: Int, val anchorX: Float, val anchorY: Float, val width: Float, val height: Float) {
  var x = 0f
  var y = 0f
  var above = false

  /** Si quedó en la fila lejana: x por donde su línea cruza la fila cercana, entre [gapNear] y [gapFar]. */
  var gapX: Float? = null
  var gapNear = 0f
  var gapFar = 0f
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

/** Reparte una fila (ordenada por ancla) sin que las etiquetas se pisen y lo más cerca posible de sus anclas. */
internal fun spreadRow(row: List<HudLabel>, left: Float, right: Float, gap: Float) {
  class Group(val items: MutableList<HudLabel>, var x: Float, val width: Float)
  val groups = ArrayList<Group>()
  for (label in row) {
    var group = Group(
      mutableListOf(label),
      (label.anchorX - label.width / 2).coerceIn(left, max(left, right - label.width)),
      label.width,
    )
    // Si choca con el grupo anterior, se funden y el conjunto se centra respecto de sus anclas.
    while (groups.isNotEmpty() && groups.last().x + groups.last().width + gap > group.x) {
      val previous = groups.removeAt(groups.lastIndex)
      previous.items.addAll(group.items)
      val width = previous.width + gap + group.width
      var offset = 0f
      var sum = 0f
      for (item in previous.items) {
        sum += item.anchorX - item.width / 2 - offset
        offset += item.width + gap
      }
      group = Group(previous.items, (sum / previous.items.size).coerceIn(left, max(left, right - width)), width)
    }
    groups.add(group)
  }
  for (group in groups) {
    var x = group.x
    for (item in group.items) {
      item.x = x
      x += item.width + gap
    }
  }
}

/**
 * Ubica las etiquetas en dos franjas, arriba y abajo de las piezas, con hasta dos filas por franja. Así ninguna
 * etiqueta tapa una pieza mientras haya espacio. Guarda memoria entre cuadros para que una etiqueta no salte de
 * lado ni de fila con cada pequeño movimiento del teléfono.
 */
internal class HudLayout {
  private val sides = HashMap<Int, Boolean>() // pieza → ¿arriba?
  private val split = booleanArrayOf(false, false) // ¿la franja de arriba / de abajo va en dos filas?

  fun reset() {
    sides.clear()
    split.fill(false)
  }

  /**
   * @param parts caja que encierra todas las piezas dibujadas
   * @param area zona donde pueden ir etiquetas (entre la barra superior y el panel)
   * @param reach distancia máxima deseada entre una etiqueta y su pieza antes de pasar a dos filas
   * @param limit máximo de etiquetas a la vez; la pieza elegida siempre entra
   */
  fun place(
    labels: List<HudLabel>, parts: HudBox, area: HudBox, gap: Float, reach: Float, limit: Int, selected: Int,
  ): List<HudLabel> {
    var visible = labels
      .filter { it.anchorX in area.left..area.right && it.anchorY in area.top..area.bottom }
      .sortedBy { it.part }
    if (visible.size > limit) {
      visible = (visible.filter { it.part == selected } + visible.filter { it.part != selected }).take(limit)
    }
    // Cada pieza va a la franja que le queda más cerca, con holgura para no cambiar de lado en el límite.
    val middle = (parts.top + parts.bottom) / 2
    val slack = .08f * parts.height
    for (label in visible) {
      val boundary = when (sides[label.part]) {
        true -> middle + slack
        false -> middle - slack
        null -> middle
      }
      sides[label.part] = label.anchorY < boundary
    }
    val placed = ArrayList<HudLabel>()
    for ((band, above) in listOf(true, false).withIndex()) {
      val group = visible.filter { sides[it.part] == above }.sortedBy { it.anchorX }.toMutableList()
      fun total() = group.sumOf { (it.width + gap).toDouble() }.toFloat() - gap
      // Lo que no cabe ni en dos filas se queda sin etiqueta (nunca la pieza elegida).
      while (group.size > 2 && total() > 2 * area.width - reach) {
        group.remove(group.filter { it.part != selected }.maxBy { it.part })
      }
      if (group.isEmpty()) continue
      val height = group.maxOf { it.height }
      spreadRow(group, area.left, area.right, gap)
      val drift = group.maxOf { abs(it.x + it.width / 2 - it.anchorX) }
      split[band] = group.size > 2 && (total() > area.width || drift > if (split[band]) reach * .7f else reach)
      val rows = if (split[band]) {
        // Intercaladas: la línea de cada etiqueta lejana pasa entre dos cercanas.
        listOf(group.filterIndexed { i, _ -> i % 2 == 0 }, group.filterIndexed { i, _ -> i % 2 == 1 })
          .onEach { spreadRow(it, area.left, area.right, gap) }
      } else listOf(group)
      val step = height + gap
      // Borde de la franja que mira a las piezas; si no hay espacio fuera de ellas, la franja se mete en la zona.
      val edge = if (above) max(area.top + rows.size * step, min(parts.top - gap, area.bottom))
      else min(area.bottom - rows.size * step, max(parts.bottom + gap, area.top))
      for ((k, row) in rows.withIndex()) {
        for (label in row) {
          label.above = above
          label.y = if (above) edge - (k + 1) * step + gap + (height - label.height) else edge + k * step
          label.gapX = null
          if (k == 1) {
            val near = rows[0]
            val ideal = (label.anchorX + label.x + label.width / 2) / 2
            // Huecos libres de la fila cercana: entre cada par de etiquetas y, si hay lugar, en los extremos.
            val free = ArrayList<Pair<Float, Float>>()
            if (near.first().x - area.left >= gap) free.add(area.left to near.first().x)
            for (i in 0 until near.lastIndex) free.add(near[i].x + near[i].width to near[i + 1].x)
            if (area.right - near.last().x - near.last().width >= gap) free.add(near.last().x + near.last().width to area.right)
            label.gapX = free
              .map { (from, to) -> if (to - from < gap) (from + to) / 2 else ideal.coerceIn(from + gap / 2, to - gap / 2) }
              .minBy { abs(it - ideal) }
            label.gapNear = edge
            label.gapFar = if (above) edge - height else edge + height
          }
          placed.add(label)
        }
      }
    }
    return placed
  }
}
