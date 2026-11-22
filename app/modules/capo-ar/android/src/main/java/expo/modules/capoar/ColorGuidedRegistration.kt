package expo.modules.capoar

import org.json.JSONObject
import org.opencv.calib3d.Calib3d
import org.opencv.core.*
import org.opencv.features2d.ORB
import org.opencv.imgproc.Imgproc
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.*

/** A frontal guide proposes a pose from five distinct stationary color patches.
 * Independently matched ORB features must support that pose before it can reach the depth gate. */
internal class ColorGuidedRegistration(bytes: ByteArray, private val references: List<ModelFeatureReference>) {
  data class Result(val features: List<ModelFeatureMatch>, val controls: List<ModelFeatureMatch>)
  private data class Spot(val p: Point, val width: Double)
  private data class Seed(val spots: List<Spot>, val cost: Double)
  private val referenceWords = references.map { readWords(it.descriptors) }
  private val points: List<Point3>
  private val layouts: List<List<Spot>>
  private val contours: List<Pair<List<Point3>,Double>>
  private val orb = ORB.create(5200).apply { setFastThreshold(9) }
  private val clahe = Imgproc.createCLAHE(2.0, Size(8.0,8.0))

  init {
    val data = JSONObject(bytes.decodeToString())
    val anchors = data.getJSONArray("points")
    points = List(5) { i -> anchors.getJSONArray(i).let { Point3(it.getDouble(0),it.getDouble(1),it.getDouble(2)) } }
    val traces = data.getJSONArray("contours")
    contours = List(traces.length()) { i ->
      val trace = traces.getJSONObject(i)
      val vertices = trace.getJSONArray("points")
      val curve = List(vertices.length()) { j ->
        vertices.getJSONArray(j).let { Point3(it.getDouble(0),it.getDouble(1),it.getDouble(2)) }
      }
      curve to trace.getDouble("minimumCoverage")
    }
    val refs = data.getJSONArray("references")
    layouts = List(refs.length()) { r -> List(5) { i ->
      refs.getJSONArray(r).getJSONArray(i).let { Spot(Point(it.getDouble(0),it.getDouble(1)),it.getDouble(2)) }
    } }
  }

  private fun spots(hsv: Mat, low: Scalar, high: Scalar, scope: MatScope): List<Spot> {
    val binary = scope.own(Mat())
    Core.inRange(hsv,low,high,binary)
    val kernel = scope.own(Imgproc.getStructuringElement(Imgproc.MORPH_RECT,Size(3.0,3.0)))
    Imgproc.morphologyEx(binary,binary,Imgproc.MORPH_CLOSE,kernel)
    val labels = scope.own(Mat())
    val stats = scope.own(Mat())
    val centers = scope.own(Mat())
    val count = Imgproc.connectedComponentsWithStats(binary,labels,stats,centers)
    val boxes = IntArray(count * 5).also { stats.get(0,0,it) }
    val xy = DoubleArray(count * 2).also { centers.get(0,0,it) }
    return (1 until count).filter { i ->
      val w=boxes[i*5+2]; val h=boxes[i*5+3]; val area=boxes[i*5+4]
      area >= 10 && area < 800*800*.03 && w >= h*.46 && h >= w*.34 && area > .3*w*h
    }.sortedByDescending { boxes[it*5+4] }.take(9).map { i ->
      Spot(Point(xy[i*2],xy[i*2+1]),boxes[i*5+2].toDouble())
    }
  }

  private fun seed(layout: List<Spot>, amber: List<Spot>, blue: List<Spot>, a: Int, b: Int, u: Spot, v: Spot): Seed? {
    val dx=layout[b].p.x-layout[a].p.x; val dy=layout[b].p.y-layout[a].p.y
    val tx=v.p.x-u.p.x; val ty=v.p.y-u.p.y
    val norm=dx*dx+dy*dy
    val real=(tx*dx+ty*dy)/norm; val imag=(ty*dx-tx*dy)/norm
    val scale=hypot(real,imag)
    if (scale !in .43..2.5 || abs(atan2(imag,real))>.92) return null
    var cost=0.0
    val spots=ArrayList<Spot>(5)
    for ((j,mark) in layout.withIndex()) {
      val x=mark.p.x-layout[a].p.x; val y=mark.p.y-layout[a].p.y
      val expected=Point(real*x-imag*y+u.p.x,imag*x+real*y+u.p.y)
      val width=mark.width*scale
      val pool=if (j==3) blue else amber
      var best: Spot?=null
      var error=Double.POSITIVE_INFINITY
      for (spot in pool) {
        val distance=hypot(spot.p.x-expected.x,spot.p.y-expected.y)
        if (spot.width !in width*.48..width*1.85 || distance>max(15.0,width*1.65)) continue
        val value=distance/width+.35*abs(ln(spot.width/width))
        if (value<error) { error=value; best=spot }
      }
      if (best==null || best in spots) return null
      spots.add(best)
      cost+=error
    }
    // The donor coolant cap has a yellow warning in its blue face.
    val cap=spots[3]
    if (amber.none { hypot(it.p.x-cap.p.x,it.p.y-cap.p.y)<cap.width*.7 }) return null
    return Seed(spots,cost)
  }

  private fun readWords(desc: Mat): LongArray {
    val bytes=ByteArray(desc.rows()*32)
    desc.get(0,0,bytes)
    return LongArray(desc.rows()*4).also { ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asLongBuffer().get(it) }
  }

