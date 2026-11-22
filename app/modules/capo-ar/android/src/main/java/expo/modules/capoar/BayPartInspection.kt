package expo.modules.capoar

import kotlin.math.cos
import kotlin.math.sin

internal enum class BayMotionKind { SEPARATE, TWIST }

internal data class BayInspectionMotion(
  val kind: BayMotionKind,
  val axis: EnginePoint,
  val travel: Float,
  val origin: EnginePoint,
  val angle: Float = 0f,
  val movingPrimitive: Int? = null,
)

/** A filmed bay has an arbitrary origin, orientation and distance scale. Use its registered basis
 * for the presentation lift, and the individual fitting axis for an exploded inspection. */
internal class BayPartInspection(
  private val part: ModelPart,
  private val index: Int,
  source: List<ModelTriangle>,
  basis: ModelBasis,
  register: (EnginePoint) -> EnginePoint,
) : PartAnimation {
  private val center = register(part.center)
  private val guide = register(part.guideCenter)
  private val triangles = source.map { it.copy(part = index, a = register(it.a), b = register(it.b), c = register(it.c)) }
  private val lift = register(part.center + basis.y * (basis.width * .14f)) - center
  private val motion = part.motion
  private val pivot = motion?.let { register(it.origin) } ?: center
  private val displacement = motion?.let { register(it.origin + it.axis * it.travel) - pivot } ?: lift
  private val axis = displacement.unit()
  private val washerMouth = if (part.id == "washer" && motion?.movingPrimitive != null) {
    val fixed = triangles.filter { it.primitive != motion.movingPrimitive }.flatMap { listOf(it.a, it.b, it.c) }.distinct()
    val top = fixed.maxOfOrNull { it.dot(axis) }
    val rim = top?.let { level -> fixed.filter { level - it.dot(axis) < displacement.length() * .01f } }.orEmpty()
    if (rim.size < 3) null else {
      val mouth = rim.reduce(EnginePoint::plus) * (1f / rim.size)
      val radius = rim.map { (it - mouth).length() }.average().toFloat()
      val across = register(part.center + basis.x) - center
      val tangent = across - axis * across.dot(axis)
      if (radius > 0f && tangent.length() > 1e-6f) WasherMouth(mouth, radius, axis, tangent.unit()) else null
    }
  } else null

  init {
    motion?.movingPrimitive?.let { primitive -> require(source.any { it.primitive == primitive }) }
  }

  override fun frame(action: InspectionAction, time: Float): InspectionFrame? {
    if (time < 0f || time >= action.duration) return null
    val brightness = inspectionBrightness(action, time)
    val resting = InspectionFrame(index, guide, triangles, emptyList(), brightness)
    if (action == InspectionAction.HIGHLIGHT) return resting
    if (action == InspectionAction.REFILL) return washerMouth?.let { refill(it, time, resting) }
    val timeFraction = time / action.duration
    val fraction = ease(timeFraction, .07f, .36f) * (1f - ease(timeFraction, .66f, .96f))
    val lifting = action == InspectionAction.LIFT
    when (action) {
      InspectionAction.LIFT -> Unit
      InspectionAction.SEPARATE -> if (motion?.kind != BayMotionKind.SEPARATE) return null
      InspectionAction.OPEN -> if (motion?.kind != BayMotionKind.TWIST) return null
      else -> return null
    }
    if (fraction == 0f) return resting
    val twisting = !lifting && motion?.kind == BayMotionKind.TWIST
    val angle = if (twisting) motion!!.angle * ease(fraction, 0f, .65f) else 0f
    val c = cos(angle)
    val s = sin(angle)
    val travelFraction = if (twisting) ease(fraction, .4f, 1f) else fraction
    val offset = (if (lifting) lift else displacement) * travelFraction
    fun move(p: EnginePoint): EnginePoint {
      if (lifting) return p + (p - center) * (.35f * fraction) + offset
      if (!twisting) return p + offset
      val relative = p - pivot
      return pivot + relative * c + axis.cross(relative) * s + axis * (axis.dot(relative) * (1f - c)) + offset
    }
    val moving = motion?.movingPrimitive
    val surface = triangles.map { triangle ->
      if (!lifting && moving != null && triangle.primitive != moving) triangle
      else triangle.copy(a = move(triangle.a), b = move(triangle.b), c = move(triangle.c))
    }
    return InspectionFrame(index, move(guide), surface, emptyList(), brightness)
  }

  private data class WasherMouth(val center: EnginePoint, val radius: Float, val normal: EnginePoint, val side: EnginePoint)

  private fun refill(mouth: WasherMouth, time: Float, resting: InspectionFrame): InspectionFrame {
    val exposed = ease(time, .3f, 2.2f) * (1f - ease(time, 7.7f, 9.7f))
    if (exposed == 0f) return resting
    val shift = displacement * exposed - mouth.side * (mouth.radius * 1.9f * exposed)
    val lid = motion!!.movingPrimitive
    val surface = triangles.map { t ->
      if (t.primitive == lid) t.copy(a = t.a + shift, b = t.b + shift, c = t.c + shift) else t
    }
    val pouring = ease(time, 2.7f, 3.5f) * (1f - ease(time, 6.6f, 7.3f))
    if (pouring == 0f) return resting.copy(center = guide + shift, surface = surface)
    val r = mouth.radius
    val spout = mouth.center + mouth.normal * (1.6f * r) + mouth.side * (.6f * r)
    val shoulder = spout + (mouth.normal * .26f + mouth.side * .55f) * r
    val end = shoulder + (mouth.normal * .62f + mouth.side * 1.3f) * r
    val bottle = floatArrayOf(.67f,.71f,.73f)
    val liquid = floatArrayOf(.13f,.73f,.89f)
    val effects = buildList {
      val reference = mouth.side.cross(mouth.normal)
      fun tube(a: EnginePoint, b: EnginePoint, radius: Float, rgb: FloatArray) =
        inspectionTube(a, b, radius, index, rgb, reference)
      tube(spout, shoulder, .13f*r, bottle)
      tube(shoulder, end, .34f*r, bottle)
      val target = mouth.center - mouth.normal * (.1f * r)
      tube(spout, spout + (target - spout)*pouring, .055f*r, liquid)
    }
    return resting.copy(center = guide + shift, surface = surface, effects = effects)
  }
}
