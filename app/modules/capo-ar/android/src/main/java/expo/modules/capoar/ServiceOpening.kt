package expo.modules.capoar

import kotlin.math.atan2
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

internal val openingParts = setOf("washer", "dipstick", "fuses", "positive", "oil_cap", "brake_fluid", "brake_cap")
private val metal = floatArrayOf(.63f, .65f, .62f)
internal val yellow = floatArrayOf(.98f, .71f, .05f)
internal val ivory = floatArrayOf(.83f, .80f, .65f)
internal val lidPlastic = floatArrayOf(.23f, .24f, .24f)
internal val dark = floatArrayOf(.12f, .12f, .10f)

private fun List<EnginePoint>.middle() = reduce(EnginePoint::plus) * (1f / size)

private fun MutableList<ModelTriangle>.quad(a: EnginePoint, b: EnginePoint, c: EnginePoint, d: EnginePoint,
  index: Int, color: FloatArray, primitive: Int = 0) {
  add(ModelTriangle(a, b, c, index, color, primitive))
  add(ModelTriangle(a, c, d, index, color, primitive))
}

private fun ModelTriangle.vertices() = listOf(a, b, c)

/** The oil gauge has a pierced yellow pull handle above the guide tube. */
internal fun dipstickHandle(source: List<ModelTriangle>): List<ModelTriangle> {
  val handle = source.filter { it.primitive == 1 }
  if (handle.isEmpty()) return source
  val points = handle.flatMap { it.vertices() }.distinct()
  val center = points.middle()
  val width = points.maxOf { it.x } - points.minOf { it.x }
  val height = points.maxOf { it.y } - points.minOf { it.y }
  val index = handle.first().part
  val outline = listOf(-.42f to .5f, .42f to .5f, .5f to .37f, .41f to -.16f,
    .16f to -.46f, 0f to -.5f, -.16f to -.46f, -.41f to -.16f, -.5f to .37f)
  fun loop(i: Int, inner: Boolean, face: Int): EnginePoint {
    val (x, y) = outline[i]
    val scale = if (inner) .63f else 1f
    return center + EnginePoint(x * width * scale, y * height * scale, face * width * .12f)
  }
  return buildList {
    addAll(source.filter { it.primitive != 1 })
    for (i in outline.indices) {
      val next = (i + 1) % outline.size
      for (face in listOf(-1, 1)) {
        quad(loop(i, false, face), loop(next, false, face), loop(next, true, face), loop(i, true, face), index, yellow, 1)
      }
      for (inner in listOf(false, true)) {
        quad(loop(i, inner, -1), loop(next, inner, -1), loop(next, inner, 1), loop(i, inner, 1), index, yellow, 1)
      }
    }
  }
}

/** Keep the existing boot perimeter and give the folded rubber cover its visible hollow interior. */
internal fun terminalBoot(source: List<ModelTriangle>): List<ModelTriangle> {
  val vertices = source.flatMap { it.vertices() }.distinct()
  val bottom = vertices.minOf { it.y }
  val rim = vertices.filter { it.y == bottom }
  if (rim.size < 3) return source
  val center = rim.middle()
  val edge = rim.sortedBy { atan2(it.z - center.z, it.x - center.x) }
  val depth = (vertices.maxOf { it.y } - bottom) * .78f
  val interior = floatArrayOf(.43f, .13f, .11f)
  val index = source.first().part
  fun inner(p: EnginePoint) = center + (p - center) * .87f
  fun back(p: EnginePoint) = inner(p) + EnginePoint(0f, depth, 0f)
  return buildList {
    addAll(source.filterNot { it.a.y == bottom && it.b.y == bottom && it.c.y == bottom })
    for (i in edge.indices) {
      val a = edge[i]
      val b = edge[(i + 1) % edge.size]
      quad(a, b, inner(b), inner(a), index, source.first().rgb)
      quad(inner(a), inner(b), back(b), back(a), index, interior)
      add(ModelTriangle(center + EnginePoint(0f,depth,0f), back(a), back(b), index, interior))
    }
  }
}

