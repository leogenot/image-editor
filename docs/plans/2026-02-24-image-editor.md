# Image Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a mobile-first, browser-based image editor with Lightroom-grade editing, RAW file support (LibRaw WASM), WebGL2 GPU rendering, and an industrial monochrome glassmorphism UI.

**Architecture:** Astro (static SPA) + Alpine.js `$store` for all reactive state. WebGL2 custom GLSL shader pipeline applies all edits in one GPU pass (plus optional second pass for sharpening/NR). LibRaw WASM runs in a Web Worker for non-blocking RAW decoding. IndexedDB via `idb-keyval` persists edit sessions.

**Tech Stack:** Astro, Vite, Alpine.js, Tailwind CSS 4, WebGL2/GLSL, LibRaw WASM, idb-keyval, Space Mono (Google Fonts).

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tailwind.config.mjs` (auto-generated)
- Create: `src/styles/global.css`
- Create: `src/pages/index.astro`

**Step 1: Scaffold Astro project**

```bash
cd /Users/leogenot/Sites/image-editor
npm create astro@latest . -- --template minimal --no-install --no-git
```

Expected: Astro project files created (astro.config.mjs, package.json, etc.)

**Step 2: Install all dependencies**

```bash
npm install
npm install alpinejs @astrojs/alpinejs
npm install idb-keyval
npm install --save-dev @tailwindcss/vite tailwindcss
```

Expected: `node_modules/` populated, no errors.

**Step 3: Install Space Mono via fontsource**

```bash
npm install @fontsource/space-mono
```

**Step 4: Configure Astro**

Replace contents of `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import alpinejs from '@astrojs/alpinejs'

export default defineConfig({
  integrations: [alpinejs({ entrypoint: '/src/entrypoint.ts' })],
  vite: {
    plugins: [tailwindcss()],
  },
})
```

**Step 5: Create Alpine.js entrypoint**

Create `src/entrypoint.ts`:

```ts
import type { Alpine } from 'alpinejs'
import { createEditorStore } from './lib/store.js'

export default (Alpine: Alpine) => {
  createEditorStore(Alpine)
}
```

**Step 6: Create global CSS with Tailwind 4 theme**

Write `src/styles/global.css`:

```css
@import "tailwindcss";
@import "@fontsource/space-mono/400.css";
@import "@fontsource/space-mono/700.css";

@theme {
  --font-mono: 'Space Mono', ui-monospace, monospace;
  --color-bg: #000000;
  --color-surface: rgba(255, 255, 255, 0.04);
  --color-border: rgba(255, 255, 255, 0.1);
  --color-primary: #ffffff;
  --color-secondary: #666666;
  --color-panel: #111111;
}

