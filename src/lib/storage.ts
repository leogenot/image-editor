import { get, set, del, keys } from 'idb-keyval'
import type { EditorStore, SessionData } from '../types'

const MAX_SESSIONS = 20
const PREFIX = 'editor_session_'
const LAST_IMAGE_KEY = 'editor_last_image'

interface LastImageEntry {
  blob: Blob
  isRaw: boolean
  filename: string
}

function serializeEdits(store: EditorStore): SessionData {
  return {
    light: { ...store.light },
    color: {
      temp: store.color.temp,
      tint: store.color.tint,
      vibrance: store.color.vibrance,
      saturation: store.color.saturation,
      hsl: JSON.parse(JSON.stringify(store.color.hsl)),
    },
    curve: {
      channel: store.curve.channel,
      rgb: store.curve.rgb.map(p => [...p] as [number, number]),
      r:   store.curve.r.map(p => [...p] as [number, number]),
      g:   store.curve.g.map(p => [...p] as [number, number]),
      b:   store.curve.b.map(p => [...p] as [number, number]),
    },
    detail: { ...store.detail },
    crop: { ...store.crop },
    frame: { ...store.frame },
    filename: store.filename,
    savedAt: Date.now(),
  }
}

export async function saveLastImage(blob: Blob, isRaw: boolean, filename: string): Promise<void> {
  await set(LAST_IMAGE_KEY, { blob, isRaw, filename })
}

export async function loadLastImage(): Promise<LastImageEntry | undefined> {
  return get<LastImageEntry>(LAST_IMAGE_KEY)
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function saveSession(store: EditorStore, previewBlob?: Blob): Promise<void> {
  const key = `${PREFIX}${Date.now()}_${store.filename}`
  const data: SessionData & { preview?: string } = serializeEdits(store)
  if (previewBlob) {
    try {
      data.preview = await blobToBase64(previewBlob)
    } catch {
      // Preview is optional — don't fail the save
    }
  }
  await set(key, data)

  // Prune oldest sessions beyond MAX_SESSIONS
  const allKeys = (await keys()).filter(k => String(k).startsWith(PREFIX))
  if (allKeys.length > MAX_SESSIONS) {
    allKeys.sort()
    const toDelete = allKeys.slice(0, allKeys.length - MAX_SESSIONS)
    await Promise.all(toDelete.map(k => del(k)))
  }
}

export async function loadSessions(): Promise<Array<SessionData & { id: IDBValidKey }>> {
  const allKeys = (await keys()).filter(k => String(k).startsWith(PREFIX))
  const sessions = await Promise.all(
    allKeys.map(k => get<SessionData>(k).then(v => ({ id: k, ...v! })))
  )
  return sessions
    .filter(s => s.savedAt)
    .sort((a, b) => b.savedAt - a.savedAt)
}

export async function deleteSession(id: IDBValidKey): Promise<void> {
  await del(id)
}

export async function clearSessions(): Promise<void> {
  const allKeys = (await keys()).filter(k => String(k).startsWith(PREFIX))
  await Promise.all(allKeys.map(k => del(k)))
}
