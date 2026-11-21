package expo.modules.capoar

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.view.MotionEvent
import android.view.View

/**
 * Dibuja el polígono del vano sobre la cámara (en el hilo de UI, con Canvas: sin pasar por JavaScript en cada cuadro).
 * - Vista previa (aún no anclado): borde ámbar punteado.
 * - Anclado con ARCore: borde verde continuo.
 * - Modo debug: relleno rojo claro.
 * Esquinas: puntos rojos; huecos si tocan el borde de la imagen (el vano sigue fuera del cuadro).
 */
internal class CapaPoligono(context: Context, private val onPart: (Int) -> Unit) : View(context) {
  var debug = true
    set(v) { field = v; invalidate() }

  var selectedPart = -1
    set(value) { field = value; invalidate() }

  private var faces: List<EngineFace> = emptyList()
  private var modelHitFrame: ModelHitFrame? = null
  private var pressedPart: Int? = null
  private val faceFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val faceEdge = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeJoin = Paint.Join.ROUND
  }

  private var puntos: FloatArray? = null // x0, y0, x1, y1… en píxeles de esta vista
  private var bordes: BooleanArray? = null
  private var anclado = false
  private val densidad = resources.displayMetrics.density

  private val relleno = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = Color.argb(82, 255, 110, 110) }
  private val linea = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 3 * densidad; strokeJoin = Paint.Join.ROUND }
  private val punto = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = Color.rgb(255, 59, 59) }
  private val aro = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2 * densidad; color = Color.WHITE }
  private val aroBorde = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 3 * densidad; color = Color.rgb(255, 59, 59) }
  private val camino = Path()

  fun actualizar(p: FloatArray?, b: BooleanArray?, estaAnclado: Boolean, engineFaces: List<EngineFace>, model: ModelHitFrame? = null) {
    puntos = p
    bordes = b
    anclado = estaAnclado
    modelHitFrame = model
    faces = engineFaces
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    for (face in faces) {
      camino.reset()
      camino.moveTo(face.points.first().x, face.points.first().y)
      for (i in 1 until face.points.size) camino.lineTo(face.points[i].x, face.points[i].y)
      camino.close()
      val selected = face.part == selectedPart
      val tint = if (selected) Color.rgb(255, 176, 32) else Color.rgb(61, 220, 132)
      faceFill.color = tint
      faceFill.alpha = if (face.side) 80 else 130
      faceEdge.color = tint
      faceEdge.strokeWidth = (if (selected) 2f else 1f) * densidad
      canvas.drawPath(camino, faceFill)
      canvas.drawPath(camino, faceEdge)
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
    fun hit() = modelHitFrame?.hit(event.x, event.y) ?: faces.findLast { it.contains(event.x, event.y) }?.part
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
}
