// Banco fuera del teléfono: lo mínimo de android.graphics, respaldado por Java2D, para dibujar CapaPoligono.kt real.
package android.graphics

import java.awt.AlphaComposite
import java.awt.BasicStroke
import java.awt.Font
import java.awt.Graphics2D
import java.awt.geom.AffineTransform
import java.awt.geom.Ellipse2D
import java.awt.geom.Path2D
import java.util.ArrayDeque

object Color {
  const val WHITE = -1
  fun argb(a: Int, r: Int, g: Int, b: Int) = (a shl 24) or (r shl 16) or (g shl 8) or b
  fun rgb(r: Int, g: Int, b: Int) = argb(255, r, g, b)
  fun parseColor(s: String): Int {
    if (s[0] != '#' || s.length != 7) throw IllegalArgumentException("Unknown color")
    return (0xFF shl 24) or s.substring(1).toInt(16)
  }
}

class Typeface private constructor(val family: String) {
  companion object {
    const val NORMAL = 0
    fun create(family: String, style: Int) = Typeface(family)
  }
}

open class PathEffect
class DashPathEffect(val intervals: FloatArray, val phase: Float) : PathEffect()

class Path {
  val shape = Path2D.Float()
  fun reset() = shape.reset()
  fun moveTo(x: Float, y: Float) = shape.moveTo(x, y)
  fun lineTo(x: Float, y: Float) = shape.lineTo(x, y)
  fun close() = shape.closePath()
}

class RectF(val left: Float, val top: Float, val right: Float, val bottom: Float) {
  fun contains(x: Float, y: Float) = left < right && top < bottom && x >= left && x < right && y >= top && y < bottom
}

class Paint(flags: Int = 0) {
  enum class Style { FILL, STROKE }
  enum class Join { ROUND, MITER }
  class FontMetrics(val ascent: Float, val descent: Float)
  companion object { const val ANTI_ALIAS_FLAG = 1 }

  var style = Style.FILL
  var strokeWidth = 0f
  var strokeJoin = Join.MITER
  var pathEffect: PathEffect? = null
  var typeface: Typeface? = null
  var textSize = 12f
  // Igual que en Android: fijar el color pisa el alfa.
  var color = Color.argb(255, 0, 0, 0)
  var alpha: Int
    get() = color ushr 24
    set(v) { color = (color and 0x00FFFFFF) or (v shl 24) }

  val font: Font get() = Font("DejaVu Sans", if (typeface?.family?.contains("medium") == true) Font.BOLD else Font.PLAIN, 1).deriveFont(textSize)
  private val probe = java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_ARGB).createGraphics()
  fun measureText(s: String) = probe.getFontMetrics(font).stringWidth(s).toFloat()
  val fontMetrics: FontMetrics get() = probe.getFontMetrics(font).let { FontMetrics(-it.ascent.toFloat(), it.descent.toFloat()) }
}

class Canvas(val g: Graphics2D, val width: Int, val height: Int) {
  private val saved = ArrayDeque<AffineTransform>()
  private fun prepare(p: Paint) {
    g.color = java.awt.Color(p.color, true)
    if (p.style == Paint.Style.STROKE) {
      val dash = (p.pathEffect as? DashPathEffect)?.intervals
      g.stroke = BasicStroke(p.strokeWidth, BasicStroke.CAP_BUTT, if (p.strokeJoin == Paint.Join.ROUND) BasicStroke.JOIN_ROUND else BasicStroke.JOIN_MITER, 10f, dash, 0f)
    }
  }
  fun drawColor(c: Int) { g.color = java.awt.Color(c, true); g.fillRect(-100000, -100000, 200000, 200000) }
  fun drawPath(path: Path, p: Paint) { prepare(p); if (p.style == Paint.Style.FILL) g.fill(path.shape) else g.draw(path.shape) }
  fun drawCircle(x: Float, y: Float, r: Float, p: Paint) {
    prepare(p)
    val e = Ellipse2D.Float(x - r, y - r, 2 * r, 2 * r)
    if (p.style == Paint.Style.FILL) g.fill(e) else g.draw(e)
  }
  fun drawText(s: String, x: Float, y: Float, p: Paint) { g.color = java.awt.Color(p.color, true); g.font = p.font; g.drawString(s, x, y) }
  fun save() = saved.push(g.transform)
  fun restore() { g.transform = saved.pop() }
  fun translate(x: Float, y: Float) = g.translate(x.toDouble(), y.toDouble())
  fun scale(x: Float, y: Float) = g.scale(x.toDouble(), y.toDouble())
}
