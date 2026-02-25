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
    histogram: null,  // { r, g, b } — 256-entry count arrays, derived from source image

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
      rgb: [[0, 0], [0.25, 0.25], [0.75, 0.75], [1, 1]],
      r:   [[0, 0], [0.25, 0.25], [0.75, 0.75], [1, 1]],
      g:   [[0, 0], [0.25, 0.25], [0.75, 0.75], [1, 1]],
      b:   [[0, 0], [0.25, 0.25], [0.75, 0.75], [1, 1]],
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

    applyEditState(state) {
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
      const defaultPts = [[0,0],[0.25,0.25],[0.75,0.75],[1,1]]
      this.curve.channel = state.curve.channel || 'rgb'
      // Support legacy format (old sessions had just `points`)
      const legacy = state.curve.points
      this.curve.rgb = state.curve.rgb || (legacy ? legacy.map(p=>[...p]) : defaultPts.map(p=>[...p]))
      this.curve.r   = state.curve.r   || defaultPts.map(p=>[...p])
      this.curve.g   = state.curve.g   || defaultPts.map(p=>[...p])
      this.curve.b   = state.curve.b   || defaultPts.map(p=>[...p])
      Object.assign(this.detail, state.detail)
      if (state.crop) Object.assign(this.crop, state.crop)
    },

    _applySnapshot(snap) {
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

    resetEdits() {
      Object.assign(this.light, { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 })
      Object.assign(this.color, { temp: 0, tint: 0, vibrance: 0, saturation: 0 })
      for (const key of Object.keys(this.color.hsl)) {
        Object.assign(this.color.hsl[key], { h: 0, s: 0, l: 0 })
      }
      const defaultCurvePts = [[0,0],[0.25,0.25],[0.75,0.75],[1,1]]
      this.curve.rgb = defaultCurvePts.map(p=>[...p])
      this.curve.r   = defaultCurvePts.map(p=>[...p])
      this.curve.g   = defaultCurvePts.map(p=>[...p])
      this.curve.b   = defaultCurvePts.map(p=>[...p])
      Object.assign(this.detail, { sharpness: 0, noiseReduction: 0 })
      this.pushHistory()
      window.dispatchEvent(new CustomEvent('editor:render'))
    },
  })
}