* {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

html, body {
  background: #000;
  color: #fff;
  font-family: 'Space Mono', monospace;
  overflow: hidden;
  height: 100%;
  width: 100%;
}

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
```

**Step 7: Create bare-bones index.astro**

Write `src/pages/index.astro`:

```astro
---
import '../styles/global.css'
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#000000" />
    <title>EDITOR</title>
  </head>
  <body class="w-full h-full bg-black" x-data>
    <p class="text-white font-mono p-4">EDITOR — SCAFFOLDING OK</p>
  </body>
</html>
```

**Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: Server starts on http://localhost:4321, page shows "EDITOR — SCAFFOLDING OK" in white monospace text on black.

**Step 9: Commit**

```bash
git init
git add .
git commit -m "feat: initial Astro + Alpine.js + Tailwind 4 scaffold"
```

---

## Task 2: Alpine.js Store (State Management)

**Files:**
- Create: `src/lib/store.js`

**Step 1: Create the editor store**

Create `src/lib/store.js`:

```js
export function createEditorStore(Alpine) {
  Alpine.store('editor', {
    // File state
    file: null,
    filename: '',
    imageData: null,   // ImageBitmap or null
    rawPixels: null,   // Float32Array for RAW files
    isRaw: false,
    width: 0,
    height: 0,
    hasImage: false,

    // Edit values
    light: {
      exposure: 0,    // EV stops, -5 to +5
      contrast: 0,    // -1 to +1
      highlights: 0,  // -1 to +1
      shadows: 0,     // -1 to +1
      whites: 0,      // -1 to +1
      blacks: 0,      // -1 to +1
    },
    color: {
      temp: 0,        // -1 to +1 (cool → warm)
      tint: 0,        // -1 to +1 (green → magenta)
      vibrance: 0,    // -1 to +1
      saturation: 0,  // -1 to +1
      hsl: {
        red:     { h: 0, s: 0, l: 0 },
        orange:  { h: 0, s: 0, l: 0 },
        yellow:  { h: 0, s: 0, l: 0 },
        green:   { h: 0, s: 0, l: 0 },
        aqua:    { h: 0, s: 0, l: 0 },
        blue:    { h: 0, s: 0, l: 0 },
        purple:  { h: 0, s: 0, l: 0 },
        magenta: { h: 0, s: 0, l: 0 },
      },
    },
    curve: {
      points: [[0, 0], [0.25, 0.25], [0.75, 0.75], [1, 1]],
      channel: 'rgb', // 'rgb' | 'r' | 'g' | 'b'
    },
    detail: {
      sharpness: 0,       // 0 to 1
      noiseReduction: 0,  // 0 to 1
    },
    crop: {
      x: 0, y: 0, w: 1, h: 1,
      angle: 0,
      ratio: 'free', // 'free' | '1:1' | '4:3' | '16:9' | '3:2'
    },

    // UI
    activePanel: 'light',
    cropMode: false,
    exportOpen: false,
    recentSessions: [],

    // History (undo/redo)
    _history: [],
    _historyIndex: -1,

    // Snapshot current editable state for undo
    _snapshot() {
      return JSON.stringify({
        light: this.light,
        color: this.color,
        curve: this.curve,
        detail: this.detail,
      })
    },

    // Push snapshot to history (call on slider 'change', not 'input')
    pushHistory() {
      const snap = this._snapshot()
      // Truncate redo branch
      this._history = this._history.slice(0, this._historyIndex + 1)
      this._history.push(snap)
      if (this._history.length > 50) this._history.shift()
      this._historyIndex = this._history.length - 1
    },

    undo() {
      if (this._historyIndex <= 0) return
      this._historyIndex--
      const state = JSON.parse(this._history[this._historyIndex])
      Object.assign(this.light, state.light)
      Object.assign(this.color, state.color)
      this.curve = state.curve
      Object.assign(this.detail, state.detail)
      window.dispatchEvent(new CustomEvent('editor:render'))
    },

    redo() {
      if (this._historyIndex >= this._history.length - 1) return
      this._historyIndex++
      const state = JSON.parse(this._history[this._historyIndex])
      Object.assign(this.light, state.light)
      Object.assign(this.color, state.color)
      this.curve = state.curve
      Object.assign(this.detail, state.detail)
      window.dispatchEvent(new CustomEvent('editor:render'))
    },

    resetEdits() {
      Object.assign(this.light, { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 })
      Object.assign(this.color, { temp: 0, tint: 0, vibrance: 0, saturation: 0 })
      this.curve.points = [[0,0],[0.25,0.25],[0.75,0.75],[1,1]]
      Object.assign(this.detail, { sharpness: 0, noiseReduction: 0 })
      this.pushHistory()
      window.dispatchEvent(new CustomEvent('editor:render'))
    },
  })
}
```

**Step 2: Verify Alpine.js integration**

Update `src/pages/index.astro` body to test store:

```astro
<body class="w-full h-full bg-black" x-data>
  <p
    class="text-white font-mono p-4"
    x-text="'PANEL: ' + $store.editor.activePanel"
  ></p>
  <button
    class="text-white font-mono p-4"
    @click="$store.editor.activePanel = 'color'"
  >SWITCH PANEL</button>
</body>
```

Run `npm run dev` and confirm clicking the button updates the text reactively.

**Step 3: Add keyboard undo/redo**

Add to body element:

```astro
<body
  x-data
  @keydown.meta.z.window="$store.editor.undo()"
  @keydown.ctrl.z.window="$store.editor.undo()"
  @keydown.meta.shift.z.window="$store.editor.redo()"
  @keydown.ctrl.y.window="$store.editor.redo()"
>
```

**Step 4: Commit**

```bash
git add src/lib/store.js src/entrypoint.ts
git commit -m "feat: Alpine.js editor store with undo/redo history"
```

---

## Task 3: WebGL Renderer Core

**Files:**
- Create: `src/lib/gl/renderer.js`
- Create: `src/lib/gl/shader.vert`
- Create: `src/lib/gl/shader.frag`

**Step 1: Create the vertex shader**

Create `src/lib/gl/shader.vert`:

```glsl
#version 300 es
in vec2 a_position;
out vec2 v_texCoord;

void main() {
  // Fullscreen triangle trick: positions are clip-space
  gl_Position = vec4(a_position, 0.0, 1.0);
  // Map clip space (-1..1) to texture space (0..1)
  v_texCoord = a_position * 0.5 + 0.5;
  v_texCoord.y = 1.0 - v_texCoord.y; // flip Y for image convention
}
```

**Step 2: Create the fragment shader (full pipeline)**

Create `src/lib/gl/shader.frag`:

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

// Input texture
uniform sampler2D u_texture;
uniform bool u_isFloat; // true for HDR/RAW float textures

// Light
uniform float u_exposure;    // EV stops: -5..+5
uniform float u_contrast;    // -1..+1
uniform float u_highlights;  // -1..+1
uniform float u_shadows;     // -1..+1
uniform float u_whites;      // -1..+1
uniform float u_blacks;      // -1..+1

// Color
uniform float u_temp;        // -1..+1
uniform float u_tint;        // -1..+1
uniform float u_vibrance;    // -1..+1
uniform float u_saturation;  // -1..+1

// HSL per color range: [h, s, l] for red/orange/yellow/green/aqua/blue/purple/magenta
uniform vec3 u_hsl[8];

// Tone curve LUT (1D, 256px wide, sampled as texture)
uniform sampler2D u_curveLUT;
uniform bool u_useCurve;

// --- Utility functions ---

// Luminance (perceptual)
float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// sRGB gamma encode
vec3 linearToSrgb(vec3 c) {
  return mix(
    12.92 * c,
    1.055 * pow(max(c, 0.0001), vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c)
  );
}

// sRGB gamma decode
vec3 srgbToLinear(vec3 c) {
  return mix(
    c / 12.92,
    pow((c + 0.055) / 1.055, vec3(2.4)),
    step(0.04045, c)
  );
}

// ACES filmic tone mapping
vec3 aces(vec3 x) {
  float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// RGB to HSL
vec3 rgbToHsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float delta = maxC - minC;
  float l = (maxC + minC) * 0.5;
  float s = delta < 0.0001 ? 0.0 : delta / (1.0 - abs(2.0 * l - 1.0));
  float h = 0.0;
  if (delta > 0.0001) {
    if (maxC == c.r)      h = mod((c.g - c.b) / delta, 6.0);
    else if (maxC == c.g) h = (c.b - c.r) / delta + 2.0;
    else                  h = (c.r - c.g) / delta + 4.0;
    h /= 6.0;
    if (h < 0.0) h += 1.0;
  }
  return vec3(h, s, l);
}

// HSL to RGB
vec3 hslToRgb(vec3 hsl) {
  float h = hsl.x, s = hsl.y, l = hsl.z;
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  float hi = floor(h * 6.0);
  if      (hi == 0.0) rgb = vec3(c, x, 0);
  else if (hi == 1.0) rgb = vec3(x, c, 0);
  else if (hi == 2.0) rgb = vec3(0, c, x);
  else if (hi == 3.0) rgb = vec3(0, x, c);
  else if (hi == 4.0) rgb = vec3(x, 0, c);
  else                rgb = vec3(c, 0, x);
  return rgb + m;
}

// Soft hue range mask (bell curve around target hue)
float hueMask(float h, float center, float width) {
  float d = abs(h - center);
  if (d > 0.5) d = 1.0 - d; // wrap around
  return smoothstep(width, 0.0, d);
}

// --- Main edit pipeline ---

void main() {
  vec4 texel = texture(u_texture, v_texCoord);
  vec3 color = texel.rgb;

  // 1. Decode: if sRGB input (JPEG/PNG), convert to linear
  if (!u_isFloat) {
    color = srgbToLinear(color);
  }

  // 2. Exposure (EV stops)
  color *= pow(2.0, u_exposure);

  // 3. Contrast (S-curve around 0.18 midpoint in log space)
  if (abs(u_contrast) > 0.001) {
    float mid = 0.18;
    float factor = 1.0 + u_contrast;
    color = pow(max(color / mid, 0.0001), vec3(factor)) * mid;
  }

  // 4. Highlights / Shadows / Whites / Blacks
  float L = luma(color);
  // Highlights: bright areas (0.5 - 1.0 luma)
  float hMask = smoothstep(0.3, 0.8, L);
  color += u_highlights * 0.5 * hMask;
  // Shadows: dark areas (0.0 - 0.5 luma)
  float sMask = 1.0 - smoothstep(0.1, 0.6, L);
  color += u_shadows * 0.3 * sMask;
  // Whites: very bright
  float wMask = smoothstep(0.7, 1.0, L);
  color += u_whites * 0.4 * wMask;
  // Blacks: very dark
  float bMask = 1.0 - smoothstep(0.0, 0.3, L);
  color += u_blacks * 0.2 * bMask;
  color = max(color, 0.0);

  // 5. White balance (color temperature + tint)
  color.r += u_temp * 0.15;
  color.b -= u_temp * 0.15;
  color.g -= u_tint * 0.1;
  color = max(color, 0.0);

  // 6. HSL per-channel adjustments (8 ranges)
  // Centers (hue 0..1): red=0/1, orange=0.08, yellow=0.17, green=0.33, aqua=0.5, blue=0.61, purple=0.75, magenta=0.88
  float centers[8];
  centers[0] = 0.0;   // red
  centers[1] = 0.08;  // orange
  centers[2] = 0.17;  // yellow
  centers[3] = 0.33;  // green
  centers[4] = 0.50;  // aqua
  centers[5] = 0.61;  // blue
  centers[6] = 0.75;  // purple
  centers[7] = 0.88;  // magenta

  vec3 hsl = rgbToHsl(color);
  for (int i = 0; i < 8; i++) {
    float mask = hueMask(hsl.x, centers[i], 0.1);
    if (mask > 0.001) {
      hsl.x = fract(hsl.x + u_hsl[i].x * mask * 0.1); // hue shift
      hsl.y = clamp(hsl.y + u_hsl[i].y * mask * 0.5, 0.0, 1.0); // sat
      hsl.z = clamp(hsl.z + u_hsl[i].z * mask * 0.5, 0.0, 1.0); // lum
    }
  }
  color = hslToRgb(hsl);

  // 7. Vibrance (intelligent saturation boost)
  {
    float maxC = max(color.r, max(color.g, color.b));
    float minC = min(color.r, min(color.g, color.b));
    float sat = maxC - minC;
    float vibranceAmount = u_vibrance * (1.0 - sat);
    float L2 = luma(color);
    color = mix(vec3(L2), color, 1.0 + vibranceAmount);
    color = max(color, 0.0);
  }

  // 8. Global saturation
  if (abs(u_saturation) > 0.001) {
    float L2 = luma(color);
    color = mix(vec3(L2), color, 1.0 + u_saturation);
    color = max(color, 0.0);
  }

  // 9. Tone curve (sampled from LUT texture)
  if (u_useCurve) {
    color.r = texture(u_curveLUT, vec2(color.r, 0.5)).r;
    color.g = texture(u_curveLUT, vec2(color.g, 0.5)).g;
    color.b = texture(u_curveLUT, vec2(color.b, 0.5)).b;
  }

  // 10. ACES filmic tone mapping (compress HDR to display range)
  color = aces(color);

  // 11. Linear to sRGB
  color = linearToSrgb(color);

  outColor = vec4(clamp(color, 0.0, 1.0), texel.a);
}
```

**Step 3: Create the renderer**

Create `src/lib/gl/renderer.js`:

```js
import vertSrc from './shader.vert?raw'
import fragSrc from './shader.frag?raw'

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true, // needed for export
    })
    if (!this.gl) throw new Error('WebGL2 not supported')
    this._init()
  }

  _init() {
    const gl = this.gl
    this.program = this._createProgram(vertSrc, fragSrc)

    // Fullscreen quad (two triangles covering clip space)
    const positions = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1])
    this.vao = gl.createVertexArray()
    gl.bindVertexArray(this.vao)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(this.program, 'a_position')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    // Placeholder 1x1 white texture
    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]))

    // Curve LUT texture (1D, 256 wide)
    this.curveLUT = gl.createTexture()
    this._updateCurveLUT([[0,0],[0.25,0.25],[0.75,0.75],[1,1]])

    // Uniform locations (cache them)
    this._uniforms = {}
    const uniformNames = [
      'u_texture', 'u_curveLUT', 'u_isFloat', 'u_useCurve',
      'u_exposure', 'u_contrast', 'u_highlights', 'u_shadows', 'u_whites', 'u_blacks',
      'u_temp', 'u_tint', 'u_vibrance', 'u_saturation', 'u_hsl',
    ]
    gl.useProgram(this.program)
    for (const name of uniformNames) {
      this._uniforms[name] = gl.getUniformLocation(this.program, name)
    }
  }

  _createShader(type, src) {
    const gl = this.gl
    const shader = gl.createShader(type)
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`Shader compile error: ${err}`)
    }
    return shader
  }

  _createProgram(vertSrc, fragSrc) {
    const gl = this.gl
    const vert = this._createShader(gl.VERTEX_SHADER, vertSrc)
    const frag = this._createShader(gl.FRAGMENT_SHADER, fragSrc)
    const prog = gl.createProgram()
    gl.attachShader(prog, vert)
    gl.attachShader(prog, frag)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`)
    }
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    return prog
  }

  // Load ImageBitmap (JPEG/PNG/WebP) into texture
  loadImage(imageBitmap) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this._isFloat = false
    this.render(this._lastState || {})
  }

  // Load raw Float32Array pixels (from LibRaw WASM)
  loadRawPixels(pixels, width, height) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, pixels)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this._isFloat = true
    this.render(this._lastState || {})
  }

  // Build 256-entry LUT from Bézier curve control points
  _updateCurveLUT(points) {
    const lut = new Uint8Array(256 * 4)
    for (let i = 0; i < 256; i++) {
      const t = i / 255
      const v = Math.round(this._evalCubicBezier(points, t) * 255)
      const clamped = Math.max(0, Math.min(255, v))
      lut[i * 4 + 0] = clamped
      lut[i * 4 + 1] = clamped
      lut[i * 4 + 2] = clamped
      lut[i * 4 + 3] = 255
    }
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.curveLUT)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  // Evaluate monotone cubic spline through 4 points
  _evalCubicBezier(pts, t) {
    // Catmull-Rom style evaluation through the control points
    const n = pts.length - 1
    const seg = Math.min(Math.floor(t * n), n - 1)
    const lt = (t * n) - seg
    const p0 = pts[Math.max(0, seg - 1)]
    const p1 = pts[seg]
    const p2 = pts[Math.min(n, seg + 1)]
    const p3 = pts[Math.min(n, seg + 2)]
    const t2 = lt * lt, t3 = lt * lt * lt
    return (
      (-t3 + 2*t2 - lt) * p0[1] * 0.5 +
      (3*t3 - 5*t2 + 2) * p1[1] * 0.5 +
      (-3*t3 + 4*t2 + lt) * p2[1] * 0.5 +
      (t3 - t2) * p3[1] * 0.5
    )
  }

  // Main render — accepts the editor store state
  render(state) {
    this._lastState = state
    const gl = this.gl
    const u = this._uniforms

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)

    // Bind textures
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(u['u_texture'], 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.curveLUT)
    gl.uniform1i(u['u_curveLUT'], 1)

    // Light
    const light = state.light || {}
    gl.uniform1f(u['u_exposure'],   light.exposure   ?? 0)
    gl.uniform1f(u['u_contrast'],   light.contrast   ?? 0)
    gl.uniform1f(u['u_highlights'], light.highlights ?? 0)
    gl.uniform1f(u['u_shadows'],    light.shadows    ?? 0)
    gl.uniform1f(u['u_whites'],     light.whites     ?? 0)
    gl.uniform1f(u['u_blacks'],     light.blacks     ?? 0)

    // Color
    const color = state.color || {}
    gl.uniform1f(u['u_temp'],       color.temp       ?? 0)
    gl.uniform1f(u['u_tint'],       color.tint       ?? 0)
    gl.uniform1f(u['u_vibrance'],   color.vibrance   ?? 0)
    gl.uniform1f(u['u_saturation'], color.saturation ?? 0)

    // HSL
    const hslKeys = ['red','orange','yellow','green','aqua','blue','purple','magenta']
    const hslData = new Float32Array(hslKeys.flatMap(k => {
      const v = color.hsl?.[k] || { h: 0, s: 0, l: 0 }
      return [v.h, v.s, v.l]
    }))
    gl.uniform3fv(u['u_hsl'], hslData)

    // Curve
    const curve = state.curve || {}
    if (curve.points) {
      this._updateCurveLUT(curve.points)
    }
    const isIdentityCurve = !curve.points ||
      JSON.stringify(curve.points) === JSON.stringify([[0,0],[0.25,0.25],[0.75,0.75],[1,1]])
    gl.uniform1i(u['u_useCurve'], isIdentityCurve ? 0 : 1)
    gl.uniform1i(u['u_isFloat'], this._isFloat ? 1 : 0)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.bindVertexArray(null)
  }

  // Export: render to offscreen canvas at full resolution and return blob
  async exportImage(state, format = 'image/jpeg', quality = 0.95) {
    this.render(state)
    return new Promise(resolve => this.canvas.toBlob(resolve, format, quality))
  }

  resize(width, height) {
    this.canvas.width = width
    this.canvas.height = height
  }
}
```

**Step 4: Verify imports work**

In `src/pages/index.astro`, add a test script section:

```astro
<script>
  // Quick smoke test — will remove later
  import { Renderer } from '../lib/gl/renderer.js'
  console.log('Renderer imported OK', Renderer)
