package android.view

import android.content.Context
import android.graphics.Canvas

class MotionEvent(val actionMasked: Int, val x: Float, val y: Float) {
  companion object { const val ACTION_DOWN = 0; const val ACTION_UP = 1; const val ACTION_CANCEL = 3 }
}

open class View(val context: Context) {
  val resources get() = context.resources
  var width = 0
  var height = 0
  var invalidations = 0
  fun invalidate() { invalidations++ }
  open fun onDraw(canvas: Canvas) {}
  open fun onTouchEvent(event: MotionEvent): Boolean = false
  open fun performClick(): Boolean = false
}
