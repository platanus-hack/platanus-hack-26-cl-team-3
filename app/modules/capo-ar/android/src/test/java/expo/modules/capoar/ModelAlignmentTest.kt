package expo.modules.capoar

import org.junit.Assert.assertEquals
import org.junit.Test

class ModelAlignmentTest {
  @Test
  fun unscaledReconstructionRequiresConsistentMeasuredDepth() {
    org.junit.Assert.assertNull(measuredSceneScale(List(5) { .19f }))
    org.junit.Assert.assertNull(measuredSceneScale(listOf(.15f, .19f, .24f, .29f, .31f, .41f)))
    assertEquals(.19f, measuredSceneScale(listOf(.19f, .19f, .18f, .20f, .19f, .21f))!!, .001f)
  }

  @Test fun pinchingKeepsTheGrabbedPointUnderTheMovingFingers() {
    val point = EnginePoint(.25f, -.125f, .5f)
    val from = EnginePoint(.5f, -.25f, .75f)
    val to = EnginePoint(.375f, .125f, .75f)
    val previous = ManualModelAlignment(from - point * 2f, 2f)
    val adjusted = previous.adjust(from,to,1.5f)
    assertEquals(to, adjusted.apply(point))
    assertEquals(3f, adjusted.scale, 0f)
    val neighbor = point + EnginePoint(.25f,0f,0f)
    assertEquals(to + EnginePoint(.75f,0f,0f), adjusted.apply(neighbor))
  }

  @Test fun draggingMovesEveryPartByTheSameOffset() {
    val delta = EnginePoint(-.125f,.5f,.25f)
    val from = EnginePoint(1f,2f,3f)
    val model = ManualModelAlignment().adjust(from,from + delta,1f)
    assertEquals(from + delta, model.apply(from))
    assertEquals(delta, model.offset)
  }

  @Test fun convertsOpenCvPoseToTheARCoreSensorAxes() {
    val pose = VisualModelPose(doubleArrayOf(0.0,-1.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0), doubleArrayOf(.5,1.0,2.0))
    assertEquals(EnginePoint(-1.5f,-2f,-5f), pose.cameraPoint(EnginePoint(1f,2f,3f)))
  }
  @Test fun denseDepthScalesTheWholePoseWithoutChangingItsProjection() {
    val ratio = visualMetricScale(listOf(1.2f, 1.18f, 1.21f, 1.2f, 1.2f, 1.22f, .7f))
    assertEquals(1.2f, ratio, .001f)
    assertEquals(1f, visualMetricScale(listOf(.6f,.8f,1f,1.2f,1.4f,1.6f)), 0f)
    val rotation = doubleArrayOf(1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0)
    val translation = doubleArrayOf(.2,.1,1.0)
    val point = EnginePoint(.2f,-.1f,.25f)
    val raw = VisualModelPose(rotation, translation).cameraPoint(point)
    val scaled = VisualModelPose(rotation, translation, ratio).cameraPoint(point)
    assertEquals(raw.z * ratio, scaled.z, .0001f)
    assertEquals(raw.x / raw.z, scaled.x / scaled.z, .0001f)
  }
}
