package expo.modules.capoar

import org.opencv.calib3d.Calib3d
import org.opencv.core.*
import org.opencv.features2d.BFMatcher
import org.opencv.features2d.ORB
import org.opencv.imgcodecs.Imgcodecs
import org.opencv.imgproc.Imgproc
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.hypot
import kotlin.math.abs
import kotlin.math.roundToInt

/** Model-to-sensor pose. OpenCV uses right/down/forward and ARCore uses right/up/back. */
internal class VisualModelPose(private val rotation: DoubleArray, private val translation: DoubleArray, private val metricScale: Float = 1f,
  val observations: List<OutbackLandmarkObservation> = emptyList()) {
  fun cameraPoint(p: EnginePoint): EnginePoint {
    fun row(i: Int) = (rotation[3*i]*p.x + rotation[3*i+1]*p.y + rotation[3*i+2]*p.z + translation[i]).toFloat()
    return EnginePoint(row(0), -row(1), -row(2)) * metricScale
  }
}

/** Compare the current anchor and the proposed rigid pose to the same physical image measurements. */
internal fun landmarkAlignmentGain(pose: VisualModelPose, registered: Map<EnginePoint,EngineImagePoint>,
  intr: EngineCaptureIntrinsics, width: Int, height: Int, degrees: Int): Double? {
  val sideways = degrees.mod(180) == 90
  val sx = (if (sideways) height else width).toDouble()/intr.width
  val sy = (if (sideways) width else height).toDouble()/intr.height
  val changes = pose.observations.mapNotNull { mark ->
    val old = registered[mark.model] ?: return@mapNotNull null
    val next = intr.project(pose.cameraPoint(mark.model)) ?: return@mapNotNull null
    fun error(uv: EngineImagePoint) = hypot((uv.x*intr.width-mark.pixel.x)*sx,(uv.y*intr.height-mark.pixel.y)*sy)
    error(old) - error(next)
  }.sorted()
  if (changes.size < 2) return null
  return if (changes.first() < -3.0) changes.first() else changes[changes.size-2]
}

/** Depth and model points are measured on the same camera ray. A global scale preserves pixel alignment. */
internal fun measuredSceneScale(ratios: Collection<Float>): Float? {
  val supported = ratios.filter { it.isFinite() && it > 0f }.sorted()
  if (supported.size < 6) return null
  val median = supported[supported.size / 2]
  return median.takeIf { supported.count { abs(it - median) < .1f * median } >= .7f * supported.size }
}

internal fun visualMetricScale(ratios: List<Float>): Float =
  measuredSceneScale(ratios.filter { it in .5f..2f }) ?: 1f

private class MatScope : AutoCloseable {
  private val mats = ArrayList<Mat>()
  fun <T : Mat> own(mat: T): T { mats.add(mat); return mat }
  override fun close() = mats.forEach { it.release() }
}

