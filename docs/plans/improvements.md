# DarkRoom — Improvement Implementation Plan

Based on the performance, UX, UI, and usability audit (2026-03-30).
Ordered by impact vs. effort. Each phase has a checkpoint to verify before continuing.

---

## Phase 1 — Quick Wins (Low effort, meaningful impact)

### 1.1 Export feedback
**File:** `src/components/Toolbar.astro`

- Set a reactive `exporting` flag on the Alpine store when export starts
- Disable the Export button and change its label to "Exporting…" during the operation
- Re-enable and restore label when `exportBlob()` resolves

**Checkpoint:** Click Export → button disables and label changes → file downloads → button re-enables. Verify on both mobile and desktop.

---

### 1.2 Keyboard zoom shortcuts
**File:** `src/pages/index.astro` (keydown handler) + `src/components/Canvas.astro`

- Add a `zoom(factor)` method (or expose the existing pan/zoom logic) on the Canvas Alpine component
- In the global keydown handler, map `+`/`=` → zoom in (×1.2), `-` → zoom out (÷1.2), `0` → fit to screen
- Guard against firing when focus is inside an `<input>` or `<textarea>`

**Checkpoint:** Press `+`, `-`, `0` while canvas is visible → image zooms/fits as expected. Pressing keys inside the hex color input does NOT trigger zoom.

---

### 1.3 Frame color visual swatch
**File:** `src/components/panels/FramePanel.astro`

- Add a small `<div>` color swatch (24×24px rounded square) next to the hex input, bound to `$store.editor.frame.color`
- On click, focus the hex input (label trick or `<input type="color">` behind the swatch)
- The native color picker (`<input type="color">`) can be hidden and triggered by the swatch click as an enhancement

**Checkpoint:** Change hex value → swatch updates instantly. Click swatch → native color picker or focused input opens.

---

### 1.4 Slider ARIA roles
**File:** `src/components/Slider.astro`

- Add `role="slider"` to the `<input type="range">` wrapper or the element acting as the slider
- Ensure each slider has `aria-label` (use the `label` prop), `aria-valuemin`, `aria-valuemax`, `aria-valuenow` (bound to current value)
- These should already exist on `<input type="range">` natively — verify they are not stripped by custom styling

**Checkpoint:** Run axe DevTools or VoiceOver → each slider announces its label and current value.

---

### 1.5 Focus-visible rings
**File:** `src/styles/global.css`

- Add a global `:focus-visible` rule with a white `outline` (e.g., `2px solid white`, `outline-offset: 2px`)
- Ensure buttons, inputs, and custom interactive elements (curve editor SVG points) inherit or set this ring
- Remove any `outline: none` overrides that are not paired with a custom `:focus-visible` style

**Checkpoint:** Tab through the UI with keyboard only → every interactive element shows a clear white ring when focused. Mouse clicks do NOT show the ring.

---

### 1.6 Project grid alt text
**File:** `src/components/ImageLibrary.astro`

- Add `alt="[filename] preview"` to each project thumbnail `<img>` element
- Add `aria-label` to the delete and open buttons per project card

**Checkpoint:** Inspect DOM → every `<img>` in the project grid has a non-empty `alt`. Run axe → no missing-alt violations.

---

## Phase 2 — UX Improvements (Medium effort, high user value)

### 2.1 Dismissible bottom sheet (mobile)
**File:** `src/components/Panel.astro`, `src/components/Canvas.astro`

- Add a collapse/expand toggle button at the top of the mobile bottom sheet (chevron icon)
- When collapsed, the bottom sheet shrinks to show only the tab bar (not the panel content)
- The canvas gets the reclaimed screen height automatically (flexbox)
- Store collapsed state in a local Alpine variable (not persisted)
- A drag-up gesture on the drag handle re-opens it

**Checkpoint:** On mobile (or narrow viewport), tap collapse → panel content hides, canvas expands. Tap again or drag up → panel re-opens. Editing still works in both states.

---

### 2.2 Larger curve touch targets (mobile)
**File:** `src/components/panels/CurvePanel.astro`

- Increase SVG control point hit area: wrap each point in a transparent `<circle>` with `r="16"` (hit area) behind the visible `r="4"` point
- On mobile (`pointer: coarse`), increase point radius to 8px visually
- Add a CSS `touch-action: none` on the curve SVG to prevent scroll conflict

**Checkpoint:** On a touch device, drag curve control points — each point is easy to grab without accidentally hitting adjacent points. Scrolling outside the curve canvas still works.

---

### 2.3 Active curve point highlight
**File:** `src/components/panels/CurvePanel.astro`

- Track a `selectedPoint` index in the curve panel Alpine state (default `null`)
- On `pointerdown` on a point, set `selectedPoint` to that index
- Render selected point with a larger visible radius (6px) and a white ring/outline (SVG `stroke`)
- Clear selection on `pointerup` outside a point or on canvas click without hitting a point

**Checkpoint:** Click/tap a curve point → it visually highlights. Click another point → previous deselects, new one selects. Click empty canvas area → all deselect.

---

### 2.4 Crop canvas rotation feedback
**File:** `src/components/Canvas.astro`

- When the straighten slider changes (`crop.angle`), apply a CSS `transform: rotate(Xdeg)` to the canvas element in addition to the WebGL-side render
- This gives instant visual feedback before the next WebGL frame
- The grid overlay (rule of thirds + fine grid for straightening) should also update synchronously

