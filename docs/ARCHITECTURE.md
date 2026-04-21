# DarkRoom Image Editor — Architecture

> Comprehensive reference for future AI agents (or humans) opening this repo cold. Read this before making changes. It covers tech stack, file layout, state flow, WebGL pipeline, storage model, and non-obvious patterns.

---

## 1. Overview

DarkRoom is a **browser-based, static, GPU-accelerated image editor** with RAW support.

- **Runtime**: 100% client-side. No backend. Static hosting only.
- **Rendering**: Custom WebGL2 two-pass shader pipeline.
- **State**: Alpine.js store, reactive two-way bindings.
- **Persistence**: IndexedDB (via `idb-keyval`). Per-image projects, LRU-pruned at 30.
- **RAW decoding**: LibRaw WASM in a Web Worker, with OffscreenCanvas fallback.
- **UX**: Desktop sidebar + mobile bottom sheet, all Tailwind-styled.

---

## 2. Tech Stack

| Layer | Tool | Version | Role |
|---|---|---|---|
| Framework | Astro | 6.1.x | Static site + component composition |
| Reactive UI | Alpine.js | 3.15.x | State, bindings, events |
| Alpine plugin | `@alpinejs/collapse` | — | Panel collapse animation |
| Styling | Tailwind CSS | 4.x | Utility classes via `@tailwindcss/vite` |
| Language | TypeScript | strict | All logic |
| Package manager | pnpm | 10.33.x | Lockfile: `pnpm-lock.yaml` |
| Graphics | WebGL2 | — | Fragment/vertex shaders |
| RAW | `libraw-wasm` | 1.1.x | Camera RAW decode |
| Storage | `idb-keyval` | 6.2.x | IndexedDB key/value wrapper |
| Font | `@fontsource/space-mono` | 5.2.x | Monospace UI |

Node 22+ required (see prior commits: `node 22 for astro 6`).

---

## 3. Directory Tree

```
image-editor/
├── astro.config.mjs
├── package.json              # scripts: dev, build, preview, astro
├── pnpm-lock.yaml
├── tsconfig.json
├── public/
│   ├── favicon.svg
│   ├── favicon.ico
│   └── apple-touch-icon.png
├── src/
│   ├── entrypoint.ts         # Alpine bootstrap (Collapse plugin + store)
│   ├── types.ts              # ALL shared TypeScript types (EditState, EditorStore, etc.)
│   ├── pages/
│   │   └── index.astro       # Single page; composes every component
│   ├── components/
│   │   ├── ImageLibrary.astro  # Landing overlay: projects grid + drag/drop import
│   │   ├── Canvas.astro        # WebGL canvas, pan/zoom, crop overlay, minimap
│   │   ├── Toolbar.astro       # Top pill: undo/redo/reset/library/export
│   │   ├── Panel.astro         # Right sidebar / mobile bottom sheet; tab routing
│   │   ├── Slider.astro        # Reusable bipolar slider with reset
│   │   ├── Dropzone.astro
│   │   └── panels/
│   │       ├── LightPanel.astro
│   │       ├── ColorPanel.astro
│   │       ├── CurvePanel.astro
│   │       ├── DetailPanel.astro
│   │       ├── CropPanel.astro
│   │       ├── FramePanel.astro
│   │       ├── LensPanel.astro
│   │       └── PresetsPanel.astro
│   ├── lib/
│   │   ├── store.ts          # Alpine.store('editor') definition + history
│   │   ├── storage.ts        # IndexedDB project CRUD + LRU prune
│   │   ├── imageLoader.ts    # RAW detection + standard image load helpers
│   │   ├── presets.ts        # Built-in preset definitions (9 presets)
│   │   ├── bezier.ts         # PCHIP monotone cubic interpolation + SVG path
│   │   ├── histogram.ts      # Histogram from Bitmap or Float32 RAW
│   │   ├── gestures.ts       # Touch pinch/zoom, wheel, double-tap
│   │   ├── bottomSheet.ts    # Mobile swipe-to-resize panel
│   │   ├── gl/
│   │   │   ├── renderer.ts   # WebGL2 pipeline, uniforms, LUT baking, 2-pass
│   │   │   ├── shader.vert   # Fullscreen quad
│   │   │   ├── shader.frag   # Main pass: light/color/curve/crop/lens/frame
│   │   │   └── sharp.frag    # Pass 2: bilateral NR + unsharp mask
│   │   └── raw/
│   │       ├── decoder.ts    # Main-thread worker spawner, promise API
│   │       └── rawWorker.ts  # Worker: LibRaw WASM → Float32Array (linear)
│   └── styles/
│       └── global.css        # Tailwind imports, iOS safe areas, form resets
```

