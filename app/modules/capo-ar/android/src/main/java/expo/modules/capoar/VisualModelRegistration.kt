package expo.modules.capoar

import org.opencv.calib3d.Calib3d
import org.opencv.core.*
import org.opencv.features2d.BFMatcher
import org.opencv.features2d.ORB
import org.opencv.imgcodecs.Imgcodecs
import org.opencv.imgproc.Imgproc
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Model-to-sensor pose. OpenCV uses right/down/forward and ARCore uses right/up/back. */
internal class VisualModelPose(private val rotation: DoubleArray, private val translation: DoubleArray) {
  fun cameraPoint(p: EnginePoint): EnginePoint {
    fun row(i: Int) = (rotation[3*i]*p.x + rotation[3*i+1]*p.y + rotation[3*i+2]*p.z + translation[i]).toFloat()
    return EnginePoint(row(0), -row(1), -row(2))
  }
}

private class MatScope : AutoCloseable {
  private val mats = ArrayList<Mat>()
  fun <T : Mat> own(mat: T): T { mats.add(mat); return mat }
  override fun close() = mats.forEach { it.release() }
}

/** Called on the capture worker. Features were registered to the GLB on three views of the test Outback. */
internal class VisualModelRegistration(bytes: ByteArray) {
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

  fun locate(path: String, degrees: Int, intrinsics: EngineCaptureIntrinsics): VisualModelPose? = MatScope().use { scope ->
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
      || inliers.rows() < 8) return null
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
    VisualModelPose(rotation,translation)
  }
}
