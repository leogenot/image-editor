// RAW file decoder — runs entirely in a Web Worker (rawWorker.ts)
// LibRaw WASM and browser-native fallback both live in the worker.

import type { RawWorkerRequest, RawWorkerResponse, RawDecodeResult } from '../../types'

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
      // Reject all pending on unexpected worker crash
      for (const cb of pendingCallbacks.values()) {
        cb.reject(new Error('RAW decode worker crashed'))
      }
      pendingCallbacks.clear()
      worker = null
    }
  }
  return worker
}

export async function decodeRaw(file: File): Promise<RawDecodeResult> {
  const buffer = await file.arrayBuffer()
  const id = nextId++
  const w = getWorker()
  return new Promise((resolve, reject) => {
    pendingCallbacks.set(id, { resolve, reject })
    w.postMessage({ id, buffer, filename: file.name } as RawWorkerRequest, [buffer])
  })
}

/** Cancel any in-flight decode. Safe to call at any time. */
export function cancelDecode(): void {
  if (!worker) return
  worker.terminate()
  worker = null
  for (const cb of pendingCallbacks.values()) {
    cb.reject(new Error('cancelled'))
  }
  pendingCallbacks.clear()
}
