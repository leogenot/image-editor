# DarkRoom | Image Editor

A mobile-first, browser-based photo editor with Lightroom-grade editing capabilities. Fully client-side — no server, no uploads, no accounts. Your images never leave your device.

---

## Features

### Image Loading

- **Drag and drop** any image onto the canvas, or click to browse
- **Standard formats**: JPEG, PNG, WebP, GIF, AVIF, and any format supported by the browser's `createImageBitmap`
- **RAW camera files**: CR2, CR3, NEF, NRW, ARW, DNG, ORF, RW2, PEF, RAF, RWL, and more — decoded via a Web Worker (browser-native fallback, WASM-ready)
- **Session restore**: the last opened image and all edits are automatically restored on next visit via IndexedDB

---

### Editing Panels

All edits are applied in real-time via custom WebGL2 GLSL shaders at full image resolution.

#### Light

| Control | Range | Description |
|---|---|---|
| Exposure | −5 to +5 EV | Multiplicative gain in linear light (`pow(2, ev)`) |
| Contrast | −1 to +1 | Power-law contrast around 18% grey midpoint |
| Highlights | −1 to +1 | Luminosity-masked recovery of bright tones |
| Shadows | −1 to +1 | Luminosity-masked lift of dark tones |
| Whites | −1 to +1 | Fine control of the brightest specular range |
| Blacks | −1 to +1 | Fine control of the deepest shadow range |

#### Color

| Control | Range | Description |
|---|---|---|
| Temperature | −1 to +1 | Shifts R/B channels (cool → warm) |
| Tint | −1 to +1 | Shifts G channel (green → magenta) |
| Vibrance | −1 to +1 | Smart saturation boost — protects already-saturated colours |
| Saturation | −1 to +1 | Global HSL saturation adjustment |

**HSL Per-Colour Mixer** — independent Hue, Saturation, and Luminance control for 8 colour ranges:

Red · Orange · Yellow · Green · Aqua · Blue · Purple · Magenta

Each range uses a smooth hue mask (`smoothstep`) to blend adjustments without hard edges between adjacent colour zones.

#### Tone Curves

An interactive Catmull-Rom spline editor with per-channel control:

- **RGB** — master luminosity curve applied to all channels
- **R / G / B** — individual channel curves, composed on top of the RGB master
- **Histogram background** — live RGB waveform rendered behind the curve for reference
- **Ghost hints** — inactive channel curves shown at low opacity for context
- Click to add control points, double-click (or double-tap on mobile) to remove them
- The curve is baked into a 256-entry LUT texture before upload to the GPU

#### Detail

| Control | Range | Description |
|---|---|---|
| Sharpness | 0 to 1 | Unsharp mask (USM) in a second GPU pass |
| Noise Reduction | 0 to 1 | 3×3 bilateral blur preserving edges |
| Grain | 0 to 1 |
| Grain size | 0 to 1 |

Detail processing uses a dedicated second fragment shader pass via a framebuffer object (FBO). The second pass is skipped entirely when both values are zero.

#### Crop & Straighten

- **Aspect ratio presets**: Free, 1:1, 4:3, 16:9, 3:2, 9:16
- **Straighten**: ±45° rotation slider applied in the GPU vertex shader (UV rotation around image centre). Double-tap resets to 0°
- Crop region is applied correctly at export time by blitting the sub-rect to a 2D canvas
- **Framing options** : Put a frame around your image and choos it's color and thickness

#### Presets

9 built-in one-click presets that apply a complete set of light and colour adjustments:

| Preset | Character |
|---|---|
| VIVID | Punchy colours, lifted shadows |
| MATTE | Low contrast, desaturated, lifted blacks |
| MONO | Full desaturation |
| WARM | Raised temperature, subtle vibrance |
| COOL | Lowered temperature |
| FADED | Low contrast, very lifted blacks, desaturated |
| HAZE | Overexposed, hazy, warm |
| PUNCH | High contrast, saturated |
| DUSK | Dark, warm, low highlights |

---

### Rendering Pipeline

All edits run on the GPU via WebGL2. The pipeline for each rendered frame:

```
Image texture (sRGB uint8 or RGBA32F float for RAW)
  → sRGB → linear conversion
  → Exposure  (pow(2, ev) gain)
  → Contrast  (power-law around 0.18 midpoint)
  → Tonal range (Highlights / Shadows / Whites / Blacks via luma masks)
  → Colour Temperature & Tint
  → HSL Per-Colour adjustments (8 hue-masked zones)
  → Vibrance & Saturation
  → Tone Curves (composed RGB + per-channel LUT lookup)
  → ACES filmic tonemapper
  → linear → sRGB conversion
  → [Pass 2, if sharpness/NR > 0] Bilateral NR + Unsharp Mask
  → Canvas output
```

