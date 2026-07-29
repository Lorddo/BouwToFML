import { splitDisconnectedFaceLabels } from './room-ink-topology-update'

export interface InkDiffBounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface SymmetricInkDiffResult {
  rawLabelsData: Int32Array
  carvedPx: number
  filledPx: number
  splitCount: number
  diffPx: number
}

const CARDINAL_DX = [0, 1, 0, -1] as const
const CARDINAL_DY = [-1, 0, 1, 0] as const

export function isWallInkPixel(bwValue: number, inkThreshold = 127): boolean {
  return bwValue < inkThreshold
}

export function carveAddedInk(params: {
  labelsData: Int32Array
  wallInkData: Uint8Array
  inkThreshold?: number
  width?: number
  bounds?: InkDiffBounds | null
}): number {
  const { labelsData, wallInkData, inkThreshold = 127, bounds } = params
  let carvedPx = 0

  if (bounds && params.width != null) {
    const width = params.width
    for (let y = bounds.y0; y <= bounds.y1; y += 1) {
      for (let x = bounds.x0; x <= bounds.x1; x += 1) {
        const i = y * width + x
        if (labelsData[i] > 0 && isWallInkPixel(wallInkData[i] ?? 255, inkThreshold)) {
          labelsData[i] = 0
          carvedPx += 1
        }
      }
    }
    return carvedPx
  }

  for (let i = 0; i < labelsData.length; i += 1) {
    if (labelsData[i] > 0 && isWallInkPixel(wallInkData[i] ?? 255, inkThreshold)) {
      labelsData[i] = 0
      carvedPx += 1
    }
  }
  return carvedPx
}

export function computeInkDiffMask(oldBwData: Uint8Array, newBwData: Uint8Array): Uint8Array {
  const length = Math.min(oldBwData.length, newBwData.length)
  const diffMask = new Uint8Array(length)
  for (let i = 0; i < length; i += 1) {
    diffMask[i] = oldBwData[i] === newBwData[i] ? 0 : 1
  }
  return diffMask
}

export function expandDiffBounds(
  bounds: InkDiffBounds,
  marginPx: number,
  width: number,
  height: number,
): InkDiffBounds {
  const margin = Math.max(0, Math.round(marginPx))
  return {
    x0: Math.max(0, bounds.x0 - margin),
    y0: Math.max(0, bounds.y0 - margin),
    x1: Math.min(width - 1, bounds.x1 + margin),
    y1: Math.min(height - 1, bounds.y1 + margin),
  }
}

export function collectLabelsInBounds(params: {
  labelsData: Int32Array
  width: number
  bounds: InkDiffBounds
}): Set<number> {
  const { labelsData, width, bounds } = params
  const labels = new Set<number>()
  for (let y = bounds.y0; y <= bounds.y1; y += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      const label = labelsData[y * width + x] ?? 0
      if (label > 0) labels.add(label)
    }
  }
  return labels
}

export function computeDiffPatchBounds(params: {
  diffMask: Uint8Array
  width: number
  height: number
  marginPx?: number
}): InkDiffBounds | null {
  const { diffMask, width, height } = params
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!diffMask[y * width + x]) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0 || maxY < 0) return null
  const margin = Math.max(0, Math.round(params.marginPx ?? 0))
  return {
    x0: Math.max(0, minX - margin),
    y0: Math.max(0, minY - margin),
    x1: Math.min(width - 1, maxX + margin),
    y1: Math.min(height - 1, maxY + margin),
  }
}

function mergeLabelInto(params: {
  labelsData: Int32Array
  fromLabel: number
  toLabel: number
}): void {
  const { labelsData, fromLabel, toLabel } = params
  if (fromLabel <= 0 || toLabel <= 0 || fromLabel === toLabel) return
  for (let i = 0; i < labelsData.length; i += 1) {
    if (labelsData[i] === fromLabel) {
      labelsData[i] = toLabel
    }
  }
}

