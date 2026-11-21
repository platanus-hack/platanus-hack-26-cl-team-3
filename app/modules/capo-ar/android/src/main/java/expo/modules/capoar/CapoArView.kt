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
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.sqrt

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
  private val capturasPendientes = ArrayList<Promise>()
  private data class FixRequest(
    val captureId: Int,
    val outline: FloatArray,
    val registration: List<Double>,
    val volumes: List<List<Double>>,
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

  // Datos de cada captura, para anclar después con la pose de ESE momento (el modelo tarda; el teléfono se mueve).
  private class Captura(
    val pose: Pose, val fx: Float, val fy: Float, val cx: Float, val cy: Float, val anchoImg: Int, val altoImg: Int,
    val grados: Int, val muestras: List<FloatArray>, val rastreando: Boolean,
    val prof: Profundidad? // mapa de profundidad completo de ese cuadro (si el teléfono lo entrega)
  )
  private val capturas = LinkedHashMap<Int, Captura>()
  private var contador = 0

  @Volatile private var vistaPrevia: FloatArray? = null // esquinas en coordenadas normalizadas de la imagen del sensor
  @Volatile private var bordesPrevia: BooleanArray? = null
  private val anclas = ArrayList<Anchor>()

  // Escaneo: mapa del vano acumulado desde varias vistas, y su contorno en el mundo (se dibuja pegado al auto).
  private val escaneo = Escaneo()
  @Volatile private var previaMundo: FloatArray? = null // x, y, z de cada esquina
  // «Mantener presionado sobre el motor»: punto del mundo que marcó el usuario.
  @Volatile private var semillaMundo: FloatArray? = null
  // Trabajos pedidos desde JS que necesitan el hilo de OpenGL (ahí viven el Frame y las capturas).
  private val tareas = ConcurrentLinkedQueue<(Frame) -> Unit>()

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
    sesion?.pause()
  }

  fun destruir() {
    pausar()
    synchronized(capturasPendientes) {
      capturasPendientes.forEach { it.reject("ERR_AR", "La vista AR se cerró", null) }
      capturasPendientes.clear()
    }
    pendingFix.getAndSet(null)?.promise?.reject("ERR_AR", "La vista AR se cerró", null)
    sesion?.close()
    sesion = null
    trabajo.shutdown()
  }

  // ---------------- API para JS ----------------

  fun capturar(promise: Promise) {
    if (sesion == null) { promise.reject("ERR_AR", "ARCore no está activo", null); return }
    synchronized(capturasPendientes) { capturasPendientes.add(promise) }
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

  fun fijar(id: Int, esquinas: List<Double>, registration: List<Double>, volumes: List<List<Double>>, promise: Promise) {
    if (esquinas.size < 6 || esquinas.size % 2 != 0) {
      promise.reject("ERR_AR", "Se necesitan al menos 3 esquinas", null)
      return
    }
    val request = FixRequest(id, FloatArray(esquinas.size) { esquinas[it].toFloat() }, registration, volumes, promise)
    if (!pendingFix.compareAndSet(null, request)) promise.reject("ERR_AR", "Ya se está fijando el vano", null)
  }

  /** Suma al escaneo lo que el modelo vio en la captura `id` (máscara 88×88 sobre el recorte rx, ry, lado). */
  fun acumular(id: Int, mascara: String, rx: Double, ry: Double, lado: Double, promise: Promise) {
    tareas.add { _ ->
      val c = capturas[id]
      val prof = c?.prof
      val ok = c != null && prof != null && c.rastreando &&
        escaneo.acumular(c.pose, prof, c.grados, mascara, rx.toFloat(), ry.toFloat(), lado.toFloat())
      val r = mutableMapOf<String, Any>("ok" to ok, "vistas" to escaneo.vistas)
      if (ok) {
        r["mapa"] = escaneo.mapa()
        semillaMundo?.let { m -> escaneo.aGrilla(m)?.let { g -> r["semilla"] = listOf(g[0].toDouble(), g[1].toDouble()) } }
      }
      promise.resolve(r)
    }
  }

  /**
   * Fija como vista previa (pegada al mundo) el contorno del escaneo, dado en coordenadas de su grilla, y devuelve ese
   * contorno proyectado a la imagen derecha de la captura `id` (puede salirse de 0..1 si el vano no cabe en el cuadro).
   */
  fun contornoEscaneo(id: Int, esquinas: List<Double>, promise: Promise) {
    tareas.add { _ ->
      val c = capturas[id]
      val mundo = ArrayList<FloatArray>()
      for (k in 0 until esquinas.size / 2) escaneo.aMundo(esquinas[2 * k].toFloat(), esquinas[2 * k + 1].toFloat())?.let { mundo.add(it) }
      if (c == null || mundo.size < 3 || mundo.size != esquinas.size / 2) { promise.resolve(emptyList<Double>()); return@add }
      previaMundo = FloatArray(mundo.size * 3) { mundo[it / 3][it % 3] }
      val inversa = c.pose.inverse()
      val salida = ArrayList<Double>(esquinas.size)
      for (m in mundo) {
        val q = inversa.transformPoint(m)
        if (q[2] > -0.05f) { promise.resolve(emptyList<Double>()); return@add } // detrás de la cámara de esa captura
        val u = (c.fx * q[0] / -q[2] + c.cx) / c.anchoImg
        val v = (c.cy - c.fy * q[1] / -q[2]) / c.altoImg
        val (x, y) = Imagen.girar(u, v, c.grados)
        salida.add(x.toDouble()); salida.add(y.toDouble())
      }
      promise.resolve(salida)
    }
  }

  fun reiniciarEscaneo() {
    tareas.add { _ -> escaneo.reiniciar(); previaMundo = null }
  }

  /** El usuario mantuvo presionado en (x, y) de la vista (píxeles): se guarda el punto del mundo que hay ahí. */
  fun sembrar(x: Double, y: Double, promise: Promise) {
    tareas.add { frame ->
      val golpe = if (frame.camera.trackingState == TrackingState.TRACKING) frame.hitTest(x.toFloat(), y.toFloat()).firstOrNull() else null
      if (golpe == null) { promise.resolve(false); return@add }
      val t = golpe.hitPose
      semillaMundo = floatArrayOf(t.tx(), t.ty(), t.tz())
      promise.resolve(true)
    }
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
      vistaPrevia = null
      previaMundo = null
      semillaMundo = null
      escaneo.reiniciar()
      soltarPendiente = false
    }
    atenderCapturas(frame)
    while (true) {
      val tarea = tareas.poll() ?: break
      try { tarea(frame) } catch (e: Exception) { /* una tarea fallida no debe botar el dibujo */ }
    }
    pendingFix.getAndSet(null)?.let { request ->
      if (camara.trackingState == TrackingState.TRACKING) {
        anclar(s, request)
      } else {
        val code = if (request.volumes.isEmpty()) "ERR_AR" else "ERR_REGISTRATION"
        request.promise.reject(code, "ARCore perdió el seguimiento del vano", null)
      }
    }

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
      // Vista previa: primero el contorno del escaneo, que está en el mundo y por eso no se mueve con el teléfono.
      val mundo = previaMundo
      if (mundo != null && rastreando) {
        val proyectar = screenProjector(frame)
        val salida = FloatArray(mundo.size / 3 * 2)
        var visible = true
        for (k in 0 until mundo.size / 3) {
          val q = proyectar(mundo[3 * k], mundo[3 * k + 1], mundo[3 * k + 2])
          if (q == null) { visible = false; break }
          salida[2 * k] = q.x; salida[2 * k + 1] = q.y
        }
        if (visible) puntos = salida
      }
      if (puntos == null) vistaPrevia?.let { p ->
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

  private fun atenderCapturas(frame: Frame) {
    val pedidos: List<Promise>
    synchronized(capturasPendientes) {
      if (capturasPendientes.isEmpty()) return
      pedidos = ArrayList(capturasPendientes)
    }
    val imagen = try { frame.acquireCameraImage() } catch (e: NotYetAvailableException) { return } catch (e: Exception) {
      synchronized(capturasPendientes) { capturasPendientes.removeAll(pedidos.toSet()) }
      pedidos.forEach { it.reject("ERR_AR", "No se pudo leer la cámara: ${e.javaClass.simpleName}", e) }
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
    // Mapa de profundidad completo (miles de puntos). Si aún no está, se cae a la grilla de 49 hit tests.
    val prof = if (rastreando && profundidad) Profundidad.leer(frame) else null
    val muestras = if (rastreando && prof == null) muestrearDistancias(frame) else emptyList()
    // Con el contorno ya anclado: dónde caen las anclas en ESTA imagen (para medir el calce con una detección nueva).
    val anclasImagen = if (rastreando && anclas.isNotEmpty()) anclasEnImagen(frame, grados) else null
    val puntos = prof?.validos ?: 0
    // Punto que el usuario marcó manteniendo presionado, visto desde esta captura (imagen derecha, normalizado).
    val semillaImagen = semillaMundo?.let { m ->
      if (!rastreando) null else screenProjector(frame)(m[0], m[1], m[2])?.let { q ->
        val enImagen = FloatArray(2)
        frame.transformCoordinates2d(Coordinates2d.VIEW, floatArrayOf(q.x, q.y), Coordinates2d.IMAGE_NORMALIZED, enImagen)
        val (x, y) = Imagen.girar(enImagen[0], enImagen[1], grados)
        listOf(x.toDouble(), y.toDouble())
      }
    }
    val id = ++contador
    capturas[id] = Captura(camara.pose, f[0], f[1], c[0], c[1], dims[0], dims[1], grados, muestras, rastreando, prof)
    while (capturas.size > 8) capturas.remove(capturas.keys.first())

    trabajo.execute {
      try {
        val archivo = File(context.cacheDir, "capo-ar-$id.jpg")
        val (ancho, alto) = Imagen.guardarJpeg(nv21, w, h, grados, archivo)
        val r = mutableMapOf<String, Any>(
          "id" to id, "uri" to "file://${archivo.absolutePath}", "ancho" to ancho, "alto" to alto,
          "grados" to grados, "rastreando" to rastreando, "muestras" to muestras.size, "profundidad" to profundidad,
          "puntos" to puntos
        )
        anclasImagen?.let { r["anclas"] = it }
        semillaImagen?.let { r["semilla"] = it }
        pedidos.forEach { it.resolve(r) }
      } catch (e: Exception) {
        pedidos.forEach { it.reject("ERR_AR", "No se pudo guardar el cuadro: ${e.message}", e) }
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
  private fun muestrearDistancias(frame: Frame): List<FloatArray> {
    if (anchoVista == 0) return emptyList()
    val salida = ArrayList<FloatArray>()
    val n = 7
    for (j in 0 until n) for (i in 0 until n) {
      val vx = (i + 0.5f) / n * anchoVista
      val vy = (j + 0.5f) / n * altoVista
      val golpe = frame.hitTest(vx, vy).firstOrNull { h ->
        when (val t = h.trackable) {
          is DepthPoint -> true
          is Plane -> t.isPoseInPolygon(h.hitPose)
          is Point -> true
          else -> false
        }
      } ?: continue
      val img = FloatArray(2)
      frame.transformCoordinates2d(Coordinates2d.VIEW, floatArrayOf(vx, vy), Coordinates2d.IMAGE_NORMALIZED, img)
      salida.add(floatArrayOf(img[0], img[1], golpe.distance))
    }
    return salida
  }

  private fun anclar(s: Session, request: FixRequest) {
    val (captureId, esquinasGiradas, registration, volumes, promise) = request
    val c = capturas[captureId]
    if (c == null) { promise.reject("ERR_AR", "La captura ya no está disponible; vuelve a intentarlo", null); return }
    if (!c.rastreando) { promise.reject("ERR_AR", "Cuando se tomó ese cuadro ARCore aún no seguía el movimiento", null); return }
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
    // Respaldo (sin mapa de profundidad): grilla de 49 hit tests.
    // Solo las muestras que caen DENTRO del polígono: las de fuera miden el piso o el fondo (mucho más lejos) y, mezcladas,
    // dejarían las esquinas a una distancia equivocada (el contorno se «deslizaría» al moverse).
    val dentro = c.muestras.filter { AnclajePorProfundidad.enPoligono(it[0], it[1], us, vs) }
    val muestras = if (dentro.size >= 4) dentro else c.muestras
    val todas = muestras.map { it[2] }.sorted()
    val mediana = densa?.mediana ?: if (todas.isNotEmpty()) todas[todas.size / 2] else DISTANCIA_POR_DEFECTO
    val nuevas = ArrayList<Anchor>()
    var conMedida = 0
    fun world(u: Float, v: Float, samples: List<FloatArray>, onMeasurement: () -> Unit = {}): EnginePoint {
      if (densa != null && prof != null) {
        val (x, y) = prof.aPixel(u, v)
        onMeasurement()
        val result = c.pose.transformPoint(densa.punto(x, y))
        return EnginePoint(result[0], result[1], result[2])
      }
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
      } else mediana
      val dx = (u * c.anchoImg - c.cx) / c.fx
      val dy = -(v * c.altoImg - c.cy) / c.fy
      val dz = -1f
      val scale = distance / sqrt(dx * dx + dy * dy + dz * dz)
      val result = c.pose.transformPoint(floatArrayOf(dx * scale, dy * scale, dz * scale))
      return EnginePoint(result[0], result[1], result[2])
    }

    val mesh = if (registration.size == 8 && volumes.isNotEmpty() && (densa != null || dentro.size >= 4)) {
      val frameCorners = registration.chunked(2).map { (x, y) -> Imagen.desgirar(x.toFloat(), y.toFloat(), c.grados) }
      if (densa != null) {
        // Con el mapa de profundidad, las cuatro esquinas del registro salen de la misma superficie medida.
        EngineMesh.create(frameCorners.map { (u, v) -> world(u, v, emptyList()) }, volumes)
      } else {
        registrationSamples(frameCorners, dentro, RADIO_MUESTRAS)?.let { nearbySamples ->
          EngineMesh.create(
            frameCorners.mapIndexed { index, (u, v) -> world(u, v, nearbySamples[index]) },
            volumes,
          )
        }
      }
    } else null
    if (volumes.isNotEmpty() && mesh == null) {
      promise.reject("ERR_REGISTRATION", "Faltan medidas del vano completo.", null)
      return
    }

    val placement: PlacedEngine?
    try {
      for (k in 0 until n) {
        val corner = world(us[k], vs[k], muestras) { conMedida++ }
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
    vistaPrevia = null
    val metodo = densa?.metodo ?: when {
      conMedida == nuevas.size && profundidad -> "profundidad"
      conMedida > 0 -> "parcial"
      todas.isNotEmpty() -> "distancia-media"
      else -> "estimado"
    }
    val datos = mutableMapOf<String, Any>(
      "esquinas" to nuevas.size, "metodo" to metodo, "muestras" to (densa?.puntos ?: muestras.size),
      "distancia" to mediana.toDouble(), "mapPlaced" to (placement != null)
    )
    if (densa != null) {
      datos["puntos"] = densa.puntos
      datos["plano"] = densa.fraccionPlano.toDouble()
      datos["rms"] = densa.rms.toDouble()
      densa.normal?.let { normal ->
        val enMundo = c.pose.rotateVector(normal) // el mundo de ARCore tiene +Y hacia arriba (gravedad)
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
    const val DISTANCIA_POR_DEFECTO = 0.7f // m: distancia típica del teléfono al vano si ARCore no midió nada
    const val RADIO_MUESTRAS = 0.25f // radio (en fracción de imagen) para promediar distancias cercanas a cada esquina
  }
}