/** Round brake reservoir cap with the rectangular edge grips and painted witness mark from the recording. */
internal fun brakeReservoirCap(source: List<ModelTriangle>, part: ModelPart): List<ModelTriangle> {
  val vertices = source.flatMap { it.vertices() }
  val radius = (vertices.maxOf { it.x } - vertices.minOf { it.x }) * .5f
  val low = vertices.minOf { it.y }
  val height = vertices.maxOf { it.y } - low
  val index = source.first().part
  val cap = source.first().rgb
  fun rim(i: Int, scale: Float, y: Float): EnginePoint {
    val angle = i * (2 * PI / 48).toFloat()
    return EnginePoint(part.center.x + cos(angle) * radius * scale, low + height * y, part.center.z + sin(angle) * radius * scale)
  }
  return buildList {
    for (i in 0 until 48) {
      val j = i + 1
      val grip = if (i % 4 == 0) 1.035f else .95f
      quad(rim(i,.97f,1f),rim(j,.97f,1f),rim(j,grip,.86f),rim(i,grip,.86f),index,cap)
      quad(rim(i,grip,.86f),rim(j,grip,.86f),rim(j,grip,.12f),rim(i,grip,.12f),index,cap)
      quad(rim(i,grip,.12f),rim(j,grip,.12f),rim(j,.94f,0f),rim(i,.94f,0f),index,cap)
      if (grip > 1f) for (end in listOf(i,j))
        quad(rim(end,.95f,.86f),rim(end,grip,.86f),rim(end,grip,.12f),rim(end,.95f,.12f),index,cap)
      add(ModelTriangle(part.center.copy(y=low+height),rim(i,.97f,1f),rim(j,.97f,1f),index,cap))
      add(ModelTriangle(part.center.copy(y=low),rim(i,.94f,0f),rim(j,.94f,0f),index,cap))
    }
    add(ModelTriangle(rim(1,.37f,1.008f),rim(0,.96f,1.008f),rim(2,.96f,1.008f),index,floatArrayOf(.38f,.39f,.38f)))
  }
}

/** Molded ring and oil-can mark visible on the filmed yellow oil filler cap. */
internal fun oilCapMark(source: List<ModelTriangle>, part: ModelPart): List<ModelTriangle> {
  val points = source.flatMap { it.vertices() }
  val width = points.maxOf { it.x } - points.minOf { it.x }
  val top = part.center.copy(y = points.maxOf { it.y } + width * .012f)
  val index = source.first().part
  val ochre = floatArrayOf(.65f, .43f, .08f)
  fun at(x: Float, z: Float) = top + EnginePoint(x * width, 0f, z * width)
  return buildList {
    addAll(source)
    fun stroke(x: Float, z: Float, endX: Float, endZ: Float, thickness: Float) {
      val start = at(x, z)
      val end = at(endX, endZ)
      val along = (end - start).unit()
      val side = EnginePoint(-along.z, 0f, along.x) * (width * thickness / 2)
      quad(start + side, end + side, end - side, start - side, index, ochre)
    }
    for (i in 0 until 32) {
      val a = (2 * PI * i / 32).toFloat()
      val b = (2 * PI * (i + 1) / 32).toFloat()
      stroke(.32f*cos(a), .32f*sin(a), .32f*cos(b), .32f*sin(b), .012f)
    }
    val outline = listOf(-.15f to -.04f, -.03f to -.04f, .035f to .015f, .20f to -.105f,
      .23f to -.07f, .045f to .13f, -.15f to .13f, -.15f to -.04f)
    for ((a,b) in outline.zipWithNext()) stroke(a.first, a.second, b.first, b.second, .024f)
    stroke(-.12f, -.10f, -.02f, -.10f, .028f)
    stroke(-.07f, -.10f, -.07f, -.04f, .022f)
  }
}