</script>
```

Run dev server. Open browser console — should see "Renderer imported OK" with no errors.

**Step 5: Remove the test script, commit**

```bash
git add src/lib/gl/
git commit -m "feat: WebGL2 renderer + full GLSL edit pipeline shaders"
```

---

## Task 4: Standard Image Loading

**Files:**
- Create: `src/lib/imageLoader.js`

**Step 1: Create image loader**

Create `src/lib/imageLoader.js`:

```js
export async function loadStandardImage(file) {
  const bitmap = await createImageBitmap(file)
  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    isRaw: false,
  }
}

export function isRawFile(file) {
  const rawExts = [
    'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2',
    'dng', 'orf', 'rw2', 'pef', 'raf', 'raw', 'rwl',
  ]
  const ext = file.name.split('.').pop().toLowerCase()
  return rawExts.includes(ext)
}

export function isStandardImage(file) {
  return file.type.startsWith('image/') && !isRawFile(file)
}
```

**Step 2: Commit**

```bash
git add src/lib/imageLoader.js
git commit -m "feat: standard image loader (JPEG/PNG/WebP)"
```

---

## Task 5: LibRaw WASM Decoder (RAW Files)

**Files:**
- Create: `src/lib/raw/decoder.js`
- Create: `src/lib/raw/rawWorker.js`
- Create: `public/libraw.wasm` (downloaded)

**Step 1: Fetch pre-built libraw WASM**

LibRaw WASM is available via the `libraw-wasm` npm package:

```bash
npm install libraw-wasm
```

If the npm package is unavailable or broken, download a pre-built binary from the community:

```bash
# Check if npm package exists and works
node -e "require('libraw-wasm')" 2>&1
```

Copy the WASM binary to public/:
```bash
cp node_modules/libraw-wasm/dist/libraw.wasm public/
cp node_modules/libraw-wasm/dist/libraw.js public/
```

**IMPORTANT:** If `libraw-wasm` is not available on npm, use this fallback approach:
- Use `dcraw.wasm` from https://github.com/scuri/dcraw-wasm (check for latest release)
- Or build LibRaw from source with Emscripten (advanced — skip for v1)
- As a pragmatic fallback: for unrecognized RAW files, show an error message and ask the user to convert to DNG first using Adobe DNG Converter (free tool)

**Step 2: Create the Web Worker**

Create `src/lib/raw/rawWorker.js`:

```js
// This file runs in a Web Worker
// It decodes RAW files using LibRaw WASM and returns Float32Array pixels

let libraw = null

async function initLibRaw() {
  if (libraw) return libraw
  // Load LibRaw WASM module
  importScripts('/libraw.js')
  libraw = await LibRaw()
  return libraw
}

self.onmessage = async (e) => {
  const { id, buffer, filename } = e.data
  try {
    const lr = await initLibRaw()

    // Allocate memory in WASM heap
    const ptr = lr._malloc(buffer.byteLength)
    lr.HEAPU8.set(new Uint8Array(buffer), ptr)

    // Open the RAW file from memory
    const result = lr.ccall('libraw_open_buffer', 'number', ['number', 'number'], [ptr, buffer.byteLength])
    if (result !== 0) throw new Error(`LibRaw open error: ${result}`)

    // Unpack RAW data
    lr.ccall('libraw_unpack', 'number', [], [])

    // Process to sRGB
    lr.ccall('libraw_dcraw_process', 'number', [], [])

    // Get processed image
    const imgPtr = lr.ccall('libraw_dcraw_make_mem_image', 'number', ['number'], [0])

    // Read dimensions and pixel data from the libraw_processed_image_t struct
    const width  = lr.getValue(imgPtr + 4,  'i32')
    const height = lr.getValue(imgPtr + 8,  'i32')
    const colors = lr.getValue(imgPtr + 12, 'i16')
    const bits   = lr.getValue(imgPtr + 14, 'i16')
    const dataSize = lr.getValue(imgPtr + 16, 'i32')
    const dataPtr  = imgPtr + 20

    // Convert to Float32 RGBA
    const pixels = new Float32Array(width * height * 4)
    if (bits === 8) {
      for (let i = 0; i < width * height; i++) {
        pixels[i * 4 + 0] = lr.HEAPU8[dataPtr + i * 3 + 0] / 255
        pixels[i * 4 + 1] = lr.HEAPU8[dataPtr + i * 3 + 1] / 255
        pixels[i * 4 + 2] = lr.HEAPU8[dataPtr + i * 3 + 2] / 255
        pixels[i * 4 + 3] = 1.0
      }
    } else { // 16-bit
      const data16 = new Uint16Array(lr.HEAPU8.buffer, dataPtr, width * height * 3)
      for (let i = 0; i < width * height; i++) {
        pixels[i * 4 + 0] = data16[i * 3 + 0] / 65535
        pixels[i * 4 + 1] = data16[i * 3 + 1] / 65535
        pixels[i * 4 + 2] = data16[i * 3 + 2] / 65535
        pixels[i * 4 + 3] = 1.0
      }
    }

    // Cleanup
    lr._free(ptr)
    lr.ccall('libraw_dcraw_clear_mem', 'void', ['number'], [imgPtr])
    lr.ccall('libraw_close', 'void', [], [])

    self.postMessage({ id, pixels, width, height }, [pixels.buffer])
  } catch (err) {
    self.postMessage({ id, error: err.message })
  }
}
```

**Step 3: Create the decoder wrapper**

Create `src/lib/raw/decoder.js`:

```js
let worker = null
let pendingCallbacks = new Map()
let nextId = 0

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./rawWorker.js', import.meta.url), { type: 'classic' })
    worker.onmessage = (e) => {
      const { id, pixels, width, height, error } = e.data
      const cb = pendingCallbacks.get(id)
      if (cb) {
        pendingCallbacks.delete(id)
        if (error) cb.reject(new Error(error))
        else cb.resolve({ pixels, width, height })
      }
    }
  }
  return worker
}

export async function decodeRaw(file) {
  const buffer = await file.arrayBuffer()
  const id = nextId++
  const w = getWorker()
  return new Promise((resolve, reject) => {
    pendingCallbacks.set(id, { resolve, reject })
    w.postMessage({ id, buffer, filename: file.name }, [buffer])
  })
}
```

**Step 4: Commit**

```bash
git add src/lib/raw/ public/libraw.js public/libraw.wasm
git commit -m "feat: LibRaw WASM decoder in Web Worker for RAW file support"
```

---

## Task 6: Dropzone Component

**Files:**
- Create: `src/components/Dropzone.astro`

**Step 1: Create Dropzone component**

Create `src/components/Dropzone.astro`:

```astro
---
---
<div
  id="dropzone"
  class="absolute inset-0 flex flex-col items-center justify-center z-10 transition-opacity duration-300"
  x-data="dropzone()"
  x-show="!$store.editor.hasImage"
  @dragover.prevent="dragging = true"
  @dragleave="dragging = false"
  @drop.prevent="handleDrop($event)"