/** Match the capture to the feature bank and colored landmarks of the selected vehicle. */
internal class VisualModelRegistration(bytes: ByteArray, private val landmarks: List<Landmark>,
  private val templates: OutbackLandmarkTemplates?, private val requireMeasuredScale: Boolean = false,
  private val poseSupport: List<EnginePoint>? = null) {
  private data class Reference(val xyz: List<Point3>, val uv: List<Point>, val descriptors: Mat)
  private data class Match(val point: Point3, val pixel: Point, val ratio: Float)
  private val references: List<Reference>
  private val orb = ORB.create(5200).apply { setFastThreshold(9) }
  private val clahe = Imgproc.createCLAHE(2.0, Size(8.0, 8.0))
  private val matcher = BFMatcher.create(Core.NORM_HAMMING, false)

  init {
    val data = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    references = List(data.int) {
      val count = data.int
      val xyz = ArrayList<Point3>(count)
      val uv = ArrayList<Point>(count)
      val descriptors = ByteArray(count * 32)
      repeat(count) { i ->
        xyz.add(Point3(data.float.toDouble(), data.float.toDouble(), data.float.toDouble()))
        uv.add(Point(data.float.toDouble(), data.float.toDouble()))
        data.get(descriptors, i * 32, 32)
      }
      Reference(xyz, uv, Mat(count, 32, CvType.CV_8U).apply { put(0,0,descriptors) })
    }
    require(!data.hasRemaining())
  }

  fun locate(path: String, degrees: Int, intrinsics: EngineCaptureIntrinsics, depth: Profundidad? = null): VisualModelPose? = MatScope().use { scope ->
    val image = scope.own(Imgcodecs.imread(path, Imgcodecs.IMREAD_GRAYSCALE))
    if (image.empty()) return null
    val enhanced = scope.own(Mat())
    clahe.apply(image, enhanced)
    val keys = scope.own(MatOfKeyPoint())
    val descriptors = scope.own(Mat())
    orb.detectAndCompute(enhanced, scope.own(Mat()), keys, descriptors)
    if (descriptors.rows() < 8) return null
    val pixels = keys.toArray()
    val matches = HashMap<Int, Match>()
    for (ref in references) {
      val reverse = scope.own(MatOfDMatch())
      matcher.match(ref.descriptors, descriptors, reverse)
      val reverseIndex = reverse.toArray().associate { it.queryIdx to it.trainIdx }
      val forward = ArrayList<MatOfDMatch>()
      val pairs = try {
        matcher.knnMatch(descriptors, ref.descriptors, forward, 2)
        forward.mapNotNull { row ->
          val pair = row.toArray()
          if (pair.size != 2) return@mapNotNull null
          val (a,b) = pair
          if (a.distance < .87f*b.distance && reverseIndex[a.trainIdx] == a.queryIdx) a to (a.distance/b.distance) else null
        }
      } finally { forward.forEach { it.release() } }
      if (pairs.size < 8) continue
      val source = scope.own(MatOfPoint2f()).apply { fromList(pairs.map { ref.uv[it.first.trainIdx] }) }
      val target = scope.own(MatOfPoint2f()).apply { fromList(pairs.map { pixels[it.first.queryIdx].pt }) }
      val mask = scope.own(Mat())
      val homography = scope.own(Calib3d.findHomography(source,target,Calib3d.USAC_MAGSAC,7.0,mask,7000,.999))
      if (homography.empty()) continue
      val flags = ByteArray(pairs.size)
      mask.get(0,0,flags)
      for ((i,pair) in pairs.withIndex()) {
        val (m,ratio) = pair
        if (flags[i].toInt() == 0 || ratio >= (matches[m.queryIdx]?.ratio ?: 1f)) continue
        matches[m.queryIdx] = Match(ref.xyz[m.trainIdx], pixels[m.queryIdx].pt, ratio)
      }
    }
    if (matches.size < 8) return null
    val pairs = matches.toSortedMap().values
    val objectPoints = pairs.map { it.point }
    // Solve in original sensor pixel coordinates with that capture's ARCore intrinsics.
    val sensor = pairs.map {
      val (x,y) = Imagen.desgirar(((it.pixel.x+.5)/image.cols()).toFloat(), ((it.pixel.y+.5)/image.rows()).toFloat(), degrees)
      Point(x.toDouble()*intrinsics.width-.5, y.toDouble()*intrinsics.height-.5)
    }
    val xyz = scope.own(MatOfPoint3f()).apply { fromList(objectPoints) }
    val uv = scope.own(MatOfPoint2f()).apply { fromList(sensor) }
    val calibration = scope.own(Mat.eye(3,3,CvType.CV_64F)).apply {
      put(0,0,intrinsics.fx.toDouble(),0.0,intrinsics.cx.toDouble(),0.0,intrinsics.fy.toDouble(),intrinsics.cy.toDouble(),0.0,0.0,1.0)
    }
    val distortion = scope.own(MatOfDouble())
    val r = scope.own(Mat())
    val t = scope.own(Mat())
    val inliers = scope.own(Mat())
    if (!Calib3d.solvePnPRansac(xyz,uv,calibration,distortion,r,t,false,700,7f,.999,inliers,Calib3d.SOLVEPNP_EPNP)
      || inliers.rows() < (if (requireMeasuredScale) 18 else 8)) return null
    val indices = IntArray(inliers.rows())
    inliers.get(0,0,indices)
    val inlierPixels = indices.map(sensor::get)
    val hull = scope.own(MatOfInt())
    val points = scope.own(MatOfPoint()).apply { fromList(inlierPixels) }
    Imgproc.convexHull(points,hull)
    points.fromList(hull.toArray().map(inlierPixels::get))
    if (Imgproc.contourArea(points) < 900.0) return null
    xyz.fromList(indices.map(objectPoints::get))
    uv.fromList(inlierPixels)
    Calib3d.solvePnPRefineLM(xyz,uv,calibration,distortion,r,t)
    val rot = scope.own(Mat())
    Calib3d.Rodrigues(r,rot)
    val rotation = DoubleArray(9).also { rot.get(0,0,it) }
    val translation = DoubleArray(3).also { t.get(0,0,it) }
    if (!rotation.all(Double::isFinite) || !translation.all(Double::isFinite) ||
      indices.any { val p = objectPoints[it]; rotation[6]*p.x+rotation[7]*p.y+rotation[8]*p.z+translation[2] <= .05 }) return null
    var observations = emptyList<OutbackLandmarkObservation>()
    if (landmarks.isNotEmpty()) try {
      val color = scope.own(Imgcodecs.imread(path, Imgcodecs.IMREAD_COLOR))
      val candidate = translation.copyOf()
      val candidateRotation = rotation.copyOf()
      if (!color.empty()) observations = observeOutbackLandmarks(color,degrees,intrinsics,VisualModelPose(rotation,translation),landmarks,templates)
      if (refineOutbackLandmarkPose(observations,intrinsics,candidateRotation,candidate,poseSupport)) {
        val scale = intrinsics.width.toDouble() / (if (degrees.mod(180) == 90) image.rows() else image.cols())
        fun medianResidual(r: DoubleArray,t: DoubleArray): Double {
          val pose = VisualModelPose(r,t)
          return indices.map { index ->
            val p = objectPoints[index]
            val uv = intrinsics.project(pose.cameraPoint(EnginePoint(p.x.toFloat(),p.y.toFloat(),p.z.toFloat())))
            if (uv == null) Double.POSITIVE_INFINITY else hypot(
              uv.x * intrinsics.width - sensor[index].x, uv.y * intrinsics.height - sensor[index].y)
          }.sorted()[indices.size/2]
        }
        if (medianResidual(candidateRotation,candidate) <= medianResidual(rotation,translation) + 4 * scale) {
          candidateRotation.copyInto(rotation)
          candidate.copyInto(translation)
        }
      }
    } catch (_: CvException) {
      // The geometric pose remains available if optional color processing fails.
    }
    val ratios = HashMap<Int, Float>()
    if (depth != null) for (index in indices) {
      val pixel = sensor[index]
      val (u,v) = depth.aPixel((pixel.x / intrinsics.width).toFloat(), (pixel.y / intrinsics.height).toFloat())
      val x = u.roundToInt()
      val y = v.roundToInt()
      if (x !in 0 until depth.w || y !in 0 until depth.h) continue
      val cell = y * depth.w + x
      val mm = depth.mm[cell].toInt() and 0xffff
      if (mm !in Profundidad.MIN_MM..Profundidad.MAX_MM) continue
      val p = objectPoints[index]
      val opticalDepth = rotation[6]*p.x + rotation[7]*p.y + rotation[8]*p.z + translation[2]
      ratios[cell] = (mm / (1000.0 * opticalDepth)).toFloat()
    }
    val scale = if (requireMeasuredScale) {
      measuredSceneScale(ratios.values) ?: return null
    } else visualMetricScale(ratios.values.toList())
    VisualModelPose(rotation,translation,scale,observations)
  }
}
