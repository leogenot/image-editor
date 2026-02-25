import vertSrc from './shader.vert?raw'
import fragSrc from './shader.frag?raw'
import sharpFragSrc from './sharp.frag?raw'
import type { RenderState, CurvePoint } from '../../types'

export class Renderer {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program!: WebGLProgram
  private sharpProgram!: WebGLProgram
  private vao!: WebGLVertexArrayObject
  private sharpVao!: WebGLVertexArrayObject
  private texture!: WebGLTexture
  private fboTexture!: WebGLTexture
  private fbo!: WebGLFramebuffer
  private curveLUT_r!: WebGLTexture
  private curveLUT_g!: WebGLTexture
  private curveLUT_b!: WebGLTexture
  private _isFloat = false
  private _floatLinear = false
  private _lastState: RenderState | null = null
  private _fboSize = { w: 0, h: 0 }
  private _u: Record<string, WebGLUniformLocation | null> = {}
  private _su: Record<string, WebGLUniformLocation | null> = {}

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    })
    if (!gl) throw new Error('WebGL2 not supported')
    this.gl = gl
    // Enable linear filtering for float textures (required for RGBA32F + LINEAR)
    this._floatLinear = gl.getExtension('OES_texture_float_linear') !== null
    gl.getExtension('EXT_color_buffer_float')
    this._init()
  }

  private _init(): void {
    const gl = this.gl

    // --- Pass 1: main edit program ---
    this.program = this._createProgram(vertSrc, fragSrc)

    // Fullscreen quad
    const positions = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1])
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(this.program, 'a_position')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    // VAO for sharp pass (same geometry, different program)
    this.sharpVao = gl.createVertexArray()!
    gl.bindVertexArray(this.sharpVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf) // reuse same buffer
    gl.bindVertexArray(null)

    // --- Textures ---
    this.texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([128, 128, 128, 255]))
    this._setTexParams()

    const defaultPts: CurvePoint[] = [[0,0],[1,1]]
    this.curveLUT_r = this._createLUTTexture()
    this.curveLUT_g = this._createLUTTexture()
    this.curveLUT_b = this._createLUTTexture()
    this._buildChannelLUTs(defaultPts, defaultPts, defaultPts, defaultPts)

    // FBO texture (for first pass output when sharpening/NR active)
    this.fboTexture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.fboTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    this._setTexParams()

    // Framebuffer
    this.fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTexture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    // --- Pass 1 uniforms ---
    gl.useProgram(this.program)
    for (const name of [
      'u_texture', 'u_curveLUT_r', 'u_curveLUT_g', 'u_curveLUT_b', 'u_isFloat', 'u_useCurve',
      'u_exposure', 'u_contrast', 'u_highlights', 'u_shadows', 'u_whites', 'u_blacks',
      'u_temp', 'u_tint', 'u_vibrance', 'u_saturation', 'u_hsl',
      'u_angle', 'u_aspectRatio',
    ]) {
      this._u[name] = gl.getUniformLocation(this.program, name)
    }

    // --- Pass 2: sharpening program ---
    this.sharpProgram = this._createProgram(vertSrc, sharpFragSrc)
    gl.useProgram(this.sharpProgram)

    // Bind a_position for sharp VAO
    gl.bindVertexArray(this.sharpVao)
    const sharpLoc = gl.getAttribLocation(this.sharpProgram, 'a_position')
    gl.enableVertexAttribArray(sharpLoc)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.vertexAttribPointer(sharpLoc, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    for (const name of ['u_texture', 'u_texelSize', 'u_sharpness', 'u_noiseReduction']) {
      this._su[name] = gl.getUniformLocation(this.sharpProgram, name)
    }
  }

  private _setTexParams(): void {
    const gl = this.gl
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  private _createShader(type: number, src: string): WebGLShader {
    const gl = this.gl
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`Shader compile error: ${err}`)
    }
    return shader
  }

  private _createProgram(vert: string, frag: string): WebGLProgram {
    const gl = this.gl
    const vs = this._createShader(gl.VERTEX_SHADER, vert)
    const fs = this._createShader(gl.FRAGMENT_SHADER, frag)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`)
    }
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    return prog
  }

  private _evalCurve(points: CurvePoint[], t: number): number {
    const n = points.length - 1
    if (n < 1) return t
    let seg = n - 1
    for (let i = 0; i < n; i++) {
      if (t <= points[i + 1][0]) { seg = i; break }
    }
    const x0 = points[seg][0], x1 = points[seg + 1][0]
    const lt = x1 === x0 ? 0 : (t - x0) / (x1 - x0)
    const p1 = points[seg]
    const p2 = points[seg + 1]
    const p0: CurvePoint = seg > 0 ? points[seg - 1] : [2*p1[0]-p2[0], 2*p1[1]-p2[1]]
    const p3: CurvePoint = seg < n - 1 ? points[seg + 2] : [2*p2[0]-p1[0], 2*p2[1]-p1[1]]
    const t2 = lt * lt, t3 = lt * lt * lt
    return Math.max(0, Math.min(1,
      (-t3 + 2*t2 - lt) * p0[1] * 0.5 +
      (3*t3 - 5*t2 + 2) * p1[1] * 0.5 +
      (-3*t3 + 4*t2 + lt) * p2[1] * 0.5 +
      (t3 - t2) * p3[1] * 0.5
    ))
  }

  private _createLUTTexture(): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    this._setTexParams()
    return tex
  }

  // Compose rgb curve with a per-channel curve and upload to texture
  private _buildComposedLUT(rgbPts: CurvePoint[], channelPts: CurvePoint[], texture: WebGLTexture): void {
    const gl = this.gl
    const lut = new Uint8Array(256 * 4)
    for (let i = 0; i < 256; i++) {
      const v1 = this._evalCurve(rgbPts, i / 255)
      const v2 = this._evalCurve(channelPts, v1)
      const out = Math.round(v2 * 255)
      lut[i*4] = lut[i*4+1] = lut[i*4+2] = out
      lut[i*4+3] = 255
    }
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut)
    this._setTexParams()
  }

  private _buildChannelLUTs(rgbPts: CurvePoint[], rPts: CurvePoint[], gPts: CurvePoint[], bPts: CurvePoint[]): void {
    this._buildComposedLUT(rgbPts, rPts, this.curveLUT_r)
    this._buildComposedLUT(rgbPts, gPts, this.curveLUT_g)
    this._buildComposedLUT(rgbPts, bPts, this.curveLUT_b)
  }

  private _resizeFBO(w: number, h: number): void {
    if (this._fboSize.w === w && this._fboSize.h === h) return
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.fboTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    this._setTexParams()
    this._fboSize = { w, h }
  }

  loadImage(imageBitmap: ImageBitmap): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    // @ts-expect-error — WebGL2 texImage2D accepts ImageBitmap but TS lib is missing this overload
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap)
    this._setTexParams()
    this._isFloat = false
    if (this._lastState) this.render(this._lastState)
  }

  loadRawPixels(pixels: Float32Array, width: number, height: number): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, pixels)
    this._setTexParams()
    // RGBA32F requires OES_texture_float_linear for LINEAR filtering; fall back to NEAREST
    if (!this._floatLinear) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    }
    this._isFloat = true
    if (this._lastState) this.render(this._lastState)
  }

  private _drawPass1(state: RenderState): void {
    const gl = this.gl
    const u = this._u

    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(u['u_texture'], 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.curveLUT_r)
    gl.uniform1i(u['u_curveLUT_r'], 1)

    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.curveLUT_g)
    gl.uniform1i(u['u_curveLUT_g'], 2)

    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, this.curveLUT_b)
    gl.uniform1i(u['u_curveLUT_b'], 3)

    const light = state.light ?? {}
    gl.uniform1f(u['u_exposure'],   light.exposure   ?? 0)
    gl.uniform1f(u['u_contrast'],   light.contrast   ?? 0)
    gl.uniform1f(u['u_highlights'], light.highlights ?? 0)
    gl.uniform1f(u['u_shadows'],    light.shadows    ?? 0)
    gl.uniform1f(u['u_whites'],     light.whites     ?? 0)
    gl.uniform1f(u['u_blacks'],     light.blacks     ?? 0)

    const color = state.color ?? {}
    gl.uniform1f(u['u_temp'],       color.temp       ?? 0)
    gl.uniform1f(u['u_tint'],       color.tint       ?? 0)
    gl.uniform1f(u['u_vibrance'],   color.vibrance   ?? 0)
    gl.uniform1f(u['u_saturation'], color.saturation ?? 0)

    const hslKeys = ['red','orange','yellow','green','aqua','blue','purple','magenta'] as const
    const hslData = new Float32Array(hslKeys.flatMap(k => {
      const v = color.hsl?.[k] ?? { h: 0, s: 0, l: 0 }
      return [v.h, v.s, v.l]
    }))
    gl.uniform3fv(u['u_hsl'], hslData)

    const curve = state.curve ?? {}
    const defaultPts: CurvePoint[] = [[0,0],[1,1]]
    const defaultStr = JSON.stringify(defaultPts)
    // Support legacy format (old sessions had just `curve.points`)
    const legacy = (curve as Record<string, unknown>).points as CurvePoint[] | undefined
    const rgbPts = curve.rgb ?? legacy ?? defaultPts
    const rPts   = curve.r   ?? defaultPts
    const gPts   = curve.g   ?? defaultPts
    const bPts   = curve.b   ?? defaultPts
    const isIdentity =
      JSON.stringify(rgbPts) === defaultStr &&
      JSON.stringify(rPts)   === defaultStr &&
      JSON.stringify(gPts)   === defaultStr &&
      JSON.stringify(bPts)   === defaultStr
    if (!isIdentity) this._buildChannelLUTs(rgbPts, rPts, gPts, bPts)
    gl.uniform1i(u['u_useCurve'], isIdentity ? 0 : 1)
    gl.uniform1i(u['u_isFloat'], this._isFloat ? 1 : 0)

    const crop = state.crop ?? {}
    const angleDeg = crop.angle ?? 0
    gl.uniform1f(u['u_angle'], (angleDeg * Math.PI) / 180)
    gl.uniform1f(u['u_aspectRatio'], gl.canvas.width / gl.canvas.height)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.bindVertexArray(null)
  }

  private _drawPass2(state: RenderState): void {
    const gl = this.gl
    const su = this._su
    const w = gl.canvas.width, h = gl.canvas.height
    const detail = state.detail ?? {}

    gl.useProgram(this.sharpProgram)
    gl.bindVertexArray(this.sharpVao)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.fboTexture)
    gl.uniform1i(su['u_texture'], 0)
    gl.uniform2f(su['u_texelSize'], 1 / w, 1 / h)
    gl.uniform1f(su['u_sharpness'],      detail.sharpness      ?? 0)
    gl.uniform1f(su['u_noiseReduction'], detail.noiseReduction ?? 0)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.bindVertexArray(null)
  }

  render(state: RenderState): void {
    this._lastState = state
    const gl = this.gl
    const w = gl.canvas.width, h = gl.canvas.height
    const detail = state.detail ?? {}
    const needsSecondPass =
      (detail.sharpness ?? 0) > 0.01 ||
      (detail.noiseReduction ?? 0) > 0.01

    gl.viewport(0, 0, w, h)

    if (needsSecondPass) {
      // Pass 1 → FBO
      this._resizeFBO(w, h)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
      this._drawPass1(state)
      // Pass 2 → screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      this._drawPass2(state)
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      this._drawPass1(state)
    }
  }

  async exportBlob(state: RenderState, format = 'image/jpeg', quality = 0.95): Promise<Blob | null> {
    this.render(state)
    return new Promise(resolve => this.canvas.toBlob(resolve, format, quality))
  }

  resize(w: number, h: number): void {
    this.canvas.width = w
    this.canvas.height = h
  }
}
