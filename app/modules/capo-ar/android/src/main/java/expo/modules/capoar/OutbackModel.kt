package expo.modules.capoar

import android.content.res.AssetManager
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs

internal data class ModelTriangle(val a: EnginePoint, val b: EnginePoint, val c: EnginePoint, val part: Int, val rgb: FloatArray)
internal data class ModelPart(val id: String, val center: EnginePoint)
internal class OutbackModel(
  val parts: List<ModelPart>, val corners: List<EnginePoint>, val triangles: List<ModelTriangle>,
) {
  companion object {
    // The bundled GLB has a single scene of identity-transform nodes, indexed triangles,
    // packed float positions, unsigned short indices and solid double-sided materials.
    fun load(assets: AssetManager): OutbackModel {
      val binding = assets.open("engine-models/outback-registration.json").bufferedReader().use { JSONObject(it.readText()) }
      fun point(a: JSONArray) = EnginePoint(a.getDouble(0).toFloat(), a.getDouble(1).toFloat(), a.getDouble(2).toFloat())
      val parts = binding.getJSONArray("parts").objects().map { ModelPart(it.getString("id"), point(it.getJSONArray("center"))) }
      val corners = binding.getJSONArray("corners").let { a -> List(4) { point(a.getJSONArray(it)) } }
      val file = ByteBuffer.wrap(assets.open("engine-models/outback-ez36.glb").use { it.readBytes() }).order(ByteOrder.LITTLE_ENDIAN)
      require(file.int == 0x46546c67 && file.int == 2 && file.int == file.capacity())
      val jsonBytes = ByteArray(file.int)
      require(file.int == 0x4e4f534a)
      file.get(jsonBytes)
      val doc = JSONObject(String(jsonBytes, Charsets.UTF_8))
      val length = file.int
      require(file.int == 0x004e4942 && length == file.remaining())
      val binary = file.slice().order(ByteOrder.LITTLE_ENDIAN)
      val accessors = doc.getJSONArray("accessors")
      val views = doc.getJSONArray("bufferViews")
      fun data(index: Int, component: Int, type: String): Pair<Int, Int> {
        val a = accessors.getJSONObject(index)
        val v = views.getJSONObject(a.getInt("bufferView"))
        require(a.getInt("componentType") == component && a.getString("type") == type && !v.has("byteStride"))
        return v.optInt("byteOffset", 0) + a.optInt("byteOffset", 0) to a.getInt("count")
      }
      val scene = doc.getJSONArray("scenes").getJSONObject(doc.getInt("scene")).getJSONArray("nodes")
      require(scene.length() == parts.size)
      val triangles = buildList {
        for (part in parts.indices) {
          val node = doc.getJSONArray("nodes").getJSONObject(scene.getInt(part))
          val mesh = doc.getJSONArray("meshes").getJSONObject(node.getInt("mesh"))
          for (primitive in mesh.getJSONArray("primitives").objects()) {
            val (pos, count) = data(primitive.getJSONObject("attributes").getInt("POSITION"), 5126, "VEC3")
            val vertices = List(count) { i ->
              val at = pos + 12 * i
              EnginePoint(binary.getFloat(at), binary.getFloat(at + 4), binary.getFloat(at + 8))
            }
            val material = doc.getJSONArray("materials").getJSONObject(primitive.getInt("material"))
            val color = material.getJSONObject("pbrMetallicRoughness").getJSONArray("baseColorFactor")
            val rgb = when (parts[part].id) {
              "washer" -> floatArrayOf(.32f,.89f,.76f)
              "dipstick" -> floatArrayOf(1f,.82f,.40f)
              "fuses" -> floatArrayOf(.47f,.73f,1f)
              else -> FloatArray(3) { Math.pow(color.getDouble(it), 1 / 2.2).toFloat() }
            }
            val (indices, n) = data(primitive.getInt("indices"), 5123, "SCALAR")
            fun vertex(i: Int) = vertices[binary.getShort(indices + 2 * i).toInt() and 65535]
            for (i in 0 until n step 3) add(ModelTriangle(vertex(i), vertex(i+1), vertex(i+2), part, rgb))
          }
        }
      }
      return OutbackModel(parts, corners, triangles)
    }

    private fun JSONArray.objects() = List(length()) { getJSONObject(it) }
  }
}

internal fun EnginePoint.unit() = this * (1f / length())

