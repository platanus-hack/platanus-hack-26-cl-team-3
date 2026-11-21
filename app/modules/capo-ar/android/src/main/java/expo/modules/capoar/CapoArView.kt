package expo.modules.capoar

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import android.os.Handler
import android.os.Looper
import android.view.Surface
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import com.google.ar.core.Anchor
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.DepthPoint
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Point
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.NotYetAvailableException
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.abs
import kotlin.math.acos

/**
 * Vista AR del vano del motor (ARCore).
 *
 * Flujo: la app pide cuadros con [capturar] → los analiza con el modelo → muestra el polígono como vista previa
 * ([mostrarVista]) → cuando la detección es buena llama a [fijar]: cada esquina pasa a ser un ancla de ARCore en el
 * espacio real, y desde ahí el polígono se proyecta en cada cuadro con la pose actual del teléfono (queda «pegado» al
 * auto aunque el usuario se mueva). [soltar] borra las anclas.
 */
class CapoArView(context: Context, appContext: AppContext) : ExpoView(context, appContext), GLSurfaceView.Renderer {
  override val shouldUseAndroidLayout = true

  private val onEstado by EventDispatcher<Map<String, Any?>>()
  private val onPart by EventDispatcher<Map<String, Int>>()

  private val gl = GLSurfaceView(context)
  internal val capa = CapaPoligono(context) { index -> onPart(mapOf("index" to index)) }
  private val fondo = FondoCamara()
  private val principal = Handler(Looper.getMainLooper())
  private val trabajo = Executors.newSingleThreadExecutor()

  private var sesion: Session? = null
  private var pedirInstalacion = true
  private var anchoVista = 0
  private var altoVista = 0
  private var geometriaPendiente = false
  private var texturaAsignada = false
  private var profundidad = false
  private var ultimoEstado = ""

  // Pedidos desde JS, atendidos en el hilo de OpenGL (donde vive el Frame de ARCore).
  private data class CaptureRequest(val includeMeasurements: Boolean, val promise: Promise)
  private val capturasPendientes = ArrayList<CaptureRequest>()
  private data class FixRequest(
    val captureId: Int,
    val outline: FloatArray,
    val registration: List<Double>,
    val volumes: List<List<Double>>,
    val observedCenters: Map<Int, EngineImagePoint>,
    val promise: Promise,
  )
  private val pendingFix = AtomicReference<FixRequest?>()
  private data class PlacedEngine(val anchor: Anchor, val mesh: EngineMesh)
  private var placedEngine: PlacedEngine? = null
  private data class OverlayFrame(
    val points: FloatArray?,
    val borders: BooleanArray?,
    val anchored: Boolean,
    val faces: List<EngineFace>,
  )
  private val overlayFrame = AtomicReference<OverlayFrame?>()
  @Volatile private var soltarPendiente = false

  private data class HitSamples(
    val nearest: List<FloatArray> = emptyList(),
    val local: List<FloatArray> = emptyList(),
  )

  // Measured captures share a nearby anchor so their saved camera poses survive world-coordinate updates.
  private class Captura(
    val pose: CapturePose, val fx: Float, val fy: Float, val cx: Float, val cy: Float, val anchoImg: Int, val altoImg: Int,
    val grados: Int, val muestras: HitSamples,
    val prof: Profundidad? // mapa de profundidad completo de ese cuadro (si el teléfono lo entrega)
  )
  private data class CaptureReference(val session: Session, val anchor: Anchor, val createdAtNs: Long)
  private var captureReference: CaptureReference? = null
  private val capturas = LinkedHashMap<Int, Captura>()
  private var contador = 0

  @Volatile private var vistaPrevia: FloatArray? = null // esquinas en coordenadas normalizadas de la imagen del sensor
  @Volatile private var bordesPrevia: BooleanArray? = null
  private val anclas = ArrayList<Anchor>()

