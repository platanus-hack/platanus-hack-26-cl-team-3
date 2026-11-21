package expo.modules.capoar

import org.junit.Assert.assertEquals
import org.junit.Test

class ModelAlignmentTest {
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
}