**Checkpoint:** Drag the angle slider → the canvas image rotates visually in real time without perceptible lag. Grid aligns with the rotation.

---

## Phase 3 — Memory & Stability (Medium effort, high impact on mobile)

### 3.1 Compress thumbnails on save
**File:** `src/lib/storage.ts`

- In `updateProject()`, before storing the `preview` base64 string, render the thumbnail to a 400px-wide offscreen canvas and export as JPEG at quality 0.7
- The `imageBlob` (full-res original) stays untouched — only the preview is compressed
- This reduces per-project storage by 80–90% for the thumbnail

**Checkpoint:** Open DevTools → Application → IndexedDB → verify `preview` strings are significantly shorter than before. Open a saved project → thumbnail loads correctly.

---

### 3.2 Lazy-load project thumbnails
**File:** `src/components/ImageLibrary.astro`

- Add `loading="lazy"` to project thumbnail `<img>` elements
- For projects where `preview` is null/missing, show a grey placeholder instead of a broken image
- Only decode/display thumbnails for projects in or near the viewport

**Checkpoint:** Open library with 20+ projects → DevTools Network shows images decoded progressively as you scroll, not all upfront.

---

## Phase 4 — Performance (Highest effort, critical for mobile RAW users)

### 4.1 RAW decode in a Web Worker
**Files:** New `src/workers/raw-decoder.worker.ts`, `src/components/ImageLibrary.astro`, `src/lib/store.ts`

**Plan:**

1. Create `src/workers/raw-decoder.worker.ts`:
   - Import `libraw-wasm`
   - Listen for `{ type: 'decode', buffer: ArrayBuffer }` messages
   - Run the decode and post back `{ type: 'result', pixels: Float32Array, width, height }` or `{ type: 'error', message }`

2. In the image load path (ImageLibrary or store), when a RAW file is detected:
   - Instantiate the worker (or reuse a singleton)
   - `postMessage({ type: 'decode', buffer })` with `[buffer]` as the transfer list
   - Show the loading spinner (already exists)
   - On `message` → call `store.loadRawPixels(pixels, w, h)`
   - On `error` → show user-facing error toast

3. Add a **Cancel** button to the loading spinner that terminates the worker (`worker.terminate()`) and resets state

**Vite config:** Ensure the worker is bundled correctly using `?worker` import syntax or `Worker` constructor with `type: 'module'`.

**Checkpoint 4.1a:** Drop a CR2/NEF file → spinner appears, page remains interactive (can scroll, click other things) while decoding.

**Checkpoint 4.1b:** Click Cancel during decode → spinner disappears, app returns to library, no zombie worker running.

**Checkpoint 4.1c:** Decode completes → image loads and renders correctly, identical to the previous synchronous path.

---

## Phase 5 — Toolbar collapse on mobile (Polish)

### 5.1 Responsive toolbar
**File:** `src/components/Toolbar.astro`

- Hide the text label inside the filename display below a certain width (show icon only)
- Consider grouping Undo/Redo into a single dropdown or hiding them behind a `...` overflow menu on very small screens (<360px)
- Ensure the Export button always remains fully visible (it's the primary CTA)

**Checkpoint:** Render on 360px wide viewport → all toolbar buttons are reachable, Export button is fully visible, nothing overflows or wraps.

---

## Checkpoint Summary Table

| # | What to verify | When |
|---|----------------|------|
| 1.1 | Export button disables during export | After Phase 1.1 |
| 1.2 | `+`/`-`/`0` zoom from keyboard | After Phase 1.2 |
| 1.3 | Color swatch updates live | After Phase 1.3 |
| 1.4 | Sliders announce in VoiceOver/axe | After Phase 1.4 |
| 1.5 | Tab key shows focus ring everywhere | After Phase 1.5 |
| 1.6 | No missing-alt violations in axe | After Phase 1.6 |
| 2.1 | Mobile panel collapses to reveal canvas | After Phase 2.1 |
| 2.2 | Curve points grabbable on touch | After Phase 2.2 |
| 2.3 | Selected curve point highlights | After Phase 2.3 |
| 2.4 | Angle slider gives instant rotation | After Phase 2.4 |
| 3.1 | IndexedDB preview strings are small | After Phase 3.1 |
| 3.2 | Thumbnails load lazily | After Phase 3.2 |
| 4.1a | Page stays interactive during RAW decode | After Phase 4.1 |
| 4.1b | Cancel terminates decode correctly | After Phase 4.1 |
| 4.1c | Decoded image renders identically | After Phase 4.1 |
| 5.1 | Toolbar usable at 360px width | After Phase 5.1 |

---

## Implementation Order

```
Phase 1 (Quick wins)     → ship as one batch
Phase 3 (Memory)         → ship before Phase 4 (cleaner storage foundation)
Phase 2 (UX polish)      → ship incrementally, one sub-item per PR
Phase 4 (Worker)         → ship alone, high risk, needs full regression test
Phase 5 (Toolbar)        → ship last, lowest priority
```

---

## Risk Notes

- **Phase 4 (RAW Worker):** `libraw-wasm` may not be importable in a Worker context without additional Vite config (`optimizeDeps` + worker format). Test this first in isolation before wiring to the full decode path.
- **Phase 2.1 (Bottom sheet collapse):** Changes the panel height layout — regression test the desktop sidebar is unaffected (use `@media (min-width: 768px)` guard).
- **Phase 3.1 (Thumbnail compression):** The offscreen canvas approach requires `OffscreenCanvas` which is available in all modern browsers but verify on Safari 16+.