>
  <!-- Background -->
  <div class="absolute inset-0 bg-black"></div>

  <!-- Drop area -->
  <div
    class="relative z-10 flex flex-col items-center gap-6 p-12 border border-white/10 rounded-2xl transition-all duration-200"
    :class="dragging ? 'border-white/40 bg-white/5' : 'bg-white/[0.02]'"
  >
    <!-- Icon -->
    <div class="text-white/30 text-6xl font-mono select-none">+</div>

    <!-- Text -->
    <div class="text-center">
      <p class="text-white font-mono text-sm uppercase tracking-widest">OPEN IMAGE</p>
      <p class="text-white/40 font-mono text-xs mt-2 uppercase tracking-wider">
        JPEG · PNG · WEBP · RAW
      </p>
    </div>

    <!-- File input button -->
    <button
      class="px-6 py-3 bg-white text-black font-mono text-xs uppercase tracking-widest rounded-full hover:bg-white/90 transition-colors"
      @click="$refs.fileInput.click()"
    >
      BROWSE FILES
    </button>

    <!-- Hidden file input -->
    <input
      x-ref="fileInput"
      type="file"
      class="hidden"
      accept="image/*,.cr2,.cr3,.nef,.nrw,.arw,.dng,.orf,.rw2,.pef,.raf,.raw,.rwl"
      @change="handleFileInput($event)"
    />
  </div>

  <!-- Drag overlay hint -->
  <p
    class="absolute bottom-8 text-white/20 font-mono text-xs uppercase tracking-widest"
    x-show="!dragging"
  >
    OR DRAG & DROP
  </p>
</div>

<script>
import Alpine from 'alpinejs'
import { loadStandardImage, isRawFile } from '../lib/imageLoader.js'
import { decodeRaw } from '../lib/raw/decoder.js'

Alpine.data('dropzone', () => ({
  dragging: false,

  async handleDrop(event) {
    this.dragging = false
    const file = event.dataTransfer.files[0]
    if (file) await this.loadFile(file)
  },

  async handleFileInput(event) {
    const file = event.target.files[0]
    if (file) await this.loadFile(file)
  },

  async loadFile(file) {
    const store = Alpine.store('editor')
    store.filename = file.name

    try {
      if (isRawFile(file)) {
        // RAW: decode via LibRaw WASM in Web Worker
        const { pixels, width, height } = await decodeRaw(file)
        store.rawPixels = pixels
        store.width = width
        store.height = height
        store.isRaw = true
        store.hasImage = true
        store.pushHistory()
        window.dispatchEvent(new CustomEvent('editor:loadRaw', { detail: { pixels, width, height } }))
      } else {
        // Standard image: use createImageBitmap
        const { bitmap, width, height } = await loadStandardImage(file)
        store.imageData = bitmap
        store.width = width
        store.height = height
        store.isRaw = false
        store.hasImage = true
        store.pushHistory()
        window.dispatchEvent(new CustomEvent('editor:loadImage', { detail: { bitmap } }))
      }
    } catch (err) {
      console.error('Failed to load image:', err)
      alert(`Failed to load image: ${err.message}`)
    }
  },
}))
</script>
```

**Step 2: Commit**

```bash
git add src/components/Dropzone.astro
git commit -m "feat: Dropzone component with drag-and-drop and file picker"
```

---

## Task 7: Canvas Component (WebGL + Touch Gestures)

**Files:**
- Create: `src/components/Canvas.astro`
- Create: `src/lib/gestures.js`

**Step 1: Create touch gesture handler**

Create `src/lib/gestures.js`:

```js
// Touch gesture handler: pinch-zoom, two-finger pan, double-tap to fit
export function setupGestures(element, callbacks) {
  let lastTapTime = 0
  let lastDist = 0
  let lastMidX = 0, lastMidY = 0

  function getTouchDist(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
  }
  function getMid(t1, t2) {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }
  }

  element.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      // Detect double tap
      const now = Date.now()
      if (now - lastTapTime < 300) callbacks.doubleTap?.()
      lastTapTime = now
    } else if (e.touches.length === 2) {
      const mid = getMid(e.touches[0], e.touches[1])
      lastDist = getTouchDist(e.touches[0], e.touches[1])
      lastMidX = mid.x
      lastMidY = mid.y
    }
  }, { passive: true })

  element.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const mid = getMid(e.touches[0], e.touches[1])
      const dist = getTouchDist(e.touches[0], e.touches[1])
      const scale = dist / lastDist
      const dx = mid.x - lastMidX
      const dy = mid.y - lastMidY
      callbacks.pinchZoom?.({ scale, dx, dy, cx: mid.x, cy: mid.y })
      lastDist = dist
      lastMidX = mid.x
      lastMidY = mid.y
    }
  }, { passive: false })

  // Mouse wheel zoom (desktop)
  element.addEventListener('wheel', (e) => {
    e.preventDefault()
    const scale = e.deltaY < 0 ? 1.1 : 0.9
    callbacks.pinchZoom?.({ scale, dx: 0, dy: 0, cx: e.clientX, cy: e.clientY })
  }, { passive: false })
}
```

**Step 2: Create Canvas component**

Create `src/components/Canvas.astro`:

```astro
---
---
<div
  id="canvas-container"
  class="absolute inset-0 overflow-hidden bg-[#0a0a0a]"
  x-data="canvasView()"
  x-show="$store.editor.hasImage"
  x-cloak
>
  <canvas
    id="gl-canvas"
    x-ref="canvas"
    class="absolute origin-top-left cursor-grab active:cursor-grabbing"
    :style="`width:${naturalW}px;height:${naturalH}px;transform:translate(${panX}px,${panY}px) scale(${zoom})`"
  ></canvas>
</div>

<script>
import Alpine from 'alpinejs'
import { Renderer } from '../lib/gl/renderer.js'
import { setupGestures } from '../lib/gestures.js'

Alpine.data('canvasView', () => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  naturalW: 0,
  naturalH: 0,
  renderer: null,

  init() {
    const canvas = this.$refs.canvas
    this.renderer = new Renderer(canvas)

    // Wire store events → renderer
    window.addEventListener('editor:loadImage', (e) => {
      const { bitmap } = e.detail
      this.naturalW = bitmap.width
      this.naturalH = bitmap.height
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      this.renderer.loadImage(bitmap)
      this.fitToScreen()
    })

    window.addEventListener('editor:loadRaw', (e) => {
      const { pixels, width, height } = e.detail
      this.naturalW = width
      this.naturalH = height
      canvas.width = width
      canvas.height = height
      this.renderer.loadRawPixels(pixels, width, height)
      this.fitToScreen()
    })

    window.addEventListener('editor:render', () => {
      this.renderer.render(Alpine.store('editor'))
    })

    // Watch ALL store edit changes — re-render on any change
    this.$watch('$store.editor.light', () => this.renderer.render(Alpine.store('editor')), { deep: true })
    this.$watch('$store.editor.color', () => this.renderer.render(Alpine.store('editor')), { deep: true })
    this.$watch('$store.editor.curve', () => this.renderer.render(Alpine.store('editor')), { deep: true })
    this.$watch('$store.editor.detail', () => this.renderer.render(Alpine.store('editor')), { deep: true })

    // Touch gestures
    const container = this.$el
    setupGestures(container, {
      doubleTap: () => this.fitToScreen(),
      pinchZoom: ({ scale, dx, dy }) => {
        this.zoom = Math.max(0.1, Math.min(20, this.zoom * scale))
        this.panX += dx
        this.panY += dy
      },
    })
  },

  fitToScreen() {
    const container = this.$el
    const cw = container.clientWidth
    const ch = container.clientHeight
    const scaleX = cw / this.naturalW
    const scaleY = ch / this.naturalH
    this.zoom = Math.min(scaleX, scaleY) * 0.95
    this.panX = (cw - this.naturalW * this.zoom) / 2
    this.panY = (ch - this.naturalH * this.zoom) / 2
  },
}))
</script>
```

**Step 3: Commit**

```bash
git add src/components/Canvas.astro src/lib/gestures.js
git commit -m "feat: Canvas component with WebGL rendering and touch gestures"
```

---

## Task 8: Toolbar Component

**Files:**
- Create: `src/components/Toolbar.astro`

**Step 1: Create Toolbar**

Create `src/components/Toolbar.astro`:

```astro
---
---
<div
  class="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl"
  x-data="toolbar()"
  x-show="$store.editor.hasImage"
  x-cloak
>
  <!-- Filename -->
  <span
    class="font-mono text-xs text-white/60 uppercase tracking-wider max-w-[120px] truncate"
    x-text="$store.editor.filename.split('.')[0].toUpperCase()"
  ></span>

  <div class="w-px h-4 bg-white/10"></div>

  <!-- Undo -->
  <button
    class="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white transition-colors font-mono text-sm"
    @click="$store.editor.undo()"
    title="Undo (⌘Z)"
  >↩</button>

  <!-- Redo -->
  <button
    class="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white transition-colors font-mono text-sm"
    @click="$store.editor.redo()"
    title="Redo (⌘⇧Z)"
  >↪</button>

  <div class="w-px h-4 bg-white/10"></div>

  <!-- Reset -->
  <button
    class="font-mono text-xs text-white/40 hover:text-white/70 uppercase tracking-wider transition-colors"
    @click="$store.editor.resetEdits()"
    title="Reset all edits"
  >RESET</button>

  <div class="w-px h-4 bg-white/10"></div>

  <!-- Export -->
  <button
    class="px-4 py-1.5 bg-white text-black font-mono text-xs uppercase tracking-widest rounded-full hover:bg-white/90 transition-colors"
    @click="$store.editor.exportOpen = true"
    x-ref="exportBtn"
  >EXPORT</button>
