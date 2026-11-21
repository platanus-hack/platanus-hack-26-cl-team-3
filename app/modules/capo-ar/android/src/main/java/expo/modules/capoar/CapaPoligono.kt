package expo.modules.capoar

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.os.SystemClock
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View
import androidx.core.graphics.PathParser
import kotlin.math.max
import kotlin.math.min

/**
 * Dibuja sobre la cámara (en el hilo de UI, con Canvas: sin pasar por JavaScript en cada cuadro).
 *
 * Polígono del vano:
 * - Vista previa (aún no anclado): borde ámbar punteado.
 * - Anclado con ARCore: borde verde continuo.
 * - Modo debug: relleno rojo claro.
 * Esquinas: puntos rojos; huecos si tocan el borde de la imagen (el vano sigue fuera del cuadro).
 *
 * Mapa de piezas (HUD): cada pieza va rellena con su color, con un punto en su centro y una etiqueta con ícono unida
 * por una línea. Las etiquetas se reparten arriba y abajo de las piezas ([HudLayout]) y se pueden tocar.
 */
internal class CapaPoligono(context: Context, private val onPart: (Int) -> Unit) : View(context) {
  var debug = true
    set(v) { field = v; invalidate() }

  var selectedPart = -1
    set(value) { field = value; invalidate() }

  private class PartStyle(val lines: List<String>, val tone: Int, val icon: Path?, val width: Float, val height: Float)

  private var faces: List<EngineFace> = emptyList()
  private var pressedPart: Int? = null
  private var styles: List<PartStyle> = emptyList()
  private var hudTop = 0f // zona libre para etiquetas, en píxeles: entre la barra superior y el panel
  private var hudBottom = 0f
  private val layout = HudLayout()
  private val shown = HashMap<Int, FloatArray>() // posición suavizada de cada etiqueta
  private val labelHits = ArrayList<Pair<Int, RectF>>()

  private var puntos: FloatArray? = null // x0, y0, x1, y1… en píxeles de esta vista
  private var bordes: BooleanArray? = null
  private var anclado = false
  private val densidad = resources.displayMetrics.density

