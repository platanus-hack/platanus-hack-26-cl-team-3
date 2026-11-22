package expo.modules.capoar

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CameraFrustumTest {
  private val clip = FloatArray(16).apply { this[0] = 1f; this[5] = 1f; this[10] = -1f; this[11] = -1f; this[14] = -.1f }
  private fun corners(x: Float, z: Float) = listOf(-2f, 2f).flatMap { dx ->
    listOf(-2f, 2f).map { y -> EnginePoint(x + dx, y, z) }
  }

  @Test fun largeBaySurroundingScreenAndPartialBaysRemainEligible() {
    assertFalse(outsideCameraView(corners(0f, -1f), clip))
    assertFalse(outsideCameraView(corners(2.5f, -1f), clip))
  }

  @Test fun diagonalPanPastScreenCornerLeavesNoJointIntersection() {
    val diamond = listOf(EnginePoint(.8f, 1.5f, -1f), EnginePoint(1.5f, .8f, -1f),
      EnginePoint(1.5f, 2.2f, -1f), EnginePoint(2.2f, 1.5f, -1f))
    assertTrue(outsideCameraView(diamond, clip))
  }

  @Test fun turnedCameraAndTargetEntirelyBehindCameraAreRejected() {
    assertTrue(outsideCameraView(corners(4f, -1f), clip))
    assertTrue(outsideCameraView(corners(0f, 1f), clip))
  }
}