/** A single similarity transform keeps part spacing and depth consistent across viewpoints. */
internal class ModelBasis(points: List<EnginePoint>) {
  val middle = points.reduce(EnginePoint::plus) * (1f / points.size)
  private val horizontal = points[1] - points[0]
  val width = horizontal.length()
  val x = horizontal.unit()
  val y = (points[2] - points[0]).cross(x).unit()
  val z = x.cross(y)
  fun coordinates(v: EnginePoint) = EnginePoint(v.dot(x), v.dot(y), v.dot(z))
  fun vector(v: EnginePoint) = x*v.x + y*v.y + z*v.z
}

internal class PlacedModel(model: OutbackModel, registration: EngineMesh, ids: List<String>) {
  val triangles: List<ModelTriangle>
  val centers: Map<Int, EnginePoint>
  init {
    val indices = model.parts.map { ids.indexOf(it.id).also { i -> require(i >= 0) } }
    val src = model.corners
    val dst = registration.registrationCorners.map { it - registration.origin }
    fun guides(c: List<EnginePoint>) = listOf((c[0]+c[2])*.5f, (c[1]+c[3])*.5f, c[2])
    val source = ModelBasis(guides(src))
    val target = ModelBasis(guides(dst))
    val scale = target.width / source.width
    val srcMiddle = src.reduce(EnginePoint::plus)*.25f
    val dstMiddle = dst.reduce(EnginePoint::plus)*.25f
    fun initial(p: EnginePoint) = dstMiddle + target.vector(source.coordinates(p - srcMiddle))*scale
    val observed = model.parts.mapIndexedNotNull { i, part ->
      val index = indices[i]
      if (index in registration.adjustedParts) registration.center(index)?.let { initial(part.center) to it } else null
    }
    fun median(values: List<Float>) = values.sorted().let { (it[(it.size-1)/2]+it[it.size/2])*.5f }
    val offsets = observed.map { (estimate, measurement) -> measurement-estimate }
    val shift = if (offsets.isEmpty()) EnginePoint(0f,0f,0f) else EnginePoint(
      median(offsets.map { it.x }), median(offsets.map { it.y }), median(offsets.map { it.z }))
    // When three spread-out measurements agree, also refine orientation. Pixel-only detections never move the model.
    var best: ((EnginePoint) -> EnginePoint) = { it + shift }
    fun error(f: (EnginePoint) -> EnginePoint) = observed.sumOf { (p,q) -> (f(p)-q).length().coerceAtMost(target.width*.12f).toDouble() }
    var score = error(best)
    for (a in observed.indices) for (b in a+1 until observed.size) for (c in b+1 until observed.size) {
      val triple = listOf(observed[a],observed[b],observed[c])
      val from = triple.map { it.first }; val to = triple.map { it.second }
      fun spread(p: List<EnginePoint>) = (p[1]-p[0]).cross(p[2]-p[0]).length()
      if (minOf(spread(from),spread(to)) < target.width*target.width*.025f) continue
      val u=ModelBasis(from); val v=ModelBasis(to); val ratio=v.width/u.width
      if (ratio !in .65f..1.5f) continue
      val transform: (EnginePoint)->EnginePoint = { p -> v.middle + v.vector(u.coordinates(p-u.middle))*ratio }
      val next=error(transform)
      if (next < score) { best=transform; score=next }
    }
    fun place(p: EnginePoint) = best(initial(p))
    centers = model.parts.mapIndexed { i,p -> indices[i] to place(p.center) }.toMap()
    val cache = HashMap<EnginePoint,EnginePoint>()
    fun vertex(p: EnginePoint) = cache.getOrPut(p) { place(p) }
    triangles = model.triangles.map { t -> ModelTriangle(vertex(t.a),vertex(t.b),vertex(t.c),indices[t.part],t.rgb) }
  }

  /** Nearest intersection on the same double-sided triangles drawn by OpenGL. */
  fun pick(start: EnginePoint, end: EnginePoint): Int? {
    val direction=end-start
    var nearest=1f
    var part: Int?=null
    for (t in triangles) {
      val e1=t.b-t.a; val e2=t.c-t.a; val p=direction.cross(e2); val det=e1.dot(p)
      if (abs(det)<1e-10f) continue
      val d=start-t.a; val u=d.dot(p)/det
      if (u !in 0f..1f) continue
      val q=d.cross(e1); val v=direction.dot(q)/det
      if (v<0 || u+v>1) continue
      val distance=e2.dot(q)/det
      if (distance>=0 && distance<nearest) {nearest=distance; part=t.part}
    }
    return part
  }
}
