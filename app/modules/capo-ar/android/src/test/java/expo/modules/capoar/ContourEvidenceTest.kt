package expo.modules.capoar

import org.junit.Assert.assertEquals
import org.junit.Test
import org.opencv.core.Point

class ContourEvidenceTest {
  @Test fun aNearbyEdgeMustFollowTheProjectedContour() {
    val width = 96
    val height = 64
    val pixels = ByteArray(width * height)
    val gradient = FloatArray(pixels.size)
    val zero = FloatArray(pixels.size)
    for (x in 8..85) {
      pixels[32 * width + x] = -1
      gradient[32 * width + x] = 40f
    }
    val curve = listOf(Point(10.0,30.0),Point(84.0,30.0))
    assertEquals(1.0,ContourEvidence(width,height,pixels,zero,gradient).coverage(curve),0.0)
    assertEquals(0.0,ContourEvidence(width,height,pixels,gradient,zero).coverage(curve),0.0)
    val distant = curve.map { Point(it.x,it.y-18.0) }
    assertEquals(0.0,ContourEvidence(width,height,pixels,zero,gradient).coverage(distant),0.0)
  }
}