No `docs/` or tests directory exists (docs created by this file).

---

## 4. Build & Run

```bash
pnpm install
pnpm dev         # astro dev → http://localhost:4321 (Astro default)
pnpm build       # → dist/
pnpm preview     # preview dist/
```

Deployment: static (see `deploy` commit in history).

---

## 5. Type System (`src/types.ts`)

Central file. All shared types live here. Key types:

### Edit state (per-image adjustments)

```ts
LightSettings    { exposure, contrast, highlights, shadows, whites, blacks }
ColorSettings    { temp, tint, vibrance, saturation, hsl: Record<HslColor, {h,s,l}> }
CurveSettings    { channel: 'rgb'|'r'|'g'|'b', rgb: CurvePoint[], r[], g[], b[] }
DetailSettings   { sharpness, noiseReduction, grain, grainSize }
CropSettings     { x, y, w, h, angle, ratio }
FrameSettings    { thickness, color }           // color = hex string
LensSettings     { curvature, vignette, vignetteSize, fringe, edgeSoftness }
HistogramData    { r: number[256], g, b }

EditState = { light, color, curve, detail, crop, frame, lens }
CurvePoint = [number, number]                   // [x, y] in [0,1]
```

### Store

```ts
EditorStore extends EditState {
  // Image
  file, filename, imageData (ImageBitmap|null), rawPixels (Float32Array|null),
  isRaw, width, height, hasImage, histogram

  // UI
  activePanel: PanelName, cropMode, exportOpen, straightening,
  libraryOpen, restoring, currentProjectId

  // History
  _history: string[]            // JSON EditState snapshots, cap 50
  _historyIndex: number

  // Methods
  _snapshot(), pushHistory(), applyEditState(partial),
  undo(), redo(), resetEdits(), clearHistory()
}
```

### Persistence

```ts
ProjectMeta   { id, filename, isRaw, preview?, createdAt, updatedAt, editState? }
ProjectData   = ProjectMeta & { imageBlob: Blob }
SessionData   extends EditState { filename, savedAt, preview? }
```

---

## 6. State Management

Single global Alpine store: `Alpine.store('editor', …)` defined in `src/lib/store.ts`, registered in `src/entrypoint.ts`.

Access pattern everywhere: `$store.editor.*` (templates) / `Alpine.store('editor').*` (scripts).

### History

- JSON snapshot of `EditState` only (not image data → cheap).
- `pushHistory()`: truncate redo tail, append, cap at 50.
- `undo()` / `redo()`: move index pointer, call `_applySnapshot()`, fire `editor:render`.
- `clearHistory()` on new image load.

### Debounce / save

- `deferSave` = 2s debounced save to IndexedDB via `updateProject(currentProjectId, store, previewBlob)`.
- Guard: `store.restoring = true` disables `deferSave` during project load (see Canvas watch logic).

---

## 7. Custom Event Bus

All cross-component communication uses DOM `CustomEvent` on `window` or body:

