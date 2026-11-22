package expo.modules.capoar

import android.opengl.GLES20 as GL
import android.opengl.Matrix
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

internal class ModelHitFrame(private val model: PlacedModel, mvp: FloatArray, private val width: Int, private val height: Int, private val animation: InspectionFrame? = null) {
  private val inverse = FloatArray(16)
  private val valid = Matrix.invertM(inverse, 0, mvp, 0)
  fun hit(x: Float, y: Float): Int? {
    if (!valid || width <= 0 || height <= 0) return null
    fun point(depth: Float): EnginePoint {
      val clip = floatArrayOf(2*x/width-1, 1-2*y/height, depth, 1f)
      val p = FloatArray(4)
      Matrix.multiplyMV(p,0,inverse,0,clip,0)
      return EnginePoint(p[0],p[1],p[2])*(1f/p[3])
    }
    return model.pick(point(-1f),point(1f),animation)
  }
}

internal class ModelRenderer {
  private var program = 0
  private var matrix = -1
  private var selected = -1
  private var brightness = -1
  private var position = -1
  private var color = -1
  private var part = -1
  private var loaded: PlacedModel? = null
  private lateinit var vertices: FloatBuffer
  private var ranges = emptyMap<Int, IntRange>()
  private var moving: FloatBuffer? = null
  private var veilProgram = 0
  private var veilPosition = -1
  private var veilColor = -1
  private val veilQuad = ByteBuffer.allocateDirect(32).order(ByteOrder.nativeOrder()).asFloatBuffer()
    .apply { put(floatArrayOf(-1f,-1f,1f,-1f,-1f,1f,1f,1f)); position(0) }
  private var focusPart = -1
  private var veilAlpha = 0f
  private var lastNs = 0L
  fun reset() { program = 0; veilProgram = 0; loaded = null; focusPart = -1; veilAlpha = 0f; lastNs = 0L }
  private fun advanceVeil(target: Int) {
    val now = System.nanoTime()
    val dt = if (lastNs == 0L) 0f else ((now - lastNs) / 1e9f).coerceAtMost(.05f)
    lastNs = now
    if (target >= 0) focusPart = target
    val goal = if (target >= 0) VEIL_ALPHA else 0f
    val step = VEIL_ALPHA * dt / VEIL_SECONDS
    veilAlpha = if (veilAlpha < goal) min(goal, veilAlpha + step) else max(goal, veilAlpha - step)
    if (target < 0 && veilAlpha == 0f) focusPart = -1
  }
  private fun drawVeil() {
    GL.glUseProgram(veilProgram)
    GL.glEnable(GL.GL_DEPTH_TEST); GL.glDepthFunc(GL.GL_LEQUAL); GL.glDepthMask(false)
    GL.glEnable(GL.GL_BLEND); GL.glBlendFunc(GL.GL_SRC_ALPHA,GL.GL_ONE_MINUS_SRC_ALPHA)
    GL.glUniform4f(veilColor,0f,0f,0f,veilAlpha)
    veilQuad.position(0)
    GL.glEnableVertexAttribArray(veilPosition)
    GL.glVertexAttribPointer(veilPosition,2,GL.GL_FLOAT,false,0,veilQuad)
    GL.glDrawArrays(GL.GL_TRIANGLE_STRIP,0,4)
    GL.glDisableVertexAttribArray(veilPosition)
    GL.glUseProgram(program)
  }
  private fun shader(type: Int, code: String): Int {
    val shader = GL.glCreateShader(type)
    GL.glShaderSource(shader,code); GL.glCompileShader(shader)
    val ok=IntArray(1); GL.glGetShaderiv(shader,GL.GL_COMPILE_STATUS,ok,0)
    check(ok[0]!=0) { GL.glGetShaderInfoLog(shader) }
    return shader
  }
  private fun initialize() {
    val vs=shader(GL.GL_VERTEX_SHADER,"""
      uniform mat4 matrix; uniform float selected; uniform float brightness;
      attribute vec3 position; attribute vec3 color; attribute float part;
      varying mediump vec4 tint;
      void main() {
        bool highlighted = abs(part-selected) < 0.25;
        tint = highlighted ? vec4(1.0,0.72,0.16,0.76) : vec4(color,0.52);
        if (highlighted && brightness >= 0.0) tint = vec4(mix(color, vec3(0.79,1.0,0.94),brightness),0.94);
        gl_Position = matrix * vec4(position,1.0);
      }
    """.trimIndent())
    val fs=shader(GL.GL_FRAGMENT_SHADER,"precision mediump float; varying mediump vec4 tint; void main(){gl_FragColor=tint;}")
    program=GL.glCreateProgram(); GL.glAttachShader(program,vs); GL.glAttachShader(program,fs)
    GL.glLinkProgram(program); GL.glDeleteShader(vs); GL.glDeleteShader(fs)
    val ok=IntArray(1); GL.glGetProgramiv(program,GL.GL_LINK_STATUS,ok,0)
    check(ok[0]!=0) { GL.glGetProgramInfoLog(program) }
    matrix=GL.glGetUniformLocation(program,"matrix"); selected=GL.glGetUniformLocation(program,"selected")
    brightness=GL.glGetUniformLocation(program,"brightness")
    val veilVertex=shader(GL.GL_VERTEX_SHADER,"attribute vec2 position; void main(){gl_Position=vec4(position,0.9999,1.0);}")
    val veilFragment=shader(GL.GL_FRAGMENT_SHADER,"precision mediump float; uniform vec4 color; void main(){gl_FragColor=color;}")
    veilProgram=GL.glCreateProgram(); GL.glAttachShader(veilProgram,veilVertex); GL.glAttachShader(veilProgram,veilFragment)
    GL.glLinkProgram(veilProgram); GL.glDeleteShader(veilVertex); GL.glDeleteShader(veilFragment)
    val veilOk=IntArray(1); GL.glGetProgramiv(veilProgram,GL.GL_LINK_STATUS,veilOk,0)
    check(veilOk[0]!=0) { GL.glGetProgramInfoLog(veilProgram) }
    veilPosition=GL.glGetAttribLocation(veilProgram,"position"); veilColor=GL.glGetUniformLocation(veilProgram,"color")
    position=GL.glGetAttribLocation(program,"position"); color=GL.glGetAttribLocation(program,"color"); part=GL.glGetAttribLocation(program,"part")
  }
  private fun buffer(count: Int) = ByteBuffer.allocateDirect(count * 3 * 28).order(ByteOrder.nativeOrder()).asFloatBuffer()

