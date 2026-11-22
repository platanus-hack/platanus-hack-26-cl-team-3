package expo.modules.capoar

import org.junit.Assert.assertEquals
import org.junit.Test

class UprightRotationTest {
  @Test
  fun upInTheImagePicksTheMatchingQuarterTurn() {
    assertEquals(0, uprightRotation(0f, -40f, 90))
    assertEquals(180, uprightRotation(0f, 40f, 90))
    assertEquals(90, uprightRotation(-40f, 0f, 0))
    assertEquals(270, uprightRotation(40f, 0f, 0))
  }

  @Test
  fun phoneFacingStraightDownKeepsThePreviousRotation() {
    assertEquals(90, uprightRotation(1f, -2f, 90))
    assertEquals(270, uprightRotation(Float.NaN, 0f, 270))
  }

  @Test
  fun nearTheDiagonalTheRotationDoesNotFlicker() {
    assertEquals(90, uprightRotation(-30f, -34f, 90))
    assertEquals(0, uprightRotation(-30f, -34f, 0))
    assertEquals(0, uprightRotation(-30f, -45f, 90))
  }

  @Test
  fun turningThePhoneUpsideDownFlipsAtOnce() {
    assertEquals(270, uprightRotation(40f, -5f, 90))
  }
}
