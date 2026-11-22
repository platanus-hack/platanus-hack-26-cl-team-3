package expo.modules.capoar

import org.opencv.core.Point
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

internal data class OutbackLandmarkObservation(val model: EnginePoint, val pixel: Point)

private data class PoseSite(val camera: DoubleArray, val u: Double, val v: Double, val support: Boolean)

// Distributed points keep the opposite side of the engine from swinging away when all visible caps
// occupy one small area. Their projections retain a weak prior from the geometric registration.
private val engineSupport = listOf(
  EnginePoint(-.36f,-.03f,-.10f), EnginePoint(-.34f,-.04f,.22f),
  EnginePoint(0f,.01f,-.12f), EnginePoint(0f,0f,.22f),
)

private fun rotate(v: DoubleArray, p: DoubleArray): DoubleArray {
  val x = p[3]; val y = p[4]; val z = p[5]
  val angle = sqrt(x*x + y*y + z*z)
  if (angle < 1e-12) return v.copyOf()
  val s = sin(angle)/angle
  val c = (1-cos(angle))/(angle*angle)
  val a = y*v[2]-z*v[1]; val b = z*v[0]-x*v[2]; val d = x*v[1]-y*v[0]
  return doubleArrayOf(v[0]+s*a+c*(y*d-z*b), v[1]+s*b+c*(z*a-x*d), v[2]+s*d+c*(x*b-y*a))
}

// The positive diagonal regularization makes this six-parameter normal matrix positive definite.
private fun solveNormal(matrix: Array<DoubleArray>, rhs: DoubleArray): DoubleArray? {
  for (i in rhs.indices) {
    val diagonal = matrix[i][i]
    if (!diagonal.isFinite() || diagonal <= 1e-12) return null
    for (j in i+1 until rhs.size) {
      val factor = matrix[j][i] / diagonal
      for (k in i+1 until rhs.size) matrix[j][k] -= factor * matrix[i][k]
      rhs[j] -= factor * rhs[i]
    }
  }
  for (i in rhs.indices.reversed()) {
    for (j in i+1 until rhs.size) rhs[i] -= matrix[i][j] * rhs[j]
    rhs[i] /= matrix[i][i]
  }
  return rhs.takeIf { it.all(Double::isFinite) }
}

/** Refines the rigid OpenCV model-to-sensor pose from distinct colored surface correspondences. */
internal fun refineOutbackLandmarkPose(
  observations: List<OutbackLandmarkObservation>, intrinsics: EngineCaptureIntrinsics,
  rotation: DoubleArray, translation: DoubleArray, support: List<EnginePoint>? = null,
): Boolean {
  if (observations.size < 2 || !intrinsics.fx.isFinite() || !intrinsics.fy.isFinite() ||
    intrinsics.fx <= 0 || intrinsics.fy <= 0) return false
  fun camera(p: EnginePoint) = DoubleArray(3) { i ->
    rotation[3*i]*p.x + rotation[3*i+1]*p.y + rotation[3*i+2]*p.z + translation[i]
  }
  // Residuals use a common focal length so thresholds survive image resizing or a different sensor.
  val sites = observations.distinctBy { it.model }.mapNotNull { obs ->
    val q = camera(obs.model)
    if (q.any { !it.isFinite() } || q[2] < .05 || !obs.pixel.x.isFinite() || !obs.pixel.y.isFinite()) null
    else PoseSite(q,1000*(obs.pixel.x-intrinsics.cx)/intrinsics.fx,1000*(obs.pixel.y-intrinsics.cy)/intrinsics.fy,false)
  }.toMutableList()
  val count = sites.size
  if (count < 2) return false
  val pivot = DoubleArray(3) { i -> sites.sumOf { it.camera[i] } / count }
  for (p in support ?: engineSupport) {
    val q = camera(p)
    if (q[2] > .05 && abs(q[0]/q[2]) < 1.5 && abs(q[1]/q[2]) < 1.5) {
      sites.add(PoseSite(q,1000*q[0]/q[2],1000*q[1]/q[2],true))
    }
  }
  val state = DoubleArray(6)
  val prior = doubleArrayOf(50.0,50.0,80.0,12.0,12.0,10.0)
  // Two points alone support translation; roll, depth and tilt need a third correspondence.
  if (count == 2) for (i in 2..5) prior[i] = 1e6
  fun project(s: PoseSite, p: DoubleArray): DoubleArray {
    val delta = rotate(DoubleArray(3) { s.camera[it]-pivot[it] },p)
    val z = delta[2]+pivot[2]+p[2]
    return doubleArrayOf(1000*(delta[0]+pivot[0]+p[0])/z,1000*(delta[1]+pivot[1]+p[1])/z)
  }
  repeat(5) {
    val normal = Array(6) { DoubleArray(6) }
    val rhs = DoubleArray(6)
    for (i in state.indices) {
      val w = prior[i]*pivot[2]
      normal[i][i] = w*w
      rhs[i] = -state[i]*w*w
    }
    for (s in sites) {
      val uv = project(s,state)
      val du = s.u-uv[0]; val dv = s.v-uv[1]
      val error = hypot(du,dv)
      val weight = if (s.support) .0144 * max(1.0,error*error/64.0) else min(1.0,6.0/max(error,1e-9))
      val jac = Array(6) { i ->
        val probe = state.copyOf()
        probe[i] += 1e-5
        val shifted = project(s,probe)
        doubleArrayOf((shifted[0]-uv[0])*1e5,(shifted[1]-uv[1])*1e5)
      }
      for (i in state.indices) {
        rhs[i] += weight*(jac[i][0]*du+jac[i][1]*dv)
        for (j in state.indices) normal[i][j] += weight*(jac[i][0]*jac[j][0]+jac[i][1]*jac[j][1])
      }
    }
    val step = solveNormal(normal,rhs) ?: return false
    for (i in state.indices) state[i] += step[i]
  }
  // Bound underconstrained extrapolation while retaining a partial improvement.
  val ratio = max(1.0,max(sqrt(state.take(3).sumOf { it*it })/(.08*pivot[2]),
    sqrt(state.drop(3).sumOf { it*it })/.15))
  for (i in state.indices) state[i] /= ratio
  val gains = sites.take(count).map { site ->
    val initial = hypot(1000*site.camera[0]/site.camera[2]-site.u,1000*site.camera[1]/site.camera[2]-site.v)
    val final = project(site,state)
    initial-hypot(final[0]-site.u,final[1]-site.v)
  }
  if (gains.count { it > .25 } < 2 || gains.any { !it.isFinite() || it < -3 } || gains.sum() <= 0) return false
  val out = rotate(DoubleArray(3) { translation[it]-pivot[it] },state)
  for (i in 0..2) translation[i] = out[i]+pivot[i]+state[i]
  for (j in 0..2) {
    val column = rotate(DoubleArray(3) { rotation[3*it+j] },state)
    for (i in 0..2) rotation[3*i+j] = column[i]
  }
  return true
}
