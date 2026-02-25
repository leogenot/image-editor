// RAW file decoder using LibRaw WASM in a Web Worker
// Falls back gracefully if WASM is unavailable

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
    const msg: RawWorkerRequest = { id, buffer, filename: file.name }
    w.postMessage(msg, [buffer])
  })
}