| Event | Fired by | Listened by | Payload / purpose |
|---|---|---|---|
| `editor:loadImage` | ImageLibrary (standard image) | Canvas → `renderer.loadImage(bitmap)` | `{ bitmap }` |
| `editor:loadRaw` | ImageLibrary (RAW decode done) | Canvas → `renderer.loadRawPixels(...)` | `{ pixels, width, height }` |
| `editor:render` | store (undo/redo), slider `@change`, Canvas (crop/pan) | Canvas → `renderer.render(state)` | — |
| `canvas:zoomIn` / `canvas:zoomOut` / `canvas:fitToScreen` | keyboard handler in `index.astro` | Canvas | — |

Keyboard shortcuts (in `index.astro` body): `⌘Z` / `Ctrl+Z` undo, `⌘⇧Z` / `Ctrl+Y` redo, `+` / `=` zoom in, `-` zoom out, `0` fit. Suppressed when typing in inputs or when export dialog open.

---

## 8. UI Composition

`src/pages/index.astro` mounts all top-level components on one page:

```
<body x-data + key handlers>
  <ImageLibrary />             # overlay; shown when libraryOpen=true or !hasImage
  <Canvas />                   # WebGL canvas + minimap + crop overlay
  <Toolbar />                  # floating pill top-center
  <Panel>                      # right sidebar (md+) / bottom sheet (mobile)
    <LightPanel /> <ColorPanel /> <CurvePanel />
    <DetailPanel /> <CropPanel /> <FramePanel />
    <LensPanel /> <PresetsPanel />
  </Panel>
</body>
```

Alpine data scopes: `imageLibrary()`, `canvasView()`, `toolbar()`, `exportDialog()`, `panelData()`, `curveEditor()`, and `Slider`'s implicit scope per-instance.

### Slider component

Reusable input driven by an Alpine expression path (e.g. `$store.editor.light.exposure`):
- Bipolar detection when `min < 0` → centered track + sign in display.
- `@input` updates store live (re-render immediate).
- `@change` fires `pushHistory()` → batched per-drag history entry.
- Double-tap / reset button resets to `defaultValue`.

### Panel (mobile bottom sheet)

3 snap points (peek / collapsed / expanded). Vertical-swipe vs horizontal-tab-scroll disambiguated by direction lock. See `src/lib/bottomSheet.ts`.

---

## 9. Storage Model (`src/lib/storage.ts`)

IndexedDB via `idb-keyval`. Per-image **project** keyed by UUID.

- **Key format**: `editor_project_<uuid>`
- **Value**: `{ id, imageBlob, isRaw, filename, editState, preview, createdAt, updatedAt }`
- **Cap**: `MAX_PROJECTS = 30`. When exceeded, sort by `updatedAt`, delete oldest.
- **Preview**: optional base64 data URL used as thumbnail in Library.
- Old `session` / `lastImage` helpers retained as **no-ops** for backwards compat.

Lifecycle:

| Op | Function | Notes |
|---|---|---|
| Create | `createProject(blob, isRaw, filename)` | Generates UUID, seeds empty EditState, runs LRU prune |
| Update | `updateProject(id, store, previewBlob?)` | Serializes current EditState, optional new preview |
| List | `loadProjects()` | Enumerates keys, strips `imageBlob`, sorts by updatedAt desc |
| Load | `loadProject(id)` | Returns full `ProjectData` (with imageBlob) |

---

## 10. Image Loading Flow

### Standard image (JPEG/PNG/WebP/etc.)

```
file → createImageBitmap(blob)
     → renderer.loadImage(bitmap)      # uploads RGBA8 texture
     → computeHistogramFromBitmap()
     → store.{imageData, width, height, hasImage=true, histogram}
     → createProject(blob, false, filename)
     → dispatch('editor:render')
```

### RAW (CR2, NEF, ARW, DNG, …)

```
file → detectRaw(file) [extension match]
     → decodeRaw(file) [spawns Worker]
        → rawWorker.ts
           → try LibRaw WASM (useCameraWb=true, sRGB output)
              → Uint8 → Float32Array, sRGB → linear (^2.2)
           → on error: OffscreenCanvas fallback
           → postMessage({ pixels: Float32Array, width, height })
     → renderer.loadRawPixels(pixels, w, h)   # uploads RGBA32F texture
     → computeHistogramFromRaw()               # linear → sRGB → bin
     → store.{rawPixels, isRaw=true, width, height, hasImage, histogram}
     → createProject(blob, true, filename)
     → dispatch('editor:render')
```