</div>

<!-- Export dialog -->
<div
  class="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
  x-show="$store.editor.exportOpen"
  x-cloak
  @click.self="$store.editor.exportOpen = false"
>
  <div
    class="flex flex-col gap-4 p-6 rounded-2xl border border-white/10 bg-black/90 backdrop-blur-xl min-w-[260px]"
    x-data="{ format: 'image/jpeg', quality: 0.95 }"
  >
    <p class="font-mono text-xs uppercase tracking-widest text-white/60">EXPORT IMAGE</p>

    <!-- Format -->
    <div class="flex flex-col gap-2">
      <label class="font-mono text-xs text-white/40 uppercase tracking-wider">FORMAT</label>
      <div class="flex gap-2">
        <template x-for="f in [{label:'JPEG',val:'image/jpeg'},{label:'PNG',val:'image/png'},{label:'WEBP',val:'image/webp'}]">
          <button
            class="flex-1 py-2 font-mono text-xs uppercase tracking-wider border rounded-lg transition-all"
            :class="format === f.val ? 'border-white bg-white text-black' : 'border-white/10 text-white/50 hover:border-white/30'"
            @click="format = f.val"
            x-text="f.label"
          ></button>
        </template>
      </div>
    </div>

    <!-- Quality (JPEG/WebP only) -->
    <div class="flex flex-col gap-2" x-show="format !== 'image/png'">
      <div class="flex justify-between">
        <label class="font-mono text-xs text-white/40 uppercase tracking-wider">QUALITY</label>
        <span class="font-mono text-xs text-white" x-text="Math.round(quality * 100) + '%'"></span>
      </div>
      <input type="range" min="0.5" max="1" step="0.01" x-model.number="quality"
        class="w-full accent-white" />
    </div>

    <!-- Buttons -->
    <div class="flex gap-3 mt-2">
      <button
        class="flex-1 py-2.5 font-mono text-xs uppercase tracking-wider border border-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
        @click="$store.editor.exportOpen = false"
      >CANCEL</button>
      <button
        class="flex-1 py-2.5 font-mono text-xs uppercase tracking-widest bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
        @click="doExport(format, quality)"
      >DOWNLOAD</button>
    </div>
  </div>
</div>

<script>
import Alpine from 'alpinejs'

Alpine.data('toolbar', () => ({
  async doExport(format, quality) {
    // Grab the renderer from the canvas component
    const canvas = document.getElementById('gl-canvas')
    if (!canvas) return
    const store = Alpine.store('editor')
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ext = format.split('/')[1]
      a.href = url
      a.download = store.filename.replace(/\.[^.]+$/, '') + '_edited.' + ext
      a.click()
      URL.revokeObjectURL(url)
      store.exportOpen = false
    }, format, quality)
  },
}))
</script>
```

**Step 2: Commit**

```bash
git add src/components/Toolbar.astro
git commit -m "feat: Toolbar component with undo/redo/reset/export"
```

---

## Task 9: Slider Component

**Files:**
- Create: `src/components/Slider.astro`

**Step 1: Create reusable Slider**

Create `src/components/Slider.astro`:

```astro
---
interface Props {
  label: string
  storeKey: string      // e.g. "$store.editor.light.exposure"
  min?: number
  max?: number
  step?: number
  decimals?: number
}
const { label, storeKey, min = -1, max = 1, step = 0.01, decimals = 2 } = Astro.props
---
<div class="flex flex-col gap-1.5 py-2 border-b border-white/5 last:border-0">
  <div class="flex justify-between items-baseline">
    <span class="font-mono text-[10px] uppercase tracking-widest text-white/40">{label}</span>
    <span
      class="font-mono text-[11px] text-white tabular-nums"
      x-text={`(${storeKey} >= 0 ? '+' : '') + Number(${storeKey}).toFixed(${decimals})`}
    ></span>
  </div>
  <div class="relative h-11 flex items-center">
    <!-- Track background -->
    <div class="absolute inset-x-0 h-px bg-white/10"></div>
    <!-- Filled portion (from center for bipolar, from left for unipolar) -->
    <div
      class="absolute h-px bg-white/60"
      :style="{
        left: `${Math.min(50, 50 + (${storeKey} / (${max} - ${min})) * 100)}%`,
        right: `${100 - Math.max(50, 50 + (${storeKey} / (${max} - ${min})) * 100)}%`,
      }"
    ></div>
    <!-- Range input (transparent, over track) -->
    <input
      type="range"
      class="absolute inset-0 w-full opacity-0 cursor-pointer h-11"
      :min="${min}"
      :max="${max}"
      :step="${step}"
      x-model.number={storeKey}
      @change={`$store.editor.pushHistory()`}
    />
    <!-- Custom thumb -->
    <div
      class="absolute w-2.5 h-2.5 bg-white rounded-sm pointer-events-none -translate-x-1/2"
      :style="`left:${50 + (${storeKey} / (${max} - ${min})) * 100}%`"
    ></div>
  </div>
</div>
```

**Step 2: Commit**

```bash
git add src/components/Slider.astro
git commit -m "feat: hardware-feel Slider component with custom thumb"
```

---

## Task 10: Panel System + Bottom Sheet

**Files:**
- Create: `src/components/Panel.astro`
- Create: `src/lib/bottomSheet.js`

**Step 1: Create bottom sheet gesture handler**

Create `src/lib/bottomSheet.js`:

```js
export function setupBottomSheet(el, { onExpand, onCollapse } = {}) {
  let startY = 0
  let currentH = 0
  let isDragging = false

  el.addEventListener('touchstart', (e) => {
    const handle = e.target.closest('[data-handle]')
    if (!handle) return
    startY = e.touches[0].clientY
    currentH = el.offsetHeight
    isDragging = true
  }, { passive: true })

  el.addEventListener('touchmove', (e) => {
    if (!isDragging) return
    const dy = startY - e.touches[0].clientY
    const newH = Math.max(200, Math.min(window.innerHeight * 0.75, currentH + dy))
    el.style.height = newH + 'px'
  }, { passive: true })

  el.addEventListener('touchend', (e) => {
    if (!isDragging) return
    isDragging = false
    const h = el.offsetHeight
    const threshold = window.innerHeight * 0.35
    if (h > threshold) {
      el.style.height = window.innerHeight * 0.6 + 'px'
      onExpand?.()
    } else {
      el.style.height = '220px'
      onCollapse?.()
    }
  }, { passive: true })
}
```

**Step 2: Create Panel component**

Create `src/components/Panel.astro`:

```astro
---
import Slider from './Slider.astro'
---
<!-- Mobile: floating bottom sheet. Desktop: right sidebar -->
<div
  id="edit-panel"
  class="
    fixed bottom-0 left-0 right-0 z-20
    md:absolute md:right-0 md:top-0 md:bottom-0 md:left-auto md:w-80
    flex flex-col
    border-t border-white/[0.08] md:border-t-0 md:border-l
    bg-black/80 backdrop-blur-xl
    transition-all duration-200 ease-out
  "
  style="height: 280px"
  x-data="panelData()"
  x-show="$store.editor.hasImage"
  x-cloak
>
  <!-- Drag handle (mobile only) -->
  <div class="flex justify-center pt-3 pb-1 md:hidden" data-handle>
    <div class="w-8 h-0.5 bg-white/20 rounded-full"></div>
  </div>

  <!-- Tab bar -->
  <div class="flex overflow-x-auto scrollbar-none border-b border-white/[0.06] px-1 flex-shrink-0">
    <template x-for="tab in tabs" :key="tab.id">
      <button
        class="flex-shrink-0 px-3 py-3 font-mono text-[10px] uppercase tracking-widest transition-all relative"
        :class="$store.editor.activePanel === tab.id
          ? 'text-white'
          : 'text-white/30 hover:text-white/60'"
        @click="$store.editor.activePanel = tab.id"
      >
        <span x-text="tab.label"></span>
        <!-- Active indicator -->
        <div
          class="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 bg-white transition-all duration-200"
          :class="$store.editor.activePanel === tab.id ? 'w-4' : 'w-0'"
        ></div>
      </button>
    </template>
  </div>

  <!-- Panel content (scrollable) -->
  <div class="flex-1 overflow-y-auto overscroll-contain px-4 py-2">

    <!-- LIGHT panel -->
    <div x-show="$store.editor.activePanel === 'light'" class="flex flex-col">
      <slot name="light" />
    </div>

    <!-- COLOR panel -->
    <div x-show="$store.editor.activePanel === 'color'" class="flex flex-col">
      <slot name="color" />
    </div>

    <!-- CURVE panel -->
    <div x-show="$store.editor.activePanel === 'curve'" class="flex flex-col">
      <slot name="curve" />
    </div>

    <!-- DETAIL panel -->
    <div x-show="$store.editor.activePanel === 'detail'" class="flex flex-col">
      <slot name="detail" />
    </div>

    <!-- CROP panel -->
    <div x-show="$store.editor.activePanel === 'crop'" class="flex flex-col">
      <slot name="crop" />
    </div>

    <!-- PRESETS panel -->
    <div x-show="$store.editor.activePanel === 'presets'" class="flex flex-col">
      <slot name="presets" />
    </div>

  </div>
</div>

<script>
import Alpine from 'alpinejs'
import { setupBottomSheet } from '../lib/bottomSheet.js'

