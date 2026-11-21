package expo.modules.capoar

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.os.SystemClock
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View
import androidx.core.graphics.PathParser
import kotlin.math.hypot
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
 * Mapa de piezas (HUD), pensado para no tapar el motor: cada pieza de mantención lleva solo un punto. La etiqueta con
 * ícono y nombre aparece únicamente sobre la pieza elegida, y los demás puntos se atenúan. Tocar un punto elige su
 * pieza. Con prismas del catálogo esta capa también los rellena; con el modelo 3D las mallas las dibuja
 * [ModelRenderer] en GL.
 */
internal class CapaPoligono(context: Context, private val onPart: (Int) -> Unit) : View(context) {
  var debug = true
    set(v) { field = v; invalidate() }

  var selectedPart = -1
    set(value) { field = value; invalidate() }

  private class PartStyle(
    val lines: List<String>, val tone: Int, val icon: Path?, val pin: Boolean, val width: Float, val height: Float,
  )

  private var faces: List<EngineFace> = emptyList()
  private var modelHitFrame: ModelHitFrame? = null
  private var modelCenters: FloatArray? = null // pieza, x, y por cada pieza del modelo 3D visible
  private var pressedPart: Int? = null
  private var styles: List<PartStyle> = emptyList()
  private var hudTop = 0f // zona libre para etiquetas, en píxeles: entre la barra superior y el panel
  private var hudBottom = 0f
  private val pins = ArrayList<FloatArray>() // pieza, x, y de cada punto dibujado en este cuadro
  private var labelPart = -1 // pieza cuya etiqueta se está mostrando
  private var labelSince = 0L
  private var labelAt: FloatArray? = null // posición suavizada de la etiqueta

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

  fun actualizar(
    p: FloatArray?, b: BooleanArray?, estaAnclado: Boolean, engineFaces: List<EngineFace>,
    model: ModelHitFrame? = null, centers: FloatArray? = null,
  ) {
    puntos = p
    bordes = b
    anclado = estaAnclado
    faces = engineFaces
    modelHitFrame = model
    modelCenters = centers
    invalidate()
  }

