package android.util

class DisplayMetrics(val density: Float)

object TypedValue {
  const val COMPLEX_UNIT_SP = 2
  fun applyDimension(unit: Int, value: Float, metrics: DisplayMetrics) = value * metrics.density
}
