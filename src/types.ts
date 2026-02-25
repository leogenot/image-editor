// Single source of truth for all shared TypeScript interfaces.

export type CurvePoint = [number, number]
export type CurveChannel = 'rgb' | 'r' | 'g' | 'b'
export type HSLKey = 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta'
export type PanelName = 'light' | 'color' | 'curve' | 'detail' | 'crop' | 'frame' | 'presets'

export interface LightSettings {
  exposure: number    // EV stops, -5 to +5
  contrast: number    // -1 to +1
  highlights: number  // -1 to +1
  shadows: number     // -1 to +1
  whites: number      // -1 to +1
  blacks: number      // -1 to +1
}

export interface HSLChannel {
  h: number
  s: number
  l: number
}

export type HSLMap = Record<HSLKey, HSLChannel>

export interface ColorSettings {
  temp: number        // -1 to +1 (cool → warm)
  tint: number        // -1 to +1 (green → magenta)
  vibrance: number    // -1 to +1
  saturation: number  // -1 to +1
  hsl: HSLMap
}

export interface CurveSettings {
  channel: CurveChannel
  rgb: CurvePoint[]
  r: CurvePoint[]
  g: CurvePoint[]
  b: CurvePoint[]
}

export interface DetailSettings {
  sharpness: number
  noiseReduction: number
  grain: number       // 0 to 1
  grainSize: number   // 1 to 8
}

export interface FrameSettings {
  thickness: number  // 0 to 0.15 (fraction of shorter image dimension)
  color: string      // hex e.g. '#ffffff'
}

export interface CropSettings {
  x: number
  y: number
  w: number
  h: number
  angle: number
  ratio: string
}

export interface HistogramData {
  r: number[]
  g: number[]
  b: number[]
}

/** Serializable edit-only state (no file or UI state). Used for undo snapshots and sessions. */
export interface EditState {
  light: LightSettings
  color: ColorSettings
  curve: CurveSettings
  detail: DetailSettings
  crop: CropSettings
  frame: FrameSettings
}

/** What gets persisted in IndexedDB per session. */
export interface SessionData extends EditState {
  filename: string
  savedAt: number
  preview?: string  // base64 data URL
}

/** A preset — partial light/color overrides (no hsl, no curve/detail). */
export interface Preset {
  id: string
  name: string
  light: Partial<LightSettings>
  color: Omit<ColorSettings, 'hsl'>
}

/** What Renderer.render() accepts — partial state, legacy `points` field allowed for curve. */
export interface RenderState {
  light?: Partial<LightSettings>
  color?: Partial<ColorSettings>
  curve?: Partial<CurveSettings> & { points?: CurvePoint[] }  // `points` = legacy format
  detail?: Partial<DetailSettings>
  crop?: Partial<CropSettings>
  frame?: Partial<FrameSettings>
}

/** Full Alpine editor store shape. */
export interface EditorStore extends EditState {
  // File state
  file: File | null
  filename: string
  imageData: ImageBitmap | null
  rawPixels: Float32Array | null
  isRaw: boolean
  width: number
  height: number
  hasImage: boolean
  histogram: HistogramData | null

  // UI state
  activePanel: PanelName
  cropMode: boolean
  exportOpen: boolean
  restoring: boolean
  straightening: boolean

  // History
  _history: string[]
  _historyIndex: number

  // Methods
  _snapshot(): string
  pushHistory(): void
  applyEditState(state: Partial<EditState>): void
  _applySnapshot(snap: string): void
  undo(): void
  redo(): void
  resetEdits(): void
}

// Alpine module augmentation — typed $store.editor access
declare module 'alpinejs' {
  interface Stores {
    editor: EditorStore
  }
}

export interface ImageLoadResult {
  bitmap: ImageBitmap
  width: number
  height: number
  isRaw: false
}

export interface PinchZoomEvent {
  scale: number
  dx: number
  dy: number
  cx: number
  cy: number
}

export interface GestureCallbacks {
  doubleTap?: () => void
  pinchZoom?: (e: PinchZoomEvent) => void
}

export interface RawWorkerRequest {
  id: number
  buffer: ArrayBuffer
  filename: string
}

export interface RawWorkerResponse {
  id: number
  pixels?: Float32Array
  width?: number
  height?: number
  error?: string
}

export interface RawDecodeResult {
  pixels: Float32Array
  width: number
  height: number
}
