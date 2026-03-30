// RAW decoding Web Worker
// Tries LibRaw WASM first (proper RAW: CR2, NEF, ARW, etc.)
// Falls back to browser-native OffscreenCanvas decoding (DNG, JPEG, PNG…)

import type { RawWorkerRequest, RawDecodeResult } from '../../types'
import LibRaw from 'libraw-wasm'

function rawDataToFloat32Linear(
  data: Uint8Array | Uint16Array,
  width: number,
  height: number,
  colors: number,
  bits: number,
): Float32Array {
  const pixels = new Float32Array(width * height * 4)
  const maxVal = bits === 16 ? 65535 : 255
  for (let i = 0; i < width * height; i++) {
    const s = i * colors
    const d = i * 4
    const r = data[s] / maxVal
    const g = data[s + 1] / maxVal
    const b = data[s + 2] / maxVal
    // sRGB → linear (renderer expects linear Float32 when u_isFloat=true)
    pixels[d]     = Math.pow(r, 2.2)
    pixels[d + 1] = Math.pow(g, 2.2)
    pixels[d + 2] = Math.pow(b, 2.2)
    pixels[d + 3] = 1.0
  }
  return pixels
}

async function decodeWithLibRaw(buffer: ArrayBuffer): Promise<RawDecodeResult> {
  const raw = new LibRaw()
  await raw.open(new Uint8Array(buffer.slice(0)), {
    useCameraWb: true,
    outputBps: 8,
    outputColor: 1, // sRGB
  })
  const { data, width, height, colors, bits } = await raw.imageData()
  return {
    pixels: rawDataToFloat32Linear(data, width, height, colors, bits),
    width,
    height,
  }
}

async function decodeWithBrowser(buffer: ArrayBuffer, filename: string): Promise<RawDecodeResult> {
  const blob = new Blob([buffer])
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  const pixels = new Float32Array(bitmap.width * bitmap.height * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i]     = Math.pow(imageData.data[i]     / 255, 2.2)
    pixels[i + 1] = Math.pow(imageData.data[i + 1] / 255, 2.2)
    pixels[i + 2] = Math.pow(imageData.data[i + 2] / 255, 2.2)
    pixels[i + 3] = 1.0
  }
  bitmap.close()
  return { pixels, width: canvas.width, height: canvas.height }
}

self.onmessage = async (e: MessageEvent<RawWorkerRequest>) => {
  const { id, buffer, filename } = e.data

  // Try LibRaw first (handles CR2, NEF, ARW, RAF, DNG, etc.)
  try {
    const result = await decodeWithLibRaw(buffer)
    self.postMessage({ id, ...result }, [result.pixels.buffer])
    return
  } catch {
    // LibRaw failed — fall through to browser-native decoder
  }

  // Browser-native fallback (JPEG, PNG, WebP, some DNG)
  try {
    const result = await decodeWithBrowser(buffer, filename)
    self.postMessage({ id, ...result }, [result.pixels.buffer])
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message })
  }
}
