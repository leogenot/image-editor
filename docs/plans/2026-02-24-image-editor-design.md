# Image Editor — Design Document
**Date**: 2026-02-24
**Status**: Approved

---

## Overview

A mobile-first, browser-based image editor with Lightroom-grade editing capabilities. Supports RAW files and standard image formats. Minimal, industrial UI inspired by Teenage Engineering's product aesthetic.

---

## Goals

- Edit RAW files (CR2, NEF, ARW, DNG, etc.) and standard formats (JPEG, PNG, WebP) in the browser
- Provide a complete non-destructive edit pipeline: exposure, color, curves, detail, crop, presets
- Mobile-first UX with touch-optimized controls; responsive desktop layout
- Real-time 60fps preview via WebGL GPU rendering
- Save sessions to IndexedDB; export final image as JPEG/PNG/WebP download
- Zero server dependency — fully client-side

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Astro (static, no SSR) + Vite |
| Reactivity | Alpine.js + `$store` |
| Styling | Tailwind CSS 4 |
| Rendering | WebGL2 (custom GLSL fragment shaders) |
| RAW decoding | LibRaw compiled to WebAssembly, runs in Web Worker |
| Session storage | IndexedDB via `idb-keyval` |

---

## Project Structure

```
image-editor/
├── src/
│   ├── pages/
│   │   └── index.astro          # Single page shell
│   ├── components/
│   │   ├── Dropzone.astro       # File open / drag-and-drop
│   │   ├── Canvas.astro         # WebGL canvas + overlay
│   │   ├── Toolbar.astro        # Top bar: open, undo, export
│   │   ├── Panel.astro          # Collapsible edit panel (bottom sheet on mobile)
│   │   ├── Slider.astro         # Reusable hardware-feel edit slider
│   │   └── ToneCurve.astro      # SVG tone curve editor
│   ├── lib/
│   │   ├── store.js             # Alpine.js $store (all edit state)
│   │   ├── gl/
│   │   │   ├── renderer.js      # WebGL context, program setup, render loop
│   │   │   ├── shader.vert      # Passthrough vertex shader
│   │   │   └── shader.frag      # Master fragment shader (all edits)
│   │   ├── raw/
│   │   │   └── decoder.js       # LibRaw WASM wrapper / Web Worker
│   │   └── storage.js           # IndexedDB session persistence
│   └── styles/
│       └── global.css           # Tailwind 4 entry
├── public/
│   └── libraw.wasm              # Pre-built LibRaw WASM binary
├── astro.config.mjs
├── tailwind.config.mjs
└── package.json
```

---

## UI/UX Design

### Layout — Mobile (primary)

```
┌─────────────────────────┐
│                         │
│  ┌───────────────────┐  │
│  │ ≡  filename  ↑↗   │  │  ← Frosted glass pill top bar
│  └───────────────────┘  │
│                         │
│      IMAGE CANVAS       │  ← Full bleed, no margins
│    (pinch-zoom, pan)    │
│                         │
│  ┌───────────────────┐  │
│  │ LIGHT COLOR CURVE │  │  ← Frosted tab strip (floating)
│  │────────────────── │  │
│  │  EXPOSURE  +0.30  │  │  ← Bottom sheet panel
│  │  ━━━━━━●━━━━━━━   │  │    (swipe up to expand)
│  │  CONTRAST  -10    │  │
│  └───────────────────┘  │
└─────────────────────────┘
```

### Layout — Desktop (responsive)

- Left sidebar: panel tab icons (vertical)
- Center: canvas with zoom/pan
- Right sidebar: active panel sliders (320px)

### Aesthetic — Industrial Monochrome (Teenage Engineering)

**Color palette** (no hues — black/white/gray only):
```
#000000   background
#0a0a0a   canvas area
#111111   glass panel base
#ffffff   primary text, active elements
#666666   secondary text, inactive tabs
#222222   panel borders
#ffffff08 glass fill (5% white tint)
```

**Typography**: `Space Mono` — monospaced, industrial. All labels uppercase, tight tracking.

**Glass panels**: `backdrop-filter: blur(16px)` + `rgba(255,255,255,0.04)` fill + `1px rgba(255,255,255,0.1)` border.

**Sliders**: Thin single-line track. Square or small-circle white thumb. Filled portion `rgba(255,255,255,0.8)`. Value displayed monospaced to the right: `EXPOSURE    +0.30`.

**Buttons**: Export = white pill, black text `EXPORT`. Active tab = white pill. Inactive = ghost text.

