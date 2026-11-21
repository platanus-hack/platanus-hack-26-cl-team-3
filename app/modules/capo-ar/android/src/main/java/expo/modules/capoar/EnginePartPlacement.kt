package expo.modules.capoar

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

internal data class EngineImagePoint(val x: Float, val y: Float)

internal class EngineCaptureIntrinsics(
  private val width: Int,
  private val height: Int,
  private val fx: Float,
  private val fy: Float,
  private val cx: Float,
  private val cy: Float,
) {
  fun ray(point: EngineImagePoint) = EnginePoint(
    (point.x * width - cx) / fx,
    (cy - point.y * height) / fy,
    -1f,
  )

  fun project(point: EnginePoint): EngineImagePoint? {
    val depth = -point.z
    if (!depth.isFinite() || depth < .05f) return null
    val x = (point.x * fx / depth + cx) / width
    val y = (cy - point.y * fy / depth) / height
    return EngineImagePoint(x, y).takeIf { x.isFinite() && y.isFinite() }
  }
}

/** The optional bridge argument carries [volume index, normalized upright image x, normalized upright image y]. */
internal fun decodeObservedCenters(rows: List<List<Double>>, volumeCount: Int): Map<Int, EngineImagePoint> {
  val centers = mutableMapOf<Int, EngineImagePoint>()
  val duplicates = mutableSetOf<Int>()
  for (row in rows) {
    if (row.size != 3 || row.any { !it.isFinite() }) continue
    val (indexValue, x, y) = row
    val index = indexValue.toInt()
    if (indexValue != index.toDouble() || index !in 0 until volumeCount || x !in 0.0..1.0 || y !in 0.0..1.0) continue
    if (centers.put(index, EngineImagePoint(x.toFloat(), y.toFloat())) != null) duplicates.add(index)
  }
  duplicates.forEach { centers.remove(it) }
  return centers
}

/** Translate the existing visible outline in capture pixels and re-lift it with locally verified depth. */
internal fun placeObservedFace(
  faceInCamera: List<EnginePoint>,
  observed: EngineImagePoint,
  intrinsics: EngineCaptureIntrinsics,
  depth: Profundidad,
  bayX: FloatArray,
  bayY: FloatArray,
): List<EnginePoint>? {
  val projected = faceInCamera.map { intrinsics.project(it) ?: return null }
  var area = 0.0
  var xMoment = 0.0
  var yMoment = 0.0
  for (index in projected.indices) {
    val a = projected[index]
    val b = projected[(index + 1) % projected.size]
    val cross = a.x.toDouble() * b.y - b.x.toDouble() * a.y
    area += cross
    xMoment += (a.x + b.x) * cross
    yMoment += (a.y + b.y) * cross
  }
  if (abs(area) < 1e-7) return null
  val shiftX = observed.x - (xMoment / (3 * area)).toFloat()
  val shiftY = observed.y - (yMoment / (3 * area)).toFloat()
  val shifted = projected.map { EngineImagePoint(it.x + shiftX, it.y + shiftY) }
  fun insideBay(point: EngineImagePoint): Boolean =
    point.x in 0f..1f && point.y in 0f..1f && AnclajePorProfundidad.enPoligono(point.x, point.y, bayX, bayY)
  if (!insideBay(observed) || shifted.any { !insideBay(it) }) return null
  val expectedDepth = -faceInCamera.map { it.z }.average().toFloat()
  val measuredDepth = depth.partDepth(observed, shifted, expectedDepth) ?: return null
  val deltaDepth = measuredDepth - expectedDepth
  // Keep the catalog face's relative depths and preserve its exact translated screen outline.
  return shifted.mapIndexed { index, pixel ->
    val opticalDepth = -faceInCamera[index].z + deltaDepth
    if (opticalDepth !in .15f..8f) return null
    intrinsics.ray(pixel) * opticalDepth
  }
}

private data class PartDepthSample(val depth: Float, val quadrant: Int, val central: Boolean)

private fun Profundidad.partDepth(
  center: EngineImagePoint,
  outline: List<EngineImagePoint>,
  expectedDepth: Float,
): Float? {
  val (cx, cy) = aPixel(center.x, center.y)
  val contour = outline.map { aPixel(it.x, it.y) }
  if (contour.any { (x, y) -> x !in 1f..(w - 1f) || y !in 1f..(h - 1f) }) return null
  val xs = contour.map { (x, _) -> cx + .8f * (x - cx) }.toFloatArray()
  val ys = contour.map { (_, y) -> cy + .8f * (y - cy) }.toFloatArray()
  if (!AnclajePorProfundidad.enPoligono(cx, cy, xs, ys)) return null
  val minX = floor(xs.min()).toInt()
  val maxX = ceil(xs.max()).toInt()
  val minY = floor(ys.min()).toInt()
  val maxY = ceil(ys.max()).toInt()
  val radius = max(1.6f, .24f * min(xs.max() - xs.min(), ys.max() - ys.min()))
  val possible = IntArray(4)
  var possibleCenter = 0
  val samples = ArrayList<PartDepthSample>()
  for (y in minY until maxY) for (x in minX until maxX) {
    val px = x + .5f
    val py = y + .5f
    if (!AnclajePorProfundidad.enPoligono(px, py, xs, ys)) continue
    val dx = px - cx
    val dy = py - cy
    val quadrant = (if (dx >= 0) 1 else 0) + (if (dy >= 0) 2 else 0)
    val central = dx * dx + dy * dy <= radius * radius
    possible[quadrant]++
    if (central) possibleCenter++
    val millimeters = mm[y * w + x].toInt() and 0xFFFF
    if (millimeters in Profundidad.MIN_MM..Profundidad.MAX_MM) {
      samples.add(PartDepthSample(millimeters / 1000f, quadrant, central))
    }
  }
  val minimumCenter = max(4, ceil(.6f * possibleCenter).toInt())
  val centerDepths = samples.filter { it.central }.map { it.depth }.sorted()
  if (centerDepths.size < minimumCenter) return null
  val median = centerDepths[centerDepths.size / 2]
  // A nearby surface can differ in height. A large discrepancy often belongs to the background.
  if (abs(median - expectedDepth) > .22f) return null
  val tolerance = max(.025f, .027f * median)
  val inliers = samples.filter { abs(it.depth - median) <= tolerance }
  if (inliers.size < max(12, ceil(.65f * possible.sum()).toInt()) || inliers.count { it.central } < minimumCenter) return null
  val supported = IntArray(4)
  inliers.forEach { supported[it.quadrant]++ }
  if (possible.indices.any { possible[it] >= 4 && supported[it] < max(2, ceil(.32f * possible[it]).toInt()) }) return null
  return median
}
