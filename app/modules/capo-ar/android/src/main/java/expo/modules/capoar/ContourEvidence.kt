package expo.modules.capoar

import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Point
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.roundToInt

/** Check the measured air-filter rim and spine against image edges with the same orientation. */
internal class ContourEvidence(
  private val width: Int,
  private val height: Int,
  private val edges: ByteArray,
  private val horizontal: FloatArray,
  private val vertical: FloatArray,
) {
  fun coverage(curve: List<Point>): Double {
    var matches = 0
    var total = 0
    for ((a,b) in curve.zipWithNext()) {
      val dx = b.x - a.x
      val dy = b.y - a.y
      val length = hypot(dx,dy)
      if (length < 1.0) continue
      val nx = -dy / length
      val ny = dx / length
      val count = (length / 6.0).roundToInt().coerceAtLeast(1)
      for (sample in 0 until count) {
        val x = a.x + dx * sample / count
        val y = a.y + dy * sample / count
        total++
        for (offset in -8..8) {
          val col = (x + nx * offset).roundToInt()
          val row = (y + ny * offset).roundToInt()
          if (col !in 1 until width-1 || row !in 1 until height-1) continue
          val i = row * width + col
          if (edges[i].toInt() == 0) continue
          val gx = horizontal[i].toDouble()
          val gy = vertical[i].toDouble()
          if (abs(gx*nx + gy*ny) <= .88 * hypot(gx,gy)) continue
          matches++
          break
        }
      }
    }
    return if (total == 0) 0.0 else matches.toDouble() / total
  }

  companion object {
    fun from(gray: Mat, scope: MatScope): ContourEvidence {
      val smooth = scope.own(Mat())
      Imgproc.GaussianBlur(gray,smooth,Size(5.0,5.0),1.3)
      val gx = scope.own(Mat())
      val gy = scope.own(Mat())
      val edge = scope.own(Mat())
      Imgproc.Sobel(smooth,gx,CvType.CV_32F,1,0)
      Imgproc.Sobel(smooth,gy,CvType.CV_32F,0,1)
      Imgproc.Canny(smooth,edge,40.0,100.0)
      val size = gray.rows() * gray.cols()
      return ContourEvidence(gray.cols(),gray.rows(),ByteArray(size).also { edge.get(0,0,it) },
        FloatArray(size).also { gx.get(0,0,it) },FloatArray(size).also { gy.get(0,0,it) })
    }
  }
}
