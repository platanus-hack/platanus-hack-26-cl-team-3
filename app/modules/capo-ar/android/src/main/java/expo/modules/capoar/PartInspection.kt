package expo.modules.capoar

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

internal enum class InspectionAction(val duration: Float) {
  HIGHLIGHT(3.2f), LIFT(5f), SEPARATE(5f), REFILL(10f), OPEN(6f);

  companion object {
    fun resolve(part: String, name: String) = entries.firstOrNull {
      it.name.equals(name, ignoreCase = true) && when (it) {
        SEPARATE -> false
        OPEN -> part in openingParts
        REFILL -> part == "washer"
        else -> true
      }
    }
  }
}

internal data class InspectionFrame(
  val index: Int, val center: EnginePoint, val surface: List<ModelTriangle>,
  val effects: List<ModelTriangle>, val brightness: Float,
)

internal fun ease(time: Float, start: Float, end: Float): Float {
  val t = ((time - start) / (end - start)).coerceIn(0f, 1f)
  return t * t * (3f - 2f * t)
}

internal fun swingWasherLid(point: EnginePoint, hinge: EnginePoint, amount: Float): EnginePoint {
  val d = point - hinge
  val angle = amount * 1.88f
  return hinge + EnginePoint(d.x*cos(angle) - d.y*sin(angle), d.x*sin(angle) + d.y*cos(angle), d.z)
}

internal interface PartAnimation {
  fun frame(action: InspectionAction, time: Float): InspectionFrame?
}

internal fun inspectionBrightness(action: InspectionAction, time: Float): Float {
  val pulse = sin(PI * time / 1.2).toFloat()
  return (.12f + .58f * pulse * pulse * (1 - ease(time, 2.1f, 2.8f))) *
    (1 - ease(time, action.duration - .4f, action.duration))
}

/** Capped cylinders for the inspection bottle and the short illustrated liquid stream. */
internal fun MutableList<ModelTriangle>.inspectionTube(
  a: EnginePoint, b: EnginePoint, radius: Float, index: Int, color: FloatArray, reference: EnginePoint,
  place: (EnginePoint) -> EnginePoint = { it },
) {
  val span = b - a
  if (span.length() <= radius * 1e-5f) return
  val axis = span.unit()
  val u = axis.cross(reference).unit()
  val v = axis.cross(u)
  fun edge(i: Int) = u * (radius * cos(i * PI / 6).toFloat()) + v * (radius * sin(i * PI / 6).toFloat())
  for (i in 0 until 12) {
    val p = edge(i)
    val q = edge(i + 1)
    add(ModelTriangle(place(a+p), place(b+p), place(b+q), index, color))
    add(ModelTriangle(place(a+p), place(b+q), place(a+q), index, color))
    add(ModelTriangle(place(b), place(b+p), place(b+q), index, color))
  }
}

