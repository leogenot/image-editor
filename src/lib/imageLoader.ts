import type { ImageLoadResult } from '../types'

const RAW_EXTENSIONS = new Set([
  'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2',
  'dng', 'orf', 'rw2', 'pef', 'raf', 'raw', 'rwl',
  '3fr', 'mef', 'mos', 'rw2',
])

export function isRawFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return RAW_EXTENSIONS.has(ext)
}

export function isStandardImage(file: File): boolean {
  return file.type.startsWith('image/') && !isRawFile(file)
}

export async function loadStandardImage(file: File): Promise<ImageLoadResult> {
  const bitmap = await createImageBitmap(file, {
    colorSpaceConversion: 'none',
  })
  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    isRaw: false,
  }
}
