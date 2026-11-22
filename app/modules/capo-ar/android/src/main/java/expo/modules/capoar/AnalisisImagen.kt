package expo.modules.capoar

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.media.ExifInterface
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.IdentityHashMap
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Ubica el modelo 3D del Outback sobre una foto fija (de la galería o un cuadro de video), sin ARCore: usa el mismo
 * registro visual que el escáner en vivo ([VisualModelRegistration], marcas ORB + color + PnP) y lo dibuja con
 * perspectiva sobre una capa transparente. No toca el anclaje en vivo: solo lo llama con un archivo.
 *
 * Lo que no hay respecto del modo en vivo: profundidad (sin escala métrica ni oclusión) y seguimiento (la pose vale
 * para esa imagen). La focal sale del EXIF cuando existe.
 */
internal class AnalisisImagen(private val context: Context) {
  private val modelo by lazy { OutbackModel.load(context.assets) }
  private val registro by lazy {
    if (org.opencv.android.OpenCVLoader.initLocal()) {
      val templates = try {
        context.assets.open("engine-models/outback-oil-templates.bin").use { OutbackLandmarkTemplates(it.readBytes()) }
      } catch (_: IOException) { null } catch (_: IllegalArgumentException) { null }
      context.assets.open("engine-models/outback-features.bin").use { VisualModelRegistration(it.readBytes(), modelo.colorLandmarks, templates) }
    } else null
  }
  private var sello = 0

  private class Proyeccion(val x: Float, val y: Float, val profundidad: Float, val camara: EnginePoint)

  /** Resultado en coordenadas normalizadas de la imagen derecha (la que se devuelve en `foto`). */
  @Synchronized
  fun analizar(uri: String, vano: List<Double>): Map<String, Any> {
    val registro = registro ?: return fallo("opencv")
    val (derecha, focal35) = leerDerecha(uri)
    try {
      val w = derecha.width
      val h = derecha.height
      val zona = recuadroAlrededor(vano)
      val x0 = zona?.let { floor(it.x0 * w).toInt() } ?: 0
      val y0 = zona?.let { floor(it.y0 * h).toInt() } ?: 0
      val cw = max(32, (zona?.let { floor(it.x1 * w).toInt() } ?: w) - x0).coerceAtMost(w - x0)
      val ch = max(32, (zona?.let { floor(it.y1 * h).toInt() } ?: h) - y0).coerceAtMost(h - y0)
      // El registro trabaja con el vano ocupando la imagen: se recorta y se lleva a ~960 px de lado largo.
      val aumento = min(LADO_REGISTRO / max(cw, ch), 2f)
      val rw = max(32, (cw * aumento).roundToInt())
      val rh = max(32, (ch * aumento).roundToInt())
      val recorte = Bitmap.createBitmap(derecha, x0, y0, cw, ch)
      val archivoRecorte = File(context.cacheDir, "capo-analisis-recorte.jpg")
      try {
        val escalado = Bitmap.createScaledBitmap(recorte, rw, rh, true)
        FileOutputStream(archivoRecorte).use { escalado.compress(Bitmap.CompressFormat.JPEG, 95, it) }
        if (escalado !== recorte) escalado.recycle()
      } finally { recorte.recycle() }
      val sx = rw.toFloat() / cw
      val sy = rh.toFloat() / ch
      val focal = focalEnPixeles(focal35 ?: FOCAL_35MM_POR_DEFECTO, w, h)
      val intrinsecos = EngineCaptureIntrinsics(rw, rh, focal * sx, focal * sy, (w / 2f - x0) * sx, (h / 2f - y0) * sy)
      val pose = try { registro.locate(archivoRecorte.path, 0, intrinsecos, null) }
        catch (_: org.opencv.core.CvException) { null } catch (_: UnsatisfiedLinkError) { null }
        ?: return fallo("sin-pose")

      // De la proyección normalizada del recorte a la imagen completa y derecha.
      fun aImagen(p: EngineImagePoint) = Pair((p.x * rw / sx + x0) / w, (p.y * rh / sy + y0) / h)
      val cache = IdentityHashMap<EnginePoint, Proyeccion?>()
      fun proyectar(p: EnginePoint): Proyeccion? = cache.getOrPut(p) {
        val c = pose.cameraPoint(p)
        val uv = intrinsecos.project(c) ?: return@getOrPut null
        val (x, y) = aImagen(uv)
        Proyeccion(x, y, -c.z, c)
      }

      val cuadro = listOf(0, 1, 3, 2).mapNotNull { proyectar(modelo.corners[it]) }
      if (!poseCreible(cuadro.map { it.x to it.y }, zona)) return fallo("pose-inverosimil")

      val lado = min(max(w, h), LADO_SALIDA)
      val k = lado.toFloat() / max(w, h)
      val sw = max(1, (w * k).roundToInt())
      val sh = max(1, (h * k).roundToInt())
      sello++
      val archivoFoto = File(context.cacheDir, "capo-analisis-foto-$sello.jpg")
      val archivoCapa = File(context.cacheDir, "capo-analisis-modelo-$sello.png")
      val foto = Bitmap.createScaledBitmap(derecha, sw, sh, true)
      try { FileOutputStream(archivoFoto).use { foto.compress(Bitmap.CompressFormat.JPEG, 90, it) } } finally { if (foto !== derecha) foto.recycle() }

      val capa = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
      val piezas = try {
        dibujar(Canvas(capa), sw, sh, ::proyectar)
        FileOutputStream(archivoCapa).use { capa.compress(Bitmap.CompressFormat.PNG, 100, it) }
        piezasProyectadas(::proyectar)
      } finally { capa.recycle() }
      limpiarAnteriores(sello)
      return mapOf(
        "ok" to true, "foto" to "file://${archivoFoto.absolutePath}", "capa" to "file://${archivoCapa.absolutePath}",
        "ancho" to sw, "alto" to sh, "marcas" to pose.observations.size, "piezas" to piezas,
        "vano" to cuadro.flatMap { listOf(it.x.toDouble(), it.y.toDouble()) },
      )
    } finally { derecha.recycle() }
  }

