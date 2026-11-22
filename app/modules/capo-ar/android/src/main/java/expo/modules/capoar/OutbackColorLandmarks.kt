package expo.modules.capoar

import kotlin.math.*
import org.opencv.core.*
import org.opencv.imgproc.Imgproc

internal enum class LandmarkHue { AMBER, BLUE, RED }

/** A colored surface with center and visible width expressed in its vehicle's model space. */
internal data class Landmark(val id: String, val center: EnginePoint, val width: Double, val hue: LandmarkHue, val upperFace: Boolean = false, val usesTemplate: Boolean = false)
internal fun outbackLandmarks(parts: List<ModelPart>): List<Landmark> {
  val widths = mapOf("brake_fluid" to .039, "oil_cap" to .047, "positive" to .044, "washer" to .041, "dipstick" to .025)
  return parts.mapNotNull { part ->
    widths[part.id]?.let { Landmark(part.id, part.guideCenter, it, if (part.id == "positive") LandmarkHue.RED else LandmarkHue.AMBER, upperFace = part.id == "positive", usesTemplate = part.id == "oil_cap") }
  }
}

private fun colorCenter(image: Mat, x: Double, y: Double, width: Double, landmark: Landmark): Point? {
  if (width < 5 || x !in 0.0..image.cols().toDouble() || y !in 0.0..image.rows().toDouble()) return null
  val radius = ceil(1.65 * width).toInt()
  val left = max(0, x.toInt()-radius)
  val top = max(0, y.toInt()-radius)
  val right = min(image.cols(), x.toInt()+radius+1)
  val bottom = min(image.rows(), y.toInt()+radius+1)
  if (right <= left || bottom <= top) return null
  val roi = image.submat(top,bottom,left,right)
  val hsv = Mat()
  val mask = Mat()
  val extra = Mat()
  val contours = ArrayList<MatOfPoint>()
  val hierarchy = Mat()
  try {
    Imgproc.cvtColor(roi,hsv,Imgproc.COLOR_BGR2HSV)
    if (landmark.hue == LandmarkHue.BLUE) {
      Core.inRange(hsv, Scalar(88.0,38.0,30.0), Scalar(125.0,255.0,255.0), mask)
    } else if (landmark.hue == LandmarkHue.RED) {
      Core.inRange(hsv,Scalar(0.0,73.0,65.0),Scalar(7.0,255.0,255.0),mask)
      Core.inRange(hsv,Scalar(166.0,73.0,65.0),Scalar(179.0,255.0,255.0),extra)
      Core.bitwise_or(mask,extra,mask)
    } else {
      Core.inRange(hsv,Scalar(9.0,75.0,73.0),Scalar(43.0,255.0,255.0),mask)
    }
    Imgproc.findContours(mask,contours,hierarchy,Imgproc.RETR_EXTERNAL,Imgproc.CHAIN_APPROX_SIMPLE)
    val choices = contours.mapNotNull { contour ->
      val box = Imgproc.boundingRect(contour)
      val area = Imgproc.contourArea(contour)
      val ratio = box.width/width
      if (area < 16 || area < .32*box.area() || ratio !in .52..1.6 || box.height/width !in .16..1.7 ||
        box.x == 0 || box.y == 0 || box.x+box.width == roi.cols() || box.y+box.height == roi.rows()) return@mapNotNull null
      val moments = Imgproc.moments(contour)
      // The red cover has a tall skirt. Its upper face provides the physical registration point.
      val point = if (landmark.upperFace) {
        val first = box.y + (box.height * .10).toInt()
        val last = min(box.y + box.height, max(first + 1, box.y + (box.height * .63).toInt()))
        val strip = mask.submat(first,last,box.x,box.x+box.width)
        try {
          val face = Imgproc.moments(strip,true)
          if (face.m00 < 3) return@mapNotNull null
          Point(left+box.x+face.m10/face.m00,top+first+face.m01/face.m00)
        } finally { strip.release() }
      } else Point(left + moments.m10/area, top + moments.m01/area)
      val distance = hypot(point.x-x,point.y-y)
      if (distance >= max(7.0,.7*width)) null else (distance/width+.35*abs(ln(ratio))) to point
    }.sortedBy { it.first }
    return choices.firstOrNull()?.takeIf { choices.size == 1 || choices[1].first-it.first > .18 }?.second
  } finally {
    contours.forEach { it.release() }
    listOf(roi,hsv,mask,extra,hierarchy).forEach { it.release() }
  }
}

/** Match physical working surfaces in the upright JPEG; return observations in sensor pixels. */
internal fun observeOutbackLandmarks(image: Mat, degrees: Int, intr: EngineCaptureIntrinsics,
  pose: VisualModelPose, landmarks: List<Landmark>, templates: OutbackLandmarkTemplates?): List<OutbackLandmarkObservation> {
  val sideways = degrees.mod(180) == 90
  val pixelsPerFocal = if (sideways) intr.fy.toDouble()*image.cols()/intr.height else intr.fx.toDouble()*image.cols()/intr.width
  fun imagePoint(model: EnginePoint): Point? {
    val uv = intr.project(pose.cameraPoint(model)) ?: return null
    val (u,v) = Imagen.girar(uv.x+.5f/intr.width,uv.y+.5f/intr.height,degrees)
    return Point(u*image.cols()-.5,v*image.rows()-.5)
  }
  val seen = mutableListOf<Point>()
  return landmarks.mapNotNull { landmark ->
    val p = pose.cameraPoint(landmark.center)
    val predicted = imagePoint(landmark.center) ?: return@mapNotNull null
    val center = if (landmark.usesTemplate) {
      if (templates == null) return@mapNotNull null
      val step = (landmark.width/24).toFloat()
      val x = imagePoint(landmark.center + EnginePoint(step,0f,0f)) ?: return@mapNotNull null
      val z = imagePoint(landmark.center + EnginePoint(0f,0f,step)) ?: return@mapNotNull null
      templates.oilCenter(image,predicted,Point(x.x-predicted.x,x.y-predicted.y),Point(z.x-predicted.x,z.y-predicted.y))
    } else colorCenter(image,predicted.x,predicted.y,landmark.width*pixelsPerFocal/-p.z,landmark)
    if (center == null || seen.any { hypot(it.x-center.x,it.y-center.y) < 3 }) return@mapNotNull null
    seen.add(center)
    val (sx,sy) = Imagen.desgirar(((center.x+.5)/image.cols()).toFloat(),((center.y+.5)/image.rows()).toFloat(),degrees)
    OutbackLandmarkObservation(landmark.center,Point(sx*intr.width-.5,sy*intr.height-.5))
  }
}