  private fun write(target: FloatBuffer, triangles: List<ModelTriangle>) {
    for (triangle in triangles) {
      val normal = (triangle.b - triangle.a).cross(triangle.c - triangle.a)
      val light = .65f + .35f * abs(normal.y) / normal.length().coerceAtLeast(.000001f)
      for (point in listOf(triangle.a, triangle.b, triangle.c)) {
        target.put(point.x).put(point.y).put(point.z)
        for (channel in triangle.rgb) target.put(channel * light)
        target.put(triangle.part.toFloat())
      }
    }
  }

  fun draw(model: PlacedModel, mvp: FloatArray, selectedPart: Int, animation: InspectionFrame? = null, focus: Int = -1) {
    if (program == 0) initialize()
    if (model !== loaded) {
      vertices = buffer(model.triangles.size)
      val groups = model.triangles.groupBy { it.part }
      ranges = groups.mapValues { (_, triangles) ->
        val start = vertices.position() / 7
        write(vertices, triangles)
        start until (vertices.position() / 7)
      }
      loaded = model
    }
    advanceVeil(focus)
    val count = (animation?.surface?.size ?: 0) + (animation?.effects?.size ?: 0)
    if (animation != null) {
      val target = moving?.takeIf { it.capacity() >= count * 21 } ?: buffer(count + 64).also { moving = it }
      target.clear()
      write(target, animation.surface)
      write(target, animation.effects)
    }
    GL.glUseProgram(program)
    GL.glUniformMatrix4fv(matrix,1,false,mvp,0)
    GL.glUniform1f(selected,selectedPart.toFloat())
    GL.glUniform1f(brightness,animation?.brightness ?: -1f)
    fun bind(source: FloatBuffer) {
      fun attribute(location: Int, size: Int, offset: Int) {
        source.position(offset)
        GL.glEnableVertexAttribArray(location)
        GL.glVertexAttribPointer(location,size,GL.GL_FLOAT,false,28,source)
      }
      attribute(position,3,0)
      attribute(color,3,3)
      attribute(part,1,6)
    }
    fun depthPass(geometry: () -> Unit) {
      GL.glEnable(GL.GL_DEPTH_TEST); GL.glDepthFunc(GL.GL_LESS); GL.glDepthMask(true); GL.glDisable(GL.GL_BLEND)
      GL.glColorMask(false,false,false,false)
      geometry()
      GL.glColorMask(true,true,true,true)
    }
    fun colorPass(geometry: () -> Unit) {
      GL.glDepthFunc(GL.GL_EQUAL); GL.glDepthMask(false)
      GL.glEnable(GL.GL_BLEND); GL.glBlendFunc(GL.GL_SRC_ALPHA,GL.GL_ONE_MINUS_SRC_ALPHA)
      geometry()
    }
    fun pass(geometry: () -> Unit) { depthPass(geometry); colorPass(geometry) }
    val animatedRange = animation?.let { ranges[it.index] }
    val focusRange = focusPart.takeIf { it >= 0 && (animation == null || animation.index == it) }?.let { ranges[it] }
    val range = animatedRange ?: focusRange
    val total = model.triangles.size * 3
    pass {
      bind(vertices)
      if (range == null) GL.glDrawArrays(GL.GL_TRIANGLES,0,total)
      else {
        GL.glDrawArrays(GL.GL_TRIANGLES,0,range.first)
        GL.glDrawArrays(GL.GL_TRIANGLES,range.last+1,total-range.last-1)
      }
    }
    if (range != null) {
      GL.glDepthMask(true); GL.glClear(GL.GL_DEPTH_BUFFER_BIT)
      val separate = {
        if (animation != null) { bind(checkNotNull(moving)); GL.glDrawArrays(GL.GL_TRIANGLES,0,count*3) }
        else { bind(vertices); GL.glDrawArrays(GL.GL_TRIANGLES,range.first,range.last-range.first+1) }
      }
      if (focusRange != null && veilAlpha > 0f) { depthPass(separate); drawVeil(); colorPass(separate) }
      else pass(separate)
    }
    GL.glDisable(GL.GL_BLEND); GL.glDepthMask(true); GL.glDepthFunc(GL.GL_LESS); GL.glDisable(GL.GL_DEPTH_TEST)
    GL.glDisableVertexAttribArray(position); GL.glDisableVertexAttribArray(color); GL.glDisableVertexAttribArray(part)
  }
}

private const val VEIL_ALPHA = .62f
private const val VEIL_SECONDS = .25f
