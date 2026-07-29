import type { InkDiffBounds } from './room-ink-symmetric'

const CARDINAL_DX = [0, 1, 0, -1] as const
const CARDINAL_DY = [-1, 0, 1, 0] as const

export interface TopologyPatchResult {
  rawLabelsData: Int32Array
  rewrittenPx: number
  createdLabels: number
}

interface ComponentRegion {
  pixels: number[]
  overlaps: Map<number, number>
  boundaryNeighbors: Map<number, number>
}

function isWhiteFloorPixel(value: number, inkThreshold = 127): boolean {
  return value >= inkThreshold
}

function nextLabelSeed(labelsData: Int32Array): number {
  let max = 0
  for (const label of labelsData) {
    if (label > max) max = label
  }
  return max + 1
}

function pickDominantLabel(region: ComponentRegion): number | null {
  let bestLabel: number | null = null
  let bestCount = -1
  for (const [label, count] of region.overlaps.entries()) {
    if (label <= 0) continue
    if (count > bestCount) {
      bestCount = count
      bestLabel = label
    }
  }
  if (bestLabel != null) return bestLabel
  for (const [label, count] of region.boundaryNeighbors.entries()) {
    if (label <= 0) continue
    if (count > bestCount) {
      bestCount = count
      bestLabel = label
    }
  }
  return bestLabel
}

/** Herlabel witte CC's in diff-bounds — alleen topologie, geen classificatie. */
export function patchTopologyLabelsInDiffRegion(params: {
  rawLabelsData: Int32Array
  newWallBwData: Uint8Array
  width: number
  height: number
  bounds: InkDiffBounds
  inkThreshold?: number
}): TopologyPatchResult {
  const { rawLabelsData, newWallBwData, width, height, bounds, inkThreshold = 127 } = params
  const oldLabels = new Int32Array(rawLabelsData)
  const labelsData = new Int32Array(rawLabelsData)
  const visited = new Uint8Array(width * height)
  const regions: ComponentRegion[] = []

  const insideBounds = (x: number, y: number) =>
    x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1

  for (let y = bounds.y0; y <= bounds.y1; y += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      const start = y * width + x
      if (visited[start]) continue
      if (!isWhiteFloorPixel(newWallBwData[start] ?? 0, inkThreshold)) continue

      const queue = [start]
      visited[start] = 1
      const pixels: number[] = []
      const overlaps = new Map<number, number>()
      const boundaryNeighbors = new Map<number, number>()

      while (queue.length > 0) {
        const current = queue.pop()!
        pixels.push(current)
        const oldLabel = oldLabels[current] ?? 0
        if (oldLabel > 0) {
          overlaps.set(oldLabel, (overlaps.get(oldLabel) ?? 0) + 1)
        }

        const cx = current % width
        const cy = (current / width) | 0
        for (let dir = 0; dir < 4; dir += 1) {
          const nx = cx + CARDINAL_DX[dir]
          const ny = cy + CARDINAL_DY[dir]
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const neighbor = ny * width + nx
          if (!insideBounds(nx, ny)) {
            const outsideLabel = oldLabels[neighbor] ?? 0
            if (outsideLabel > 0) {
              boundaryNeighbors.set(outsideLabel, (boundaryNeighbors.get(outsideLabel) ?? 0) + 1)
            }
            continue
          }
          if (visited[neighbor]) continue
          if (!isWhiteFloorPixel(newWallBwData[neighbor] ?? 0, inkThreshold)) continue
          visited[neighbor] = 1
          queue.push(neighbor)
        }
      }

      regions.push({ pixels, overlaps, boundaryNeighbors })
    }
  }

  for (let y = bounds.y0; y <= bounds.y1; y += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      labelsData[y * width + x] = 0
    }
  }

  let nextLabel = nextLabelSeed(labelsData)
  let rewrittenPx = 0
  let createdLabels = 0
  const reusedLabels = new Set<number>()

  for (const region of regions) {
    const dominant = pickDominantLabel(region)
    let assignedLabel = dominant
    if (assignedLabel == null || reusedLabels.has(assignedLabel)) {
      assignedLabel = nextLabel
      nextLabel += 1
      createdLabels += 1
    }
    reusedLabels.add(assignedLabel)

    for (const idx of region.pixels) {
      labelsData[idx] = assignedLabel
      rewrittenPx += 1
    }
  }

  return { rawLabelsData: labelsData, rewrittenPx, createdLabels }
}

/** @deprecated Gebruik patchTopologyLabelsInDiffRegion — classificatie hoort in ink-process. */
export function patchTopologyInDiffRegion(params: {
  rawLabelsData: Int32Array
  newWallBwData: Uint8Array
  width: number
  height: number
  bounds: InkDiffBounds
  inkThreshold?: number
}): TopologyPatchResult {
  return patchTopologyLabelsInDiffRegion(params)
}
