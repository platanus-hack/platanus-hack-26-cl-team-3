package expo.modules.capoar

import kotlin.math.abs
import kotlin.math.hypot

internal data class GuideTarget(val x: Float, val y: Float, val visible: Boolean, val distance: Float)

internal const val GUIDE_INTERVAL_NS = 100_000_000L

/** View position of a clip-space point. A point behind the camera stays on the side the user has to turn to. */
internal fun guideTarget(clipX: Float, clipY: Float, clipW: Float, distance: Float): GuideTarget? {
  if (!clipX.isFinite() || !clipY.isFinite() || !clipW.isFinite() || !distance.isFinite()) return null
  if (clipW >= .05f) {
    val x = (clipX / clipW + 1f) / 2f
    val y = (1f - clipY / clipW) / 2f
    return GuideTarget(x, y, x in 0f..1f && y in 0f..1f, distance)
  }
  val length = hypot(clipX, clipY)
  val directionX = if (length < 1e-6f) 1f else clipX / length
  val directionY = if (length < 1e-6f) 0f else clipY / length
  val reach = 2f / maxOf(abs(directionX), abs(directionY))
  return GuideTarget((directionX * reach + 1f) / 2f, (1f - directionY * reach) / 2f, false, distance)
}
