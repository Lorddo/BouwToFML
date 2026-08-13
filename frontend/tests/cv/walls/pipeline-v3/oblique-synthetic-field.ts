/**
 * Synthetisch DT-veld voor de schuine-as specs: banden met dikte in een mask,
 * daarna een exacte euclidische distance transform. Geen OpenCV nodig.
 */
import type { RidgeField } from '@/cv/walls/rooms/pipeline-v3/engines/oblique'

export type SyntheticBand = {
  a: { x: number; y: number }
  b: { x: number; y: number }
  thicknessPx: number
}

function distToSegment(px: number, py: number, band: SyntheticBand): number {
  const dx = band.b.x - band.a.x
  const dy = band.b.y - band.a.y
  const len2 = dx * dx + dy * dy
  let t = len2 <= 0 ? 0 : ((px - band.a.x) * dx + (py - band.a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (band.a.x + t * dx), py - (band.a.y + t * dy))
}

/** Felzenszwalb 1D-transform, per as toegepast. */
function transform1d(src: Float64Array, n: number, dst: Float64Array): void {
  const INF = 1e20
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q += 1) {
    let s = (src[q] + q * q - (src[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k -= 1
      s = (src[q] + q * q - (src[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k += 1
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1
    dst[q] = (q - v[k]) * (q - v[k]) + src[v[k]]
  }
}

export function buildSyntheticField(params: {
  bands: SyntheticBand[]
  width: number
  height: number
  maxSearchPx?: number
  sampleStepPx?: number
}): RidgeField {
  const { bands, width, height } = params
  const INF = 1e20
  const grid = new Float64Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = bands.some((band) => distToSegment(x, y, band) <= band.thicknessPx / 2)
      grid[y * width + x] = inside ? INF : 0
    }
  }

  const col = new Float64Array(height)
  const colOut = new Float64Array(height)
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) col[y] = grid[y * width + x]
    transform1d(col, height, colOut)
    for (let y = 0; y < height; y += 1) grid[y * width + x] = colOut[y]
  }

  const row = new Float64Array(width)
  const rowOut = new Float64Array(width)
  const distanceMap = new Float32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) row[x] = grid[y * width + x]
    transform1d(row, width, rowOut)
    for (let x = 0; x < width; x += 1) distanceMap[y * width + x] = Math.sqrt(rowOut[x])
  }

  return {
    distanceMap,
    width,
    height,
    maxSearchPx: params.maxSearchPx ?? 120,
    sampleStepPx: params.sampleStepPx ?? 4,
  }
}
