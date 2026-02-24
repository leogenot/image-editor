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
      channel: 'rgb',
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
        curve: { points: this.curve.points.map(p => [...p]), channel: this.curve.channel },
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

    _applySnapshot(snap) {
      const state = JSON.parse(snap)
      Object.assign(this.light, state.light)
      Object.assign(this.color, {
        temp: state.color.temp,
        tint: state.color.tint,
        vibrance: state.color.vibrance,
        saturation: state.color.saturation,
      })
      for (const key of Object.keys(state.color.hsl)) {
        Object.assign(this.color.hsl[key], state.color.hsl[key])
      }
      this.curve.points = state.curve.points
      this.curve.channel = state.curve.channel
      Object.assign(this.detail, state.detail)
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

    resetEdits() {
      Object.assign(this.light, { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 })
      Object.assign(this.color, { temp: 0, tint: 0, vibrance: 0, saturation: 0 })
      for (const key of Object.keys(this.color.hsl)) {
        Object.assign(this.color.hsl[key], { h: 0, s: 0, l: 0 })
      }
      this.curve.points = [[0,0],[0.25,0.25],[0.75,0.75],[1,1]]
      Object.assign(this.detail, { sharpness: 0, noiseReduction: 0 })
      this.pushHistory()
      window.dispatchEvent(new CustomEvent('editor:render'))
    },
  })
}