### Edit Panels

| Panel | Controls |
|---|---|
| LIGHT | Exposure, Contrast, Highlights, Shadows, Whites, Blacks |
| COLOR | Temp, Tint, Vibrance, Saturation, HSL (H/S/L × 8 color ranges) |
| CURVE | Tone curve — 4 control points, RGB + per-channel (SVG editor) |
| DETAIL | Sharpness, Noise Reduction |
| CROP | Free/ratio crop, straighten rotation slider |
| PRESETS | Grid of preset thumbnail cards |

### Interactions

- Canvas: pinch-to-zoom, two-finger pan, double-tap to fit
- Bottom sheet: swipe up to expand, swipe down to collapse
- Sliders: 44px touch target (hardware-feel, thumb on track)
- Undo: Cmd/Ctrl+Z + shake gesture (mobile)

---

## Technical Pipeline

### Data Flow

```
File input
  → LibRaw WASM (Web Worker) decode
  → Float32Array linear RGB pixels
  → Upload to WebGL2 RGBA32F texture
  → Fragment shader applies all edits
  → Canvas displays result
  → IndexedDB saves session (edit state + JPEG preview)
  → Export: offscreen canvas → canvas.toBlob() → download
```

### Fragment Shader Edit Order (single-pass)

1. Linear → log tone mapping (perceptual space)
2. Exposure (EV stops: `pixel *= pow(2.0, exposure)`)
3. Contrast (S-curve around midpoint)
4. Highlights / Shadows / Whites / Blacks (zone-based luminance masking)
5. White balance (3×3 color temperature matrix)
6. HSL per-channel adjustments (8 color ranges, hue/sat/lum each)
7. Vibrance (weighted saturation boost, spares already-saturated pixels)
8. Saturation (global)
9. Tone curve (cubic Bézier, sampled as 256-entry 1D LUT uniform)
10. Log → display: ACES filmic tone mapping
11. Output sRGB (gamma 2.2)

*Sharpening and noise reduction run as a second framebuffer pass when enabled.*

### Alpine.js State Store Shape

```js
Alpine.store('editor', {
  // File
  file: null, imageData: null, isRaw: false,
  width: 0, height: 0,

  // Edits (all normalized: exposure in EV stops, others -1 to +1)
  light: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
  color: {
    temp: 0, tint: 0, vibrance: 0, saturation: 0,
    hsl: { red:{h:0,s:0,l:0}, orange:{...}, yellow:{...}, green:{...},
           aqua:{...}, blue:{...}, purple:{...}, magenta:{...} }
  },
  curve: { points: [[0,0],[0.25,0.25],[0.75,0.75],[1,1]], channel: 'rgb' },
  detail: { sharpness: 0, noiseReduction: 0 },
  crop: { x:0, y:0, w:1, h:1, angle: 0, ratio: 'free' },

  // UI
  activePanel: 'light', cropMode: false,

  // History
  history: [], historyIndex: -1,
  push() { /* snapshot current edits */ },
  undo() { /* pop history */ },
  redo() { /* step forward */ },
})
```

### Undo System

- Every slider `change` event (not `input`) snapshots full edit state into `history[]`
- Max 50 history states (circular buffer)
- Undo: pop state, call `renderer.render(state)`

### RAW Decoding

- LibRaw WASM runs in a dedicated `Web Worker`
- Main thread posts `{ buffer: ArrayBuffer }`, worker returns `{ pixels: Float32Array, width, height, metadata }`
- Supports: CR2, NEF, ARW, DNG, RW2, ORF, RAF, and all LibRaw-supported formats

### Session Persistence (IndexedDB)

- On meaningful change (debounced 2s): serialize edit state + downsampled JPEG preview → IndexedDB
- On app load: list recent sessions with previews
- Max 20 sessions stored

### Export

- Render current edits to full-resolution offscreen canvas
- `canvas.toBlob('image/jpeg', 0.95)` → download via `<a>` element
- User selects format (JPEG / PNG / WebP) and quality

---

## Non-Goals (v1)

- Server-side processing or cloud storage
- Masking / local adjustments (heal, clone, graduated filter)
- Video support
- Batch processing
- Collaborative editing

---

## Success Criteria

- Opens and edits a 24MP RAW file smoothly on a modern iPhone
- All sliders update the preview at ≥30fps
- Session survives a page reload (loaded from IndexedDB)
- Exported JPEG is pixel-accurate to the preview
- UI passes WCAG AA contrast on all text elements
