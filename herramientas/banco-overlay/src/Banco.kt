package expo.modules.capoar

import android.content.Context
import android.graphics.Canvas
import android.os.SystemClock
import android.view.MotionEvent
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO

/**
 * Dibuja la CapaPoligono real sobre una foto, como en un teléfono de 1080 × 2400 a densidad 2,625.
 * Argumentos: carpeta de datos, foto, salida.png, pieza elegida, zoom, desplazamiento en dp y toques «x,y» en píxeles.
 */
fun main(args: Array<String>) {
  val (dir, photoPath, out, selectedArg, zoomArg) = args.take(5)
  val density = 2.625f
  val w = 1080
  val h = 2400
  val zoom = zoomArg.toFloat()
  val volumes = File(dir, "volumenes.txt").readLines().map { line ->
    val (height, outline) = line.split(";")
    height.toFloat() to outline.split(" ").map { p -> p.split(",").let { it[0].toFloat() to it[1].toFloat() } }
  }
  val rows = File(dir, "filas.tsv").readLines().map { it.split("\t") }
  val photo = ImageIO.read(File(photoPath))
  val fw = w * zoom
  val fh = fw * photo.height / photo.width
  val fx = (w - fw) / 2 + args[5].toFloat() * density
  val fy = 235 * density - (fh - w * photo.height.toFloat() / photo.width) / 2

  val image = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB)
  val g = image.createGraphics()
  g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
  g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)
  g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
  g.color = java.awt.Color(14, 17, 22)
  g.fillRect(0, 0, w, h)
  g.drawImage(photo, fx.toInt(), fy.toInt(), fw.toInt(), fh.toInt(), null)

  // Caras como las entrega EngineMesh.project: las laterales (side) y la cara visible de cada pieza. Aquí la altura
  // es un corrimiento fijo, no una proyección 3D: alcanza para ver el dibujo.
  val faces = ArrayList<EngineFace>()
  for ((part, volume) in volumes.withIndex()) {
    val top = volume.second.map { (u, v) -> EngineScreenPoint(fx + u * fw, fy + v * fh, 1f) }
    val rise = volume.first * fw * .55f
    val base = top.map { EngineScreenPoint(it.x + rise * .12f, it.y + rise, 1f) }
    for (i in top.indices) {
      val j = (i + 1) % top.size
      faces.add(EngineFace(part, listOf(base[i], base[j], top[j], top[i]), true))
    }
    faces.add(EngineFace(part, top, false))
  }

  var tapped = -1
  val capa = CapaPoligono(Context(density)) { tapped = it }
  capa.width = w
  capa.height = h
  capa.setHudParts(rows)
  capa.setHudArea(96f, 560f) // bajo la barra superior y sobre el panel, en dp
  capa.selectedPart = selectedArg.toInt()
  // MODELO=1: como con el modelo 3D de la #38. Las mallas las dibuja OpenGL (aquí, la cara visible en gris) y la capa
  // solo recibe el centro de cada pieza.
  if (System.getenv("MODELO") == "1") {
    val centers = ArrayList<Float>()
    for (face in faces.filter { !it.side }) {
      val shape = java.awt.geom.Path2D.Float()
      face.points.forEachIndexed { i, p -> if (i == 0) shape.moveTo(p.x, p.y) else shape.lineTo(p.x, p.y) }
      shape.closePath()
      g.color = if (face.part == selectedArg.toInt()) java.awt.Color(255, 184, 41, 194) else java.awt.Color(150, 170, 190, 133)
      g.fill(shape)
      centers.add(face.part.toFloat())
      centers.add(face.points.map { it.x }.average().toFloat())
      centers.add(face.points.map { it.y }.average().toFloat())
    }
    capa.actualizar(null, null, true, emptyList(), ModelHitFrame(), centers.toFloatArray())
  } else {
    capa.actualizar(null, null, true, faces)
  }
  // Varios cuadros para que las etiquetas terminen de deslizarse a su lugar; se guarda el último.
  val scratch = BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB)
  repeat(30) { SystemClock.ahora = it * 33L; capa.onDraw(Canvas(scratch.createGraphics(), w, h)) }
  SystemClock.ahora = 400
  capa.onDraw(Canvas(g, w, h))
  ImageIO.write(image, "png", File(out))
  println("dibujado: $out")

  for (tap in args.drop(6).map { it.split(",").let { p -> p[0].toFloat() to p[1].toFloat() } }) {
    tapped = -1
    capa.onTouchEvent(MotionEvent(MotionEvent.ACTION_DOWN, tap.first, tap.second))
    capa.onTouchEvent(MotionEvent(MotionEvent.ACTION_UP, tap.first, tap.second))
    println("toque en ${tap.first.toInt()},${tap.second.toInt()} → pieza $tapped")
  }
}