  fun locate(rawGray: Mat, original: Mat, degrees: Int, intrinsics: EngineCaptureIntrinsics, scope: MatScope): Result? {
    if (original.empty()) return null
    val scale=800.0/original.cols()
    val image=scope.own(Mat())
    Imgproc.resize(original,image,Size(800.0,round(original.rows()*scale)),0.0,0.0,Imgproc.INTER_AREA)
    val hsv=scope.own(Mat())
    Imgproc.cvtColor(image,hsv,Imgproc.COLOR_BGR2HSV)
    val amber=spots(hsv,Scalar(8.0,86.0,87.0),Scalar(39.0,255.0,255.0),scope)
    val blue=spots(hsv,Scalar(86.0,80.0,53.0),Scalar(128.0,255.0,255.0),scope)
    if (amber.size<4 || blue.isEmpty()) return null
    val seeds=ArrayList<Seed>()
    for (layout in layouts) for ((a,b) in listOf(0 to 1,0 to 4,1 to 4,0 to 2)) {
      for (u in amber) for (v in amber) if (u!=v) seed(layout,amber,blue,a,b,u,v)?.let(seeds::add)
    }
    if (seeds.isEmpty()) return null
    val gray=scope.own(Mat())
    // Match the reference bank's grayscale JPEG decoding and resize order.
    Imgproc.resize(rawGray,gray,image.size(),0.0,0.0,Imgproc.INTER_AREA)
    val evidence = ContourEvidence.from(gray,scope)
    clahe.apply(gray,gray)
    val keys=scope.own(MatOfKeyPoint()); val desc=scope.own(Mat())
    orb.detectAndCompute(gray,scope.own(Mat()),keys,desc)
    if (desc.rows()<18) return null
    val pixels=keys.toArray().map { it.pt }; val words=readWords(desc)
    val gridWidth=51
    fun cell(p: Point)=(p.y/16).toInt()*gridWidth+(p.x/16).toInt()
    val grid=pixels.indices.groupBy { cell(pixels[it]) }
    val sideways=degrees.mod(180)==90
    val sx=image.cols().toDouble()/(if (sideways) intrinsics.height else intrinsics.width)
    val sy=image.rows().toDouble()/(if (sideways) intrinsics.width else intrinsics.height)
    val (cx,cy)=Imagen.girar((intrinsics.cx+.5f)/intrinsics.width,(intrinsics.cy+.5f)/intrinsics.height,degrees)
    val camera=scope.own(Mat.eye(3,3,CvType.CV_64F)).apply {
      put(0,0,(if (sideways) intrinsics.fy else intrinsics.fx)*sx,0.0,cx*image.cols()-.5,
        0.0,(if (sideways) intrinsics.fx else intrinsics.fy)*sy,cy*image.rows()-.5,0.0,0.0,1.0)
    }
    val empty=scope.own(MatOfDouble())
    val marks=scope.own(MatOfPoint3f()).apply { fromList(points) }
    fun original(p: Point)=Point((p.x+.5)/scale-.5,(p.y+.5)*original.rows()/image.rows()-.5)
    for (seed in seeds.sortedBy { it.cost }.distinctBy { it.spots }.take(6)) MatScope().use { work ->
      val uv=work.own(MatOfPoint2f()).apply { fromList(seed.spots.map { it.p }) }
      val r=work.own(Mat()); val t=work.own(Mat())
      if (!Calib3d.solvePnP(marks,uv,camera,empty,r,t,false,Calib3d.SOLVEPNP_SQPNP)) return@use
      val predicted=work.own(MatOfPoint2f())
      Calib3d.projectPoints(marks,r,t,camera,empty,predicted)
      if (predicted.toArray().zip(seed.spots).any { (p,s) -> hypot(p.x-s.p.x,p.y-s.p.y)>18 }) return@use
      val shapeMatches = contours.all { (curve, minimum) ->
        val xyz = work.own(MatOfPoint3f()).apply { fromList(curve) }
        Calib3d.projectPoints(xyz,r,t,camera,empty,predicted)
        evidence.coverage(predicted.toArray().toList()) >= minimum
      }
      if (!shapeMatches) return@use
      // Search only nearby detected corners. Keep one independent observation per four-pixel cell.
      val best=HashMap<Pair<Int,Int>,Pair<Int,Pair<ModelFeatureMatch,Double>>>()
      for ((ri,ref) in references.withIndex()) {
        val world=work.own(MatOfPoint3f()).apply { fromList(ref.xyz) }
        Calib3d.projectPoints(world,r,t,camera,empty,predicted)
        val codes=referenceWords[ri]
        for ((i,p) in predicted.toArray().withIndex()) {
          if (p.x !in -15.0..815.0 || p.y !in -15.0..(image.rows()+15.0)) continue
          var first=257; var second=257; var idx=-1
          val center=cell(p)
          for (dy in -1..1) for (dx in -1..1) for (k in grid[center+dy*gridWidth+dx].orEmpty()) {
            val q=pixels[k]
            if (abs(q.x-p.x)>=15 || abs(q.y-p.y)>=15) continue
            var distance=0
            for (j in 0..3) distance+=java.lang.Long.bitCount(codes[i*4+j] xor words[k*4+j])
            if (distance<first) { second=first; first=distance; idx=k } else if (distance<second) second=distance
          }
          if (idx<0 || second==257 || first>=78 || first>=.93*second) continue
          val q=pixels[idx]; val key=(q.x/4).toInt() to (q.y/4).toInt()
          if (first >= (best[key]?.first ?: 257)) continue
          best[key]=first to (ModelFeatureMatch(ref.xyz[i],original(q),first/256f) to hypot(p.x-q.x,p.y-q.y))
        }
      }
      val features=best.values.filter { it.second.second<6.5 }.map { it.second.first }
      if (features.size>=18) {
        val controls=seed.spots.mapIndexed { i,spot -> ModelFeatureMatch(points[i],original(spot.p),0f) }
        return Result(features,controls)
      }
    }
    return null
  }
}
