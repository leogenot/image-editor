import { get, set, del, keys } from 'idb-keyval'
import type { EditorStore, SessionData } from '../types'

// ── Per-image project storage ────────────────────────────────────────────────

const PROJECT_PREFIX = 'editor_project_'
const MAX_PROJECTS = 30

export interface ProjectMeta {
  id: string
  filename: string
  isRaw: boolean
  preview?: string      // base64 data URL — thumbnail
  createdAt: number
  updatedAt: number
  editState?: SessionData
}

export interface ProjectData extends ProjectMeta {
  imageBlob: Blob
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
    lens: { ...store.lens },
    filename: store.filename,
    savedAt: Date.now(),
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function createProject(imageBlob: Blob, isRaw: boolean, filename: string): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()
  await set(`${PROJECT_PREFIX}${id}`, { id, imageBlob, isRaw, filename, createdAt: now, updatedAt: now } satisfies ProjectData)

  // Prune oldest beyond MAX_PROJECTS
  const allKeys = (await keys()).filter(k => String(k).startsWith(PROJECT_PREFIX))
  if (allKeys.length > MAX_PROJECTS) {
    const metas = await Promise.all(
      allKeys.map(k => get<Pick<ProjectData, 'id' | 'updatedAt'>>(k as string).then(v => v ? { key: k, updatedAt: v.updatedAt ?? 0 } : null))
    )
    const sorted = metas.filter(Boolean).sort((a, b) => a!.updatedAt - b!.updatedAt)
    await Promise.all(sorted.slice(0, sorted.length - MAX_PROJECTS).map(m => del(m!.key)))
  }

  return id
}

export async function updateProject(id: string, store: EditorStore, previewBlob?: Blob): Promise<void> {
  const key = `${PROJECT_PREFIX}${id}`
  const existing = await get<ProjectData>(key)
  if (!existing) return

  const editState = serializeEdits(store)
  const updated: ProjectData = { ...existing, editState, updatedAt: Date.now() }

  if (previewBlob) {
    try { updated.preview = await blobToBase64(previewBlob) } catch { /* optional */ }
  }

  await set(key, updated)
}

export async function loadProjects(): Promise<ProjectMeta[]> {
  const allKeys = (await keys()).filter(k => String(k).startsWith(PROJECT_PREFIX))
  const projects = await Promise.all(
    allKeys.map(k => get<ProjectData>(k as string).then(v => {
      if (!v) return null
      const { imageBlob: _blob, ...meta } = v
      return meta as ProjectMeta
    }))
  )
  return projects
    .filter((p): p is ProjectMeta => p !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadProject(id: string): Promise<ProjectData | undefined> {
  return get<ProjectData>(`${PROJECT_PREFIX}${id}`)
}

export async function deleteProject(id: string): Promise<void> {
  await del(`${PROJECT_PREFIX}${id}`)
}

export async function clearAllProjects(): Promise<void> {
  const all = await keys()
  const projectKeys = all.filter(k => typeof k === 'string' && k.startsWith(PROJECT_PREFIX))
  await Promise.all(projectKeys.map(k => del(k)))
}

// ── Legacy helpers (kept for backwards compat, no longer actively used) ───────

export async function saveLastImage(): Promise<void> { /* no-op */ }
export async function loadLastImage(): Promise<undefined> { return undefined }
export async function saveSession(): Promise<void> { /* no-op */ }
export async function loadSessions(): Promise<[]> { return [] }
export async function deleteSession(): Promise<void> { /* no-op */ }
export async function clearSessions(): Promise<void> { /* no-op */ }
