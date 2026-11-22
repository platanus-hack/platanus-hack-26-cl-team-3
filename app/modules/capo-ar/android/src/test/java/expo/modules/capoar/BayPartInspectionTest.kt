package expo.modules.capoar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BayPartInspectionTest {
  private val center = EnginePoint(7f, -3f, 12f)
  private val basis = ModelBasis(listOf(center, center + EnginePoint(0f, 4f, 0f), center + EnginePoint(0f, 0f, 3f)))
  private val base = ModelTriangle(center, center + basis.x, center + basis.z, 0, floatArrayOf(.4f,.4f,.4f))
  private val cap = base.copy(a = base.a + basis.y, b = base.b + basis.y, c = base.c + basis.y, primitive = 1)
  private fun registered(p: EnginePoint) = EnginePoint(p.z, p.x, p.y) * .22f
  private fun shape(motion: BayInspectionMotion?) =
    BayPartInspection(ModelPart("washer", center, cap.a, motion), 4, listOf(base, cap), basis, ::registered)

  @Test fun liftUsesTheBayNormalAndReturnsToTheInstalledVertices() {
    val part = shape(null)
    val seated = part.frame(InspectionAction.HIGHLIGHT, 0f)!!
    val raised = part.frame(InspectionAction.LIFT, 2f)!!
    val expected = registered(center + basis.y * (basis.width * .14f))
    assertTrue((expected - raised.surface.first().a).length() < 1e-5f)
    assertTrue((raised.surface.first().b - raised.surface.first().a).length() >
      (seated.surface.first().b - seated.surface.first().a).length())
    assertEquals(seated.surface, part.frame(InspectionAction.LIFT, 4.9f)!!.surface)
    assertNull(part.frame(InspectionAction.SEPARATE, 2f))
    assertNull(part.frame(InspectionAction.LIFT, 5f))
  }

  @Test fun explodedInspectionPreservesTheHousingAndUsesTheBoundAxis() {
    val travel = EnginePoint(.41f, -.73f, .27f)
    val part = shape(BayInspectionMotion(BayMotionKind.SEPARATE, travel.unit(), travel.length(), center, movingPrimitive = 1))
    val separated = part.frame(InspectionAction.SEPARATE, 2f)!!
    assertEquals(registered(base.a), separated.surface.first().a)
    assertTrue((registered(cap.a + travel) - separated.surface.last().a).length() < 1e-5f)
    assertEquals(registered(cap.b), part.frame(InspectionAction.SEPARATE, 4.9f)!!.surface.last().b)
    assertNull(part.frame(InspectionAction.REFILL, 2f))
  }

  @Test fun twistRevealsTheFillerAndReturnsToTheSeatedPose() {
    val part = shape(BayInspectionMotion(BayMotionKind.TWIST, EnginePoint(0f, 0f, 1f), .5f,
      cap.a, (Math.PI / 2).toFloat(), movingPrimitive = 1))
    val opened = part.frame(InspectionAction.OPEN, 2.5f)!!
    val radial = cap.b - cap.a
    val expected = cap.a + EnginePoint(-radial.y, radial.x, radial.z + .5f)
    assertTrue((registered(expected) - opened.surface.last().b).length() < 1e-5f)
    assertEquals(registered(base.a), opened.surface.first().a)
    assertEquals(registered(cap.b), part.frame(InspectionAction.OPEN, 5.9f)!!.surface.last().b)
  }

  @Test fun washerRefillKeepsTheNeckFixedAndRestoresTheLid() {
    val normal = EnginePoint(0f, 0f, 1f)
    val neck = base.copy(b = center + EnginePoint(1f,0f,0f), c = center + EnginePoint(0f,1f,0f))
    val lid = neck.copy(a = neck.a + normal, b = neck.b + normal, c = neck.c + normal, primitive = 1)
    val part = BayPartInspection(ModelPart("washer", center, lid.a,
      BayInspectionMotion(BayMotionKind.SEPARATE, normal, .6f, center, movingPrimitive = 1)),
      4, listOf(neck,lid), basis, ::registered)
    val rest = part.frame(InspectionAction.REFILL, 0f)!!
    val pouring = part.frame(InspectionAction.REFILL, 5f)!!
    assertEquals(rest.surface.first(), pouring.surface.first())
    assertTrue((rest.surface.last().a - pouring.surface.last().a).length() > .1f)
    assertTrue(pouring.effects.isNotEmpty() && pouring.effects.all { it.a.length().isFinite() })
    assertEquals(rest.surface, part.frame(InspectionAction.REFILL, 9.8f)!!.surface)
  }
}
