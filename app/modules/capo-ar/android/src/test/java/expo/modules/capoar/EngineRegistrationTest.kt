package expo.modules.capoar

import com.google.ar.core.Pose
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.hypot

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

  @Test
  fun onlyMeasuredPartMovesAndRetainsItsProjectedOutline() {
    val fixture = PartPlacementFixture()
    val depth = depthGrid { x, y -> if (x in 56..92 && y in 53..85) 1170 else 3700 }
    val observed = EngineImagePoint(.46f, .44f)
    val original = fixture.mesh()
    val corrected = fixture.mesh { index, face ->
      if (index == 0) fixture.correct(face, observed, depth) else null
    }
    val originalTop = fixture.tops(original)
    val correctedTop = fixture.tops(corrected)
    val before = originalTop.getValue(0).points
    val after = correctedTop.getValue(0).points
    assertEquals(listOf(0), corrected.adjustedParts)
    assertEquals(originalTop.getValue(1), correctedTop.getValue(1))
    assertTrue(original.origin == corrected.origin)
    assertEquals(observed.x, after.map { it.x }.average().toFloat(), .00001f)
    assertEquals(observed.y, after.map { it.y }.average().toFloat(), .00001f)
    assertTrue(hypot(after[0].x - before[0].x, after[0].y - before[0].y) > .1f)
    for (index in before.indices) {
      assertEquals(before[index].x - before[0].x, after[index].x - after[0].x, .00001f)
      assertEquals(before[index].y - before[0].y, after[index].y - after[0].y, .00001f)
      assertEquals(1.17f, after[index].depth, .00001f)
    }
    assertTrue(correctedTop.getValue(0).contains(observed.x, observed.y))
  }

  @Test
  fun unprovedObservationsLeaveTheWholePartMeshUntouched() {
    val fixture = PartPlacementFixture()
    val observed = EngineImagePoint(.46f, .44f)
    val usable = depthGrid { _, _ -> 1170 }
    val missingCenter = depthGrid { x, y ->
      if (hypot(x + .5f - 160 * observed.x, y + .5f - 160 * observed.y) < 6) 0 else 1170
    }
    val mixed = depthGrid { x, y ->
      if ((x + y) % 2 == 0 && hypot(x + .5f - 160 * observed.x, y + .5f - 160 * observed.y) > 4) 3700 else 1170
    }
    val cases = listOf(
      observed to null,
      observed to missingCenter,
      observed to mixed,
      observed to depthGrid { _, _ -> 3700 },
      EngineImagePoint(.98f, .8f) to usable,
      EngineImagePoint(.46f, .94f) to usable,
    )
    val original = fixture.mesh()
    for ((center, depth) in cases) {
      val candidate = fixture.mesh { index, face ->
        if (index == 0 && depth != null) fixture.correct(face, center, depth) else null
      }
      assertTrue(candidate.adjustedParts.isEmpty())
      assertEquals(fixture.faces(original), fixture.faces(candidate))
    }
  }

  @Test
  fun observedCentersRejectMalformedClippedAliasesAndDuplicateIndices() {
    val corrections = decodeObservedCenters(
      listOf(
        listOf(1.0, .21, .48), listOf(0.0, .1, .2), listOf(0.0, .3, .4),
        listOf(2.0, 1.1, .4), listOf(3.0, .5, .3), listOf(2.1, .5, .3),
        listOf(2.0, Double.NaN, .5), listOf(2.0, .4),
      ), 3,
    )
    assertEquals(mapOf(1 to EngineImagePoint(.21f, .48f)), corrections)
  }

  private class PartPlacementFixture {
    private val intrinsics = EngineCaptureIntrinsics(160, 160, 105f, 105f, 80f, 80f)
    private val worldCorners = listOf(
      EnginePoint(-.76f, 0f, -.48f), EnginePoint(.76f, 0f, -.48f),
      EnginePoint(-.76f, 0f, .48f), EnginePoint(.76f, 0f, .48f),
    )
    private val rows = listOf(
      listOf(.06, .18, .25, .39, .25, .39, .47, .18, .47),
      listOf(.04, .69, .60, .85, .60, .85, .785, .69, .785),
    )
    private val imageBayX = floatArrayOf(.06f, .94f, .94f, .06f)
    private val imageBayY = floatArrayOf(.125f, .125f, .875f, .875f)

    private fun cameraPoint(world: EnginePoint) = EnginePoint(world.x, -world.z, world.y - 1.25f)
    private fun worldPoint(camera: EnginePoint) = EnginePoint(camera.x, camera.z + 1.25f, -camera.y)

    fun correct(face: List<EnginePoint>, center: EngineImagePoint, depth: Profundidad): List<EnginePoint>? =
      placeObservedFace(face.map(::cameraPoint), center, intrinsics, depth, imageBayX, imageBayY)?.map(::worldPoint)

    fun mesh(refine: ((Int, List<EnginePoint>) -> List<EnginePoint>?)? = null): EngineMesh =
      checkNotNull(EngineMesh.create(worldCorners, rows, refine) { -cameraPoint(it).z })

    fun faces(mesh: EngineMesh): List<EngineFace> =
      mesh.project { local ->
        val camera = cameraPoint(local + mesh.origin)
        intrinsics.project(camera)?.let { EngineScreenPoint(it.x, it.y, -camera.z) }
      }

    fun tops(mesh: EngineMesh) = faces(mesh).filter { !it.side }.associateBy { it.part }
  }

  private fun insideBay(x: Int, y: Int) = x in 20 until 140 && y in 25 until 135

  private fun depthGrid(depthMillimeters: (x: Int, y: Int) -> Int): Profundidad {
    val size = 160
    val depths = ShortArray(size * size) { depthMillimeters(it % size, it / size).toShort() }
    return Profundidad(
      depths, size, size, 110f, 105f, 79.5f, 79.5f,
      floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f),
    )
  }

  private fun fit(depthMillimeters: (x: Int, y: Int) -> Int): AnclajeDenso =
    checkNotNull(AnclajePorProfundidad.calcular(depthGrid(depthMillimeters), bayX, bayY))
}
