package expo.modules.capoar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class EngineRegistrationTest {
  private val bayX = floatArrayOf(20f, 140f, 140f, 20f)
  private val bayY = floatArrayOf(25f, 25f, 135f, 135f)
  private val corners = listOf(29f to 36f, 131f to 36f, 29f to 124f, 131f to 124f)

  @Test
  fun backgroundOnlyDepthCanStillDrawTheGenericContour() {
    val surface = fit { x, y -> if (insideBay(x, y)) 0 else 3700 }
    assertEquals(-3.7f, surface.punto(80f, 80f)[2], .01f)
    assertNull(surface.registrationPoints(corners))
  }

  @Test
  fun missingCornerCannotBorrowFromTheRestOfTheBay() {
    val surface = fit { x, y ->
      if (!insideBay(x, y)) 3700 else if (x > 110 && y > 103) 0 else 1200
    }
    assertNull(surface.registrationPoints(corners))
  }

  @Test
  fun supportedPlaneAndMeasuredReliefUseTheirOwnDepth() {
    val plane = fit { x, y -> if (insideBay(x, y)) 1450 else 3700 }
    val planarRegistration = checkNotNull(plane.registrationPoints(corners))
    assertEquals("plano", planarRegistration.method)
    assertEquals(-1.45f, planarRegistration.points.first()[2], .01f)

    val relief = fit { x, y ->
      if (!insideBay(x, y)) 3700 else if (x < 42 && y < 49) 920 else 1450
    }
    val reliefRegistration = checkNotNull(relief.registrationPoints(corners))
    assertEquals("relieve", reliefRegistration.method)
    assertEquals(-.92f, reliefRegistration.points.first()[2], .01f)
  }

  @Test
  fun sparseHitsMustSupportSeparateCorners() {
    val normalized = listOf(.30f to .38f, .56f to .38f, .30f to .62f, .56f to .62f)
    val measured = normalized.map { (x, y) -> floatArrayOf(x + .01f, y + .01f, 1.2f) }
    assertNotNull(registrationSamples(normalized, measured, .25f))
    assertNull(registrationSamples(normalized, measured.take(3), .25f))
    val clustered = listOf(.40f to .47f, .46f to .47f, .40f to .53f, .46f to .53f)
      .map { (x, y) -> floatArrayOf(x, y, 1.2f) }
    assertNull(registrationSamples(normalized, clustered, .25f))
  }

  @Test
  fun meshAcceptsShallowReliefAndRejectsVerticalOrWarpedBays() {
    val parts = listOf(listOf(.06, .15, .2, .42, .2, .42, .48, .15, .48))
    val worldCorners = listOf(
      EnginePoint(-.7f, .14f, -.48f), EnginePoint(.7f, .12f, -.48f),
      EnginePoint(-.66f, .02f, .46f), EnginePoint(.66f, .04f, .46f),
    )
    assertNotNull(EngineMesh.create(worldCorners, parts))
    assertNull(EngineMesh.create(worldCorners.map { EnginePoint(it.x, it.z + .8f, 0f) }, parts))
    val warped = listOf(
      EnginePoint(-.6f, 0f, 0f), EnginePoint(.6f, 0f, 0f),
      EnginePoint(-.6f, -1.1f, 1f), EnginePoint(.6f, 0f, .5f),
    )
    assertNull(EngineMesh.create(warped, parts))
  }

  private fun insideBay(x: Int, y: Int) = x in 20 until 140 && y in 25 until 135

  private fun fit(depthMillimeters: (x: Int, y: Int) -> Int): AnclajeDenso {
    val size = 160
    val depths = ShortArray(size * size) { depthMillimeters(it % size, it / size).toShort() }
    val frame = Profundidad(
      depths, size, size, 110f, 105f, 79.5f, 79.5f,
      floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f),
    )
    return checkNotNull(AnclajePorProfundidad.calcular(frame, bayX, bayY))
  }
}