Alpine.data('panelData', () => ({
  tabs: [
    { id: 'light',   label: 'LIGHT' },
    { id: 'color',   label: 'COLOR' },
    { id: 'curve',   label: 'CURVE' },
    { id: 'detail',  label: 'DETAIL' },
    { id: 'crop',    label: 'CROP' },
    { id: 'presets', label: 'PRESETS' },
  ],

  init() {
    const isMobile = window.innerWidth < 768
    if (isMobile) {
      setupBottomSheet(this.$el)
    }
  },
}))
</script>
```

**Step 3: Commit**

```bash
git add src/components/Panel.astro src/lib/bottomSheet.js
git commit -m "feat: Panel system with bottom sheet (mobile) and sidebar (desktop)"
```

---

## Task 11: Light Panel

**Files:**
- Create: `src/components/panels/LightPanel.astro`

**Step 1: Create Light Panel**

Create `src/components/panels/LightPanel.astro`:

```astro
---
import Slider from '../Slider.astro'
---
<Slider label="EXPOSURE"  storeKey="$store.editor.light.exposure"  min="-5" max="5" step="0.05" decimals="2" />
<Slider label="CONTRAST"  storeKey="$store.editor.light.contrast"  min="-1" max="1" step="0.01" decimals="2" />
<Slider label="HIGHLIGHTS" storeKey="$store.editor.light.highlights" min="-1" max="1" step="0.01" decimals="2" />
<Slider label="SHADOWS"   storeKey="$store.editor.light.shadows"   min="-1" max="1" step="0.01" decimals="2" />
<Slider label="WHITES"    storeKey="$store.editor.light.whites"    min="-1" max="1" step="0.01" decimals="2" />
<Slider label="BLACKS"    storeKey="$store.editor.light.blacks"    min="-1" max="1" step="0.01" decimals="2" />
```

**Step 2: Commit**

```bash
git add src/components/panels/LightPanel.astro
git commit -m "feat: Light panel (exposure/contrast/highlights/shadows/whites/blacks)"
```

---

## Task 12: Color Panel + HSL

**Files:**
- Create: `src/components/panels/ColorPanel.astro`

**Step 1: Create Color Panel**

Create `src/components/panels/ColorPanel.astro`:

```astro
---
import Slider from '../Slider.astro'
---
<!-- Global color -->
<Slider label="TEMP"       storeKey="$store.editor.color.temp"       min="-1" max="1" step="0.01" decimals="2" />
<Slider label="TINT"       storeKey="$store.editor.color.tint"       min="-1" max="1" step="0.01" decimals="2" />
<Slider label="VIBRANCE"   storeKey="$store.editor.color.vibrance"   min="-1" max="1" step="0.01" decimals="2" />
<Slider label="SATURATION" storeKey="$store.editor.color.saturation" min="-1" max="1" step="0.01" decimals="2" />

<!-- HSL per channel -->
<div class="mt-4 mb-2">
  <p class="font-mono text-[10px] uppercase tracking-widest text-white/30">HSL</p>
</div>

<template x-for="channel in ['red','orange','yellow','green','aqua','blue','purple','magenta']" :key="channel">
  <div
    x-data="{ open: false }"
    class="border-b border-white/5 last:border-0"
  >
    <button
      class="w-full flex justify-between items-center py-2.5 font-mono text-[10px] uppercase tracking-widest text-white/50 hover:text-white/80 transition-colors"
      @click="open = !open"
    >
      <span x-text="channel.toUpperCase()"></span>
      <span x-text="open ? '−' : '+'"></span>
    </button>
    <div x-show="open" x-collapse class="pl-2">
      <Slider
        label="HUE"
        :storeKey="`$store.editor.color.hsl[${channel}].h`"
        min="-1" max="1" step="0.01" decimals="2"
      />
      <Slider
        label="SAT"
        :storeKey="`$store.editor.color.hsl[${channel}].s`"
        min="-1" max="1" step="0.01" decimals="2"
      />
      <Slider
        label="LUM"
        :storeKey="`$store.editor.color.hsl[${channel}].l`"
        min="-1" max="1" step="0.01" decimals="2"
      />
    </div>
  </div>
</template>
```

**Step 2: Install Alpine.js collapse plugin**

```bash
npm install @alpinejs/collapse
```

Add to `src/entrypoint.ts`:
```ts
import Collapse from '@alpinejs/collapse'
Alpine.plugin(Collapse)
```

**Step 3: Commit**

```bash
git add src/components/panels/ColorPanel.astro
git commit -m "feat: Color panel with global color + per-channel HSL"
```

---

## Task 13: Tone Curve Editor

**Files:**
- Create: `src/components/panels/CurvePanel.astro`
- Create: `src/lib/bezier.js`

**Step 1: Create bezier utility**

Create `src/lib/bezier.js`:

```js
// Evaluate Catmull-Rom spline through sorted control points at x=t (0..1)
export function evalCurve(points, t) {
  const n = points.length - 1
  if (n < 1) return t
  const seg = Math.min(Math.floor(t * n), n - 1)
  const lt = t * n - seg
  const p0 = points[Math.max(0, seg - 1)]
  const p1 = points[seg]
  const p2 = points[Math.min(n, seg + 1)]
  const p3 = points[Math.min(n, seg + 2)]
  const t2 = lt * lt, t3 = lt * lt * lt
  return (
    (-t3 + 2*t2 - lt) * p0[1] * 0.5 +
    (3*t3 - 5*t2 + 2) * p1[1] * 0.5 +
    (-3*t3 + 4*t2 + lt) * p2[1] * 0.5 +
    (t3 - t2) * p3[1] * 0.5
  )
}

// Build SVG path string from curve points (for visual rendering)
export function buildCurvePath(points, width, height) {
  const pts = Array.from({ length: 101 }, (_, i) => {
    const t = i / 100
    const v = Math.max(0, Math.min(1, evalCurve(points, t)))
    return `${t * width},${(1 - v) * height}`
  })
  return 'M ' + pts.join(' L ')
}
```

**Step 2: Create Curve Panel**

Create `src/components/panels/CurvePanel.astro`:

```astro
---
---
<div x-data="curveEditor()" class="flex flex-col gap-3">
  <!-- Channel selector -->
  <div class="flex gap-1">
    <template x-for="ch in ['RGB','R','G','B']">
      <button
        class="flex-1 py-1.5 font-mono text-[10px] uppercase tracking-widest border rounded transition-all"
        :class="$store.editor.curve.channel === ch.toLowerCase()
          ? 'border-white bg-white text-black'
          : 'border-white/10 text-white/40 hover:text-white/70'"
        @click="$store.editor.curve.channel = ch.toLowerCase()"
        x-text="ch"
      ></button>
    </template>
  </div>

  <!-- Curve SVG editor -->
  <div class="relative bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden" style="aspect-ratio:1">
    <svg
      class="w-full h-full"
      viewBox="0 0 256 256"
      x-ref="svg"
      @mousedown="startDrag($event)"
      @touchstart.prevent="startDragTouch($event)"
    >
      <!-- Grid lines -->
      <line x1="64"  y1="0" x2="64"  y2="256" stroke="white" stroke-opacity="0.05" />
      <line x1="128" y1="0" x2="128" y2="256" stroke="white" stroke-opacity="0.05" />
      <line x1="192" y1="0" x2="192" y2="256" stroke="white" stroke-opacity="0.05" />
      <line x1="0" y1="64"  x2="256" y2="64"  stroke="white" stroke-opacity="0.05" />
      <line x1="0" y1="128" x2="256" y2="128" stroke="white" stroke-opacity="0.05" />
      <line x1="0" y1="192" x2="256" y2="192" stroke="white" stroke-opacity="0.05" />
      <!-- Diagonal reference -->
      <line x1="0" y1="256" x2="256" y2="0" stroke="white" stroke-opacity="0.08" />
      <!-- Curve line -->
      <path
        :d="curvePath"
        fill="none"
        stroke="white"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <!-- Control points -->
      <template x-for="(pt, i) in $store.editor.curve.points" :key="i">
        <circle
          :cx="pt[0] * 256"
          :cy="(1 - pt[1]) * 256"
          r="5"
          fill="black"
          stroke="white"
          stroke-width="1.5"
          class="cursor-grab"
          @mousedown.stop="activePoint = i"
          @touchstart.stop.prevent="activePoint = i"
        />
      </template>
    </svg>
  </div>

  <!-- Reset curve -->
  <button
    class="font-mono text-[10px] uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors py-1"
    @click="resetCurve()"
  >RESET CURVE</button>
</div>

<script>
import Alpine from 'alpinejs'
import { buildCurvePath } from '../../lib/bezier.js'

