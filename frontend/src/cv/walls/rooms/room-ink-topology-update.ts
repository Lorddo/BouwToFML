import type { RoomRasterClass } from './room-ink-classify'
import type { InkDiffBounds } from './room-ink-symmetric'
import { carveAddedInk } from './room-ink-symmetric'

const CARDINAL_DX = [0, 1, 0, -1] as const
const CARDINAL_DY = [-1, 0, 1, 0] as const

export interface DrawnInkTopologyUpdate {
  rawLabelsData: Int32Array
  /** Bronlabel → alle resulterende component-labels (incl. grootste = bron-id). */
  splitMap: Map<number, number[]>
  carvedPx: number
  splitCount: number
}

function maxLabel(labelsData: Int32Array): number {
  let max = 0
  for (const value of labelsData) {
    if (value > max) max = value
  }
  return max
}

/** Zet muur-inkt (donker in B/W) op label 0 — snijdt door bestaande vlakken. */
export function carveWallInkIntoLabels(params: {
  labelsData: Int32Array
  wallInkData: Uint8Array
  inkThreshold?: number
}): number {
  return carveAddedInk(params)
}

/**
 * Zelfde face-label in meerdere niet-verbonden witte gebieden → nieuwe labels voor kleinere stukken.
 * Grootste component behoudt het oorspronkelijke label.
 */
export function splitDisconnectedFaceLabels(
  labelsData: Int32Array,
  width: number,
  height: number,
  options?: {
    /** Alleen deze labels splitsen (sneller bij lokale inkt-edits). */
    labelsToSplit?: ReadonlySet<number>
    /** Beperk seed-scan tot bounds; BFS volgt nog het hele component. */
    seedBounds?: InkDiffBounds | null
  },
): { splitMap: Map<number, number[]>; splitCount: number } {
  const splitMap = new Map<number, number[]>()
  let splitCount = 0
  let nextLabel = maxLabel(labelsData) + 1

  const labelsPresent = new Set<number>()
  if (options?.labelsToSplit) {
    for (const label of options.labelsToSplit) {
      if (label > 0) labelsPresent.add(label)
    }
  } else if (options?.seedBounds) {
    for (let y = options.seedBounds.y0; y <= options.seedBounds.y1; y += 1) {
      for (let x = options.seedBounds.x0; x <= options.seedBounds.x1; x += 1) {
        const label = labelsData[y * width + x] ?? 0
        if (label > 0) labelsPresent.add(label)
      }
    }
  } else {
    for (const value of labelsData) {
      if (value > 0) labelsPresent.add(value)
    }
  }

  const visited = new Uint8Array(labelsData.length)
  const seedBounds = options?.seedBounds

  for (const label of labelsPresent) {
    const components: number[][] = []

    const yStart = seedBounds?.y0 ?? 0
    const yEnd = seedBounds?.y1 ?? height - 1
    const xStart = seedBounds?.x0 ?? 0
    const xEnd = seedBounds?.x1 ?? width - 1

    for (let y = yStart; y <= yEnd; y += 1) {
      for (let x = xStart; x <= xEnd; x += 1) {
        const idx = y * width + x
        if (labelsData[idx] !== label || visited[idx]) continue

        const pixels: number[] = []
        const stack = [idx]
        visited[idx] = 1

        while (stack.length > 0) {
          const current = stack.pop()!
          pixels.push(current)
          const cx = current % width
          const cy = (current / width) | 0

          for (let dir = 0; dir < 4; dir += 1) {
            const nx = cx + CARDINAL_DX[dir]
            const ny = cy + CARDINAL_DY[dir]
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const neighbor = ny * width + nx
            if (labelsData[neighbor] !== label || visited[neighbor]) continue
            visited[neighbor] = 1
            stack.push(neighbor)
          }
        }

        components.push(pixels)
      }
    }

    if (components.length <= 1) continue

    components.sort((a, b) => b.length - a.length)
    const descendantLabels = [label]

    for (let c = 1; c < components.length; c += 1) {
      const newLabel = nextLabel
      nextLabel += 1
      for (const idx of components[c]) {
        labelsData[idx] = newLabel
      }
      descendantLabels.push(newLabel)
      splitCount += 1
    }

    splitMap.set(label, descendantLabels)
  }

  return { splitMap, splitCount }
}

/** Classificatie + overrides erven op gesplitste child-labels. */
function migrateClassificationAfterLabelSplits(params: {
  classificationByLabel: Map<number, RoomRasterClass>
  faceOverrides: Map<number, RoomRasterClass>
  pinnedRoots: Set<number>
  splitMap: Map<number, number[]>
}): void {
  for (const [sourceLabel, descendants] of params.splitMap.entries()) {
    const inheritedClass =
      params.faceOverrides.get(sourceLabel) ?? params.classificationByLabel.get(sourceLabel)
    if (!inheritedClass) continue

    const hadOverride = params.faceOverrides.has(sourceLabel)
    const wasPinned = params.pinnedRoots.has(sourceLabel)

    for (const label of descendants) {
      params.classificationByLabel.set(label, inheritedClass)
      if (hadOverride) {
        params.faceOverrides.set(label, inheritedClass)
      }
      if (wasPinned) {
        params.pinnedRoots.add(label)
      }
    }
  }
}

/** Verwerk getekende/gewijzigde muur-inkt op opgeslagen CC-topologie (alleen labels). */
export function applyDrawnInkToStoredTopology(params: {
  rawLabelsData: Int32Array
  wallInkData: Uint8Array
  width: number
  height: number
  inkThreshold?: number
}): DrawnInkTopologyUpdate {
  const labelsData = new Int32Array(params.rawLabelsData)
  const carvedPx = carveWallInkIntoLabels({
    labelsData,
    wallInkData: params.wallInkData,
    inkThreshold: params.inkThreshold,
  })
  const { splitMap, splitCount } = splitDisconnectedFaceLabels(labelsData, params.width, params.height)

  return { rawLabelsData: labelsData, splitMap, carvedPx, splitCount }
}