/** Demonstrate each recorded mechanism in its original registration, then reverse it to the seated pose. */
internal class ServiceOpening(
  private val part: ModelPart, private val index: Int, private val source: List<ModelTriangle>,
  private val register: (EnginePoint) -> EnginePoint,
  private val washerHinge: EnginePoint, private val washerMouth: Set<EnginePoint>, openTray: List<ModelTriangle>,
) {
  private val points = source.flatMap { it.vertices() }.distinct()
  private val width = (points.maxOf { it.x } - points.minOf { it.x }).coerceAtLeast(.001f)
  private val low = points.minOf { it.y }
  private val bootHinge = EnginePoint(part.center.x, low, points.minOf { it.z })
  private val tube = source.filter { it.primitive == 0 }.flatMap { it.vertices() }.distinct()
  private val gaugeAxis = if (part.id == "dipstick" && tube.size >= 4) {
    val sorted = tube.sortedBy { it.y }
    (sorted.takeLast(sorted.size / 2).middle() - sorted.take(sorted.size / 2).middle()).unit()
  } else EnginePoint(0f, 1f, 0f)
  private val tubeMouth = if (part.id == "dipstick" && tube.size >= 4)
    tube.sortedBy { it.y }.takeLast(tube.size / 2).middle() else part.center
  private val split = part.id == "washer" || part.id == "dipstick" || part.id == "fuses"
  private val mobile = if (split) source.filter { it.primitive == 1 } else source
  private fun registered(t: ModelTriangle) = t.copy(a=register(t.a), b=register(t.b), c=register(t.c), part=index)
  private val stationary = if (split) source.filter { it.primitive != 1 } else emptyList()
  private val seated = source.map(::registered)
  private val openBase = stationary.filterNot { part.id == "washer" &&
    it.a in washerMouth && it.b in washerMouth && it.c in washerMouth }.map(::registered)
  private val hardware = buildList {
    // Surfaces exposed as the boot/cap opens. The rings depict the clamp and reservoir mouth seen on the test car.
    fun socket(center: EnginePoint, radius: Float, depth: Float, rgb: FloatArray, sides: Int, inner: Float) {
      fun edge(i: Int, r: Float, y: Float): EnginePoint {
        val angle = (2 * PI * i / sides).toFloat()
        return center + EnginePoint(cos(angle) * r, y, sin(angle) * r)
      }
      for (i in 0 until sides) {
        val j = (i + 1) % sides
        quad(edge(i,radius,0f), edge(j,radius,0f), edge(j,radius,-depth), edge(i,radius,-depth), index, rgb)
        quad(edge(i,radius,0f), edge(j,radius,0f), edge(j,inner,0f), edge(i,inner,0f), index, rgb)
        quad(edge(i,inner,0f), edge(j,inner,0f), edge(j,inner,-depth), edge(i,inner,-depth), index, rgb)
        add(ModelTriangle(center + EnginePoint(0f,-depth,0f), edge(i,inner,-depth), edge(j,inner,-depth), index, dark))
      }
    }
    when (part.id) {
      "washer" -> if (washerMouth.isNotEmpty()) {
        val mouth = washerMouth.toList().middle()
        val radius = washerMouth.maxOf { (it - mouth).length() }
        socket(mouth + EnginePoint(0f, radius*.08f, 0f), radius*.96f, radius*.54f, ivory, 24, radius*.83f)
      }
      "brake_cap" -> socket(EnginePoint(part.center.x, low + width*.035f, part.center.z),
        width*.38f, width*.18f, ivory, 24, width*.27f)
      "positive" -> {
        val seat = EnginePoint(part.center.x, low + width*.04f, part.center.z)
        socket(seat, width*.31f, width*.10f, metal, 16, width*.19f)
        socket(seat + EnginePoint(0f,width*.045f,0f), width*.19f, width*.05f, metal, 12, width*.015f)
        val bridge = seat + EnginePoint(0f, -width*.02f, 0f)
        fun bridgePoint(x: Float, z: Float) = bridge + EnginePoint(width*x, 0f, width*z)
        quad(bridgePoint(-.10f,-.16f), bridgePoint(.10f,-.16f), bridgePoint(.10f,-.44f), bridgePoint(-.10f,-.44f), index, metal)
        socket(seat + EnginePoint(0f,0f,-width*.36f), width*.16f, width*.10f, metal, 6, width*.045f)
      }
      "fuses" -> addAll(openTray)
    }
  }.map(::registered)

  fun frame(time: Float, brightness: Float): InspectionFrame {
    val progress = ease(time, .3f, 2.1f) * (1f - ease(time, 3.7f, 5.7f))
    if (progress == 0f) return InspectionFrame(index, register(part.guideCenter), seated, emptyList(), brightness)
    val twist = ease(progress, 0f, .48f)
    val remove = ease(progress, .35f, 1f)
    val travel = gaugeAxis * (.22f * progress)
    fun moving(p: EnginePoint): EnginePoint = when (part.id) {
      "washer" -> swingWasherLid(p, washerHinge, progress)
      "fuses" -> {
        val d = p - part.center
        val angle = remove * .44f
        part.center + EnginePoint(d.x, d.y*cos(angle) - d.z*sin(angle), d.y*sin(angle) + d.z*cos(angle)) +
          EnginePoint(.09f*remove, .14f*progress, -.055f*remove)
      }
      "positive" -> {
        val d = p - bootHinge
        val angle = progress * 1.78f
        bootHinge + EnginePoint(d.x, d.y*cos(angle) + d.z*sin(angle), -d.y*sin(angle) + d.z*cos(angle))
      }
      "dipstick" -> p + travel
      "oil_cap", "brake_cap" -> {
        val brake = part.id == "brake_cap"
        val angle = if (brake) twist * 1.3f else progress * 1.5f
        val d = p - part.center
        val offset = if (brake) EnginePoint(.028f*remove, .055f*remove, -.012f*remove) else EnginePoint(0f,.002f*progress,0f)
        part.center + EnginePoint(d.x*cos(angle) + d.z*sin(angle), d.y, -d.x*sin(angle) + d.z*cos(angle)) + offset
      }
      else -> p
    }
    val surface = buildList {
      addAll(openBase)
      val vertices = HashMap<EnginePoint, EnginePoint>()
      fun vertex(p: EnginePoint) = vertices.getOrPut(p) { register(moving(p)) }
      for (t in mobile) add(t.copy(a=vertex(t.a), b=vertex(t.b), c=vertex(t.c), part=index))
      addAll(hardware)
      if (part.id == "dipstick") {
        val strip = EnginePoint(.0015f,0f,0f)
        val end = part.center + travel
        quad(register(tubeMouth-strip), register(tubeMouth+strip), register(end+strip), register(end-strip), index, metal)
      }
    }
    return InspectionFrame(index, register(moving(part.guideCenter)), surface, emptyList(), brightness)
  }
}