Alpine.data('curveEditor', () => ({
  activePoint: null,

  get curvePath() {
    const pts = this.$store.editor.curve.points
    return buildCurvePath(pts, 256, 256)
  },

  startDrag(e) {
    if (this.activePoint === null) this.addPoint(e)
    const onMove = (e) => this.movePoint(e.clientX, e.clientY)
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      this.activePoint = null
      this.$store.editor.pushHistory()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  },

  startDragTouch(e) {
    if (e.touches.length !== 1) return
    if (this.activePoint === null) this.addPointTouch(e)
    const onMove = (e) => this.movePoint(e.touches[0].clientX, e.touches[0].clientY)
    const onUp = () => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
      this.activePoint = null
      this.$store.editor.pushHistory()
    }
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onUp)
  },

  getSvgCoords(clientX, clientY) {
    const svg = this.$refs.svg
    const rect = svg.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
    return [x, y]
  },

  addPoint(e) {
    const [x, y] = this.getSvgCoords(e.clientX, e.clientY)
    this.$store.editor.curve.points.push([x, y])
    this.$store.editor.curve.points.sort((a, b) => a[0] - b[0])
    this.activePoint = this.$store.editor.curve.points.findIndex(p => Math.abs(p[0]-x) < 0.01)
  },

  addPointTouch(e) {
    const [x, y] = this.getSvgCoords(e.touches[0].clientX, e.touches[0].clientY)
    this.$store.editor.curve.points.push([x, y])
    this.$store.editor.curve.points.sort((a, b) => a[0] - b[0])
    this.activePoint = this.$store.editor.curve.points.findIndex(p => Math.abs(p[0]-x) < 0.01)
  },

  movePoint(clientX, clientY) {
    if (this.activePoint === null) return
    const [x, y] = this.getSvgCoords(clientX, clientY)
    const pts = this.$store.editor.curve.points
    // Keep endpoints locked to x=0 and x=1
    const newX = (this.activePoint === 0) ? 0
               : (this.activePoint === pts.length - 1) ? 1
               : x
    pts[this.activePoint] = [newX, y]
    pts.sort((a, b) => a[0] - b[0])
  },

  resetCurve() {
    this.$store.editor.curve.points = [[0,0],[0.25,0.25],[0.75,0.75],[1,1]]
    this.$store.editor.pushHistory()
    window.dispatchEvent(new CustomEvent('editor:render'))
  },
}))
</script>
```

**Step 3: Commit**

```bash
git add src/components/panels/CurvePanel.astro src/lib/bezier.js
git commit -m "feat: SVG tone curve editor with draggable control points"
```

---

## Task 14: Detail Panel

**Files:**
- Create: `src/components/panels/DetailPanel.astro`

**Step 1: Create Detail Panel**

Create `src/components/panels/DetailPanel.astro`:

```astro
---
import Slider from '../Slider.astro'
---
<div class="py-2">
  <p class="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-3">SHARPENING</p>
  <Slider label="AMOUNT"    storeKey="$store.editor.detail.sharpness"      min="0" max="1" step="0.01" decimals="2" />
</div>
<div class="py-2 mt-2">
  <p class="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-3">NOISE REDUCTION</p>
  <Slider label="LUMINANCE" storeKey="$store.editor.detail.noiseReduction" min="0" max="1" step="0.01" decimals="2" />
</div>

<p class="font-mono text-[9px] text-white/20 uppercase tracking-widest mt-4 leading-relaxed">
  SHARPENING AND NOISE REDUCTION APPLY AS A SECOND RENDER PASS.
</p>
```

**Step 2: Commit**

```bash
git add src/components/panels/DetailPanel.astro
git commit -m "feat: Detail panel (sharpness + noise reduction)"
```

---

## Task 15: Crop Tool

**Files:**
- Create: `src/components/panels/CropPanel.astro`
- Create: `src/components/CropOverlay.astro`

**Step 1: Create Crop Panel**

Create `src/components/panels/CropPanel.astro`:

```astro
---
---
<div x-data class="flex flex-col gap-4">
  <!-- Aspect ratio buttons -->
  <div>
    <p class="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-2">ASPECT RATIO</p>
    <div class="grid grid-cols-4 gap-1">
      <template x-for="r in ['FREE','1:1','4:3','16:9','3:2','9:16']" :key="r">
        <button
          class="py-2 font-mono text-[9px] uppercase tracking-widest border rounded transition-all"
          :class="$store.editor.crop.ratio === r.toLowerCase()
            ? 'border-white bg-white text-black'
            : 'border-white/10 text-white/40 hover:text-white/60'"
          @click="$store.editor.crop.ratio = r.toLowerCase()"
          x-text="r"
        ></button>
      </template>
    </div>
  </div>

  <!-- Straighten slider -->
  <div>
    <p class="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-1">STRAIGHTEN</p>
    <div class="flex items-center gap-3">
      <input
        type="range" min="-45" max="45" step="0.5"
        x-model.number="$store.editor.crop.angle"
        class="flex-1 accent-white"
        @change="$store.editor.pushHistory()"
      />
      <span class="font-mono text-xs text-white tabular-nums w-12 text-right"
        x-text="$store.editor.crop.angle.toFixed(1) + '°'"></span>
    </div>
  </div>

  <!-- Reset crop -->
  <button
    class="font-mono text-[10px] uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors py-2 border border-white/10 rounded-lg"
    @click="$store.editor.crop = { x:0, y:0, w:1, h:1, angle:0, ratio:'free' }; $store.editor.pushHistory()"
  >RESET CROP</button>
</div>
```

**Step 2: Commit**

```bash
git add src/components/panels/CropPanel.astro
git commit -m "feat: Crop panel with aspect ratio + straighten"
```

---

## Task 16: Presets Panel

**Files:**
- Create: `src/components/panels/PresetsPanel.astro`
- Create: `src/lib/presets.js`

**Step 1: Define presets**

Create `src/lib/presets.js`:

```js
export const PRESETS = [
  {
    id: 'vivid',
    name: 'VIVID',
    edits: {
      light: { exposure: 0.2, contrast: 0.3, highlights: -0.2, shadows: 0.1, whites: 0.1, blacks: -0.1 },
      color: { temp: 0.1, tint: 0, vibrance: 0.5, saturation: 0.2, hsl: {} },
    },
  },
  {
    id: 'matte',
    name: 'MATTE',
    edits: {
      light: { exposure: 0, contrast: -0.3, highlights: -0.3, shadows: 0.3, whites: -0.2, blacks: 0.2 },
      color: { temp: 0, tint: 0, vibrance: -0.1, saturation: -0.2, hsl: {} },
    },
  },
  {
    id: 'mono',
    name: 'MONO',
    edits: {
      light: { exposure: 0.1, contrast: 0.2, highlights: -0.1, shadows: 0.1, whites: 0, blacks: 0 },
      color: { temp: 0, tint: 0, vibrance: 0, saturation: -1, hsl: {} },
    },
  },
  {
    id: 'warm',
    name: 'WARM',
    edits: {
      light: { exposure: 0.1, contrast: 0.1, highlights: -0.1, shadows: 0.1, whites: 0, blacks: 0 },
      color: { temp: 0.4, tint: 0.1, vibrance: 0.2, saturation: 0.1, hsl: {} },
    },
  },
  {
    id: 'cool',
    name: 'COOL',
    edits: {
      light: { exposure: 0, contrast: 0.1, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
      color: { temp: -0.4, tint: -0.1, vibrance: 0.1, saturation: 0, hsl: {} },
    },
  },
  {
    id: 'faded',
    name: 'FADED',
    edits: {
      light: { exposure: 0.2, contrast: -0.4, highlights: -0.2, shadows: 0.3, whites: -0.1, blacks: 0.3 },
      color: { temp: 0.1, tint: 0, vibrance: -0.2, saturation: -0.3, hsl: {} },
    },
  },
]
```

**Step 2: Create Presets Panel**

Create `src/components/panels/PresetsPanel.astro`:

```astro
---
---
<div x-data="presetsData()" class="flex flex-col gap-3">
  <p class="font-mono text-[10px] uppercase tracking-widest text-white/30">PRESETS</p>
  <div class="grid grid-cols-3 gap-2">
    <template x-for="preset in presets" :key="preset.id">
      <button
        class="flex flex-col items-center gap-1.5 p-2 border border-white/10 rounded-xl hover:border-white/30 transition-all"
        @click="applyPreset(preset)"
      >
        <!-- Thumbnail placeholder (shows preset name as text) -->
        <div class="w-full aspect-square bg-white/[0.04] rounded-lg flex items-center justify-center">
          <span class="font-mono text-[8px] text-white/30 uppercase" x-text="preset.name[0]"></span>
        </div>
        <span class="font-mono text-[9px] uppercase tracking-widest text-white/50" x-text="preset.name"></span>
      </button>
    </template>
  </div>
</div>

<script>
import Alpine from 'alpinejs'
import { PRESETS } from '../../lib/presets.js'

Alpine.data('presetsData', () => ({
  presets: PRESETS,

  applyPreset(preset) {
    const store = Alpine.store('editor')
    Object.assign(store.light, { ...store.light, ...preset.edits.light })
    Object.assign(store.color, { ...store.color, ...preset.edits.color })
    store.pushHistory()
    window.dispatchEvent(new CustomEvent('editor:render'))
  },
}))
</script>
```

**Step 3: Commit**

```bash
git add src/components/panels/PresetsPanel.astro src/lib/presets.js
git commit -m "feat: Presets panel with 6 built-in looks"
```

---

## Task 17: IndexedDB Session Persistence

**Files:**
- Create: `src/lib/storage.js`

**Step 1: Create storage module**

Create `src/lib/storage.js`:

```js
import { get, set, del, keys } from 'idb-keyval'

const MAX_SESSIONS = 20

function serializeEdits(store) {
  return {
    light: { ...store.light },
    color: {
      temp: store.color.temp,
      tint: store.color.tint,
      vibrance: store.color.vibrance,
      saturation: store.color.saturation,
      hsl: JSON.parse(JSON.stringify(store.color.hsl)),
    },
    curve: { points: [...store.curve.points.map(p => [...p])], channel: store.curve.channel },
    detail: { ...store.detail },
    crop: { ...store.crop },
    filename: store.filename,
    savedAt: Date.now(),
  }
}

export async function saveSession(store, previewBlob) {
  const id = `session_${store.filename}_${Date.now()}`
  const data = {
    ...serializeEdits(store),
    preview: previewBlob ? await blobToBase64(previewBlob) : null,
  }
  await set(id, data)
  // Prune old sessions
  const allKeys = await keys()
  const sessionKeys = allKeys.filter(k => String(k).startsWith('session_')).sort()
  if (sessionKeys.length > MAX_SESSIONS) {
    for (const k of sessionKeys.slice(0, sessionKeys.length - MAX_SESSIONS)) {
      await del(k)
    }
  }
}

export async function loadSessions() {
  const allKeys = await keys()
  const sessionKeys = allKeys.filter(k => String(k).startsWith('session_'))
  const sessions = await Promise.all(sessionKeys.map(k => get(k).then(v => ({ id: k, ...v }))))
  return sessions.sort((a, b) => b.savedAt - a.savedAt)
}

function blobToBase64(blob) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}
```

**Step 2: Wire auto-save in Canvas component**

In `src/components/Canvas.astro`, inside `init()`, add after setting up the `editor:render` listener:

```js
import { saveSession } from '../lib/storage.js'

