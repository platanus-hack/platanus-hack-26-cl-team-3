package expo.modules.capoar

import kotlin.math.abs
import kotlin.math.hypot

/**
 * Cuántos grados (0, 90, 180 o 270, en sentido horario) hay que girar la imagen del sensor para que quede derecha
 * según la gravedad, sin importar cómo esté tomado el teléfono.
 *
 * `du`, `dv`: hacia dónde apunta «arriba» del mundo sobre la imagen del sensor, en píxeles (v crece hacia abajo).
 * `previous`: el giro del cuadro anterior. Se conserva cuando «arriba» casi no se ve en la imagen (el teléfono mira
 * derecho hacia el suelo o el cielo) o cuando el teléfono está cerca de la diagonal, para que el giro no salte de un
 * cuadro a otro.
 */
internal fun uprightRotation(du: Float, dv: Float, previous: Int): Int {
  if (!du.isFinite() || !dv.isFinite() || hypot(du, dv) < MIN_UP_LENGTH) return previous
  val candidate = if (abs(dv) >= abs(du)) (if (dv < 0) 0 else 180) else (if (du < 0) 90 else 270)
  if (candidate == previous) return previous
  // Para cambiar, la dirección nueva tiene que dominar con margen sobre la del giro anterior.
  val towardPrevious = if (previous % 180 == 0) abs(dv) else abs(du)
  val towardCandidate = if (candidate % 180 == 0) abs(dv) else abs(du)
  return if (candidate % 180 == previous % 180 || towardCandidate > towardPrevious * SWITCH_MARGIN) candidate else previous
}

private const val MIN_UP_LENGTH = 6f // px que mide en la imagen un tramo vertical de 10 cm a un metro, casi de punta
private const val SWITCH_MARGIN = 1.35f
