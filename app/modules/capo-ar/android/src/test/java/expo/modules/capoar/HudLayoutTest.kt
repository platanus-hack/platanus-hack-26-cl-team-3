package expo.modules.capoar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HudLayoutTest {
  private val area = HudBox(8f, 96f, 404f, 552f)

  @Test
  fun modelCentersProjectToViewPixelsAndSkipPointsBehindTheCamera() {
    // Column-major matrix with w = z: x and y land at the view center plus half a view per unit of x/z and y/z.
    val mvp = floatArrayOf(1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f, 1f, 0f, 0f, 0f, 0f)
    val out = projectCenters(
      linkedMapOf(4 to EnginePoint(.5f, -.5f, 1f), 7 to EnginePoint(0f, 0f, -1f)), mvp, 1000, 2000,
    )
    assertEquals(3, out.size)
    assertEquals(4f, out[0], 0f)
    assertEquals(750f, out[1], .01f)
    assertEquals(1500f, out[2], .01f)
  }

  @Test
  fun longNamesWrapNearTheMiddle() {
    assertEquals(listOf("Batería"), wrapLabel("Batería"))
    assertEquals(listOf("Refrigerante"), wrapLabel("Refrigerante"))
    assertEquals(listOf("Fusibles", "del motor"), wrapLabel("Fusibles del motor"))
  }

  @Test
  fun theLabelSitsCenteredAboveItsPart() {
    val at = placeLabel(200f, 300f, 90f, 38f, area, 22f, 72f)
    assertEquals(155f, at[0], .001f)
    assertEquals(240f, at[1], .001f)
  }

  @Test
  fun theLabelGoesBelowWhenThereIsNoRoomAbove() {
    val at = placeLabel(200f, 120f, 90f, 38f, area, 22f, 72f)
    assertEquals(192f, at[1], .001f)
  }

  @Test
  fun theLabelNeverLeavesTheFreeArea() {
    val right = placeLabel(400f, 300f, 90f, 38f, area, 22f, 72f)
    assertEquals(314f, right[0], .001f)
    val left = placeLabel(10f, 300f, 90f, 38f, area, 22f, 72f)
    assertEquals(8f, left[0], .001f)
    val squeezed = placeLabel(200f, 100f, 90f, 38f, HudBox(8f, 96f, 404f, 150f), 22f, 72f)
    assertTrue(squeezed[1] >= 96f && squeezed[1] + 38f <= 150f)
  }
}
