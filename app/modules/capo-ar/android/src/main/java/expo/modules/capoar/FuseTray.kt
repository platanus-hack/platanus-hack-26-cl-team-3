package expo.modules.capoar

import org.json.JSONObject

/** Open tray of the filmed EZ36. Photo coordinates are shared with the tappable engine-box image. */
internal fun fuseTray(layout: JSONObject, part: Int): List<ModelTriangle> = buildList {
  // Three points on the case top register the photographed rows below the removable cover.
  val rearLeft = EnginePoint(.344f, .003f, -.066f)
  val across = EnginePoint(.167f, -.027f, -.052f)
  val forward = EnginePoint(-.010f, -.028f, .114f)
  val up = forward.cross(across).unit()
  val finishes = mapOf(
    "grey" to floatArrayOf(.43f,.43f,.41f), "black" to floatArrayOf(.14f,.15f,.16f),
    "brown" to floatArrayOf(.42f,.25f,.20f), "ivory" to floatArrayOf(.75f,.72f,.64f),
    "tan" to floatArrayOf(.50f,.39f,.32f), "red" to floatArrayOf(.68f,.27f,.22f),
    "blue" to floatArrayOf(.30f,.43f,.63f), "yellow" to floatArrayOf(.73f,.70f,.37f),
    "green" to floatArrayOf(.35f,.52f,.42f), "clear" to floatArrayOf(.68f,.67f,.61f),
  )
  val socket = floatArrayOf(.095f,.10f,.10f)
  val metal = floatArrayOf(.79f,.79f,.75f)
  fun point(x: Float, y: Float, height: Float) =
    rearLeft + across * ((x - 24f) / 727f) + forward * ((y - 55f) / 465f) + up * height
  fun block(x: Float, y: Float, w: Float, h: Float, bottom: Float, top: Float, color: FloatArray) {
    val outline = listOf(x-w/2 to y-h/2, x+w/2 to y-h/2, x+w/2 to y+h/2, x-w/2 to y+h/2)
    val low = outline.map { (u,v) -> point(u,v,bottom) }
    val high = outline.map { (u,v) -> point(u,v,top) }
    fun face(a: EnginePoint,b: EnginePoint,c: EnginePoint,d: EnginePoint) {
      add(ModelTriangle(a,b,c,part,color))
      add(ModelTriangle(a,c,d,part,color))
    }
    face(high[0],high[1],high[2],high[3])
    for (i in outline.indices) {
      val next = (i+1)%outline.size
      face(low[i],low[next],high[next],high[i])
    }
  }
  val slots = layout.getJSONArray("slots")
  for (i in 0 until slots.length()) {
    val slot = slots.getJSONObject(i)
    val x = slot.getInt("x").toFloat()
    val y = slot.getInt("y").toFloat()
    block(x,y,22f,39f,.001f,.003f,socket)
    if (slot.isNull("finish")) continue
    block(x,y,16f,30f,.003f,.006f,finishes.getValue(slot.getString("finish")))
    for (offset in listOf(-9f,9f)) block(x,y+offset,4f,4f,.006f,.0063f,metal)
  }
  val relays = layout.getJSONArray("relays")
  for (i in 0 until relays.length()) {
    val relay = relays.getJSONObject(i)
    block(relay.getInt("x").toFloat(),relay.getInt("y").toFloat(),
      relay.getInt("width").toFloat(),relay.getInt("height").toFloat(),
      .001f,.013f,finishes.getValue(relay.getString("finish")))
  }
}
