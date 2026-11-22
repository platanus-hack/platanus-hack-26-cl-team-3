package expo.modules.capoar

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.opencv.core.Point
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

class OutbackLandmarkPoseTest {
  private val parts = listOf(EnginePoint(.50f,-.01f,.09f),EnginePoint(.25f,-.06f,.24f),
    EnginePoint(.28f,.02f,-.18f),EnginePoint(.36f,-.005f,.087f),EnginePoint(.20f,-.05f,.23f))
  private val initialR = doubleArrayOf(1.0,0.0,0.0,0.0,.8,.6,0.0,-.6,.8)
  private val initialT = doubleArrayOf(-.32,-.04,1.15)
  private val intr = EngineCaptureIntrinsics(1000,700,1000f,1000f,500f,350f)
  private fun image(p: EnginePoint, r: DoubleArray, t: DoubleArray): Point {
    fun row(i: Int) = r[i*3]*p.x+r[i*3+1]*p.y+r[i*3+2]*p.z+t[i]
    return Point(intr.cx+intr.fx*row(0)/row(2),intr.cy+intr.fy*row(1)/row(2))
  }

  @Test
  fun improvesSimultaneousLandmarkAlignmentWithOneRigidPose() {
    val obs = parts.map { part ->
      val p = image(part,initialR,initialT)
      val u = p.x-520; val v = p.y-350; val a = .042
      OutbackLandmarkObservation(part,Point(524+cos(a)*u-sin(a)*v,347+sin(a)*u+cos(a)*v))
    }
    fun worst(r: DoubleArray,t: DoubleArray) = obs.maxOf {
      val p = image(it.model,r,t)
      hypot(p.x-it.pixel.x,p.y-it.pixel.y)
    }
    val r = initialR.copyOf(); val t = initialT.copyOf()
    assertTrue(refineOutbackLandmarkPose(obs,intr,r,t))
    assertTrue(worst(r,t) < .55*worst(initialR,initialT))
    // The object-to-camera basis remains orthonormal.
    for (i in 0..2) for (j in 0..2) {
      val dot = (0..2).sumOf { k -> r[3*i+k]*r[3*j+k] }
      assertTrue(kotlin.math.abs(dot-(if (i==j) 1 else 0)) < 1e-7)
    }
  }

  @Test
  fun aSingleContradictoryMarkCannotDisplaceAnAlignedSurface() {
    for ((a,b) in listOf(0.0 to 8.0,-8.0 to 8.0)) {
      val r = initialR.copyOf(); val t = initialT.copyOf()
      val marks = parts.take(2).mapIndexed { index, part ->
        val p = image(part,r,t)
        OutbackLandmarkObservation(part, Point(p.x+if (index == 0) a else b,p.y))
      }
      assertFalse(refineOutbackLandmarkPose(marks,intr,r,t))
      assertArrayEquals(initialR,r,0.0)
      assertArrayEquals(initialT,t,0.0)
    }
  }

  @Test
  fun duplicateOrInvalidPointsCannotReplaceTheGeometricPose() {
    val r = initialR.copyOf(); val t = initialT.copyOf()
    val mark = OutbackLandmarkObservation(parts.first(),Point(550.0,340.0))
    val invalid = OutbackLandmarkObservation(parts.last(),Point(Double.NaN,390.0))
    assertFalse(refineOutbackLandmarkPose(listOf(mark,mark,invalid),intr,r,t))
    assertArrayEquals(initialR,r,0.0)
    assertArrayEquals(initialT,t,0.0)
  }
}
