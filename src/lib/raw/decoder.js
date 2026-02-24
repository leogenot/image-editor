// RAW file decoder using LibRaw WASM in a Web Worker
// Falls back gracefully if WASM is unavailable

let worker = null
const pendingCallbacks = new Map()
let nextId = 0

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./rawWorker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const { id, pixels, width, height, error } = e.data
      const cb = pendingCallbacks.get(id)
      if (cb) {
        pendingCallbacks.delete(id)
        if (error) cb.reject(new Error(error))
        else cb.resolve({ pixels, width, height })
      }
    }
    worker.onerror = (e) => {
      console.error('RAW Worker error:', e)
    }
  }
  return worker
}

export async function decodeRaw(file) {
  const buffer = await file.arrayBuffer()
  const id = nextId++
  const w = getWorker()
  return new Promise((resolve, reject) => {
    pendingCallbacks.set(id, { resolve, reject })
    w.postMessage({ id, buffer, filename: file.name }, [buffer])
  })
}
