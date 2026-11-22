package expo.modules.capoar

import kotlin.math.abs
import kotlin.math.sqrt
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Point
import org.opencv.core.Scalar
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc

private const val SIDE = 47
private const val SEARCH = 20
private const val EXTENT = SIDE + 2 * SEARCH
private const val SAMPLE_STEP = 3
private const val RESPONSE_SIDE = 2 * SEARCH + 1

/** Eight real color patches of the oil cap top, rectified in model space. */
internal class OutbackLandmarkTemplates(bank: ByteArray) {
  private val sampleOffsets = buildList {
    for (y in 1 until SIDE step SAMPLE_STEP) for (x in 1 until SIDE step SAMPLE_STEP) add(y to x)
  }
  private val imageOffsets = sampleOffsets.map { (y,x) -> 3*(y*EXTENT+x) }.toIntArray()
  private val templates: List<FloatArray>

  init {
    val bytesPerPatch = SIDE*SIDE*3
    require(bank.size == 8*bytesPerPatch)
    templates = (bank.indices step bytesPerPatch).map { start ->
      val values = FloatArray(sampleOffsets.size*3)
      val sums = DoubleArray(3)
      for ((i,offset) in sampleOffsets.withIndex()) {
        val source = start+3*(offset.first*SIDE+offset.second)
        for (channel in 0..2) {
          values[3*i+channel] = (bank[source+channel].toInt() and 255).toFloat()
          sums[channel] += values[3*i+channel].toDouble()
        }
      }
      var squares = 0.0
      for (i in values.indices) {
        values[i] -= (sums[i%3]/sampleOffsets.size).toFloat()
        squares += values[i]*values[i]
      }
      require(squares > 0)
      val norm = sqrt(squares).toFloat()
      for (i in values.indices) values[i] /= norm
      values
    }
  }

  /** Step vectors project 1/24 of the cap width along each model-plane axis into the oriented image. */
  fun oilCenter(image: Mat, predicted: Point, xStep: Point, zStep: Point): Point? {
    if (predicted.x !in 0.0..image.cols().toDouble() || predicted.y !in 0.0..image.rows().toDouble() ||
      !xStep.x.isFinite() || !xStep.y.isFinite() || !zStep.x.isFinite() || !zStep.y.isFinite() ||
      abs(xStep.x*zStep.y-xStep.y*zStep.x) < .14) return null
    val transform = Mat(2,3,CvType.CV_64F)
    val rectified = Mat()
    val bytes = ByteArray(EXTENT*EXTENT*3)
    try {
      val radius = EXTENT/2
      transform.put(0,0,xStep.x,zStep.x,predicted.x-radius*(xStep.x+zStep.x),
        xStep.y,zStep.y,predicted.y-radius*(xStep.y+zStep.y))
      Imgproc.warpAffine(image,rectified,transform,Size(EXTENT.toDouble(),EXTENT.toDouble()),
        Imgproc.INTER_LINEAR or Imgproc.WARP_INVERSE_MAP,Core.BORDER_REPLICATE,Scalar.all(0.0))
      rectified.get(0,0,bytes)
    } finally {
      transform.release()
      rectified.release()
    }

    val pixels = IntArray(bytes.size) { bytes[it].toInt() and 255 }
    val inverseNorms = DoubleArray(RESPONSE_SIDE*RESPONSE_SIDE) { -1.0 }
    // A spatially sampled normalized correlation avoids device-specific FFT kernels.
    fun correlation(template: FloatArray, x: Int, y: Int): Double {
      val offset = (y*EXTENT+x)*3
      val slot = y*RESPONSE_SIDE+x
      if (inverseNorms[slot] < 0) {
        var blue = 0
        var green = 0
        var red = 0
        var squares = 0
        for (sample in imageOffsets) {
          val i = sample+offset
          val b = pixels[i]; val g = pixels[i+1]; val r = pixels[i+2]
          blue += b; green += g; red += r
          squares += b*b+g*g+r*r
        }
        val variance = squares-(blue.toDouble()*blue+green.toDouble()*green+red.toDouble()*red)/imageOffsets.size
        inverseNorms[slot] = if (variance > 1.0) 1/sqrt(variance) else 0.0
      }
      var dot = 0f
      var j = 0
      for (sample in imageOffsets) {
        val i = offset+sample
        dot += template[j]*pixels[i]+template[j+1]*pixels[i+1]+template[j+2]*pixels[i+2]
        j += 3
      }
      return dot*inverseNorms[slot]
    }

    // Compare every location against every photograph so two different caps cannot win independently.
    val scores = DoubleArray(RESPONSE_SIDE*RESPONSE_SIDE) { -1.0 }
    var winningScore = .70
    var winningTemplate: FloatArray? = null
    var bx = 0
    var by = 0
    for (template in templates) {
      for (y in 0 until RESPONSE_SIDE) for (x in 0 until RESPONSE_SIDE) {
        val score = correlation(template,x,y)
        val slot = y*RESPONSE_SIDE+x
        if (score > scores[slot]) scores[slot] = score
        if (score > winningScore) {
          winningScore = score
          winningTemplate = template
          bx = x
          by = y
        }
      }
    }
    val template = winningTemplate ?: return null
    if (bx !in 2..2*SEARCH-2 || by !in 2..2*SEARCH-2) return null
    for (y in 0 until RESPONSE_SIDE) for (x in 0 until RESPONSE_SIDE) {
      if ((x-bx)*(x-bx)+(y-by)*(y-by)>49 && scores[y*RESPONSE_SIDE+x] >= winningScore-.02) return null
    }
    val color = 3*((by+SIDE/2)*EXTENT+bx+SIDE/2)
    if (pixels[color+2] < 1.25*pixels[color] || pixels[color+1] < 1.18*pixels[color]) return null
    fun subpixel(left: Double, right: Double) = (.5*(left-right)/(left+right-2*winningScore-1e-6)).coerceIn(-.7,.7)
    val dx = bx-SEARCH+subpixel(correlation(template,bx-1,by),correlation(template,bx+1,by))
    val dy = by-SEARCH+subpixel(correlation(template,bx,by-1),correlation(template,bx,by+1))
    return Point(predicted.x+xStep.x*dx+zStep.x*dy,predicted.y+xStep.y*dx+zStep.y*dy).takeIf {
      it.x in 0.0..(image.cols()-1).toDouble() && it.y in 0.0..(image.rows()-1).toDouble()
    }
  }
}
