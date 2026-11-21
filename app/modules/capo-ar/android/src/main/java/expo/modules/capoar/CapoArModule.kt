package expo.modules.capoar

import com.google.ar.core.ArCoreApk
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Collections
import java.util.WeakHashMap

class CapoArModule : Module() {
  companion object {
    /** Vistas AR vivas, para pausar/reanudar ARCore cuando la app pasa a segundo plano. */
    val vistas: MutableSet<CapoArView> = Collections.newSetFromMap(WeakHashMap())
  }

  override fun definition() = ModuleDefinition {
    Name("CapoAr")

    /**
     * ¿El teléfono soporta ARCore? Devuelve el nombre de ArCoreApk.Availability: SUPPORTED_INSTALLED,
     * SUPPORTED_APK_TOO_OLD, SUPPORTED_NOT_INSTALLED, UNSUPPORTED_DEVICE_NOT_CAPABLE, UNKNOWN_CHECKING, UNKNOWN_ERROR…
     * (UNKNOWN_CHECKING: volver a preguntar en un momento).
     */
    AsyncFunction("disponibilidad") { promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) { promise.resolve("UNKNOWN_ERROR"); return@AsyncFunction }
      promise.resolve(ArCoreApk.getInstance().checkAvailability(ctx).name)
    }

    OnActivityEntersForeground { vistas.toList().forEach { it.reanudar() } }
    OnActivityEntersBackground { vistas.toList().forEach { it.pausar() } }

    View(CapoArView::class) {
      Events("onEstado", "onPart", "onGuia")

      Prop("debug") { vista: CapoArView, debug: Boolean? -> vista.capa.debug = debug ?: true }

      Prop("selectedPart") { view: CapoArView, index: Int? ->
        view.capa.selectedPart = index ?: -1
        view.guidePart = index ?: -1
      }

      AsyncFunction("capturar") { view: CapoArView, includeMeasurements: Boolean?, promise: Promise ->
        view.capturar(includeMeasurements ?: true, promise)
      }

      AsyncFunction("mostrarVista") { vista: CapoArView, esquinas: List<Double>, bordes: List<Boolean>, grados: Int ->
        vista.mostrarVista(esquinas, bordes, grados)
      }

      AsyncFunction("fijar") {
        vista: CapoArView, id: Int, esquinas: List<Double>, registration: List<Double>, volumes: List<List<Double>>,
        observedCenters: List<List<Double>>?, promise: Promise ->
        vista.fijar(id, esquinas, registration, volumes, observedCenters.orEmpty(), promise)
      }

      AsyncFunction("soltar") { vista: CapoArView -> vista.soltar() }

      AsyncFunction("pulso") { vista: CapoArView -> vista.pulso() }

      AsyncFunction("acumular") { vista: CapoArView, id: Int, mascara: String, rx: Double, ry: Double, lado: Double, promise: Promise ->
        vista.acumular(id, mascara, rx, ry, lado, promise)
      }

      AsyncFunction("contornoEscaneo") { vista: CapoArView, id: Int, esquinas: List<Double>, promise: Promise ->
        vista.contornoEscaneo(id, esquinas, promise)
      }

      AsyncFunction("reiniciarEscaneo") { vista: CapoArView -> vista.reiniciarEscaneo() }

      AsyncFunction("sembrar") { vista: CapoArView, x: Double, y: Double, promise: Promise -> vista.sembrar(x, y, promise) }

      OnViewDestroys { vista -> vista.destruir() }
    }
  }
}
