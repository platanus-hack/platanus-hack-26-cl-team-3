package expo.modules.capoar

/** Clip the ordered bay against the live view, including edges that cross near or screen planes. */
internal fun outsideCameraView(corners: List<EnginePoint>, viewProjection: FloatArray): Boolean {
  var polygon = listOf(0, 1, 3, 2).map { i ->
    val p = corners[i]
    DoubleArray(4) { row -> (viewProjection[row] * p.x + viewProjection[4 + row] * p.y +
      viewProjection[8 + row] * p.z + viewProjection[12 + row]).toDouble() }
  }
  for (axis in 0..2) for (sign in listOf(-1, 1)) {
    val clipped = ArrayList<DoubleArray>()
    var previous = polygon.last()
    var from = previous[3] + sign * previous[axis]
    for (point in polygon) {
      val to = point[3] + sign * point[axis]
      if ((from >= 0) != (to >= 0)) {
        val t = from / (from - to)
        clipped.add(DoubleArray(4) { i -> previous[i] + t * (point[i] - previous[i]) })
      }
      if (to >= 0) clipped.add(point)
      previous = point
      from = to
    }
    if (clipped.size < 3) return true
    polygon = clipped
  }
  val area = polygon.indices.sumOf { i ->
    val a = polygon[i]
    val b = polygon[(i + 1) % polygon.size]
    (a[0] * b[1] - a[1] * b[0]) / (a[3] * b[3])
  }
  return !area.isFinite() || area == 0.0
}