// Debounced auto-save
let saveTimer = null
window.addEventListener('editor:render', () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    if (!Alpine.store('editor').hasImage) return
    const canvas = this.$refs.canvas
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.4))
    await saveSession(Alpine.store('editor'), blob)
  }, 2000)
})
```

**Step 3: Commit**

```bash
git add src/lib/storage.js
git commit -m "feat: IndexedDB session persistence with auto-save"
```

---

## Task 18: Assemble index.astro

**Files:**
- Modify: `src/pages/index.astro`

**Step 1: Assemble the full page**

Replace `src/pages/index.astro`:

```astro
---
import '../styles/global.css'
import Dropzone from '../components/Dropzone.astro'
import Canvas from '../components/Canvas.astro'
import Toolbar from '../components/Toolbar.astro'
import Panel from '../components/Panel.astro'
import LightPanel from '../components/panels/LightPanel.astro'
import ColorPanel from '../components/panels/ColorPanel.astro'
import CurvePanel from '../components/panels/CurvePanel.astro'
import DetailPanel from '../components/panels/DetailPanel.astro'
import CropPanel from '../components/panels/CropPanel.astro'
import PresetsPanel from '../components/panels/PresetsPanel.astro'
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#000000" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>EDITOR</title>
  </head>
  <body
    class="w-screen h-screen overflow-hidden bg-black relative"
    x-data
    @keydown.meta.z.window="$store.editor.undo()"
    @keydown.ctrl.z.window="$store.editor.undo()"
    @keydown.meta.shift.z.window="$store.editor.redo()"
    @keydown.ctrl.y.window="$store.editor.redo()"
  >
    <!-- Dropzone (shown when no image loaded) -->
    <Dropzone />

    <!-- Canvas (shown when image loaded) -->
    <Canvas />

    <!-- Toolbar (shown when image loaded) -->
    <Toolbar />

    <!-- Edit panel -->
    <Panel>
      <LightPanel   slot="light"   />
      <ColorPanel   slot="color"   />
      <CurvePanel   slot="curve"   />
      <DetailPanel  slot="detail"  />
      <CropPanel    slot="crop"    />
      <PresetsPanel slot="presets" />
    </Panel>
  </body>
</html>
```

**Step 2: Verify full app works end-to-end**

```bash
npm run dev
```

Open http://localhost:4321, verify:
- [ ] Dropzone shows on load
- [ ] Drag a JPEG onto the page — dropzone hides, canvas shows with image
- [ ] Toolbar appears with filename
- [ ] Panel shows at bottom with LIGHT tab active
- [ ] Moving EXPOSURE slider updates the image in real-time
- [ ] Moving CONTRAST slider updates the image
- [ ] Switching to COLOR panel and moving SATURATION to -1 makes image monochrome
- [ ] CURVE panel shows the SVG editor, moving points updates the image
- [ ] Export button opens dialog, clicking DOWNLOAD saves the file
- [ ] Cmd+Z undoes the last slider change

**Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: assemble full editor page with all panels"
```

---

## Task 19: Polish — Sharpening / NR Second Pass

**Files:**
- Modify: `src/lib/gl/renderer.js`
- Create: `src/lib/gl/sharp.frag`

**Step 1: Create sharpening/NR fragment shader**

Create `src/lib/gl/sharp.frag`:

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;
uniform vec2 u_texelSize; // 1.0 / vec2(width, height)
uniform float u_sharpness;
uniform float u_noiseReduction;

void main() {
  vec2 uv = v_texCoord;
  vec4 center = texture(u_texture, uv);

  // 3×3 box blur (used for both sharpening and NR)
  vec4 blur = vec4(0.0);
  float weight = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 offset = vec2(float(x), float(y)) * u_texelSize;
      vec4 s = texture(u_texture, uv + offset);
      // For NR: bilateral weighting (down-weight samples far in color space)
      float colorDist = length(s.rgb - center.rgb);
      float w = exp(-colorDist * colorDist / (2.0 * 0.04)); // sigma=0.2
      blur += s * w;
      weight += w;
    }
  }
  blur /= weight;

  // Noise reduction: blend toward blur
  vec4 denoised = mix(center, blur, u_noiseReduction);

  // Sharpening: unsharp mask (denoised + amount * (denoised - blur))
  vec4 sharpened = denoised + u_sharpness * (denoised - blur) * 2.0;

  outColor = clamp(sharpened, 0.0, 1.0);
}
```

**Step 2: Add second pass to renderer**

In `src/lib/gl/renderer.js`, extend the `_init()` method to add a framebuffer and second program:

```js
// In _init(), after existing code:
import sharpFragSrc from './sharp.frag?raw'

// Create framebuffer for pass 1 output
this.fbo = gl.createFramebuffer()
this.fboTexture = gl.createTexture()
// ... (bind FBO texture and attach to framebuffer)

// Create second program for sharpening
this.sharpProgram = this._createProgram(vertSrc, sharpFragSrc)
this._sharpUniforms = {
  u_texture: gl.getUniformLocation(this.sharpProgram, 'u_texture'),
  u_texelSize: gl.getUniformLocation(this.sharpProgram, 'u_texelSize'),
  u_sharpness: gl.getUniformLocation(this.sharpProgram, 'u_sharpness'),
  u_noiseReduction: gl.getUniformLocation(this.sharpProgram, 'u_noiseReduction'),
}
```

Update `render()` to do two passes when sharpness/NR > 0:

```js
render(state) {
  const needsSecondPass = (state.detail?.sharpness ?? 0) > 0.01 ||
                          (state.detail?.noiseReduction ?? 0) > 0.01

  if (needsSecondPass) {
    // Pass 1: render edits to FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    this._renderPass1(state)
    // Pass 2: sharpening/NR from FBO to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this._renderPass2(state)
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this._renderPass1(state)
  }
}
```

**Step 3: Commit**

```bash
git add src/lib/gl/sharp.frag
git commit -m "feat: two-pass sharpening and noise reduction via bilateral filter"
```

---

## Task 20: Final Polish

**Step 1: Add `x-cloak` CSS to prevent flash of unstyled content**

In `src/styles/global.css`, add:

```css
[x-cloak] { display: none !important; }
```

**Step 2: Add scrollbar hiding utility**

In `src/styles/global.css`, add:

```css
.scrollbar-none {
  scrollbar-width: none;
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
```

**Step 3: Add loading state for RAW decoding**

In `src/components/Canvas.astro`, add a loading overlay:

```astro
<div
  class="absolute inset-0 flex items-center justify-center z-30 bg-black/60 backdrop-blur-sm"
  x-show="loading"
  x-cloak
>
  <p class="font-mono text-xs uppercase tracking-widest text-white/60 animate-pulse">DECODING RAW...</p>
</div>
```

**Step 4: Build and verify production build**

```bash
npm run build
npm run preview
```

Verify the production build loads, all features work, no console errors.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: final polish — loading states, scrollbar hiding, x-cloak"
```

---

## Testing Checklist

Before declaring complete, manually verify:

- [ ] **Drop JPEG**: Image loads, canvas shows, toolbar + panel appear
- [ ] **Drop PNG**: Same as above
- [ ] **Drop RAW (CR2/NEF/ARW)**: "DECODING RAW..." shown, then image appears
- [ ] **Exposure slider**: Dragging updates canvas in real-time (smooth, no lag)
- [ ] **Saturation = -1**: Image goes fully monochrome
- [ ] **White balance shift**: Colors shift warm/cool visibly
- [ ] **HSL**: Expand RED channel, shift hue — red tones shift in image
- [ ] **Tone curve**: Drag a point down in highlights — image darkens in highlights only
- [ ] **Presets**: Tap MONO — image goes monochrome. Tap VIVID — colors pop
- [ ] **Undo**: Move a slider, Cmd+Z — value reverts and image updates
- [ ] **Export JPEG**: Download opens, image matches preview
- [ ] **Reload page**: Recent session is listed (IndexedDB working)
- [ ] **Mobile (iPhone Safari)**: Dropzone works with tap, image shows, panel swipes up, sliders are usable
- [ ] **Pinch zoom**: Two-finger pinch zooms in/out smoothly
- [ ] **Double tap**: Canvas fits to screen

---

## Known Limitations (v1)

1. **RAW support** depends on LibRaw WASM availability — if `libraw-wasm` npm package is unavailable, prompt user to convert to DNG first.
2. **Sharpening 2nd pass** FBO setup must match canvas resolution — handle resize events.
3. **Tone curve** uses Catmull-Rom, not true Bézier — visual is close but mathematically different from Lightroom.
4. **HSL per-channel** in GLSL uses soft hue masks — color isolation is not as precise as Lightroom's (which uses real HSL color wheel analysis).
5. **No crop pixel rendering** — crop values are stored but the canvas rendering doesn't yet apply the crop (rotate transform via CSS as a quick workaround).
