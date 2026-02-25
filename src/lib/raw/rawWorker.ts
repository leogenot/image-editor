// RAW decoding Web Worker
// Uses browser-native decoding (works for DNG and some RAW formats).
// For full LibRaw WASM support, place libraw.js in public/ and implement
// a module-safe loader here.

import type { RawWorkerRequest, RawDecodeResult } from '../../types'

// Fallback: decode using browser's built-in capabilities via OffscreenCanvas
async function fallbackDecode(buffer: ArrayBuffer, filename: string): Promise<RawDecodeResult> {
  // For DNG and some RAW formats, browsers can sometimes handle them
  const blob = new Blob([buffer])
  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
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
  } catch {
    throw new Error(`Cannot decode ${filename}. Unsupported format.`)
  }
}

self.onmessage = async (e: MessageEvent<RawWorkerRequest>) => {
  const { id, buffer, filename } = e.data

  try {
    // Try browser native first (works for DNG and some formats)
    const result = await fallbackDecode(buffer, filename)
    self.postMessage({ id, ...result }, [result.pixels.buffer])
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message })
  }
}
