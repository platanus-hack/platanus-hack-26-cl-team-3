package androidx.core.graphics

import android.graphics.Path
import java.awt.geom.Arc2D
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.sqrt

/** Trazados SVG con comandos absolutos M L H V C S A Z (los que usan los íconos); cualquier otro falla, como en Android. */
object PathParser {
  fun createPathFromPathData(d: String): Path {
    val path = Path()
    val tokens = Regex("[A-Za-z]|-?\\d*\\.?\\d+").findAll(d).map { it.value }.toList()
    var i = 0
    var cmd = ' '
    var x = 0f; var y = 0f; var cx = 0f; var cy = 0f
    fun n() = tokens[i++].toFloat()
    while (i < tokens.size) {
      if (tokens[i][0].isLetter()) cmd = tokens[i++][0]
      when (cmd) {
        'M' -> { x = n(); y = n(); path.shape.moveTo(x, y); cmd = 'L'; cx = x; cy = y }
        'L' -> { x = n(); y = n(); path.shape.lineTo(x, y); cx = x; cy = y }
        'H' -> { x = n(); path.shape.lineTo(x, y); cx = x; cy = y }
        'V' -> { y = n(); path.shape.lineTo(x, y); cx = x; cy = y }
        'C' -> { val a = n(); val b = n(); cx = n(); cy = n(); x = n(); y = n(); path.shape.curveTo(a, b, cx, cy, x, y) }
        'S' -> { val a = 2 * x - cx; val b = 2 * y - cy; cx = n(); cy = n(); x = n(); y = n(); path.shape.curveTo(a, b, cx, cy, x, y) }
        'A' -> {
          var rx = n(); var ry = n(); val phi = n(); val large = n() != 0f; val sweep = n() != 0f
          val ex = n(); val ey = n()
          if (phi != 0f || abs(rx - ry) > 1e-4f) throw RuntimeException("arco no circular")
          // Centro del arco circular entre (x, y) y (ex, ey).
          val dx = (x - ex) / 2; val dy = (y - ey) / 2
          val half = sqrt(dx * dx + dy * dy)
          if (rx < half) { rx = half; ry = half }
          val h = sqrt(maxOf(0f, rx * rx - half * half))
          val sign = if (large != sweep) 1f else -1f
          val mx = (x + ex) / 2; val my = (y + ey) / 2
          val ox = mx + sign * h * (dy / half) ; val oy = my - sign * h * (dx / half)
          val start = Math.toDegrees(atan2((-(y - oy)).toDouble(), (x - ox).toDouble()))
          var end = Math.toDegrees(atan2((-(ey - oy)).toDouble(), (ex - ox).toDouble()))
          var extent = end - start
          // En Java2D los ángulos crecen en sentido antihorario; sweep=1 en SVG es horario en pantalla.
          if (sweep && extent > 0) extent -= 360.0
          if (!sweep && extent < 0) extent += 360.0
          path.shape.append(Arc2D.Float(ox - rx, oy - rx, 2 * rx, 2 * rx, start.toFloat(), extent.toFloat(), Arc2D.OPEN), true)
          x = ex; y = ey; cx = x; cy = y
        }
        'Z' -> { path.shape.closePath() }
        else -> throw RuntimeException("comando $cmd")
      }
    }
    return path
  }
}
