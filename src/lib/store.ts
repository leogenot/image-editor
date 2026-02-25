import type { Alpine } from 'alpinejs'
import type { EditorStore, EditState, CurvePoint, HSLKey } from '../types'

export function createEditorStore(Alpine: Alpine): void {
  const defaultCurvePts = (): CurvePoint[] => [[0, 0], [1, 1]]

  // ThisType<EditorStore> gives correct `this` context inside all methods
  const storeDefinition: EditorStore & ThisType<EditorStore> = {
    // File state
    file: null,
    filename: '',
    imageData: null,
    rawPixels: null,
    isRaw: false,
    width: 0,
    height: 0,
    hasImage: false,
    histogram: null,

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
      channel: 'rgb',
      rgb: defaultCurvePts(),
      r:   defaultCurvePts(),
      g:   defaultCurvePts(),
      b:   defaultCurvePts(),
    },
    detail: {
      sharpness: 0,
      noiseReduction: 0,
    },
    crop: {
      x: 0, y: 0, w: 1, h: 1,
      angle: 0,
      ratio: 'free',
    },

    // UI state
    activePanel: 'light',
    cropMode: false,
    exportOpen: false,
    restoring: false,
    straightening: false,

    // History (undo/redo)
    _history: [],
    _historyIndex: -1,

    _snapshot() {
      return JSON.stringify({
        light: this.light,
        color: {
          temp: this.color.temp,
          tint: this.color.tint,
          vibrance: this.color.vibrance,
          saturation: this.color.saturation,
          hsl: this.color.hsl,
        },
        curve: {
          channel: this.curve.channel,
          rgb: this.curve.rgb.map(p => [...p]),
          r:   this.curve.r.map(p => [...p]),
          g:   this.curve.g.map(p => [...p]),
          b:   this.curve.b.map(p => [...p]),
        },
        detail: this.detail,
      })
    },

    pushHistory() {
      const snap = this._snapshot()
      this._history = this._history.slice(0, this._historyIndex + 1)
      this._history.push(snap)
      if (this._history.length > 50) this._history.shift()
      this._historyIndex = this._history.length - 1
    },

    applyEditState(state: Partial<EditState>) {
      if (state.light) Object.assign(this.light, state.light)
      if (state.color) {
        Object.assign(this.color, {
          temp: state.color.temp,
          tint: state.color.tint,
          vibrance: state.color.vibrance,
          saturation: state.color.saturation,
        })
        if (state.color.hsl) {
          for (const key of Object.keys(state.color.hsl) as HSLKey[]) {
            Object.assign(this.color.hsl[key], state.color.hsl[key])
          }
        }
      }
      if (state.curve) {
        const defaultPts = defaultCurvePts()
        // Support legacy format (old sessions had just `points`)
        const legacy = (state.curve as Record<string, unknown>).points as CurvePoint[] | undefined
        this.curve.channel = state.curve.channel ?? 'rgb'
        this.curve.rgb = state.curve.rgb ?? (legacy ? legacy.map(p => [...p] as CurvePoint) : defaultPts)
        this.curve.r   = state.curve.r   ?? defaultCurvePts()
        this.curve.g   = state.curve.g   ?? defaultCurvePts()
        this.curve.b   = state.curve.b   ?? defaultCurvePts()
      }
      if (state.detail) Object.assign(this.detail, state.detail)
      if (state.crop) Object.assign(this.crop, state.crop)
    },

    _applySnapshot(snap: string) {
      this.applyEditState(JSON.parse(snap))
      window.dispatchEvent(new CustomEvent('editor:render'))
    },

    undo() {
      if (this._historyIndex <= 0) return
      this._historyIndex--
      this._applySnapshot(this._history[this._historyIndex])
    },

    redo() {
      if (this._historyIndex >= this._history.length - 1) return
      this._historyIndex++
      this._applySnapshot(this._history[this._historyIndex])
    },

    clearHistory() {
      this._history = []
      this._historyIndex = -1
    },

    resetEdits() {
      Object.assign(this.light, { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 })
      Object.assign(this.color, { temp: 0, tint: 0, vibrance: 0, saturation: 0 })
      for (const key of Object.keys(this.color.hsl) as HSLKey[]) {
        Object.assign(this.color.hsl[key], { h: 0, s: 0, l: 0 })
      }
      this.curve.rgb = defaultCurvePts()
      this.curve.r   = defaultCurvePts()
      this.curve.g   = defaultCurvePts()
      this.curve.b   = defaultCurvePts()
      Object.assign(this.detail, { sharpness: 0, noiseReduction: 0 })
      this.pushHistory()
      window.dispatchEvent(new CustomEvent('editor:render'))
    },
  }

  Alpine.store('editor', storeDefinition)
}
