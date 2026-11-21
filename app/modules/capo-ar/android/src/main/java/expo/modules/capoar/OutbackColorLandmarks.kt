package expo.modules.capoar

import kotlin.math.*
import org.opencv.core.*
import org.opencv.imgproc.Imgproc

/** Centers of colored surfaces in Outback model coordinates, with their approximate visible widths. */
private data class Landmark(val center: EnginePoint, val width: Double, val red: Boolean = false)
private val landmarks = listOf(
  Landmark(EnginePoint(.28555f,.01826f,-.18279f), .039), // Brake fluid cap
  Landmark(EnginePoint(.25168f,-.06060f,.24057f), .047), // Oil filler
  Landmark(EnginePoint(.35765f,-.00480f,.08695f), .042, true), // Battery terminal cover
  Landmark(EnginePoint(.50114f,-.01193f,.09207f), .041), // Washer filler
  Landmark(EnginePoint(.20630f,-.05020f,.23682f), .025), // Dipstick handle
)

private fun median(values: List<Double>): Double {
  val sorted = values.sorted()
  return (sorted[(sorted.size-1)/2] + sorted[sorted.size/2]) / 2
}

private fun colorCenter(image: Mat, x: Double, y: Double, width: Double, red: Boolean): Point? {
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
    if (red) {
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
      val point = Point(left + moments.m10/area, top + moments.m01/area)
      val distance = hypot(point.x-x,point.y-y)
      if (distance >= max(7.0,.7*width)) null else (distance/width+.35*abs(ln(ratio))) to point
    }.sortedBy { it.first }
    return choices.firstOrNull()?.takeIf { choices.size == 1 || choices[1].first-it.first > .18 }?.second
  } finally {
    contours.forEach { it.release() }
    listOf(roi,hsv,mask,extra,hierarchy).forEach { it.release() }
  }
}

/** Refine lateral translation only when independently identified surfaces support a common correction. */
internal fun refineOutbackTranslation(image: Mat, degrees: Int, intr: EngineCaptureIntrinsics, rotation: DoubleArray, translation: DoubleArray) {
  val pose = VisualModelPose(rotation,translation)
  val sideways = degrees.mod(180) == 90
  val pixelsPerFocal = if (sideways) intr.fy.toDouble()*image.cols()/intr.height else intr.fx.toDouble()*image.cols()/intr.width
  val seen = mutableListOf<Point>()
  val observations = landmarks.mapNotNull { landmark ->
    val p = pose.cameraPoint(landmark.center)
    val uv = intr.project(p) ?: return@mapNotNull null
    val (u,v) = Imagen.girar(uv.x+.5f/intr.width,uv.y+.5f/intr.height,degrees)
    val x = u*image.cols()-.5
    val y = v*image.rows()-.5
    val center = colorCenter(image,x,y,landmark.width*pixelsPerFocal/-p.z,landmark.red) ?: return@mapNotNull null
    if (seen.any { hypot(it.x-center.x,it.y-center.y) < 3 }) return@mapNotNull null
    seen.add(center)
    val (sx,sy) = Imagen.desgirar(((center.x+.5)/image.cols()).toFloat(),((center.y+.5)/image.rows()).toFloat(),degrees)
    Triple((sx-uv.x)*intr.width.toDouble()-.5,(sy-uv.y)*intr.height.toDouble()-.5,-p.z.toDouble())
  }
  if (observations.size < 2) return
  val dx = median(observations.map { it.first })
  val dy = median(observations.map { it.second })
  val tolerance = 5.0 * (if (sideways) intr.height else intr.width) / image.cols()
  val agreed = observations.filter { hypot(it.first-dx,it.second-dy) < tolerance }
  if (agreed.size < 2) return
  translation[0] += median(agreed.map { it.first*it.third/intr.fx })
  translation[1] += median(agreed.map { it.second*it.third/intr.fy })
}