  /**
   * Una fila por pieza, en el orden de los volúmenes: nombre, color (#RRGGBB), ícono (trazado SVG de 24 × 24) y "1"
   * si la pieza lleva punto aunque no esté elegida.
   */
  fun setHudParts(rows: List<List<String>>) {
    styles = rows.map { row ->
      val lines = wrapLabel(row.getOrNull(0).orEmpty())
      val tone = try { Color.parseColor(row.getOrNull(1).orEmpty()) } catch (e: RuntimeException) { HUD }
      val icon = row.getOrNull(2)?.takeIf { it.isNotEmpty() }?.let {
        try { PathParser.createPathFromPathData(it) } catch (e: RuntimeException) { null }
      }
      val lead = if (icon != null) 30f else 9f
      PartStyle(
        lines, tone, icon, row.getOrNull(3) == "1",
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

  /** Prismas del catálogo (autos sin modelo 3D): relleno suave con el color de la pieza; la elegida, más marcada. */
  private fun drawFaces(canvas: Canvas) {
    val d = densidad
    for (face in faces) {
      trazar(face.points)
      val selected = face.part == selectedPart
      val tone = styles.getOrNull(face.part)?.tone ?: HUD
      faceFill.color = tone
      faceFill.alpha = if (face.side) (if (selected) 64 else 22) else if (selected) 110 else 44
      canvas.drawPath(camino, faceFill)
      if (face.side) continue
      faceEdge.color = if (selected) Color.WHITE else tone
      faceEdge.alpha = if (selected) 242 else 150
      faceEdge.strokeWidth = (if (selected) 2f else 1f) * d
      canvas.drawPath(camino, faceEdge)
      // El punto de la pieza va en el centro de su cara visible.
      var cx = 0f
      var cy = 0f
      for (q in face.points) { cx += q.x; cy += q.y }
      pins.add(floatArrayOf(face.part.toFloat(), cx / face.points.size, cy / face.points.size))
    }
  }

  private fun drawHud(canvas: Canvas) {
    val d = densidad
    pins.clear()
    val centers = modelCenters
    if (centers != null && centers.size >= 3) {
      for (k in 0 until centers.size / 3) pins.add(floatArrayOf(centers[3 * k], centers[3 * k + 1], centers[3 * k + 2]))
    } else {
      drawFaces(canvas)
    }

    // Solo llevan punto las piezas de mantención y la elegida; lo demás queda limpio.
    var chosen: FloatArray? = null
    val drawn = pins.iterator()
    while (drawn.hasNext()) {
      val pin = drawn.next()
      val part = pin[0].toInt()
      val style = styles.getOrNull(part)
      if (part == selectedPart && style != null) chosen = pin
      else if (style == null || !style.pin) drawn.remove()
    }
    for (pin in pins) {
      if (pin === chosen) continue
      val fade = if (chosen == null) 255 else 105 // con una pieza elegida, los demás puntos se atenúan
      solid.color = DOT_BACK
      solid.alpha = fade * 200 / 255
      canvas.drawCircle(pin[1], pin[2], 6f * d, solid)
      solid.color = styles[pin[0].toInt()].tone
      solid.alpha = fade
      canvas.drawCircle(pin[1], pin[2], 3.5f * d, solid)
    }

    val now = SystemClock.uptimeMillis()
    if (chosen == null) {
      labelPart = -1
      labelAt = null
      return
    }
    val part = chosen[0].toInt()
    val style = styles[part]
    if (part != labelPart) {
      labelPart = part
      labelSince = now
      labelAt = null
    }
    // La etiqueta aparece en un quinto de segundo: sube unos píxeles mientras se aclara.
    val appear = min(1f, (now - labelSince) / APPEAR_MS)
    fun shade(alpha: Int) = (alpha * appear).toInt()
    val ax = chosen[1]
    val ay = chosen[2]
    val area = HudBox(8 * d, hudTop + 8 * d, width - 8 * d, (if (hudBottom > hudTop) hudBottom else height.toFloat()) - 8 * d)
    val w = style.width
    val h = style.height
    // Arriba de la pieza; la distancia y «La encontraste» (PartGuide) van debajo.
    val target = placeLabel(ax, ay, w, h, area, 22 * d, 72 * d)
    val at = labelAt ?: floatArrayOf(target[0], target[1]).also { labelAt = it }
    at[0] += (target[0] - at[0]) * EASE
    at[1] += (target[1] - at[1]) * EASE
    val x = at[0]
    val y = at[1] + (1 - appear) * 6 * d
    val above = y + h / 2 < ay

    // Punto de la pieza elegida: aro fijo y otro que late.
    val pulse = (now % PULSE_MS) / PULSE_MS.toFloat()
    leader.color = Color.WHITE
    leader.strokeWidth = 1.5f * d
    leader.alpha = shade(230)
    val from = x + 10 * d
    canvas.drawLine(ax, ay, min(max(ax, from), max(from, x + w - 10 * d)), if (above) y + h else y, leader)
    solid.color = DOT_BACK
    canvas.drawCircle(ax, ay, 6.5f * d, solid)
    solid.color = Color.WHITE
    canvas.drawCircle(ax, ay, 3.5f * d, solid)
    leader.alpha = 230
    canvas.drawCircle(ax, ay, 8 * d, leader)
    leader.alpha = (200 * (1 - pulse)).toInt()
    canvas.drawCircle(ax, ay, (8 + 10 * pulse) * d, leader)

    // Etiqueta: caja con dos esquinas cortadas, ícono y nombre.
    val cut = 7 * d
    camino.reset()
    camino.moveTo(x + cut, y)
    camino.lineTo(x + w, y)
    camino.lineTo(x + w, y + h - cut)
    camino.lineTo(x + w - cut, y + h)
    camino.lineTo(x, y + h)
    camino.lineTo(x, y + cut)
    camino.close()
    solid.color = BOX
    solid.alpha = shade(235)
    canvas.drawPath(camino, solid)
    boxEdge.color = Color.WHITE
    boxEdge.alpha = shade(235)
    boxEdge.strokeWidth = 1.25f * d
    canvas.drawPath(camino, boxEdge)
    var textX = x + 9 * d
    style.icon?.let { icon ->
      val size = 16 * d
      canvas.save()
      canvas.translate(x + 8 * d, y + (h - size) / 2)
      canvas.scale(size / 24f, size / 24f)
      solid.color = style.tone
      solid.alpha = shade(255)
      canvas.drawPath(icon, solid)
      canvas.restore()
      textX = x + 30 * d
    }
    text.color = Color.WHITE
    text.alpha = shade(255)
    val metrics = text.fontMetrics
    for ((i, line) in style.lines.withIndex()) {
      val center = y + h / 2 + (i - (style.lines.size - 1) / 2f) * lineHeight
      canvas.drawText(line, textX, center - (metrics.ascent + metrics.descent) / 2, text)
    }
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (faces.isNotEmpty() || (modelCenters?.size ?: 0) >= 3) {
      drawHud(canvas)
    } else {
      pins.clear()
      labelPart = -1
      labelAt = null
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
    // Un punto elige su pieza con un área de toque generosa; si no, la malla del modelo 3D o el prisma tocado.
    fun hit(): Int? {
      val reach = 24 * densidad
      val near = pins.minByOrNull { hypot(it[1] - event.x, it[2] - event.y) }
      if (near != null && hypot(near[1] - event.x, near[2] - event.y) <= reach) return near[0].toInt()
      return modelHitFrame?.hit(event.x, event.y) ?: faces.findLast { it.contains(event.x, event.y) }?.part
    }
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
    val BOX = Color.rgb(8, 22, 40)
    val DOT_BACK = Color.argb(230, 4, 14, 28)
    const val PULSE_MS = 1600L
    const val APPEAR_MS = 200f
    const val EASE = .45f
  }
}
