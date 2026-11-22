package expo.modules.capoar

import android.view.View
import android.view.ViewGroup
import androidx.camera.view.PreviewView
import com.google.ar.core.ArCoreApk
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Collections
import java.util.WeakHashMap

class CapoArModule : Module() {
  private val plateReader = lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
  private var closed = false
  private val analisis by lazy { AnalisisImagen(requireNotNull(appContext.reactContext) { "Sin contexto de React" }) }

  private fun findCameraPreview(view: View): PreviewView? {
    if (view is PreviewView) return view
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        findCameraPreview(view.getChildAt(index))?.let { return it }
      }
    }
    return null
  }

  companion object {
    /** Vistas AR vivas, para pausar/reanudar ARCore cuando la app pasa a segundo plano. */
    val vistas: MutableSet<CapoArView> = Collections.newSetFromMap(WeakHashMap())
  }

  override fun definition() = ModuleDefinition {
    Name("CapoAr")

    AsyncFunction("readPlatePreview") { cameraContainer: View, promise: Promise ->
      val preview = requireNotNull(findCameraPreview(cameraContainer)) { "Camera preview is unavailable" }
      val frame = preview.bitmap
      if (frame == null) {
        promise.resolve(emptyList<String>())
        return@AsyncFunction
      }
      val image = InputImage.fromBitmap(frame, 0)
      val task = synchronized(plateReader) {
        check(!closed) { "Plate reader module was destroyed" }
        plateReader.value.process(image)
      }
      task
        .addOnSuccessListener { text ->
          promise.resolve(text.textBlocks.flatMap { block -> block.lines.map { it.text } })
        }
        .addOnFailureListener { error -> promise.reject("ERR_PLATE_OCR", error.message, error) }
        .addOnCompleteListener { frame.recycle() }
    }.runOnQueue(Queues.MAIN)

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

    /**
     * Ubica el modelo 3D del Outback sobre una foto fija con el mismo registro visual del escáner (sin ARCore).
     * `vano`: esquinas del detector (x0, y0, x1, y1… normalizadas), para recortar alrededor; lista vacía = imagen completa.
     * Devuelve { ok, foto, capa, ancho, alto, piezas[{id, contorno, centro}], vano } o { ok: false, motivo }.
     */
    AsyncFunction("analizarImagen") { uri: String, vano: List<Double>?, promise: Promise ->
      try {
        promise.resolve(analisis.analizar(uri, vano.orEmpty()))
      } catch (e: Throwable) {
        promise.reject("ERR_ANALISIS", e.message ?: e.javaClass.simpleName, e)
      }
    }.runOnQueue(Queues.DEFAULT)

    OnDestroy {
      synchronized(plateReader) {
        closed = true
        if (plateReader.isInitialized()) plateReader.value.close()
      }
    }

    OnActivityEntersForeground { vistas.toList().forEach { it.reanudar() } }
    OnActivityEntersBackground { vistas.toList().forEach { it.pausar() } }

    View(CapoArView::class) {
      Events("onEstado", "onPart", "onGuia")

      Prop("debug") { vista: CapoArView, debug: Boolean? -> vista.capa.debug = debug ?: true }

      Prop("swiftParts") { view: CapoArView, ids: List<String>? -> view.swiftParts = ids.orEmpty() }
      Prop("outbackParts") { view: CapoArView, ids: List<String>? -> view.outbackParts = ids.orEmpty() }

      Prop("editingMap") { view: CapoArView, enabled: Boolean? -> view.editMap(enabled == true) }

      Prop("focusedPart") { view: CapoArView, id: String? -> view.focusedPart = id }

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
        observedCenters: List<List<Double>>?, allowVisual: Boolean?, promise: Promise ->
        vista.fijar(id, esquinas, registration, volumes, observedCenters.orEmpty(), allowVisual == true, promise)
      }

      AsyncFunction("placeInitial") {
        view: CapoArView, id: Int, outline: List<Double>, registration: List<Double>, volumes: List<List<Double>>,
        observedCenters: List<List<Double>>?, allowVisual: Boolean?, promise: Promise ->
        view.fijar(id, outline, registration, volumes, observedCenters.orEmpty(), allowVisual == true, promise, checkLiveView = true)
      }

      AsyncFunction("soltar") { vista: CapoArView -> vista.soltar() }

      AsyncFunction("playPartAction") { view: CapoArView, id: String, action: String -> view.playPartAction(id, action) }

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
