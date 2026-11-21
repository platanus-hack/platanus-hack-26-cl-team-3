package expo.modules.capoar

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

internal enum class InspectionAction(val duration: Float) {
  HIGHLIGHT(3.2f), LIFT(5f), REFILL(10f);

  companion object {
    fun resolve(part: String, name: String) = entries.firstOrNull {
      it.name.equals(name, ignoreCase = true) && (it != REFILL || part == "washer")
    }
  }
}

internal data class InspectionFrame(
  val index: Int, val center: EnginePoint, val surface: List<ModelTriangle>,
  val effects: List<ModelTriangle>, val brightness: Float,
)

private fun ease(time: Float, start: Float, end: Float): Float {
  val t = ((time - start) / (end - start)).coerceIn(0f, 1f)
  return t * t * (3f - 2f * t)
}

/** Animate in asset coordinates, then apply the same registration as the stationary mesh. */
internal class InspectionPart(
  private val part: ModelPart, private val index: Int, private val source: List<ModelTriangle>,
  private val register: (EnginePoint) -> EnginePoint,
) {
  private val points = source.flatMap { listOf(it.a, it.b, it.c) }.distinct()
  private val neck = if (part.id == "washer") source.filter { it.primitive == 0 }
    .flatMap { listOf(it.a, it.b, it.c) }.distinct() else emptyList()
  private val bottom = neck.minOfOrNull { it.y } ?: 0f
  private val rim = neck.maxOfOrNull { it.y } ?: 0f
  private val mouth = neck.filter { it.y > rim - .003f }.let { ring ->
    if (ring.isEmpty()) part.center else ring.reduce(EnginePoint::plus) * (1f / ring.size)
  }
  private val hinge = EnginePoint(points.minOf { it.x }, mouth.y, mouth.z)
  private val size = maxOf(points.maxOf { it.x } - points.minOf { it.x },
    points.maxOf { it.z } - points.minOf { it.z }, points.maxOf { it.y } - points.minOf { it.y })
  private val restingCenter = register(part.center)
  private val restingSurface by lazy { source.map { it.copy(a = register(it.a), b = register(it.b), c = register(it.c), part = index) } }
  private val liquid = floatArrayOf(.13f,.73f,.89f)
  private val marker = floatArrayOf(.35f,.94f,.81f)

  fun frame(action: InspectionAction, time: Float): InspectionFrame? {
    if (time < 0 || time >= action.duration) return null
    val pulse = sin(PI * time / 1.2).toFloat()
    val brightness = (.12f + .58f*pulse*pulse*(1-ease(time,2.1f,2.8f))) *
      (1 - ease(time, action.duration-.4f, action.duration))
    if (action == InspectionAction.HIGHLIGHT) return InspectionFrame(index, restingCenter, restingSurface, emptyList(), brightness)
    val lift = when (action) {
      InspectionAction.HIGHLIGHT -> 0f
      InspectionAction.LIFT -> ease(time, .35f, 2f) * (1 - ease(time, 3.65f, 5f))
      InspectionAction.REFILL -> ease(time, 1.05f, 3.1f) * (1 - ease(time, 7.8f, 9.6f))
    }
    val refill = action == InspectionAction.REFILL
    val open = if (refill) ease(time, 3.15f, 4.05f) * (1 - ease(time, 6.9f, 7.7f)) else 0f
    val level = bottom + (rim - bottom) * .9f * ease(time, 4.35f, 6.55f)
    val scale = 1 + lift * (.12f / size.coerceAtLeast(.07f)).coerceAtMost(1.35f)
    val offset = EnginePoint(-part.center.x * .62f, .17f, 0f) * lift
    fun place(p: EnginePoint) = register(part.center + (p - part.center) * scale + offset)
    val cosine = cos(open * 1.88f)
    val sine = sin(open * 1.88f)
    fun lid(p: EnginePoint): EnginePoint {
      val d = p - hinge
      return hinge + EnginePoint(d.x*cosine - d.y*sine, d.x*sine + d.y*cosine, d.z)
    }
    val surface = ArrayList<ModelTriangle>(source.size)
    for (triangle in source) {
      fun vertex(p: EnginePoint) = place(if (open > 0 && triangle.primitive == 1) lid(p) else p)
      if (refill && time > 4.35f && triangle.primitive == 0 && level > bottom) {
        // Split at the level so it rises continuously even on long, sparsely tessellated faces.
        val vertices = listOf(triangle.a, triangle.b, triangle.c)
        for (filled in listOf(false, true)) {
          val polygon = ArrayList<EnginePoint>(4)
          var a = vertices.last()
          for (b in vertices) {
            if ((a.y < level) != (b.y < level)) polygon.add(a + (b-a)*((level-a.y)/(b.y-a.y)))
            if ((b.y < level) == filled) polygon.add(b)
            a = b
          }
          for (i in 1 until polygon.lastIndex) surface.add(ModelTriangle(place(polygon[0]),
            place(polygon[i]), place(polygon[i+1]), index, if (filled) liquid else triangle.rgb))
        }
      } else surface.add(triangle.copy(a = vertex(triangle.a), b = vertex(triangle.b), c = vertex(triangle.c), part = index))
    }
    val effects = mutableListOf<ModelTriangle>()
    fun quad(a: EnginePoint, b: EnginePoint, c: EnginePoint, d: EnginePoint, rgb: FloatArray) {
      effects.add(ModelTriangle(a,b,c,index,rgb))
      effects.add(ModelTriangle(a,c,d,index,rgb))
    }
    if (lift > .02f) {
      val radius = (size * .48f).coerceIn(.024f,.105f)
      fun ring(i: Int, r: Float): EnginePoint {
        val angle = i * 2 * PI / 32
        return register(part.center + EnginePoint(cos(angle).toFloat()*r, .003f, sin(angle).toFloat()*r))
      }
      for (i in 0 until 32) quad(ring(i,radius),ring(i+1,radius),ring(i+1,radius+.002f),ring(i,radius+.002f),marker)
    }
    val pour = if (refill) ease(time,3.85f,4.35f)*(1-ease(time,6.55f,6.9f)) else 0f
    if (pour > .005f) {
      val spout = mouth + EnginePoint(.028f,.064f,0f)
      fun tube(a: EnginePoint,b: EnginePoint,r: Float,rgb: FloatArray) {
        val axis = (b-a).unit()
        val u = axis.cross(EnginePoint(0f,0f,1f)).unit()
        val v = axis.cross(u)
        fun edge(i: Int) = u*(r*cos(i*PI/6).toFloat()) + v*(r*sin(i*PI/6).toFloat())
        for (i in 0 until 12) {
          val p = edge(i); val q = edge(i+1)
          quad(place(a+p),place(b+p),place(b+q),place(a+q),rgb)
          effects.add(ModelTriangle(place(b),place(b+p),place(b+q),index,rgb))
        }
      }
      val shoulder = spout + EnginePoint(.012f,.009f,0f)
      val bottle = floatArrayOf(.59f,.71f,.76f)
      tube(spout,shoulder,.004f,bottle)
      tube(shoulder,shoulder+EnginePoint(.025f,.019f,0f),.011f,bottle)
      tube(spout, spout + (mouth-spout)*pour, .0022f*pour, liquid)
    }
    return InspectionFrame(index, place(part.center), surface, effects, brightness)
  }
}
