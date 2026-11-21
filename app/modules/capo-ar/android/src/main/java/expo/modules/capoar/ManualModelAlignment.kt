package expo.modules.capoar

import android.opengl.Matrix
import android.view.MotionEvent
import android.view.View
import kotlin.math.hypot

internal data class ManualModelAlignment(
  val offset: EnginePoint = EnginePoint(0f, 0f, 0f),
  val scale: Float = 1f,
) {
  fun apply(point: EnginePoint) = offset + point * scale

  // Keep the model point under the previous finger midpoint under the next midpoint.
  fun adjust(from: EnginePoint, to: EnginePoint, ratio: Float): ManualModelAlignment {
    if (!ratio.isFinite() || ratio <= 0f) return this
    val next = (scale * ratio).coerceIn(.25f, 4f)
    return ManualModelAlignment(to + (offset - from) * (next / scale), next)
  }

  fun gesture(mvp: FloatArray, move: MapGesture): ManualModelAlignment {
    val clip = FloatArray(4)
    Matrix.multiplyMV(clip, 0, mvp, 0, floatArrayOf(offset.x, offset.y, offset.z, 1f), 0)
    if (clip[3] <= 0f) return this
    val inverse = FloatArray(16)
    if (!Matrix.invertM(inverse, 0, mvp, 0)) return this
    val depth = clip[2] / clip[3]
    fun unproject(x: Float, y: Float): EnginePoint? {
      val result = FloatArray(4)
      Matrix.multiplyMV(result, 0, inverse, 0, floatArrayOf(x * 2 - 1, 1 - y * 2, depth, 1f), 0)
      if (result[3] == 0f || result.any { !it.isFinite() }) return null
      return EnginePoint(result[0], result[1], result[2]) * (1f / result[3])
    }
    return adjust(unproject(move.fromX, move.fromY) ?: return this, unproject(move.toX, move.toY) ?: return this, move.ratio)
  }
}

internal data class MapGesture(val fromX: Float, val fromY: Float, val toX: Float, val toY: Float, val ratio: Float)

internal class MapGestureListener(private val update: (MapGesture) -> Unit) : View.OnTouchListener {
  private var lastX = 0f
  private var lastY = 0f
  private var lastSpan = 0f
  private var count = 0

  override fun onTouch(view: View, event: MotionEvent): Boolean {
    val action = event.actionMasked
    if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
      count = 0
      return true
    }
    val fingers = (0 until event.pointerCount).filter { action != MotionEvent.ACTION_POINTER_UP || it != event.actionIndex }
    if (fingers.size !in 1..2 || view.width <= 0 || view.height <= 0) {
      count = 0
      return true
    }
    val a = fingers.first()
    val b = fingers.last()
    val x = (event.getX(a) + event.getX(b)) / (2 * view.width)
    val y = (event.getY(a) + event.getY(b)) / (2 * view.height)
    val span = hypot(event.getX(a) - event.getX(b), event.getY(a) - event.getY(b))
    if (action == MotionEvent.ACTION_MOVE && fingers.size == count) {
      update(MapGesture(lastX, lastY, x, y, if (lastSpan > 1f && span > 1f) span / lastSpan else 1f))
    }
    lastX = x
    lastY = y
    lastSpan = span
    count = fingers.size
    return true
  }
}
