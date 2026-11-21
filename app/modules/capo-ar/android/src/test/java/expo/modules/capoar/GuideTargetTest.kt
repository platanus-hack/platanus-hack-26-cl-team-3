package expo.modules.capoar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GuideTargetTest {
  @Test
  fun pointInFrontAndInsideTheViewIsVisible() {
    val target = checkNotNull(guideTarget(.5f, -.5f, 1f, .8f))
    assertEquals(.75f, target.x, .0001f)
    assertEquals(.75f, target.y, .0001f)
    assertTrue(target.visible)
    assertEquals(.8f, target.distance, .0001f)
  }

  @Test
  fun pointInFrontAndOutsideTheViewKeepsItsSide() {
    val target = checkNotNull(guideTarget(3f, 0f, 1f, 1f))
    assertEquals(2f, target.x, .0001f)
    assertEquals(.5f, target.y, .0001f)
    assertFalse(target.visible)
  }

  @Test
  fun pointBehindTheCameraIsNotMirrored() {
    val right = checkNotNull(guideTarget(.4f, 0f, -1f, 1f))
    assertTrue(right.x > 1f)
    assertFalse(right.visible)
    val below = checkNotNull(guideTarget(0f, -.4f, -1f, 1f))
    assertTrue(below.y > 1f)
    assertEquals(.5f, below.x, .0001f)
  }

  @Test
  fun invalidInputHasNoTarget() {
    assertNull(guideTarget(Float.NaN, 0f, 1f, 1f))
  }
}
