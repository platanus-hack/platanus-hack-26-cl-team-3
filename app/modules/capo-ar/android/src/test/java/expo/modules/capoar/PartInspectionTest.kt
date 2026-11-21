package expo.modules.capoar

import org.junit.Assert.*
import org.junit.Test

class PartInspectionTest {
  private val origin = EnginePoint(.4f,0f,.1f)
  private val vertices = listOf(origin, origin + EnginePoint(.04f,0f,0f), origin + EnginePoint(0f,-.1f,.03f))
  private val neck = ModelTriangle(vertices[0], vertices[1], vertices[2], 9, floatArrayOf(.4f,.8f,.7f))
  private val cap = neck.copy(a = origin + EnginePoint(0f,.01f,0f), primitive = 1)
  private fun inspection(id: String) = InspectionPart(ModelPart(id,origin), 3, listOf(neck,cap)) { it }

  @Test fun highlightKeepsGeometryAndLiftRestoresTheOriginalPose() {
    val part = inspection("fuses")
    val highlighted = part.frame(InspectionAction.HIGHLIGHT,.6f)!!
    assertEquals(origin, highlighted.center)
    assertEquals(vertices, highlighted.surface.first().let { listOf(it.a,it.b,it.c) })
    val lifted = part.frame(InspectionAction.LIFT,2.8f)!!
    assertTrue(lifted.center.y > origin.y)
    assertTrue(lifted.effects.isNotEmpty())
    assertNull(part.frame(InspectionAction.LIFT,5f))
    assertNull(InspectionAction.resolve("fuses","refill"))
  }

  @Test fun refillOpensTheCapBeforePouringAndRestoresTheRegisteredCenter() {
    val part = inspection("washer")
    val before = part.frame(InspectionAction.REFILL,3.11f)!!
    val open = part.frame(InspectionAction.REFILL,4.1f)!!
    assertEquals(before.center,open.center)
    assertNotEquals(before.surface.last().b,open.surface.last().b)
    val pour = part.frame(InspectionAction.REFILL,5.7f)!!
    assertTrue(pour.effects.size > before.effects.size)
    assertTrue(pour.surface.any { it.rgb[2] > it.rgb[1] })
    assertEquals(origin,part.frame(InspectionAction.REFILL,9.8f)!!.center)
    assertNull(part.frame(InspectionAction.REFILL,10f))
  }

  @Test fun aSealedNeckOpensAndItsLiquidSurfaceRises() {
    val top = listOf(origin, origin + EnginePoint(.04f,0f,0f), origin + EnginePoint(0f,0f,.04f))
    val base = top.map { it + EnginePoint(0f,-.1f,0f) }
    fun face(a: EnginePoint, b: EnginePoint, c: EnginePoint) = neck.copy(a=a, b=b, c=c)
    val mesh = buildList {
      add(face(top[0],top[1],top[2]))
      add(face(base[0],base[1],base[2]))
      for (i in top.indices) {
        val j = (i+1) % top.size
        add(face(base[i],base[j],top[j]))
        add(face(base[i],top[j],top[i]))
      }
    }
    val part = InspectionPart(ModelPart("washer",origin),0,mesh) { it }
    val closed = part.frame(InspectionAction.REFILL,3.12f)!!
    val opened = part.frame(InspectionAction.REFILL,4.1f)!!
    assertEquals(closed.surface.size-1,opened.surface.size)
    fun surfaceHeight(time: Float) = part.frame(InspectionAction.REFILL,time)!!.surface.first {
      it.rgb[2] > it.rgb[1] && kotlin.math.abs(it.a.y-it.b.y) < .00001f &&
        kotlin.math.abs(it.b.y-it.c.y) < .00001f && it.a.y > closed.surface[1].a.y + .001f
    }.a.y
    assertTrue(surfaceHeight(5.8f) > surfaceHeight(4.8f))
  }
}
