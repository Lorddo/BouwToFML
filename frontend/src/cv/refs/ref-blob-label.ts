import type { RefBBox, RefPoint } from './types'

const INK_THRESHOLD = 128

export type InkBlob = {
  label: number
  areaPx: number
  bbox: RefBBox
  centroid: RefPoint
}

export type LabelInkResult = {
  labels: Int32Array
  blobs: InkBlob[]
  width: number
  height: number
}

export function isInk(v: number): boolean {
  return v < INK_THRESHOLD
}

/** 8-connected ink components (zwarte inkt). */
export function labelInkComponents(
  data: Uint8Array,
  width: number,
  height: number,
): LabelInkResult {
  const labels = new Int32Array(width * height)
  const blobs: InkBlob[] = []
  let nextLabel = 1

  const idx = (x: number, y: number) => y * width + x

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = idx(x, y)
      if (labels[i] !== 0 || !isInk(data[i] ?? 255)) continue

      const label = nextLabel
      nextLabel += 1
      let area = 0
      let sumX = 0
      let sumY = 0
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y

      const stack: Array<{ x: number; y: number }> = [{ x, y }]
      labels[i] = label

      while (stack.length > 0) {
        const cur = stack.pop()!
        area += 1
        sumX += cur.x
        sumY += cur.y
        if (cur.x < minX) minX = cur.x
        if (cur.x > maxX) maxX = cur.x
        if (cur.y < minY) minY = cur.y
        if (cur.y > maxY) maxY = cur.y

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue
            const nx = cur.x + dx
            const ny = cur.y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const ni = idx(nx, ny)
            if (labels[ni] !== 0 || !isInk(data[ni] ?? 255)) continue
            labels[ni] = label
            stack.push({ x: nx, y: ny })
          }
        }
      }

      blobs.push({
        label,
        areaPx: area,
        bbox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
        centroid: { x: sumX / area, y: sumY / area },
      })
    }
  }

  return { labels, blobs, width, height }
}

export function filterSignificantBlobs(
  blobs: InkBlob[],
  cropArea: number,
  options?: { minAreaPx?: number; minRatioOfLargest?: number },
): InkBlob[] {
  if (blobs.length === 0) return []
  const minAreaPx = options?.minAreaPx ?? Math.max(12, Math.round(cropArea * 0.002))
  const minRatio = options?.minRatioOfLargest ?? 0.08
  const largest = Math.max(...blobs.map((b) => b.areaPx))
  return blobs
    .filter((b) => b.areaPx >= minAreaPx && b.areaPx >= largest * minRatio)
    .sort((a, b) => b.areaPx - a.areaPx)
}

export type AxisSpan = { start: number; end: number }

/** Vind aaneengesloten occupied spans; gaps ertussen splitsen units. */
export function spansFromOccupancy(occ: Uint8Array, minGapPx = 3, minSpanPx = 4): AxisSpan[] {
  const spans: AxisSpan[] = []
  let start: number | null = null
  for (let i = 0; i < occ.length; i += 1) {
    if (occ[i] === 1) {
      if (start === null) start = i
      continue
    }
    if (start !== null) {
      spans.push({ start, end: i - 1 })
      start = null
    }
  }
  if (start !== null) spans.push({ start, end: occ.length - 1 })

  const merged: AxisSpan[] = []
  for (const span of spans) {
    if (span.end - span.start + 1 < minSpanPx) continue
    const prev = merged[merged.length - 1]
    if (prev && span.start - prev.end - 1 < minGapPx) {
      prev.end = span.end
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}
