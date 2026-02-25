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
  data: Uint8Array | Uint16Array, width: number, height: number, colors: number, bits: number
): Float32Array {
  const pixels = new Float32Array(width * height * 4)
  const maxVal = bits === 16 ? 65535 : 255
  // For 8-bit: data is Uint8Array, each element is one channel byte (0-255)
  // For 16-bit: data is Uint16Array, each element is one channel value (0-65535)
  // Either way, element index = i * colors + channel
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

export async function decodeRaw(file: File): Promise<RawDecodeResult> {
  const buffer = await file.arrayBuffer()

  // Try LibRaw WASM for proper RAW support (ARW, CR2, NEF, RAF, DNG, etc.)
  try {
    const raw = new LibRaw()
    // Slice so LibRaw's internal worker transfer doesn't detach our buffer
    await raw.open(new Uint8Array(buffer.slice(0)), {
      useCameraWb: true,
      outputBps: 8,
      outputColor: 1,  // sRGB
    })
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
