import { get, set, del, keys } from 'idb-keyval'

const MAX_SESSIONS = 20
const PREFIX = 'editor_session_'
const LAST_IMAGE_KEY = 'editor_last_image'

function serializeEdits(store) {
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
      rgb: store.curve.rgb.map(p => [...p]),
      r:   store.curve.r.map(p => [...p]),
      g:   store.curve.g.map(p => [...p]),
      b:   store.curve.b.map(p => [...p]),
    },
    detail: { ...store.detail },
    crop: { ...store.crop },
    filename: store.filename,
    savedAt: Date.now(),
  }
}

export async function saveLastImage(blob, isRaw, filename) {
  await set(LAST_IMAGE_KEY, { blob, isRaw, filename })
}

export async function loadLastImage() {
  return get(LAST_IMAGE_KEY)
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function saveSession(store, previewBlob) {
  const key = `${PREFIX}${Date.now()}_${store.filename}`
  const data = serializeEdits(store)
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
    // Sort by timestamp embedded in key (oldest first)
    allKeys.sort()
    const toDelete = allKeys.slice(0, allKeys.length - MAX_SESSIONS)
    await Promise.all(toDelete.map(k => del(k)))
  }
}

export async function loadSessions() {
  const allKeys = (await keys()).filter(k => String(k).startsWith(PREFIX))
  const sessions = await Promise.all(
    allKeys.map(k => get(k).then(v => ({ id: k, ...v })))
  )
  // Sort newest first
  return sessions
    .filter(s => s.savedAt)
    .sort((a, b) => b.savedAt - a.savedAt)
}

export async function deleteSession(id) {
  await del(id)
}