RAW files are loaded as `RGBA32F` float textures, bypassing the sRGB decode step for maximum dynamic range.

---

### Undo / Redo

- 50-step undo history stored as JSON snapshots of the full edit state using IndexedDB Api
- **Keyboard**: `Cmd/Ctrl+Z` to undo, `Cmd/Ctrl+Shift+Z` or `Ctrl+Y` to redo
- **Toolbar buttons**: Undo and Redo icons in the floating top bar
- History is committed on slider `@change` (release), not `@input` (drag), so live-preview drags don't flood the stack

---

### Session Persistence

- The last opened image is stored in IndexedDB (as a `Blob`) and restored automatically on next visit
- Edit state (all sliders, curves, crop, HSL) is auto-saved to IndexedDB with a 2-second debounce after every render
- Up to 20 sessions are retained; older sessions are pruned automatically
- All storage is entirely local — nothing is sent to any server

---

### Export

- **JPEG** with quality slider (50–100%, default 92%)
- **PNG** (lossless)
- Crop is correctly applied at export — the cropped sub-region is blitted to a temporary 2D canvas before encoding
- Output file is downloaded with the original filename + `_edited` suffix

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Astro](https://astro.build) (static output) |
| Reactivity | [Alpine.js](https://alpinejs.dev) + `$store` |
| Styling | [Tailwind CSS 4](https://tailwindcss.com) (`@import "tailwindcss"`) |
| GPU rendering | WebGL2 + custom GLSL shaders |
| RAW decoding | Web Worker (browser-native `createImageBitmap` + LibRaw WASM-ready) |
| Storage | [idb-keyval](https://github.com/jakearchibald/idb-keyval) (IndexedDB) |
| Font | Space Mono (`@fontsource/space-mono`) |
| Build | Vite |

---

## Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:4321)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

Requires Node.js 18+.

---

## Browser Requirements

- **WebGL2** is required (supported in all modern browsers)
- `OES_texture_float_linear` is used when available for smoother RAW rendering; falls back to nearest-neighbour filtering if absent
- `EXT_color_buffer_float` is enabled for float framebuffer support
- Designed and tested on Chrome, Safari (iOS + macOS)

---

## Project Structure

```
src/
├── pages/
│   └── index.astro           # Root page — assembles all components
├── components/
│   ├── Canvas.astro           # WebGL canvas + render loop
│   ├── Dropzone.astro         # Drag & drop / file picker UI
│   ├── Panel.astro            # Bottom sheet (mobile) / sidebar (desktop)
│   ├── Toolbar.astro          # Floating top bar (undo/redo/export/open)
│   ├── Slider.astro           # Reusable slider component
│   └── panels/
│       ├── LightPanel.astro
│       ├── ColorPanel.astro
│       ├── CurvePanel.astro
│       ├── DetailPanel.astro
│       ├── CropPanel.astro
│       └── PresetsPanel.astro
├── lib/
│   ├── store.ts               # Alpine $store — all editor state + undo/redo
│   ├── presets.ts             # Built-in preset definitions
│   ├── imageLoader.ts         # Standard image loading via createImageBitmap
│   ├── storage.ts             # IndexedDB session persistence
│   ├── histogram.ts           # RGB histogram computation
│   ├── bezier.ts              # Catmull-Rom curve path builder
│   ├── gestures.ts            # Touch gesture helpers
│   ├── bottomSheet.ts         # Mobile swipe-up sheet behaviour
│   ├── gl/
│   │   ├── renderer.ts        # WebGL2 Renderer class (two-pass pipeline)
│   │   ├── shader.vert        # Vertex shader (fullscreen quad)
│   │   ├── shader.frag        # Pass 1: full edit pipeline + ACES tonemapper
│   │   └── sharp.frag         # Pass 2: bilateral NR + unsharp mask
│   └── raw/
│       ├── decoder.ts         # RAW dispatch (browser-native or WASM)
│       └── rawWorker.ts       # Web Worker for RAW decoding
├── styles/
│   └── global.css             # Tailwind imports + base styles
├── types.ts                   # Shared TypeScript types
└── entrypoint.ts              # Alpine plugin registration + store init
```
