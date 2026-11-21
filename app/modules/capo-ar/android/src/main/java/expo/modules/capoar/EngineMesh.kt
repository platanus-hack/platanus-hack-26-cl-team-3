package expo.modules.capoar

import kotlin.math.abs
import kotlin.math.sqrt

internal data class EnginePoint(val x: Float, val y: Float, val z: Float) {
  operator fun plus(other: EnginePoint) = EnginePoint(x + other.x, y + other.y, z + other.z)
  operator fun minus(other: EnginePoint) = EnginePoint(x - other.x, y - other.y, z - other.z)
  operator fun times(scale: Float) = EnginePoint(x * scale, y * scale, z * scale)
  fun length() = sqrt(x * x + y * y + z * z)

  fun cross(other: EnginePoint) = EnginePoint(
    y * other.z - z * other.y,
    z * other.x - x * other.z,
    x * other.y - y * other.x,
  )
}

internal data class EngineScreenPoint(val x: Float, val y: Float, val depth: Float)
internal data class EngineFace(val part: Int, val points: List<EngineScreenPoint>, val side: Boolean) {
  val depth = points.map { it.depth }.average()

  fun contains(x: Float, y: Float): Boolean {
    var inside = false
    for (i in points.indices) {
      val a = points[i]
      val b = points[(i + 1) % points.size]
      if ((a.y > y) != (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside
  }
}

/** Keep neighboring measurement regions disjoint. */
internal fun cornerSupportRadiiSquared(
  corners: List<Pair<Float, Float>>,
  maxRadius: Float,
): List<Float> = corners.mapIndexed { index, corner ->
  val nearest = corners.indices.filter { it != index }.minOf { other ->
    val dx = corner.first - corners[other].first
    val dy = corner.second - corners[other].second
    dx * dx + dy * dy
  }
  minOf(maxRadius * maxRadius, nearest * 0.45f * 0.45f)
}

/** Assign distinct depth samples to each corner so a cluster cannot register the whole bay. */
internal fun registrationSamples(
  corners: List<Pair<Float, Float>>,
  samples: List<FloatArray>,
  maxRadius: Float,
): List<List<FloatArray>>? {
  if (corners.size != 4) return null
  val groups = List(corners.size) { ArrayList<FloatArray>() }
  fun distanceSquared(sample: FloatArray, corner: Pair<Float, Float>): Float {
    val dx = sample[0] - corner.first
    val dy = sample[1] - corner.second
    return dx * dx + dy * dy
  }
  val radiiSquared = cornerSupportRadiiSquared(corners, maxRadius)
  for (sample in samples) {
    val nearest = corners.indices.minBy { distanceSquared(sample, corners[it]) }
    if (distanceSquared(sample, corners[nearest]) <= radiiSquared[nearest]) groups[nearest].add(sample)
  }
  return groups.takeIf { it.all { group -> group.isNotEmpty() } }
}

internal class EngineMesh private constructor(
  val origin: EnginePoint,
  private val volumes: List<Volume>
) {
  private data class Volume(val part: Int, val base: List<EnginePoint>, val top: List<EnginePoint>)

  fun project(toScreen: (EnginePoint) -> EngineScreenPoint?): List<EngineFace> {
    val faces = ArrayList<EngineFace>()
    fun add(part: Int, points: List<EngineScreenPoint>, side: Boolean) {
      val area = points.indices.sumOf { i ->
        val a = points[i]
        val b = points[(i + 1) % points.size]
        (a.x * b.y - a.y * b.x).toDouble()
      }
      if (area > .01) faces.add(EngineFace(part, points, side))
    }
    for ((part, base, top) in volumes) {
      val bottomScreen = base.mapNotNull(toScreen)
      val topScreen = top.mapNotNull(toScreen)
      if (bottomScreen.size != base.size || topScreen.size != top.size) continue
      for (i in base.indices) {
        val next = (i + 1) % base.size
        add(part, listOf(bottomScreen[i], bottomScreen[next], topScreen[next], topScreen[i]), true)
      }
      add(part, topScreen, false)
    }
    return faces.sortedByDescending { it.depth }
  }

  companion object {
    /** Corners are back-left, back-right, front-left, front-right. Heights are fractions of the bay width. */
    fun create(corners: List<EnginePoint>, rows: List<List<Double>>): EngineMesh? {
      if (corners.size != 4 || rows.isEmpty()) return null
      val (backLeft, backRight, frontLeft, frontRight) = corners
      val width = ((backRight - backLeft).length() + (frontRight - frontLeft).length()) / 2
      val depth = ((frontLeft - backLeft).length() + (frontRight - backRight).length()) / 2
      if (width !in .35f..2.8f || depth !in .15f..2.4f) return null
      val first = (backRight - backLeft).cross(frontLeft - backLeft)
      val second = (frontLeft - frontRight).cross(backRight - frontRight)
      // Check both halves so one misplaced corner cannot hide behind their average slope.
      // World Y follows gravity and the two triangles must wind in the same direction.
      if (first.y * second.y <= 0f || listOf(first, second).any { normal ->
        val area = normal.length()
        area < .01f || abs(normal.y) / area < .55f
      }) return null
      val origin = (backLeft + backRight + frontLeft + frontRight) * .25f
      val volumes = rows.mapIndexed { part, row ->
        if (row.size < 7 || row.size % 2 != 1 || row.any { !it.isFinite() || it !in 0.0..1.0 }) return null
        val base = row.drop(1).chunked(2).map { (u, v) ->
          val back = backLeft + (backRight - backLeft) * u.toFloat()
          val front = frontLeft + (frontRight - frontLeft) * u.toFloat()
          back + (front - back) * v.toFloat() - origin
        }
        val rise = EnginePoint(0f, width * row.first().toFloat(), 0f)
        Volume(part, base, base.map { it + rise })
      }
      return EngineMesh(origin, volumes)
    }
  }
}
