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

  private val gl = GLSurfaceView(context)
  internal val capa = CapaPoligono(context)
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
  private var fijarPendiente: Pair<FloatArray, Promise>? = null
  private var fijarCaptura = 0
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
    fijarPendiente?.second?.reject("ERR_AR", "La vista AR se cerró", null)
    fijarPendiente = null
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

  fun fijar(id: Int, esquinas: List<Double>, promise: Promise) {
    if (esquinas.size < 6) { promise.reject("ERR_AR", "Se necesitan al menos 3 esquinas", null); return }
    fijarCaptura = id
    fijarPendiente = Pair(FloatArray(esquinas.size) { esquinas[it].toFloat() }, promise)
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
      vistaPrevia = null
      soltarPendiente = false
    }
    atenderCapturas(frame)
    fijarPendiente?.let { (esquinas, promise) -> fijarPendiente = null; anclar(s, esquinas, promise) }

    val rastreando = camara.trackingState == TrackingState.TRACKING
    val estado = if (rastreando) "rastreando" else "sin-rastreo:${camara.trackingFailureReason.name}"
    if (estado != ultimoEstado) { ultimoEstado = estado; emitir(if (rastreando) "rastreando" else "sin-rastreo", camara.trackingFailureReason.name) }

    // Puntos a dibujar: anclas proyectadas con la pose ACTUAL, o la vista previa mapeada a la pantalla.
    var puntos: FloatArray? = null
    var bordes: BooleanArray? = null
    val anclado = anclas.isNotEmpty()
    if (anclado) {
      if (rastreando) puntos = proyectarAnclas(frame)
    } else {
      vistaPrevia?.let { p ->
        val salida = FloatArray(p.size)
        frame.transformCoordinates2d(Coordinates2d.IMAGE_NORMALIZED, p, Coordinates2d.VIEW, salida)
        puntos = salida
        bordes = bordesPrevia
      }
    }
    val p = puntos
    val b = bordes
    principal.post { capa.actualizar(p, b, anclado) }
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

  private fun anclar(s: Session, esquinasGiradas: FloatArray, promise: Promise) {
    val c = capturas[fijarCaptura]
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
    // Camino principal: mapa de profundidad completo → plano (o relieve) con miles de puntos.
    c.prof?.let { p ->
      val xs = FloatArray(n)
      val ys = FloatArray(n)
      for (k in 0 until n) {
        val (x, y) = p.aPixel(us[k], vs[k])
        xs[k] = x; ys[k] = y
      }
      AnclajePorProfundidad.calcular(p, xs, ys)?.let { r ->
        val nuevas = r.esquinas.map { s.createAnchor(Pose.makeTranslation(c.pose.transformPoint(it))) }
        anclas.forEach { it.detach() }
        anclas.clear()
        anclas.addAll(nuevas)
        vistaPrevia = null
        val datos = mutableMapOf<String, Any>(
          "esquinas" to nuevas.size, "metodo" to r.metodo, "muestras" to r.puntos, "distancia" to r.mediana.toDouble(),
          "puntos" to r.puntos, "plano" to r.fraccionPlano.toDouble(), "rms" to r.rms.toDouble()
        )
        r.normal?.let { normal ->
          val enMundo = c.pose.rotateVector(normal) // el mundo de ARCore tiene +Y hacia arriba (gravedad)
          // 0° = superficie horizontal (se mira hacia abajo, como un motor); 90° = vertical (una pantalla).
          datos["inclinacion"] = Math.toDegrees(acos(abs(enMundo[1]).coerceAtMost(1f)).toDouble())
          // 0° = se mira la superficie de frente; crece al mirarla de lado.
          datos["anguloVista"] = Math.toDegrees(acos(normal[2].coerceIn(-1f, 1f)).toDouble())
        }
        promise.resolve(datos)
        return
      }
    }
    // Respaldo (sin mapa de profundidad): grilla de 49 hit tests.
    // Solo las muestras que caen DENTRO del polígono: las de fuera miden el piso o el fondo (mucho más lejos) y, mezcladas,
    // dejarían las esquinas a una distancia equivocada (el contorno se «deslizaría» al moverse).
    val dentro = c.muestras.filter { AnclajePorProfundidad.enPoligono(it[0], it[1], us, vs) }
    val muestras = if (dentro.size >= 4) dentro else c.muestras
    val todas = muestras.map { it[2] }.sorted()
    val mediana = if (todas.isNotEmpty()) todas[todas.size / 2] else DISTANCIA_POR_DEFECTO
    val nuevas = ArrayList<Anchor>()
    var conMedida = 0
    for (k in 0 until n) {
      val u = us[k]
      val v = vs[k]
      // Distancia: promedio ponderado (1/d²) de las muestras cercanas en la imagen; si no hay, la mediana del vano.
      var suma = 0f
      var peso = 0f
      for (m in muestras) {
        val d2 = (m[0] - u) * (m[0] - u) + (m[1] - v) * (m[1] - v)
        if (d2 > RADIO_MUESTRAS * RADIO_MUESTRAS) continue
        val w = 1f / (d2 + 1e-4f)
        suma += w * m[2]
        peso += w
      }
      val distancia = if (peso > 0f) { conMedida++; suma / peso } else mediana
      // Rayo desde la cámara de ESA captura: +X derecha, +Y arriba, -Z hacia adelante (según la lectura de la imagen).
      val px = u * c.anchoImg
      val py = v * c.altoImg
      var dx = (px - c.cx) / c.fx
      var dy = -(py - c.cy) / c.fy
      var dz = -1f
      val norma = sqrt(dx * dx + dy * dy + dz * dz)
      dx /= norma; dy /= norma; dz /= norma
      val enMundo = c.pose.transformPoint(floatArrayOf(dx * distancia, dy * distancia, dz * distancia))
      nuevas.add(s.createAnchor(Pose.makeTranslation(enMundo)))
    }
    anclas.forEach { it.detach() }
    anclas.clear()
    anclas.addAll(nuevas)
    vistaPrevia = null
    val metodo = when {
      conMedida == nuevas.size && profundidad -> "profundidad"
      conMedida > 0 -> "parcial"
      todas.isNotEmpty() -> "distancia-media"
      else -> "estimado"
    }
    promise.resolve(mapOf("esquinas" to nuevas.size, "metodo" to metodo, "muestras" to muestras.size, "distancia" to mediana))
  }

  /** Esquinas ancladas proyectadas a la imagen derecha de este cuadro (x0, y0, x1, y1… normalizadas). */
  private fun anclasEnImagen(frame: Frame, grados: Int): List<Double>? {
    val enVista = proyectarAnclas(frame) ?: return null
    val enImagen = FloatArray(enVista.size)
    frame.transformCoordinates2d(Coordinates2d.VIEW, enVista, Coordinates2d.IMAGE_NORMALIZED, enImagen)
    val salida = ArrayList<Double>(enVista.size)
    for (k in 0 until enVista.size / 2) {
      val (x, y) = Imagen.girar(enImagen[2 * k], enImagen[2 * k + 1], grados)
      salida.add(x.toDouble()); salida.add(y.toDouble())
    }
    return salida
  }

  private fun proyectarAnclas(frame: Frame): FloatArray? {
    val vista = FloatArray(16)
    val proy = FloatArray(16)
    val vp = FloatArray(16)
    frame.camera.getViewMatrix(vista, 0)
    frame.camera.getProjectionMatrix(proy, 0, 0.05f, 100f)
    Matrix.multiplyMM(vp, 0, proy, 0, vista, 0)
    val salida = FloatArray(anclas.size * 2)
    val p = FloatArray(4)
    val q = FloatArray(4)
    for ((k, a) in anclas.withIndex()) {
      if (a.trackingState == TrackingState.STOPPED) return null
      val pose = a.pose
      p[0] = pose.tx(); p[1] = pose.ty(); p[2] = pose.tz(); p[3] = 1f
      Matrix.multiplyMV(q, 0, vp, 0, p, 0)
      if (q[3] <= 0f) return null // detrás de la cámara
      salida[2 * k] = (q[0] / q[3] + 1f) / 2f * anchoVista
      salida[2 * k + 1] = (1f - q[1] / q[3]) / 2f * altoVista
    }
    return salida
  }

  @Suppress("DEPRECATION")
  private fun rotacionPantalla(): Int =
    (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay?.rotation ?: Surface.ROTATION_0

  private fun emitir(estado: String, detalle: String?) {
    principal.post {
      onEstado(mapOf("estado" to estado, "detalle" to detalle, "anclado" to anclas.isNotEmpty(), "profundidad" to profundidad))
    }
  }

  private companion object {
    const val DISTANCIA_POR_DEFECTO = 0.7f // m: distancia típica del teléfono al vano si ARCore no midió nada
    const val RADIO_MUESTRAS = 0.25f // radio (en fracción de imagen) para promediar distancias cercanas a cada esquina
  }
}
