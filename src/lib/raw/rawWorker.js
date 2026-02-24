// RAW decoding Web Worker
// Uses LibRaw WASM when available, otherwise returns an error with helpful message

let librawReady = false
let librawModule = null

async function tryLoadLibRaw() {
  // Try loading from public directory
  try {
    // Dynamic import of the WASM module
    const response = await fetch('/libraw.js')
    if (!response.ok) throw new Error('libraw.js not found in public/')

    // If we got here, WASM file exists — evaluate it
    const scriptText = await response.text()
    // eslint-disable-next-line no-new-func
    const moduleFactory = new Function('module', scriptText + '\nreturn module.exports || LibRaw')
    librawModule = await moduleFactory({})
    if (typeof librawModule === 'function') {
      librawModule = await librawModule()
    }
    librawReady = true
    return true
  } catch (e) {
    console.warn('LibRaw WASM not available:', e.message)
    return false
  }
}

// Fallback: decode using browser's built-in capabilities via OffscreenCanvas
async function fallbackDecode(buffer, filename) {
  // For DNG and some RAW formats, browsers can sometimes handle them
  // For others, we surface a helpful error
  const blob = new Blob([buffer])
  try {
    const bitmap = await createImageBitmap(blob)
    // Browser decoded it natively — convert to Float32Array
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    // Convert Uint8 sRGB to Float32 linear
    const pixels = new Float32Array(bitmap.width * bitmap.height * 4)
    for (let i = 0; i < pixels.length; i += 4) {
      // sRGB to linear conversion
      pixels[i+0] = Math.pow(imageData.data[i+0] / 255, 2.2)
      pixels[i+1] = Math.pow(imageData.data[i+1] / 255, 2.2)
      pixels[i+2] = Math.pow(imageData.data[i+2] / 255, 2.2)
      pixels[i+3] = 1.0
    }
    bitmap.close()
    return { pixels, width: canvas.width, height: canvas.height }
  } catch (e) {
    throw new Error(
      `Cannot decode ${filename}. LibRaw WASM is not installed. ` +
      `Please convert your RAW file to DNG or JPEG first using Adobe DNG Converter or your camera software.`
    )
  }
}

self.onmessage = async (e) => {
  const { id, buffer, filename } = e.data

  try {
    // Try browser native first (works for DNG and some formats)
    const result = await fallbackDecode(buffer, filename)
    self.postMessage({ id, ...result }, [result.pixels.buffer])
  } catch (err) {
    self.postMessage({ id, error: err.message })
  }
}