Shader branches on `u_isFloat`: float path skips sRGB→linear decode and applies ACES tonemap at end; uint path does sRGB decode and no tonemap.

---

## 11. WebGL Pipeline (`src/lib/gl/renderer.ts`)

Two-pass rendering. Fullscreen triangle (vertex shader is trivial; all work in fragment).

### Pass 1 — `shader.frag`

Input textures:
- `u_image` (RGBA8 or RGBA32F) — the image
- `u_curveLUT_r`, `u_curveLUT_g`, `u_curveLUT_b` — 256×1 LUTs baked from curve state

Pixel pipeline (in order):
1. **Border / frame** — inset UVs by `borderThickness`, fill outside with `borderColor`.
2. **Straighten rotation** — rotate UV around crop center by `angle`.
3. **Barrel (fisheye)** — radial distortion from `lens.curvature`.
4. **Chromatic fringe** — radial R/G/B sample offset.
5. **sRGB → linear** — only if `!u_isFloat`.
6. **Exposure** — `color *= pow(2, exposure)`.
7. **Contrast** — power curve around 18% grey.
8. **Tonal masks** — luma-weighted gains for highlights/shadows/whites/blacks.
9. **Temp / tint** — R/B and G shifts.
10. **HSL per-color** — 8 hue ranges with smooth masks, apply H/S/L adjustments.
11. **Vibrance** — saturation that protects already-saturated pixels.
12. **Saturation** — global in HSL space.
13. **Curve LUT lookup** — if `useCurve`, sample per-channel `u_curveLUT_*`.
14. **ACES tonemap** — only if `u_isFloat` (RAW linear path).
15. **Linear → sRGB** — gamma out.
16. **Grain** — per-pixel hash noise in sRGB.
17. **Vignette** — circular mask from `lens.vignette*`.

### Pass 2 — `sharp.frag` (optional)

Triggered when `detail.sharpness > 0.01` **or** `detail.noiseReduction > 0.01`.

- Pass 1 renders to FBO instead of screen.
- 3×3 bilateral blur (color-weighted, sigma²=0.04).
- Noise reduction: blend toward blurred (× `noiseReduction * 0.8`).
- Unsharp mask: `denoised + (denoised - blurred) * sharpness * 2.5`.
- Output to screen.

### Curve LUT baking

- 256 entries per channel. For each `i`:
  1. Sample master RGB curve at `i/255`.
  2. Sample R/G/B channel curve at the master's output.
  3. Pack as RGBA8.
- Rebaked on render when curve deviates from identity `[[0,0],[1,1]]`.
- Uploaded to three separate 256×1 textures (`u_curveLUT_r/g/b`).

### Export

`renderer.exportBlob(state, format, quality)`:
1. `render(state)` — normal pipeline to screen canvas.
2. `canvas.toBlob(cb, format, quality)` — read back encoded blob.
3. Toolbar triggers `<a download>` click.

Note: crop is applied in-shader during preview but export reads back the rendered canvas, so the exported frame matches the preview (including vignette/grain/frame).

---

## 12. Rendering Flow (End-to-End)

```
User moves slider
  ↓ x-model
store.light.exposure = newValue
  ↓ @input (live) / @change (commit)
dispatchEvent('editor:render')
  ↓
Canvas listener → renderer.render(state)
  ↓
  Pass 1 → (maybe Pass 2) → screen
  ↓
Minimap copies main canvas (if visible)
  ↓ @change only
pushHistory() → snapshot appended
  ↓ debounced 2s
updateProject(currentProjectId, store, previewBlob) → IndexedDB
```

---

## 13. Presets (`src/lib/presets.ts`)

9 built-in presets: VIVID, MATTE, MONO, WARM, COOL, FADED, HAZE, PUNCH, DUSK.