/** Animate in asset coordinates, then apply the same registration as the stationary mesh. */
internal class InspectionPart(
  private val part: ModelPart, private val index: Int, private val source: List<ModelTriangle>,
  private val openTray: List<ModelTriangle> = emptyList(),
  private val register: (EnginePoint) -> EnginePoint,
) : PartAnimation {
  private val points = source.flatMap { listOf(it.a, it.b, it.c) }.distinct()
  private val neck = if (part.id == "washer") source.filter { it.primitive == 0 }
    .flatMap { listOf(it.a, it.b, it.c) }.distinct() else emptyList()
  private val bottom = neck.minOfOrNull { it.y } ?: 0f
  private val rim = neck.maxOfOrNull { it.y } ?: 0f
  // The bundled neck has three vertex rings. Its upper ring is tilted relative to asset Y.
  private val mouthRing = neck.filter { it.y > rim - (rim - bottom) * .2f }.toSet()
  private val mouth = mouthRing.let { ring ->
    if (ring.isEmpty()) part.center else ring.reduce(EnginePoint::plus) * (1f / ring.size)
  }
  private val hinge = EnginePoint(points.minOf { it.x }, mouth.y, mouth.z)
  private val size = maxOf(points.maxOf { it.x } - points.minOf { it.x },
    points.maxOf { it.z } - points.minOf { it.z }, points.maxOf { it.y } - points.minOf { it.y })
  private val restingCenter = register(part.guideCenter)
  private val restingSurface by lazy { source.map { it.copy(a = register(it.a), b = register(it.b), c = register(it.c), part = index) } }
  private val liquid = floatArrayOf(.13f,.73f,.89f)
  private val marker = floatArrayOf(.35f,.94f,.81f)

  private val opening by lazy { ServiceOpening(part, index, source, register, hinge, mouthRing, openTray) }

  override fun frame(action: InspectionAction, time: Float): InspectionFrame? {
    if (time < 0 || time >= action.duration) return null
    val brightness = inspectionBrightness(action, time)
    if (action == InspectionAction.HIGHLIGHT) return InspectionFrame(index, restingCenter, restingSurface, emptyList(), brightness)
    if (action == InspectionAction.OPEN) return opening.frame(time, brightness)
    val lift = when (action) {
      InspectionAction.HIGHLIGHT, InspectionAction.OPEN -> 0f
      InspectionAction.SEPARATE -> return null
      InspectionAction.LIFT -> ease(time, .35f, 2f) * (1 - ease(time, 3.65f, 5f))
      InspectionAction.REFILL -> ease(time, 1.05f, 3.1f) * (1 - ease(time, 7.8f, 9.6f))
    }
    val refill = action == InspectionAction.REFILL
    val open = if (refill) ease(time, 3.15f, 4.05f) * (1 - ease(time, 6.9f, 7.7f)) else 0f
    val level = bottom + (rim - bottom) * .9f * ease(time, 4.35f, 6.55f)
    val scale = 1 + lift * (.12f / size.coerceAtLeast(.07f)).coerceAtMost(1.35f)
    val offset = EnginePoint(-part.center.x * .62f, .17f, 0f) * lift
    fun place(p: EnginePoint) = register(part.center + (p - part.center) * scale + offset)
    val surface = ArrayList<ModelTriangle>(source.size)
    val waterline = mutableSetOf<EnginePoint>()
    for (triangle in source) {
      if (open > 0f && triangle.primitive == 0 &&
        triangle.a in mouthRing && triangle.b in mouthRing && triangle.c in mouthRing) continue
      fun vertex(p: EnginePoint) = place(if (open > 0 && triangle.primitive == 1) swingWasherLid(p, hinge, open) else p)
      if (refill && time > 4.35f && triangle.primitive == 0 && level > bottom) {
        // Split at the level so it rises continuously even on long, sparsely tessellated faces.
        val vertices = listOf(triangle.a, triangle.b, triangle.c)
        for (filled in listOf(false, true)) {
          val polygon = ArrayList<EnginePoint>(4)
          var a = vertices.last()
          for (b in vertices) {
            if ((a.y < level) != (b.y < level)) {
              val low = if (a.y < b.y) a else b
              val high = if (a.y < b.y) b else a
              val crossing = low + (high-low)*((level-low.y)/(high.y-low.y))
              polygon.add(crossing)
              if (filled) waterline.add(crossing)
            }
            if ((b.y < level) == filled) polygon.add(b)
            a = b
          }
          for (i in 1 until polygon.lastIndex) surface.add(ModelTriangle(place(polygon[0]),
            place(polygon[i]), place(polygon[i+1]), index, if (filled) liquid else triangle.rgb))
        }
      } else surface.add(triangle.copy(a = vertex(triangle.a), b = vertex(triangle.b), c = vertex(triangle.c), part = index))
    }
    var liquidCenter = mouth.copy(y = bottom)
    if (waterline.size >= 3) {
      liquidCenter = waterline.reduce(EnginePoint::plus) * (1f / waterline.size)
      val boundary = waterline.sortedBy { atan2(it.z-liquidCenter.z, it.x-liquidCenter.x) }
      val center = place(liquidCenter)
      for (i in boundary.indices) surface.add(ModelTriangle(center, place(boundary[i]),
        place(boundary[(i+1) % boundary.size]), index, liquid))
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
      fun tube(a: EnginePoint, b: EnginePoint, r: Float, rgb: FloatArray) =
        effects.inspectionTube(a, b, r, index, rgb, EnginePoint(0f,0f,1f), ::place)
      val shoulder = spout + EnginePoint(.012f,.009f,0f)
      val bottle = floatArrayOf(.59f,.71f,.76f)
      tube(spout,shoulder,.004f,bottle)
      tube(shoulder,shoulder+EnginePoint(.025f,.019f,0f),.011f,bottle)
      tube(spout, spout + (mouth-spout)*pour, .0022f*pour, liquid)
      if (pour >= .99f && (liquidCenter-mouth).length() > .002f) tube(mouth, liquidCenter, .0022f, liquid)
    }
    return InspectionFrame(index, place(part.guideCenter), surface, effects, brightness)
  }
}
