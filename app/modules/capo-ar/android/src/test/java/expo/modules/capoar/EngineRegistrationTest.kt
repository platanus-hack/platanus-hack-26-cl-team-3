package expo.modules.capoar

import com.google.ar.core.Pose
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineRegistrationTest {
  private val bayX = floatArrayOf(20f, 140f, 140f, 20f)
  private val bayY = floatArrayOf(25f, 25f, 135f, 135f)
  private val corners = listOf(29f to 36f, 131f to 36f, 29f to 124f, 131f to 124f)

  @Test
  fun measuredPointsFollowReferenceThroughWorldCorrections() {
    val reference = Pose.makeTranslation(1f, .6f, 1f)
    val camera = Pose.makeTranslation(1.5f, 1.9f, 2.1f)
      .compose(Pose.makeRotation(.21644f, 0f, 0f, .97630f))
    val depthPoint = floatArrayOf(.08f, -.1f, -1.25f)
    val capture = CapturePose(reference, camera)

    assertArrayEquals(camera.transformPoint(depthPoint), capture.inCurrentWorld(reference).transformPoint(depthPoint), .0001f)

    val correction = Pose.makeTranslation(.07f, .02f, -.09f)
      .compose(Pose.makeRotation(0f, .052336f, 0f, .99863f))
    val adjustedCamera = capture.inCurrentWorld(correction.compose(reference))
    val adjustedPoint = adjustedCamera.transformPoint(depthPoint)
    val expectedPoint = correction.transformPoint(camera.transformPoint(depthPoint))
    assertArrayEquals(expectedPoint, adjustedPoint, .0001f)

    val cameraNormal = floatArrayOf(0f, 1f, 0f)
    val expectedNormal = correction.rotateVector(camera.rotateVector(cameraNormal))
    assertArrayEquals(expectedNormal, adjustedCamera.rotateVector(cameraNormal), .0001f)
  }

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
    assertNotNull(EngineMesh.create(worldCorners, parts) { 1f })
    assertNull(EngineMesh.create(worldCorners.map { EnginePoint(it.x, it.z + .8f, 0f) }, parts) { 1f })
    val warped = listOf(
      EnginePoint(-.6f, 0f, 0f), EnginePoint(.6f, 0f, 0f),
      EnginePoint(-.6f, -1.1f, 1f), EnginePoint(.6f, 0f, .5f),
    )
    assertNull(EngineMesh.create(warped, parts) { 1f })
    assertNull(EngineMesh.create(worldCorners, parts) { -.5f })
    assertNull(EngineMesh.create(worldCorners, parts) { Float.NaN })
  }

  @Test
  fun tracedTopMatchesCaptureRaysAndCanBeSelectedFromAnotherView() {
    val corners = listOf(
      EnginePoint(-.67f, .06f, -.40f), EnginePoint(.68f, .04f, -.38f),
      EnginePoint(-.64f, .10f, .56f), EnginePoint(.61f, .03f, .55f),
    )
    val outline = listOf(.80, .25, .92, .25, .93, .40, .79, .39)
    val camera = Pose.makeTranslation(.43f, 1.54f, 1.8f)
      .compose(Pose.makeRotation(-.30f, 0f, 0f, .9539392f))
    val inverse = camera.inverse()
    fun cameraPoint(point: EnginePoint, pose: Pose) =
      pose.transformPoint(floatArrayOf(point.x, point.y, point.z))
    fun project(point: EnginePoint, pose: Pose): EngineScreenPoint {
      val (x, y, z) = cameraPoint(point, pose)
      return EngineScreenPoint(520f + 700f * x / -z, 350f - 700f * y / -z, -z)
    }

    val mesh = checkNotNull(EngineMesh.create(corners, listOf(listOf(.066) + outline)) { -cameraPoint(it, inverse)[2] })
    val top = mesh.project { project(it + mesh.origin, inverse) }.single { !it.side }
    val cornerPixels = corners.map { project(it, inverse) }
    for ((index, coordinates) in outline.chunked(2).withIndex()) {
      val (u, v) = coordinates
      val weights = listOf((1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v)
      val x = cornerPixels.indices.sumOf { cornerPixels[it].x * weights[it] }.toFloat()
      val y = cornerPixels.indices.sumOf { cornerPixels[it].y * weights[it] }.toFloat()
      assertEquals(x, top.points[index].x, .001f)
      assertEquals(y, top.points[index].y, .001f)
    }

    val movedCamera = Pose.makeTranslation(.25f, .06f, .08f).compose(camera).inverse()
    val moved = mesh.project { project(it + mesh.origin, movedCamera) }.single { !it.side }
    assertTrue(moved.points.first() != top.points.first())
    val centerX = moved.points.map { it.x }.average().toFloat()
    val centerY = moved.points.map { it.y }.average().toFloat()
    assertTrue(moved.contains(centerX, centerY))
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