Each is a partial override of `light` + `color` fields. Applied via `applyEditState(partial)` then `pushHistory()`. To add a preset: append to `PRESETS` array; `PresetsPanel` re-renders automatically.

---

## 14. Non-Obvious Patterns

| Pattern | Detail |
|---|---|
| **`restoring` guard** | Suspends `deferSave` while loading a project, preventing the loaded state from immediately overwriting itself in IndexedDB. |
| **`libraryOpen` while editing** | Library overlay can be reopened from Toolbar without losing current edit; lets user swap images without losing session. |
| **Input vs. change events** | `@input` re-renders (fast GPU), `@change` pushes history (batches per-drag). Do not swap. |
| **Float vs uint path** | Shader decisions keyed off `u_isFloat`. RAW is linear + needs ACES. Standard is sRGB + no tonemap. |
| **Histogram downsample** | Max ~500k samples; both bitmap and raw paths enforce this to keep computation cheap. |
| **LUT rebake skip** | Identity curve skips LUT upload → hot path stays fast for light/color-only edits. |
| **History = JSON only** | ~kb per snapshot, cap 50 → negligible memory. Never snapshot image data. |
| **Bottom sheet direction lock** | Vertical swipe vs horizontal tab scroll are disambiguated on first move; prevents accidental panel resize when scrolling tabs. |
| **Minimap desktop-only** | Hidden on mobile and during crop. Not a live FBO — copies main canvas post-render. |

---

## 15. Extending the Editor

### New adjustment panel

1. Add fields to `EditState` subtype in `src/types.ts`.
2. Add defaults to `storeDefinition` in `src/lib/store.ts`.
3. Create `src/components/panels/NewPanel.astro` with `<Slider>` instances.
4. Register panel in `Panel.astro` (tab button + slot).
5. Add uniforms to `shader.frag`; bind in `renderer.ts` (`_drawPass1`).
6. Include in `resetEdits()` / `applyEditState()` logic (it's already generic if you extend `EditState` cleanly).

### New preset

Append object to `PRESETS` in `src/lib/presets.ts`. Auto-listed in `PresetsPanel`.

### New RAW format

`libraw-wasm` handles almost all; if needed, extend extension match in `detectRaw()` (`src/lib/imageLoader.ts`).

---

## 16. Gotchas

- Node ≥ 22 required (Astro 6).
- Package manager is **pnpm**, not npm. Do not mix lockfiles.
- `src/types.ts` lives at `src/types.ts` (not `src/lib/types.ts`).
- Histogram for RAW does its own linear→sRGB conversion before binning — do not assume sRGB input.
- `deferSave` will silently no-op if `restoring` is true; check that flag when debugging "save not happening".
- Crop is a shader uniform, not a real resize — the canvas itself is always full image. Exporters need to read the rendered canvas, not the raw texture.
- Render events are raw `CustomEvent`s, not Alpine magic — dispatch and listen via `window.dispatchEvent` / `addEventListener`.

---

## 17. Quick Reference — Where Does X Live?

| Need to… | Look at |
|---|---|
| Add a slider-driven adjustment | `shader.frag` + `renderer.ts` + panel `.astro` + `types.ts` + `store.ts` |
| Change persistence shape | `src/lib/storage.ts` + `ProjectMeta`/`ProjectData` in `types.ts` |
| Change undo behavior | `store.ts` (`_history`, `pushHistory`, `undo`, `redo`) |
| Add a custom event | Dispatch from component, listen in Canvas or relevant scope |
| Modify WebGL passes | `src/lib/gl/renderer.ts` + the two `.frag` files |
| Add a preset | `src/lib/presets.ts` |
| Tweak mobile panel behavior | `src/lib/bottomSheet.ts` + `Panel.astro` |
| RAW decoding bug | `src/lib/raw/rawWorker.ts` (worker) + `decoder.ts` (main-thread wrapper) |
| Export format/quality | `Toolbar.astro` (`exportDialog`) + `renderer.exportBlob()` |
