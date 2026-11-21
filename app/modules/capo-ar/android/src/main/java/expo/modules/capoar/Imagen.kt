package expo.modules.capoar

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

internal object Imagen {
  /** Copia una imagen YUV_420_888 de ARCore a NV21 (hay que copiarla antes de cerrar la Image). */
  fun aNv21(img: Image): ByteArray {
    val w = img.width
    val h = img.height
    val salida = ByteArray(w * h * 3 / 2)
    val y = img.planes[0]
    val u = img.planes[1]
    val v = img.planes[2]
    val yb = y.buffer
    var pos = 0
    for (fila in 0 until h) {
      val base = fila * y.rowStride
      for (col in 0 until w) salida[pos++] = yb.get(base + col * y.pixelStride)
    }
    val ub = u.buffer
    val vb = v.buffer
    for (fila in 0 until h / 2) {
      for (col in 0 until w / 2) {
        salida[pos++] = vb.get(fila * v.rowStride + col * v.pixelStride)
        salida[pos++] = ub.get(fila * u.rowStride + col * u.pixelStride)
      }
    }
    return salida
  }

  /** NV21 → JPEG girado `grados` en sentido horario (para que el modelo vea la imagen derecha). Devuelve (ancho, alto). */
  fun guardarJpeg(nv21: ByteArray, w: Int, h: Int, grados: Int, destino: File): Pair<Int, Int> {
    val bruto = ByteArrayOutputStream()
    YuvImage(nv21, ImageFormat.NV21, w, h, null).compressToJpeg(Rect(0, 0, w, h), 92, bruto)
    var bmp = BitmapFactory.decodeByteArray(bruto.toByteArray(), 0, bruto.size())
    if (grados % 360 != 0) {
      val girada = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(grados.toFloat()) }, true)
      bmp.recycle()
      bmp = girada
    }
    FileOutputStream(destino).use { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it) }
    val tam = Pair(bmp.width, bmp.height)
    bmp.recycle()
    return tam
  }

  /** De coordenadas normalizadas de la imagen GIRADA (la que ve el modelo) a las de la imagen original del sensor. */
  fun desgirar(x: Float, y: Float, grados: Int): Pair<Float, Float> = when ((grados % 360 + 360) % 360) {
    90 -> Pair(y, 1f - x)
    180 -> Pair(1f - x, 1f - y)
    270 -> Pair(1f - y, x)
    else -> Pair(x, y)
  }
}
