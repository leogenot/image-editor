import type { CurvePoint } from '../types'

// PCHIP tangent slope at point p1, using neighbours p0 and p2.
// Returns 0 if the secant slopes have opposite signs (monotonicity condition).
function pchipTangent(p0: CurvePoint, p1: CurvePoint, p2: CurvePoint): number {
  const h0 = p1[0] - p0[0]
  const h1 = p2[0] - p1[0]
  if (h0 <= 0 || h1 <= 0) return 0
  const d0 = (p1[1] - p0[1]) / h0
  const d1 = (p2[1] - p1[1]) / h1
  if (d0 * d1 <= 0) return 0
  // Weighted harmonic mean (Fritsch-Carlson)
  const w0 = 2 * h1 + h0
  const w1 = h1 + 2 * h0
  return (w0 + w1) / (w0 / d0 + w1 / d1)
}

// Monotone piecewise cubic Hermite interpolation (PCHIP).
// No overshoot between control points regardless of their spacing.
export function evalCurve(points: CurvePoint[], t: number): number {
  const n = points.length
  if (n < 2) return t
  if (t <= points[0][0]) return points[0][1]
  if (t >= points[n - 1][0]) return points[n - 1][1]

  // Find segment
  let seg = n - 2
  for (let i = 0; i < n - 1; i++) {
    if (t < points[i + 1][0]) { seg = i; break }
  }

  const x0 = points[seg][0],     y0 = points[seg][1]
  const x1 = points[seg + 1][0], y1 = points[seg + 1][1]
  const h = x1 - x0
  if (h < 1e-10) return y0

  const dk = (y1 - y0) / h

  // Endpoint tangents fall back to the local secant slope (linear extension)
  const m0 = seg === 0
    ? dk
    : pchipTangent(points[seg - 1], points[seg], points[seg + 1])
  const m1 = seg === n - 2
    ? dk
    : pchipTangent(points[seg], points[seg + 1], points[seg + 2])

  const lt = (t - x0) / h
  const t2 = lt * lt
  const t3 = lt * t2

  return Math.max(0, Math.min(1,
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + lt) * h * m0 +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * h * m1,
  ))
}

// Build SVG polyline path string from curve control points
// width, height: SVG viewport dimensions
export function buildCurvePath(points: CurvePoint[], width: number, height: number): string {
  const steps = 128
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const v = evalCurve(points, t)
    pts.push(`${(t * width).toFixed(1)},${((1 - v) * height).toFixed(1)}`)
  }
  return 'M ' + pts.join(' L ')
}
