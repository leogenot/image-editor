import type { CurvePoint } from '../types'

// Catmull-Rom spline evaluation through sorted control points
// points: array of [x, y] pairs, sorted by x ascending, x and y in [0, 1]
// t: input x value in [0, 1]
// returns: output y value in [0, 1]
export function evalCurve(points: CurvePoint[], t: number): number {
  const n = points.length - 1
  if (n < 1) return t

  let seg = n - 1
  for (let i = 0; i < n; i++) {
    if (t <= points[i + 1][0]) {
      seg = i
      break
    }
  }

  const x0 = points[seg][0]
  const x1 = points[seg + 1][0]
  const lt = x1 === x0 ? 0 : (t - x0) / (x1 - x0)

  const p1 = points[seg]
  const p2 = points[seg + 1]
  // Reflected phantom points at boundaries keep the spline linear through collinear points
  const p0: CurvePoint = seg > 0 ? points[seg - 1] : [2*p1[0]-p2[0], 2*p1[1]-p2[1]]
  const p3: CurvePoint = seg < n - 1 ? points[seg + 2] : [2*p2[0]-p1[0], 2*p2[1]-p1[1]]

  const t2 = lt * lt
  const t3 = lt * lt * lt

  const v = (
    (-t3 + 2 * t2 - lt) * p0[1] * 0.5 +
    (3 * t3 - 5 * t2 + 2) * p1[1] * 0.5 +
    (-3 * t3 + 4 * t2 + lt) * p2[1] * 0.5 +
    (t3 - t2) * p3[1] * 0.5
  )

  return Math.max(0, Math.min(1, v))
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
