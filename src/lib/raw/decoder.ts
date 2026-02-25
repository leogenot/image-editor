// RAW file decoder using LibRaw WASM
// Falls back to browser-native worker for JPEG/PNG/WebP/DNG

import type { RawWorkerRequest, RawWorkerResponse, RawDecodeResult } from '../../types'
import LibRaw from 'libraw-wasm'

let worker: Worker | null = null
const pendingCallbacks = new Map<number, {
  resolve: (result: RawDecodeResult) => void
  reject: (err: Error) => void
}>()
let nextId = 0

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./rawWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<RawWorkerResponse>) => {
      const { id, pixels, width, height, error } = e.data
      const cb = pendingCallbacks.get(id)
      if (cb) {
        pendingCallbacks.delete(id)
        if (error) cb.reject(new Error(error))
        else cb.resolve({ pixels: pixels!, width: width!, height: height! })
      }
    }
    worker.onerror = (e) => {
      console.error('RAW Worker error:', e)
    }
  }
  return worker
}

function rawDataToFloat32Linear(
  data: Uint8Array, width: number, height: number, colors: number, bits: number
): Float32Array {
  const pixels = new Float32Array(width * height * 4)
  const maxVal = bits === 16 ? 65535 : 255
  for (let i = 0; i < width * height; i++) {
    const d = i * 4
    let r: number, g: number, b: number
    if (bits === 16) {
      const s = i * colors * 2
      r = (data[s] | (data[s + 1] << 8)) / maxVal
      g = (data[s + 2] | (data[s + 3] << 8)) / maxVal
      b = (data[s + 4] | (data[s + 5] << 8)) / maxVal
    } else {
      const s = i * colors
      r = data[s] / maxVal
      g = data[s + 1] / maxVal
      b = data[s + 2] / maxVal
    }
    // sRGB → linear (renderer expects linear Float32 when u_isFloat=true)
    pixels[d]     = Math.pow(r, 2.2)
    pixels[d + 1] = Math.pow(g, 2.2)
    pixels[d + 2] = Math.pow(b, 2.2)
    pixels[d + 3] = 1.0
  }
  return pixels
}

export async function decodeRaw(file: File): Promise<RawDecodeResult> {
  const buffer = await file.arrayBuffer()

  // Try LibRaw WASM for proper RAW support (ARW, CR2, NEF, RAF, DNG, etc.)
  try {
    const raw = new LibRaw()
    // Slice so LibRaw's internal worker transfer doesn't detach our buffer
    await raw.open(new Uint8Array(buffer.slice(0)))
    const { data, width, height, colors, bits } = await raw.imageData()
    return { pixels: rawDataToFloat32Linear(data, width, height, colors, bits), width, height }
  } catch {
    // Fall through to browser-native worker (JPEG, PNG, WebP)
  }

  const id = nextId++
  const w = getWorker()
  return new Promise((resolve, reject) => {
    pendingCallbacks.set(id, { resolve, reject })
    w.postMessage({ id, buffer, filename: file.name } as RawWorkerRequest, [buffer])
  })
}