function fillRemovedInk(params: {
  labelsData: Int32Array
  oldWallBwData: Uint8Array
  newWallBwData: Uint8Array
  width: number
  height: number
  inkThreshold?: number
  bounds?: InkDiffBounds | null
}): number {
  const {
    labelsData,
    oldWallBwData,
    newWallBwData,
    width,
    height,
    inkThreshold = 127,
    bounds,
  } = params
  const visited = new Uint8Array(labelsData.length)
  let filledPx = 0

  const removedInkAt = (idx: number) =>
    isWallInkPixel(oldWallBwData[idx] ?? 255, inkThreshold) &&
    !isWallInkPixel(newWallBwData[idx] ?? 255, inkThreshold)

  const iterateIndices = function* () {
    if (!bounds) {
      for (let i = 0; i < labelsData.length; i += 1) yield i
      return
    }
    for (let y = bounds.y0; y <= bounds.y1; y += 1) {
      for (let x = bounds.x0; x <= bounds.x1; x += 1) {
        yield y * width + x
      }
    }
  }

  for (const i of iterateIndices()) {
    if (visited[i] || labelsData[i] !== 0 || !removedInkAt(i)) continue
    const queue = [i]
    const component: number[] = []
    const neighborLabels = new Set<number>()
    visited[i] = 1

    while (queue.length > 0) {
      const current = queue.pop()!
      component.push(current)
      const cx = current % width
      const cy = (current / width) | 0

      for (let dir = 0; dir < 4; dir += 1) {
        const nx = cx + CARDINAL_DX[dir]
        const ny = cy + CARDINAL_DY[dir]
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const neighbor = ny * width + nx
        const neighborLabel = labelsData[neighbor] ?? 0
        if (neighborLabel > 0) {
          neighborLabels.add(neighborLabel)
          continue
        }
        if (visited[neighbor]) continue
        if (!removedInkAt(neighbor)) continue
        visited[neighbor] = 1
        queue.push(neighbor)
      }
    }

    if (neighborLabels.size === 0) continue
    const [targetLabel] = neighborLabels
    for (const idx of component) {
      labelsData[idx] = targetLabel
      filledPx += 1
    }

    for (const label of neighborLabels) {
      if (label === targetLabel) continue
      mergeLabelInto({ labelsData, fromLabel: label, toLabel: targetLabel })
    }
  }

  return filledPx
}

/** Topologie-only: carve/fill/split zonder classificatie-mutaties. */
export function applySymmetricInkDiff(params: {
  rawLabelsData: Int32Array
  oldWallBwData: Uint8Array
  newWallBwData: Uint8Array
  width: number
  height: number
  inkThreshold?: number
  /** Beperk carve/fill-seeds tot diff-regio (sneller op grote tekeningen). */
  bounds?: InkDiffBounds | null
}): SymmetricInkDiffResult {
  const labelsData = new Int32Array(params.rawLabelsData)
  const carvedPx = carveAddedInk({
    labelsData,
    wallInkData: params.newWallBwData,
    inkThreshold: params.inkThreshold,
    width: params.width,
    bounds: params.bounds,
  })
  const filledPx = fillRemovedInk({
    labelsData,
    oldWallBwData: params.oldWallBwData,
    newWallBwData: params.newWallBwData,
    width: params.width,
    height: params.height,
    inkThreshold: params.inkThreshold,
    bounds: params.bounds,
  })

  const labelsInBounds =
    params.bounds != null
      ? collectLabelsInBounds({
          labelsData,
          width: params.width,
          bounds: params.bounds,
        })
      : undefined
  const { splitCount } = splitDisconnectedFaceLabels(labelsData, params.width, params.height, {
    labelsToSplit: labelsInBounds,
    seedBounds: params.bounds,
  })

  let diffPx = 0
  if (params.bounds) {
    const diffMask = computeInkDiffMask(params.oldWallBwData, params.newWallBwData)
    for (let y = params.bounds.y0; y <= params.bounds.y1; y += 1) {
      for (let x = params.bounds.x0; x <= params.bounds.x1; x += 1) {
        if (diffMask[y * params.width + x]) diffPx += 1
      }
    }
  } else {
    const diffMask = computeInkDiffMask(params.oldWallBwData, params.newWallBwData)
    for (const v of diffMask) {
      if (v) diffPx += 1
    }
  }

  return {
    rawLabelsData: labelsData,
    carvedPx,
    filledPx,
    splitCount,
    diffPx,
  }
}
