package expo.modules.capoar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AnalisisGeometriaTest {
  @Test fun `el recorte rodea al vano con margen y no se sale de la imagen`() {
    val r = recuadroAlrededor(listOf(.3, .4, .7, .4, .7, .6, .3, .6))!!
    assertEquals(.2f, r.x0, 1e-4f); assertEquals(.8f, r.x1, 1e-4f)
    assertEquals(.35f, r.y0, 1e-4f); assertEquals(.65f, r.y1, 1e-4f)
    val borde = recuadroAlrededor(listOf(.0, .4, .5, .4, .5, .6, .0, .6))!!
    assertEquals(0f, borde.x0, 0f)
  }

  @Test fun `sin vano o con un recorte que ya es toda la imagen no se recorta`() {
    assertNull(recuadroAlrededor(emptyList()))
    assertNull(recuadroAlrededor(listOf(.1, .1, .2, .1)))
    assertNull(recuadroAlrededor(listOf(.5, .5, .51, .5, .51, .51)))
    assertNull(recuadroAlrededor(listOf(.02, .02, .98, .02, .98, .98, .02, .98)))
    assertNull(recuadroAlrededor(listOf(.1, .1, Double.NaN, .2, .3, .3)))
  }

  @Test fun `la focal en pixeles sale de la diagonal`() {
    // 26 mm sobre una foto de 4000 x 3000 (diagonal 5000 px): 26 * 5000 / 43,27
    assertEquals(3004.4f, focalEnPixeles(26f, 4000, 3000), 1f)
    // girar la foto no cambia la focal
    assertEquals(focalEnPixeles(26f, 4000, 3000), focalEnPixeles(26f, 3000, 4000), 1e-3f)
  }

  @Test fun `el casco ignora los puntos interiores`() {
    val c = casco(listOf(0f to 0f, 4f to 0f, 4f to 4f, 0f to 4f, 2f to 2f, 1f to 3f, 2f to 0f))
    assertEquals(setOf(0f to 0f, 4f to 0f, 4f to 4f, 0f to 4f), c.toSet())
    assertEquals(16f, kotlin.math.abs(areaPoligono(c)), 1e-4f)
  }

  @Test fun `un cuadro convexo y donde el detector vio el vano es creible`() {
    val cuadro = listOf(.3f to .4f, .7f to .4f, .7f to .6f, .3f to .6f)
    assertTrue(poseCreible(cuadro, RecuadroNorm(.2f, .3f, .8f, .7f)))
    assertTrue(poseCreible(cuadro, null))
  }

  @Test fun `una pose con el cuadro torcido, minusculo o lejos del vano no es creible`() {
    val mariposa = listOf(.3f to .4f, .7f to .6f, .7f to .4f, .3f to .6f)
    assertFalse(esConvexo(mariposa))
    assertFalse(poseCreible(mariposa, null))
    assertFalse(poseCreible(listOf(.5f to .5f, .51f to .5f, .51f to .51f, .5f to .51f), null))
    val cuadro = listOf(.3f to .4f, .7f to .4f, .7f to .6f, .3f to .6f)
    assertFalse(poseCreible(cuadro, RecuadroNorm(.0f, .0f, .2f, .2f)))
    assertFalse(poseCreible(cuadro.take(3), null))
  }
}
