package expo.modules.capoar

import android.opengl.GLES20 as GL
import android.opengl.Matrix
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.abs

internal class ModelHitFrame(private val model: PlacedModel, mvp: FloatArray, private val width: Int, private val height: Int) {
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
    return model.pick(point(-1f),point(1f))
  }
}

internal class ModelRenderer {
  private var program = 0
  private var matrix = -1
  private var selected = -1
  private var position = -1
  private var color = -1
  private var part = -1
  private var loaded: PlacedModel? = null
  private lateinit var vertices: FloatBuffer
  fun reset() { program = 0; loaded = null }
  private fun shader(type: Int, code: String): Int {
    val shader = GL.glCreateShader(type)
    GL.glShaderSource(shader,code); GL.glCompileShader(shader)
    val ok=IntArray(1); GL.glGetShaderiv(shader,GL.GL_COMPILE_STATUS,ok,0)
    check(ok[0]!=0) { GL.glGetShaderInfoLog(shader) }
    return shader
  }
  private fun initialize() {
    val vs=shader(GL.GL_VERTEX_SHADER,"""
      uniform mat4 matrix; uniform float selected;
      attribute vec3 position; attribute vec3 color; attribute float part;
      varying mediump vec4 tint;
      void main() {
        bool highlighted = abs(part-selected) < 0.25;
        tint = highlighted ? vec4(1.0,0.72,0.16,0.76) : vec4(color,0.52);
        gl_Position = matrix * vec4(position,1.0);
      }
    """.trimIndent())
    val fs=shader(GL.GL_FRAGMENT_SHADER,"precision mediump float; varying mediump vec4 tint; void main(){gl_FragColor=tint;}")
    program=GL.glCreateProgram(); GL.glAttachShader(program,vs); GL.glAttachShader(program,fs)
    GL.glLinkProgram(program); GL.glDeleteShader(vs); GL.glDeleteShader(fs)
    val ok=IntArray(1); GL.glGetProgramiv(program,GL.GL_LINK_STATUS,ok,0)
    check(ok[0]!=0) { GL.glGetProgramInfoLog(program) }
    matrix=GL.glGetUniformLocation(program,"matrix"); selected=GL.glGetUniformLocation(program,"selected")
    position=GL.glGetAttribLocation(program,"position"); color=GL.glGetAttribLocation(program,"color"); part=GL.glGetAttribLocation(program,"part")
  }
  fun draw(model: PlacedModel, mvp: FloatArray, selectedPart: Int) {
    if (program==0) initialize()
    if (model !== loaded) {
      vertices=ByteBuffer.allocateDirect(model.triangles.size*3*28).order(ByteOrder.nativeOrder()).asFloatBuffer()
      for(t in model.triangles) {
        val normal=(t.b-t.a).cross(t.c-t.a)
        val light=.65f+.35f*abs(normal.y)/normal.length().coerceAtLeast(.000001f)
        for(p in listOf(t.a,t.b,t.c)) {
          vertices.put(p.x).put(p.y).put(p.z)
          for (channel in t.rgb) vertices.put(channel*light)
          vertices.put(t.part.toFloat())
        }
      }
      loaded=model
    }
    GL.glUseProgram(program); GL.glUniformMatrix4fv(matrix,1,false,mvp,0); GL.glUniform1f(selected,selectedPart.toFloat())
    fun bind(location:Int, size:Int, offset:Int) {
      vertices.position(offset); GL.glEnableVertexAttribArray(location)
      GL.glVertexAttribPointer(location,size,GL.GL_FLOAT,false,28,vertices)
    }
    bind(position,3,0); bind(color,3,3); bind(part,1,6)
    GL.glEnable(GL.GL_DEPTH_TEST); GL.glDepthFunc(GL.GL_LESS); GL.glDepthMask(true)
    GL.glColorMask(false,false,false,false)
    GL.glDrawArrays(GL.GL_TRIANGLES,0,model.triangles.size*3)
    GL.glColorMask(true,true,true,true); GL.glDepthFunc(GL.GL_EQUAL); GL.glDepthMask(false)
    GL.glEnable(GL.GL_BLEND); GL.glBlendFunc(GL.GL_SRC_ALPHA,GL.GL_ONE_MINUS_SRC_ALPHA)
    GL.glDrawArrays(GL.GL_TRIANGLES,0,model.triangles.size*3)
    GL.glDisable(GL.GL_BLEND); GL.glDepthMask(true); GL.glDepthFunc(GL.GL_LESS); GL.glDisable(GL.GL_DEPTH_TEST)
    GL.glDisableVertexAttribArray(position); GL.glDisableVertexAttribArray(color); GL.glDisableVertexAttribArray(part)
  }
}