  init {
    gl.preserveEGLContextOnPause = true
    gl.setEGLContextClientVersion(2)
    gl.setEGLConfigChooser(8, 8, 8, 8, 16, 0)
    gl.setRenderer(this)
    gl.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    val contenedor = FrameLayout(context)
    contenedor.addView(gl, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    contenedor.addView(capa, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    addView(contenedor, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  // ---------------- ciclo de vida ----------------

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    CapoArModule.vistas.add(this)
    reanudar()
  }

  override fun onDetachedFromWindow() {
    CapoArModule.vistas.remove(this)
    pausar()
    super.onDetachedFromWindow()
  }

  fun reanudar() {
    val actividad = appContext.currentActivity ?: return
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      emitir("error", "Falta el permiso de cámara.")
      return
    }
    try {
      if (sesion == null) {
        when (ArCoreApk.getInstance().requestInstall(actividad, pedirInstalacion)) {
          ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
            pedirInstalacion = false // al volver a la app se reintenta sin volver a preguntar
            emitir("instalando", "Instalando los Servicios de Google Play para RA…")
            return
          }
          else -> {}
        }
        val s = Session(context)
        val cfg = Config(s)
        cfg.focusMode = Config.FocusMode.AUTO // el motor está cerca: el foco fijo lo ve borroso
        cfg.updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
        cfg.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
        profundidad = s.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
        if (profundidad) cfg.depthMode = Config.DepthMode.AUTOMATIC
        s.configure(cfg)
        sesion = s
        texturaAsignada = false
        geometriaPendiente = true
      }
      sesion?.resume()
      ultimoEstado = ""
      gl.onResume()
      emitir("iniciando", null)
    } catch (e: Exception) {
      emitir("error", "No se pudo iniciar ARCore: ${e.javaClass.simpleName}${e.message?.let { " – $it" } ?: ""}")
      sesion = null
    }
  }

  fun pausar() {
    gl.onPause()
    clearCaptureReference()
    sesion?.pause()
  }

  fun destruir() {
    pausar()
    synchronized(capturasPendientes) {
      capturasPendientes.forEach { it.promise.reject("ERR_AR", "La vista AR se cerró", null) }
      capturasPendientes.clear()
    }
    pendingFix.getAndSet(null)?.promise?.reject("ERR_AR", "La vista AR se cerró", null)
    sesion?.close()
    sesion = null
    trabajo.shutdown()
  }

  // ---------------- API para JS ----------------

  fun capturar(includeMeasurements: Boolean, promise: Promise) {
    if (sesion == null) { promise.reject("ERR_AR", "ARCore no está activo", null); return }
    synchronized(capturasPendientes) { capturasPendientes.add(CaptureRequest(includeMeasurements, promise)) }
  }

  /** Esquinas en coordenadas normalizadas de la imagen entregada por [capturar] (derecha): x0, y0, x1, y1… */
  fun mostrarVista(esquinas: List<Double>, bordes: List<Boolean>, grados: Int) {
    if (esquinas.size < 6) { vistaPrevia = null; bordesPrevia = null; return }
    val p = FloatArray(esquinas.size)
    for (k in 0 until esquinas.size / 2) {
      val (x, y) = Imagen.desgirar(esquinas[2 * k].toFloat(), esquinas[2 * k + 1].toFloat(), grados)
      p[2 * k] = x; p[2 * k + 1] = y
    }
    bordesPrevia = bordes.toBooleanArray()
    vistaPrevia = p
  }

  fun fijar(
    id: Int, esquinas: List<Double>, registration: List<Double>, volumes: List<List<Double>>,
    observedCenters: List<List<Double>>, promise: Promise,
  ) {
    if (esquinas.size < 6 || esquinas.size % 2 != 0) {
      promise.reject("ERR_AR", "Se necesitan al menos 3 esquinas", null)
      return
    }
    val request = FixRequest(
      id, FloatArray(esquinas.size) { esquinas[it].toFloat() }, registration, volumes,
      decodeObservedCenters(observedCenters, volumes.size), promise,
    )
    if (!pendingFix.compareAndSet(null, request)) promise.reject("ERR_AR", "Ya se está fijando el vano", null)
  }

  fun soltar() {
    soltarPendiente = true
  }

  // ---------------- render (hilo de OpenGL) ----------------

  override fun onSurfaceCreated(g: GL10?, config: EGLConfig?) {
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    fondo.crear()
    texturaAsignada = false
  }

  override fun onSurfaceChanged(g: GL10?, w: Int, h: Int) {
    GLES20.glViewport(0, 0, w, h)
    anchoVista = w
    altoVista = h
    geometriaPendiente = true
  }

  override fun onDrawFrame(g: GL10?) {
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
    val s = sesion ?: return
    if (!texturaAsignada) { s.setCameraTextureName(fondo.textura); texturaAsignada = true }
    if (geometriaPendiente && anchoVista > 0) { s.setDisplayGeometry(rotacionPantalla(), anchoVista, altoVista); geometriaPendiente = false }
    val frame = try { s.update() } catch (e: Exception) { return }
    fondo.dibujar(frame)
    val camara = frame.camera

    if (soltarPendiente) {
      anclas.forEach { it.detach() }
      anclas.clear()
      placedEngine?.anchor?.detach()
      placedEngine = null
      clearCaptureReference()
      vistaPrevia = null
      soltarPendiente = false
    }
    pendingFix.getAndSet(null)?.let { request ->
      if (camara.trackingState == TrackingState.TRACKING) {
        anclar(s, request)
      } else {
        request.promise.reject("ERR_REGISTRATION", "ARCore perdió el seguimiento del vano", null)
      }
    }
    atenderCapturas(s, frame)

    val rastreando = camara.trackingState == TrackingState.TRACKING
    val engine = placedEngine?.takeIf { rastreando && it.anchor.trackingState == TrackingState.TRACKING }
    val estado = "${camara.trackingState}:${camara.trackingFailureReason}:${engine != null}"
    if (estado != ultimoEstado) {
      ultimoEstado = estado
      emitir(if (rastreando) "rastreando" else "sin-rastreo", camara.trackingFailureReason.name, engine != null)
    }

    // Puntos a dibujar: anclas proyectadas con la pose ACTUAL, o la vista previa mapeada a la pantalla.
    var puntos: FloatArray? = null
    var bordes: BooleanArray? = null
    val anclado = anclas.isNotEmpty()
    val projector = if (rastreando && anclado) screenProjector(frame) else null
    if (anclado) {
      if (projector != null && placedEngine == null) puntos = proyectarAnclas(projector)
    } else {
      vistaPrevia?.let { p ->
        val salida = FloatArray(p.size)
        frame.transformCoordinates2d(Coordinates2d.IMAGE_NORMALIZED, p, Coordinates2d.VIEW, salida)
        puntos = salida
        bordes = bordesPrevia
      }
    }
    val faces = if (engine != null && projector != null) {
      val pose = engine.anchor.pose
      engine.mesh.project { local ->
        val world = pose.transformPoint(floatArrayOf(local.x, local.y, local.z))
        projector(world[0], world[1], world[2])
      }
    } else emptyList()
    // Keep only the newest projection if the UI thread misses a camera frame.
    if (overlayFrame.getAndSet(OverlayFrame(puntos, bordes, anclado, faces)) == null) {
      principal.post {
        overlayFrame.getAndSet(null)?.let { capa.actualizar(it.points, it.borders, it.anchored, it.faces) }
      }
    }
  }

  private fun clearCaptureReference() {
    captureReference?.anchor?.detach()
    captureReference = null
    capturas.clear()
  }

  private fun capturePose(session: Session, camera: Pose, timestampNs: Long): CapturePose? {
    val reference = captureReference?.takeIf { it.session === session }
    val anchor = reference?.anchor
    if (anchor?.trackingState == TrackingState.TRACKING) {
      val referencePose = anchor.pose
      val dx = camera.tx() - referencePose.tx()
      val dy = camera.ty() - referencePose.ty()
      val dz = camera.tz() - referencePose.tz()
      if (dx * dx + dy * dy + dz * dz <= CAPTURE_REFERENCE_RADIUS_METERS * CAPTURE_REFERENCE_RADIUS_METERS) {
        return CapturePose(referencePose, camera)
      }
    }
    // Give a newly created anchor time to start tracking before replacing it.
    if (reference != null && anchor?.trackingState == TrackingState.PAUSED &&
      timestampNs - reference.createdAtNs < CAPTURE_REFERENCE_STARTUP_NS
    ) return null

    clearCaptureReference()
    val replacement = try {
      val nearBay = camera.transformPoint(floatArrayOf(0f, 0f, -CAPTURE_REFERENCE_FORWARD_METERS))
      session.createAnchor(Pose.makeTranslation(nearBay))
    } catch (_: Exception) {
      return null
    }
    captureReference = CaptureReference(session, replacement, timestampNs)
    return if (replacement.trackingState == TrackingState.TRACKING) CapturePose(replacement.pose, camera) else null
  }

  private fun atenderCapturas(session: Session, frame: Frame) {
    val pedidos: List<CaptureRequest>
    synchronized(capturasPendientes) {
      if (capturasPendientes.isEmpty()) return
      pedidos = ArrayList(capturasPendientes)
    }
    val imagen = try { frame.acquireCameraImage() } catch (e: NotYetAvailableException) { return } catch (e: Exception) {
      synchronized(capturasPendientes) { capturasPendientes.removeAll(pedidos.toSet()) }
      pedidos.forEach { it.promise.reject("ERR_AR", "No se pudo leer la cámara: ${e.javaClass.simpleName}", e) }
      return
    }
    synchronized(capturasPendientes) { capturasPendientes.removeAll(pedidos.toSet()) }
    val w = imagen.width
    val h = imagen.height
    val nv21 = try { Imagen.aNv21(imagen) } finally { imagen.close() }

    val camara = frame.camera
    val rastreando = camara.trackingState == TrackingState.TRACKING
    val grados = gradosImagen(frame)
    val intr = camara.imageIntrinsics
    val f = intr.focalLength
    val c = intr.principalPoint
    val dims = intr.imageDimensions
    // Keep same-frame hit tests for gaps in dense depth. The bay mask is only known after inference.
    val requestedMeasurements = pedidos.any { it.includeMeasurements }
    val pose = if (rastreando && requestedMeasurements) capturePose(session, camara.pose, frame.timestamp) else null
    val measure = pose != null
    val prof = if (measure && profundidad) Profundidad.leer(frame) else null
    val muestras = if (measure) muestrearDistancias(frame) else HitSamples()
    // Con el contorno ya anclado: dónde caen las anclas en ESTA imagen (para medir el calce con una detección nueva).
    val anclasImagen = if (rastreando && anclas.isNotEmpty()) anclasEnImagen(frame, grados) else null
    val puntos = prof?.validos ?: 0
    val id = ++contador
    if (pose != null) {
      capturas[id] = Captura(pose, f[0], f[1], c[0], c[1], dims[0], dims[1], grados, muestras, prof)
      while (capturas.size > 8) capturas.remove(capturas.keys.first())
    }

    trabajo.execute {
      pedidos.forEachIndexed { index, request ->
        try {
          // Each caller owns its JPEG, including when recalibration and a contour check share the same frame.
          val archivo = File(context.cacheDir, "capo-ar-$id-$index.jpg")
          val (ancho, alto) = Imagen.guardarJpeg(nv21, w, h, grados, archivo)
          val r = mutableMapOf<String, Any>(
            "id" to id, "uri" to "file://${archivo.absolutePath}", "ancho" to ancho, "alto" to alto,
            "grados" to grados, "rastreando" to (rastreando && (!request.includeMeasurements || measure)),
            "muestras" to muestras.nearest.size, "profundidad" to profundidad,
            "puntos" to puntos,
            "registrationMeasurements" to (puntos >= AnclajeDenso.MIN_REGISTRATION_POINTS || muestras.local.size >= 4)
          )
          anclasImagen?.let { r["anclas"] = it }
          request.promise.resolve(r)
        } catch (e: Exception) {
          request.promise.reject("ERR_AR", "No se pudo guardar el cuadro: ${e.message}", e)
        }
      }
    }
  }

  /** Cuánto hay que girar (horario) la imagen del sensor para verla derecha en esta pantalla. */
  private fun gradosImagen(frame: Frame): Int {
    val src = floatArrayOf(0f, 0f, 1f, 0f)
    val dst = FloatArray(4)
    frame.transformCoordinates2d(Coordinates2d.IMAGE_NORMALIZED, src, Coordinates2d.VIEW_NORMALIZED, dst)
    val dx = dst[2] - dst[0]
    val dy = dst[3] - dst[1]
    return if (abs(dx) > abs(dy)) { if (dx > 0) 0 else 180 } else { if (dy > 0) 90 else 270 }
  }

  /** Grilla 7×7 de hit tests: distancia real (m) a lo que hay en cada punto, en coordenadas normalizadas de la imagen. */
  private fun muestrearDistancias(frame: Frame): HitSamples {
    if (anchoVista == 0) return HitSamples()
    val nearest = ArrayList<FloatArray>()
    val local = ArrayList<FloatArray>()
    val n = 7
    for (j in 0 until n) for (i in 0 until n) {
      val vx = (i + 0.5f) / n * anchoVista
      val vy = (j + 0.5f) / n * altoVista
      val hits = frame.hitTest(vx, vy)
      val golpe = hits.firstOrNull { h ->
        when (val t = h.trackable) {
          is DepthPoint, is Point -> true
          is Plane -> t.isPoseInPolygon(h.hitPose)
          else -> false
        }
      } ?: continue
      val img = FloatArray(2)
      frame.transformCoordinates2d(Coordinates2d.VIEW, floatArrayOf(vx, vy), Coordinates2d.IMAGE_NORMALIZED, img)
      nearest.add(floatArrayOf(img[0], img[1], golpe.distance))
      // Keep the nearest local surface even when the generic contour uses a detected plane.
      hits.firstOrNull { h -> (h.trackable is DepthPoint || h.trackable is Point) && h.distance in .15f..8f }?.let {
        local.add(floatArrayOf(img[0], img[1], it.distance))
      }
    }
    return HitSamples(nearest, local)
  }

  private fun anclar(s: Session, request: FixRequest) {
    val (captureId, esquinasGiradas, registration, volumes, observedCenters, promise) = request
    val c = capturas[captureId]
    val reference = captureReference?.takeIf { it.session === s }?.anchor
      ?.takeIf { it.trackingState == TrackingState.TRACKING }
    if (c == null || reference == null) {
      promise.reject("ERR_REGISTRATION", "La captura ya no tiene seguimiento; vuelve a apuntar al vano.", null)
      return
    }
    val cameraInCurrentWorld = c.pose.inCurrentWorld(reference.pose)
    val worldInCaptureCamera = cameraInCurrentWorld.inverse()
    val intrinsics = EngineCaptureIntrinsics(c.anchoImg, c.altoImg, c.fx, c.fy, c.cx, c.cy)
    fun inCaptureCamera(point: EnginePoint): EnginePoint {
      val (x, y, z) = worldInCaptureCamera.transformPoint(floatArrayOf(point.x, point.y, point.z))
      return EnginePoint(x, y, z)
    }
    fun captureDepth(point: EnginePoint): Float = -inCaptureCamera(point).z
    // Esquinas en coordenadas de la imagen del sensor (las muestras de distancia están en ese sistema).
    val n = esquinasGiradas.size / 2
    val us = FloatArray(n)
    val vs = FloatArray(n)
    for (k in 0 until n) {
      val (u, v) = Imagen.desgirar(esquinasGiradas[2 * k], esquinasGiradas[2 * k + 1], c.grados)
      us[k] = u; vs[k] = v
    }
    // Superficie medida con el mapa de profundidad completo (miles de puntos): plano o relieve. Sirve tanto para las
    // esquinas del contorno como para registrar el mapa de piezas.
    val prof = c.prof
    val densa = prof?.let { p ->
      val xs = FloatArray(n)
      val ys = FloatArray(n)
      for (k in 0 until n) {
        val (x, y) = p.aPixel(us[k], vs[k])
        xs[k] = x; ys[k] = y
      }
      AnclajePorProfundidad.calcular(p, xs, ys)
    }
    // Respaldo: grilla de 49 hit tests.
    // Solo las muestras que caen DENTRO del polígono: las de fuera miden el piso o el fondo (mucho más lejos) y, mezcladas,
    // dejarían las esquinas a una distancia equivocada (el contorno se «deslizaría» al moverse).
    val dentro = c.muestras.nearest.filter { AnclajePorProfundidad.enPoligono(it[0], it[1], us, vs) }
    val localHits = c.muestras.local.filter { AnclajePorProfundidad.enPoligono(it[0], it[1], us, vs) }
    val muestras = if (dentro.size >= 4) dentro else c.muestras.nearest
    val todas = muestras.map { it[2] }.sorted()
    val mediana = densa?.mediana ?: if (todas.isNotEmpty()) todas[todas.size / 2] else DISTANCIA_POR_DEFECTO
    val nuevas = ArrayList<Anchor>()
    var conMedida = 0
    fun cameraToWorld(point: FloatArray): EnginePoint {
      val result = cameraInCurrentWorld.transformPoint(point)
      return EnginePoint(result[0], result[1], result[2])
    }
    fun fromHitTests(
      u: Float, v: Float, samples: List<FloatArray>, fallback: Float = mediana, onMeasurement: () -> Unit = {},
    ): EnginePoint {
      var sum = 0f
      var weight = 0f
      for (sample in samples) {
        val dx = sample[0] - u
        val dy = sample[1] - v
        val radiusSquared = dx * dx + dy * dy
        if (radiusSquared > RADIO_MUESTRAS * RADIO_MUESTRAS) continue
        val contribution = 1f / (radiusSquared + 1e-4f)
        sum += contribution * sample[2]
        weight += contribution
      }
      val distance = if (weight > 0f) {
        onMeasurement()
        sum / weight
      } else fallback
      val ray = intrinsics.ray(EngineImagePoint(u, v))
      val point = ray * (distance / ray.length())
      return cameraToWorld(floatArrayOf(point.x, point.y, point.z))
    }

    val refinePartFace: ((Int, List<EnginePoint>) -> List<EnginePoint>?)? =
      if (prof != null && observedCenters.isNotEmpty()) {
        { part, face ->
          observedCenters[part]?.let { center ->
            val (u, v) = Imagen.desgirar(center.x, center.y, c.grados)
            placeObservedFace(face.map(::inCaptureCamera), EngineImagePoint(u, v), intrinsics, prof, us, vs)
              ?.map { cameraToWorld(floatArrayOf(it.x, it.y, it.z)) }
          }
        }
      } else null

    var registrationMethod: String? = null
    val mesh = if (registration.size == 8 && volumes.isNotEmpty()) {
      val frameCorners = registration.chunked(2).map { (x, y) -> Imagen.desgirar(x.toFloat(), y.toFloat(), c.grados) }
      val denseMesh = if (densa != null) {
        val depthCorners = frameCorners.map { (u, v) -> prof.aPixel(u, v) }
        densa.registrationPoints(depthCorners)?.let { fit ->
          EngineMesh.create(fit.points.map(::cameraToWorld), volumes, refinePartFace, ::captureDepth)?.also {
            registrationMethod = fit.method
          }
        }
      } else null
      denseMesh ?: registrationSamples(frameCorners, localHits, RADIO_MUESTRAS)?.let { nearbySamples ->
        EngineMesh.create(
          frameCorners.mapIndexed { index, (u, v) -> fromHitTests(u, v, nearbySamples[index]) },
          volumes, refinePartFace, ::captureDepth,
        )?.also { registrationMethod = "hit-test" }
      }
    } else null
    if (volumes.isNotEmpty() && mesh == null) {
      promise.reject("ERR_REGISTRATION", "Faltan medidas del vano completo.", null)
      return
    }
    if (placedEngine?.mesh?.adjustedParts?.isNotEmpty() == true && mesh?.adjustedParts.isNullOrEmpty()) {
      promise.reject("ERR_REGISTRATION", "Faltan medidas de las piezas para recalibrar el mapa.", null)
      return
    }

    val usedHitTests = registrationMethod == "hit-test"
    val localMedian = if (usedHitTests) localHits.map { it[2] }.sorted()[localHits.size / 2] else mediana
    val placement: PlacedEngine?
    try {
      for (k in 0 until n) {
        val corner = if (usedHitTests) {
          fromHitTests(us[k], vs[k], localHits, localMedian)
        } else if (densa != null) {
          val (x, y) = prof.aPixel(us[k], vs[k])
          conMedida++
          cameraToWorld(densa.punto(x, y))
        } else fromHitTests(us[k], vs[k], muestras) { conMedida++ }
        nuevas.add(s.createAnchor(Pose.makeTranslation(corner.x, corner.y, corner.z)))
      }
      placement = mesh?.let {
        val origin = it.origin
        PlacedEngine(s.createAnchor(Pose.makeTranslation(origin.x, origin.y, origin.z)), it)
      }
    } catch (e: Exception) {
      nuevas.forEach { it.detach() }
      promise.reject("ERR_AR", "No se pudieron crear las anclas del vano", e)
      return
    }
    anclas.forEach { it.detach() }
    anclas.clear()
    anclas.addAll(nuevas)
    placedEngine?.anchor?.detach()
    placedEngine = placement
    clearCaptureReference()
    vistaPrevia = null
    val metodo = registrationMethod ?: densa?.metodo ?: when {
      conMedida == nuevas.size && profundidad -> "profundidad"
      conMedida > 0 -> "parcial"
      todas.isNotEmpty() -> "distancia-media"
      else -> "estimado"
    }
    val datos = mutableMapOf<String, Any>(
      "esquinas" to nuevas.size, "metodo" to metodo,
      "muestras" to (if (usedHitTests) localHits.size else densa?.puntos ?: muestras.size),
      "distancia" to localMedian.toDouble(), "mapPlaced" to (placement != null),
      "adjustedParts" to (mesh?.adjustedParts ?: emptyList<Int>()),
    )
    if (densa != null && !usedHitTests) {
      datos["puntos"] = densa.puntos
      datos["plano"] = densa.fraccionPlano.toDouble()
      datos["rms"] = densa.rms.toDouble()
      densa.normal?.let { normal ->
        val enMundo = cameraInCurrentWorld.rotateVector(normal) // el mundo de ARCore tiene +Y hacia arriba (gravedad)
        // 0° = superficie horizontal (se mira hacia abajo, como un motor); 90° = vertical (una pantalla).
        datos["inclinacion"] = Math.toDegrees(acos(abs(enMundo[1]).coerceAtMost(1f)).toDouble())
        // 0° = se mira la superficie de frente; crece al mirarla de lado.
        datos["anguloVista"] = Math.toDegrees(acos(normal[2].coerceIn(-1f, 1f)).toDouble())
      }
    }
    promise.resolve(datos)
  }

  /** Esquinas ancladas proyectadas a la imagen derecha de este cuadro (x0, y0, x1, y1… normalizadas). */
  private fun anclasEnImagen(frame: Frame, grados: Int): List<Double>? {
    val enVista = proyectarAnclas(screenProjector(frame)) ?: return null
    val enImagen = FloatArray(enVista.size)
    frame.transformCoordinates2d(Coordinates2d.VIEW, enVista, Coordinates2d.IMAGE_NORMALIZED, enImagen)
    val salida = ArrayList<Double>(enVista.size)
    for (k in 0 until enVista.size / 2) {
      val (x, y) = Imagen.girar(enImagen[2 * k], enImagen[2 * k + 1], grados)
      salida.add(x.toDouble()); salida.add(y.toDouble())
    }
    return salida
  }

  private fun screenProjector(frame: Frame): (Float, Float, Float) -> EngineScreenPoint? {
    val view = FloatArray(16)
    val projection = FloatArray(16)
    val combined = FloatArray(16)
    val point = floatArrayOf(0f, 0f, 0f, 1f)
    val clip = FloatArray(4)
    frame.camera.getViewMatrix(view, 0)
    frame.camera.getProjectionMatrix(projection, 0, 0.05f, 100f)
    Matrix.multiplyMM(combined, 0, projection, 0, view, 0)
    return { x, y, z ->
      point[0] = x; point[1] = y; point[2] = z
      Matrix.multiplyMV(clip, 0, combined, 0, point, 0)
      val w = clip[3]
      if (w < .05f || !w.isFinite()) null else EngineScreenPoint(
        (clip[0] / w + 1f) / 2f * anchoVista,
        (1f - clip[1] / w) / 2f * altoVista,
        w,
      )
    }
  }

  private fun proyectarAnclas(project: (Float, Float, Float) -> EngineScreenPoint?): FloatArray? {
    val salida = FloatArray(anclas.size * 2)
    for ((k, anchor) in anclas.withIndex()) {
      if (anchor.trackingState != TrackingState.TRACKING) return null
      val pose = anchor.pose
      val point = project(pose.tx(), pose.ty(), pose.tz()) ?: return null
      salida[2 * k] = point.x
      salida[2 * k + 1] = point.y
    }
    return salida
  }

  @Suppress("DEPRECATION")
  private fun rotacionPantalla(): Int =
    (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay?.rotation ?: Surface.ROTATION_0

  private fun emitir(estado: String, detalle: String?, mapTracking: Boolean = false) {
    principal.post {
      onEstado(mapOf("estado" to estado, "detalle" to detalle, "anclado" to anclas.isNotEmpty(), "mapTracking" to mapTracking, "profundidad" to profundidad))
    }
  }

  private companion object {
    const val CAPTURE_REFERENCE_RADIUS_METERS = 3f
    const val CAPTURE_REFERENCE_FORWARD_METERS = .75f
    const val CAPTURE_REFERENCE_STARTUP_NS = 1_500_000_000L
    const val DISTANCIA_POR_DEFECTO = 0.7f // m: distancia típica del teléfono al vano si ARCore no midió nada
    const val RADIO_MUESTRAS = 0.25f // radio (en fracción de imagen) para promediar distancias cercanas a cada esquina
  }
}