  private fun fallo(motivo: String): Map<String, Any> = mapOf("ok" to false, "motivo" to motivo)

  /** Los triángulos del modelo, de atrás hacia adelante, con sombreado simple según su inclinación respecto de la cámara. */
  private fun dibujar(canvas: Canvas, sw: Int, sh: Int, proyectar: (EnginePoint) -> Proyeccion?) {
    class Cara(val profundidad: Float, val a: Proyeccion, val b: Proyeccion, val c: Proyeccion, val triangulo: ModelTriangle)
    val caras = ArrayList<Cara>(modelo.triangles.size)
    for (t in modelo.triangles) {
      val a = proyectar(t.a) ?: continue
      val b = proyectar(t.b) ?: continue
      val c = proyectar(t.c) ?: continue
      caras.add(Cara((a.profundidad + b.profundidad + c.profundidad) / 3f, a, b, c, t))
    }
    caras.sortByDescending { it.profundidad }
    val relleno = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    val borde = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1f; strokeJoin = Paint.Join.ROUND }
    val camino = Path()
    for (cara in caras) {
      val n = (cara.b.camara - cara.a.camara).cross(cara.c.camara - cara.a.camara)
      val largo = n.length()
      val brillo = if (largo > 1e-9f) .45f + .55f * abs(n.z) / largo else 1f
      val rgb = cara.triangulo.rgb
      val color = Color.argb(
        ALFA_MODELO, (rgb[0] * brillo * 255).roundToInt().coerceIn(0, 255),
        (rgb[1] * brillo * 255).roundToInt().coerceIn(0, 255), (rgb[2] * brillo * 255).roundToInt().coerceIn(0, 255),
      )
      relleno.color = color
      borde.color = color // sin el trazo, el suavizado deja costuras entre triángulos vecinos
      camino.rewind()
      camino.moveTo(cara.a.x * sw, cara.a.y * sh)
      camino.lineTo(cara.b.x * sw, cara.b.y * sh)
      camino.lineTo(cara.c.x * sw, cara.c.y * sh)
      camino.close()
      canvas.drawPath(camino, relleno)
      canvas.drawPath(camino, borde)
    }
  }

  /** Silueta (envolvente convexa) y centro de cada pieza, normalizados, para tocarlas y resaltarlas desde la app. */
  private fun piezasProyectadas(proyectar: (EnginePoint) -> Proyeccion?): List<Map<String, Any>> {
    val puntos = List(modelo.parts.size) { ArrayList<Pair<Float, Float>>() }
    for (t in modelo.triangles) for (v in listOf(t.a, t.b, t.c)) proyectar(v)?.let { puntos[t.part].add(it.x to it.y) }
    return modelo.parts.mapIndexedNotNull { i, parte ->
      val silueta = casco(puntos[i])
      val centro = proyectar(parte.center)
      if (silueta.size < 3 || centro == null) return@mapIndexedNotNull null
      mapOf(
        "id" to parte.id,
        "contorno" to silueta.flatMap { listOf(it.first.toDouble(), it.second.toDouble()) },
        "centro" to listOf(centro.x.toDouble(), centro.y.toDouble()),
        "profundidad" to centro.profundidad.toDouble(),
      )
    }
  }

  private fun limpiarAnteriores(actual: Int) {
    context.cacheDir.listFiles { f -> f.name.startsWith("capo-analisis-foto-") || f.name.startsWith("capo-analisis-modelo-") }
      ?.filter { !it.name.endsWith("-$actual.jpg") && !it.name.endsWith("-$actual.png") }
      ?.forEach { it.delete() }
  }

  private fun abrir(uri: String) = context.contentResolver.openInputStream(Uri.parse(uri)) ?: throw IOException("No se pudo abrir la imagen")

  /** La imagen ya derecha (con el giro del EXIF aplicado) y el equivalente a 35 mm de la cámara, si lo trae. */
  private fun leerDerecha(uri: String): Pair<Bitmap, Float?> {
    val medidas = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    abrir(uri).use { BitmapFactory.decodeStream(it, null, medidas) }
    if (medidas.outWidth <= 0 || medidas.outHeight <= 0) throw IOException("La imagen no se pudo leer")
    var muestra = 1
    while (max(medidas.outWidth, medidas.outHeight) / (muestra * 2) >= LADO_LECTURA) muestra *= 2
    val bruta = abrir(uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = muestra }) }
      ?: throw IOException("La imagen no se pudo leer")
    val exif = try { abrir(uri).use { ExifInterface(it) } } catch (_: IOException) { null }
    val orientacion = exif?.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) ?: ExifInterface.ORIENTATION_NORMAL
    val focal = exif?.getAttributeInt(ExifInterface.TAG_FOCAL_LENGTH_IN_35MM_FILM, 0)?.takeIf { it in 10..200 }?.toFloat()
    val giro = Matrix()
    when (orientacion) {
      ExifInterface.ORIENTATION_ROTATE_90 -> giro.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> giro.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> giro.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> giro.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> giro.postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> { giro.postRotate(90f); giro.postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_TRANSVERSE -> { giro.postRotate(270f); giro.postScale(-1f, 1f) }
    }
    if (giro.isIdentity) return bruta to focal
    val derecha = Bitmap.createBitmap(bruta, 0, 0, bruta.width, bruta.height, giro, true)
    if (derecha !== bruta) bruta.recycle()
    return derecha to focal
  }

  private companion object {
    const val LADO_LECTURA = 1800 // la imagen se lee con la menor reducción que deje al menos este lado largo
    const val LADO_REGISTRO = 960f // lado largo del recorte que ve el registro (con el que se afinó)
    const val LADO_SALIDA = 1280 // lado largo de la foto y de la capa que se devuelven a la app
    const val ALFA_MODELO = 205
  }
}
