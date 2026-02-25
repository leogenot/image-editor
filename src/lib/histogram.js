const MAX_PIXELS = 500_000

export async function computeHistogramFromBitmap(bitmap) {
  const total = bitmap.width * bitmap.height
  const scale = total > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / total) : 1
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const r = new Array(256).fill(0)
  const g = new Array(256).fill(0)
  const b = new Array(256).fill(0)
  for (let i = 0; i < data.length; i += 4) {
    r[data[i]]++
    g[data[i + 1]]++
    b[data[i + 2]]++
  }
  return { r, g, b }
}

export function computeHistogramFromRaw(pixels) {
  const total = pixels.length / 4
  const stride = Math.max(1, Math.floor(total / MAX_PIXELS))
  const r = new Array(256).fill(0)
  const g = new Array(256).fill(0)
  const b = new Array(256).fill(0)
  for (let i = 0; i < pixels.length; i += 4 * stride) {
    r[_clamp(Math.round(_linearToSrgb(pixels[i]) * 255))]++
    g[_clamp(Math.round(_linearToSrgb(pixels[i + 1]) * 255))]++
    b[_clamp(Math.round(_linearToSrgb(pixels[i + 2]) * 255))]++
  }
  return { r, g, b }
}

function _clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v }

function _linearToSrgb(v) {
  if (v <= 0) return 0
  if (v >= 1) return 1
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}
