package expo.modules.capoar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HudLayoutTest {
  private val area = HudBox(8f, 96f, 404f, 552f)
  private val parts = HudBox(20f, 240f, 400f, 440f)

  private fun label(part: Int, x: Float, y: Float, width: Float = 90f, height: Float = 38f) =
    HudLabel(part, x, y, width, height)

  private fun overlap(a: HudLabel, b: HudLabel) =
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

  /** Nine parts clustered like the Outback bay: four toward the back, five toward the front right. */
  private fun bay() = listOf(
    label(0, 60f, 260f), label(1, 300f, 250f), label(2, 350f, 270f), label(3, 340f, 300f),
    label(4, 290f, 400f), label(5, 310f, 410f), label(6, 330f, 420f), label(7, 360f, 380f), label(8, 395f, 370f),
  )

  @Test
  fun longNamesWrapNearTheMiddle() {
    assertEquals(listOf("Batería"), wrapLabel("Batería"))
    assertEquals(listOf("Refrigerante"), wrapLabel("Refrigerante"))
    assertEquals(listOf("Fusibles", "del motor"), wrapLabel("Fusibles del motor"))
  }

  @Test
  fun aLoneLabelSitsOverItsAnchor() {
    val one = label(0, 200f, 300f)
    spreadRow(listOf(one), area.left, area.right, 6f)
    assertEquals(155f, one.x, .001f)
  }

  @Test
  fun crowdedRowKeepsOrderWithoutOverlapInsideTheArea() {
    val row = listOf(label(0, 300f, 300f), label(1, 320f, 300f), label(2, 390f, 300f))
    spreadRow(row, area.left, area.right, 6f)
    for (i in 0 until row.lastIndex) assertTrue(row[i].x + row[i].width + 6f <= row[i + 1].x + .001f)
    assertTrue(row.first().x >= area.left - .001f)
    assertTrue(row.last().x + row.last().width <= area.right + .001f)
  }

  @Test
  fun labelsGoToTheNearestBandOutsideThePartsAndNeverOverlap() {
    val placed = HudLayout().place(bay(), parts, area, 6f, 70f, 10, 7)
    assertEquals(9, placed.size)
    for (item in placed) {
      assertEquals(item.anchorY < 340f, item.above)
      assertTrue(item.x >= area.left - .001f && item.x + item.width <= area.right + .001f)
      assertTrue(item.y >= area.top - .001f && item.y + item.height <= area.bottom + .001f)
      assertTrue(if (item.above) item.y + item.height <= parts.top else item.y >= parts.bottom)
    }
    for (a in placed) for (b in placed) if (a !== b) assertFalse(overlap(a, b))
  }

  @Test
  fun farRowLeaderCrossesTheNearRowThroughAFreeGap() {
    val placed = HudLayout().place(bay(), parts, area, 6f, 70f, 10, 7)
    val far = placed.filter { it.gapX != null }
    assertTrue(far.isNotEmpty())
    for (item in far) {
      val gapX = checkNotNull(item.gapX)
      for (other in placed.filter { it.above == item.above && it.gapX == null }) {
        assertFalse(gapX > other.x + .001f && gapX < other.x + other.width - .001f)
      }
    }
  }

  @Test
  fun aLabelNearTheMiddleKeepsItsSideWhileItWobbles() {
    val layout = HudLayout()
    fun sideAt(y: Float) = layout
      .place(listOf(label(0, 100f, y), label(1, 300f, 250f), label(2, 300f, 430f)), parts, area, 6f, 70f, 10, -1)
      .first { it.part == 0 }.above
    assertTrue(sideAt(335f))
    assertTrue(sideAt(345f))
    assertFalse(sideAt(360f))
    assertFalse(sideAt(335f))
  }

  @Test
  fun selectedPartKeepsItsLabelWhenThereAreTooMany() {
    val labels = (0 until 14).map { label(it, 30f + 27f * it, if (it % 2 == 0) 260f else 420f, 60f, 26f) }
    val placed = HudLayout().place(labels, parts, area, 6f, 70f, 10, 13)
    assertEquals(10, placed.size)
    assertTrue(placed.any { it.part == 13 })
    for (a in placed) for (b in placed) if (a !== b) assertFalse(overlap(a, b))
  }

  @Test
  fun bandsStayInsideTheAreaWhenThePartsFillTheScreen() {
    val everywhere = HudBox(-200f, -100f, 700f, 900f)
    val placed = HudLayout().place(listOf(label(0, 100f, 200f), label(1, 300f, 500f)), everywhere, area, 6f, 70f, 10, -1)
    assertEquals(2, placed.size)
    for (item in placed) assertTrue(item.y >= area.top - .001f && item.y + item.height <= area.bottom + .001f)
  }
}