  private val faceFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val faceEdge = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND }
  private val leader = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND }
  private val solid = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val boxEdge = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    // Respeta el tamaño de letra del sistema, con tope para que las etiquetas sigan cabiendo.
    textSize = min(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 11.5f, resources.displayMetrics), 15f * densidad)
  }
  private val lineHeight = text.textSize * 1.25f

  private val relleno = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = Color.argb(82, 255, 110, 110) }
  private val linea = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 3 * densidad; strokeJoin = Paint.Join.ROUND }
  private val punto = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = Color.rgb(255, 59, 59) }
  private val aro = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2 * densidad; color = Color.WHITE }
  private val aroBorde = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 3 * densidad; color = Color.rgb(255, 59, 59) }
  private val camino = Path()

  fun actualizar(p: FloatArray?, b: BooleanArray?, estaAnclado: Boolean, engineFaces: List<EngineFace>) {
    puntos = p
    bordes = b
    anclado = estaAnclado
    faces = engineFaces
    invalidate()
  }

  /** Una fila por pieza, en el orden de los volúmenes: nombre, color (#RRGGBB) e ícono (trazado SVG de 24 × 24). */
  fun setHudParts(rows: List<List<String>>) {
    styles = rows.map { row ->
      val lines = wrapLabel(row.getOrNull(0).orEmpty())
      val tone = try { Color.parseColor(row.getOrNull(1).orEmpty()) } catch (e: RuntimeException) { HUD }
      val icon = row.getOrNull(2)?.takeIf { it.isNotEmpty() }?.let {
        try { PathParser.createPathFromPathData(it) } catch (e: RuntimeException) { null }
      }
      val lead = if (icon != null) 30f else 9f
      PartStyle(
        lines, tone, icon,
        max(44f * densidad, (lead + 9f) * densidad + lines.maxOf { text.measureText(it) }),
        max(26f * densidad, lines.size * lineHeight + 10f * densidad),
      )
    }
    invalidate()
  }

  /** Zona donde pueden ir etiquetas, en dp desde arriba de la vista. Con (0, 0) se usa la vista completa. */
  fun setHudArea(top: Float, bottom: Float) {
    hudTop = top * densidad
    hudBottom = bottom * densidad
    invalidate()
  }

  private fun trazar(points: List<EngineScreenPoint>) {
    camino.reset()
    camino.moveTo(points.first().x, points.first().y)
    for (i in 1 until points.size) camino.lineTo(points[i].x, points[i].y)
    camino.close()
  }

  private fun drawHud(canvas: Canvas) {
    val d = densidad
    canvas.drawColor(SCRIM) // velo azul: el HUD resalta sobre la cámara

    var left = Float.MAX_VALUE
    var top = Float.MAX_VALUE
    var right = -Float.MAX_VALUE
    var bottom = -Float.MAX_VALUE
    val labels = ArrayList<HudLabel>()
    for (face in faces) {
      trazar(face.points)
      val selected = face.part == selectedPart
      val style = styles.getOrNull(face.part)
      val tone = style?.tone ?: HUD
      faceFill.color = tone
      faceFill.alpha = if (face.side) (if (selected) 76 else 41) else if (selected) 117 else 71
      canvas.drawPath(camino, faceFill)
      faceEdge.color = tone
      if (face.side) {
        faceEdge.alpha = if (selected) 140 else 77
        faceEdge.strokeWidth = .75f * d
        canvas.drawPath(camino, faceEdge)
      } else {
        // Resplandor: un trazo ancho y tenue bajo el borde fino.
        faceEdge.alpha = if (selected) 115 else 64
        faceEdge.strokeWidth = (if (selected) 7f else 5f) * d
        canvas.drawPath(camino, faceEdge)
        faceEdge.color = if (selected) Color.WHITE else tone
        faceEdge.alpha = 242
        faceEdge.strokeWidth = (if (selected) 2f else 1.25f) * d
        canvas.drawPath(camino, faceEdge)
      }
      var cx = 0f
      var cy = 0f
      for (q in face.points) {
        left = min(left, q.x); right = max(right, q.x); top = min(top, q.y); bottom = max(bottom, q.y)
        cx += q.x; cy += q.y
      }
      // La etiqueta apunta al centro de la cara visible de la pieza.
      if (!face.side && style != null) {
        labels.add(HudLabel(face.part, cx / face.points.size, cy / face.points.size, style.width, style.height))
      }
    }

    val area = HudBox(8 * d, hudTop + 8 * d, width - 8 * d, (if (hudBottom > hudTop) hudBottom else height.toFloat()) - 8 * d)
    // Esquinas del marco.
    boxEdge.color = HUD
    boxEdge.alpha = 150
    boxEdge.strokeWidth = 1.5f * d
    for (sx in SIDES) for (sy in SIDES) {
      val x = if (sx > 0) area.left else area.right
      val y = if (sy > 0) area.top else area.bottom
      camino.reset()
      camino.moveTo(x + sx * 16 * d, y)
      camino.lineTo(x, y)
      camino.lineTo(x, y + sy * 16 * d)
      canvas.drawPath(camino, boxEdge)
    }

    val placed = layout.place(labels, HudBox(left, top, right, bottom), area, 6 * d, 70 * d, MAX_LABELS, selectedPart)
    shown.keys.retainAll(placed.map { it.part }.toSet())
    for (label in placed) {
      // Las etiquetas se deslizan hacia su lugar en vez de saltar cuando cambia el reparto.
      val at = shown.getOrPut(label.part) { floatArrayOf(label.x, label.y) }
      at[0] += (label.x - at[0]) * EASE
      at[1] += (label.y - at[1]) * EASE
      label.x = at[0]
      label.y = at[1]
    }

    // Líneas y puntos primero, para que queden debajo de las cajas.
    val pulse = (SystemClock.uptimeMillis() % PULSE_MS) / PULSE_MS.toFloat()
    for (label in placed) {
      val style = styles[label.part]
      val selected = label.part == selectedPart
      leader.color = if (selected) Color.WHITE else style.tone
      leader.alpha = if (selected) 242 else 204
      leader.strokeWidth = (if (selected) 1.5f else 1f) * d
      camino.reset()
      camino.moveTo(label.anchorX, label.anchorY)
      val gapX = label.gapX
      if (gapX != null) {
        camino.lineTo(gapX, label.gapNear)
        camino.lineTo(gapX, label.gapFar)
      }
      val from = label.x + 10 * d
      camino.lineTo(
        min(max(gapX ?: label.anchorX, from), max(from, label.x + label.width - 10 * d)),
        if (label.above) label.y + label.height else label.y,
      )
      canvas.drawPath(camino, leader)
      solid.color = DOT_BACK
      canvas.drawCircle(label.anchorX, label.anchorY, 4.5f * d, solid)
      solid.color = if (selected) Color.WHITE else style.tone
      canvas.drawCircle(label.anchorX, label.anchorY, 2.6f * d, solid)
      if (selected) {
        // Aro fijo y otro que late sobre la pieza elegida.
        leader.strokeWidth = 1.5f * d
        leader.alpha = 230
        canvas.drawCircle(label.anchorX, label.anchorY, 7 * d, leader)
        leader.alpha = (230 * (1 - pulse)).toInt()
        canvas.drawCircle(label.anchorX, label.anchorY, (6 + 12 * pulse) * d, leader)
      }
    }

    labelHits.clear()
    val metrics = text.fontMetrics
    for (label in placed) {
      val style = styles[label.part]
      val selected = label.part == selectedPart
      val x = label.x
      val y = label.y
      val w = label.width
      val h = label.height
      val cut = 7 * d
      // Caja con dos esquinas cortadas.
      camino.reset()
      camino.moveTo(x + cut, y)
      camino.lineTo(x + w, y)
      camino.lineTo(x + w, y + h - cut)
      camino.lineTo(x + w - cut, y + h)
      camino.lineTo(x, y + h)
      camino.lineTo(x, y + cut)
      camino.close()
      solid.color = if (selected) BOX_SELECTED else BOX
      canvas.drawPath(camino, solid)
      if (selected) {
        boxEdge.color = HUD
        boxEdge.alpha = 90
        boxEdge.strokeWidth = 5 * d
        canvas.drawPath(camino, boxEdge)
      }
      boxEdge.color = if (selected) Color.WHITE else HUD
      boxEdge.alpha = if (selected) 255 else 191
      boxEdge.strokeWidth = (if (selected) 1.5f else 1f) * d
      canvas.drawPath(camino, boxEdge)
      var textX = x + 9 * d
      style.icon?.let { icon ->
        val size = 16 * d
        canvas.save()
        canvas.translate(x + 8 * d, y + (h - size) / 2)
        canvas.scale(size / 24f, size / 24f)
        solid.color = style.tone
        canvas.drawPath(icon, solid)
        canvas.restore()
        textX = x + 30 * d
      }
      text.color = if (selected) Color.WHITE else TEXT
      for ((i, line) in style.lines.withIndex()) {
        val center = y + h / 2 + (i - (style.lines.size - 1) / 2f) * lineHeight
        canvas.drawText(line, textX, center - (metrics.ascent + metrics.descent) / 2, text)
      }
      labelHits.add(label.part to RectF(x - 4 * d, y - 4 * d, x + w + 4 * d, y + h + 4 * d))
    }
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (faces.isNotEmpty()) {
      drawHud(canvas)
    } else {
      layout.reset()
      shown.clear()
      labelHits.clear()
    }
    val p = puntos ?: return
    if (p.size < 6) return
    camino.reset()
    camino.moveTo(p[0], p[1])
    var i = 2
    while (i < p.size) { camino.lineTo(p[i], p[i + 1]); i += 2 }
    camino.close()
    if (debug) canvas.drawPath(camino, relleno)
    linea.color = if (anclado) Color.rgb(61, 220, 132) else Color.rgb(255, 176, 32)
    linea.pathEffect = if (anclado) null else DashPathEffect(floatArrayOf(10 * densidad, 6 * densidad), 0f)
    canvas.drawPath(camino, linea)
    val r = 7 * densidad
    for (k in 0 until p.size / 2) {
      val x = p[2 * k]
      val y = p[2 * k + 1]
      if (bordes?.getOrNull(k) == true && !anclado) {
        canvas.drawCircle(x, y, r, aroBorde)
      } else {
        canvas.drawCircle(x, y, r, punto)
        canvas.drawCircle(x, y, r, aro)
      }
    }
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    // Una etiqueta elige su pieza igual que tocar la pieza misma.
    fun hit() = labelHits.firstOrNull { it.second.contains(event.x, event.y) }?.first
      ?: faces.findLast { it.contains(event.x, event.y) }?.part
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        pressedPart = hit()
        return pressedPart != null
      }
      MotionEvent.ACTION_UP -> {
        val part = pressedPart
        pressedPart = null
        if (part != null && hit() == part) {
          performClick()
          onPart(part)
        }
        return part != null
      }
      MotionEvent.ACTION_CANCEL -> pressedPart = null
    }
    return true
  }

  override fun performClick(): Boolean {
    super.performClick()
    return true
  }

  private companion object {
    val HUD = Color.rgb(73, 211, 255)
    val SCRIM = Color.argb(66, 4, 16, 40)
    val BOX = Color.argb(214, 5, 16, 30)
    val BOX_SELECTED = Color.argb(240, 10, 34, 60)
    val TEXT = Color.rgb(220, 239, 250)
    val DOT_BACK = Color.argb(230, 4, 14, 28)
    val SIDES = floatArrayOf(1f, -1f)
    const val MAX_LABELS = 10
    const val PULSE_MS = 1400L
    const val EASE = .45f
  }
}
