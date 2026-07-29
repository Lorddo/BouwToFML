import { resolveMergedLabel } from './room-raster-merge'

function ensureNode(adjacency: Map<number, Set<number>>, root: number): void {
  if (!adjacency.has(root)) adjacency.set(root, new Set())
}

function connect(adjacency: Map<number, Set<number>>, a: number, b: number): void {
  if (a === b) return
  ensureNode(adjacency, a)
  ensureNode(adjacency, b)
  adjacency.get(a)!.add(b)
  adjacency.get(b)!.add(a)
}

/**
 * 8-connected label adjacency over a parentMap-resolved label raster.
 * Shared by floor dual (white/ink) and door Stage-1 cluster rebuild.
 */
export function buildLabelAdjacency(params: {
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
}): Map<number, Set<number>> {
  const { labelsData, width, height, parentMap } = params
  const adjacency = new Map<number, Set<number>>()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x
      const label = labelsData[idx] ?? 0
      if (label <= 0) continue
      const root = resolveMergedLabel(label, parentMap)
      ensureNode(adjacency, root)
      const hasRight = x + 1 < width
      const hasDown = y + 1 < height
      if (hasRight) {
        const rightLabel = labelsData[idx + 1] ?? 0
        if (rightLabel > 0) {
          connect(adjacency, root, resolveMergedLabel(rightLabel, parentMap))
        }
      }
      if (hasDown) {
        const downLabel = labelsData[idx + width] ?? 0
        if (downLabel > 0) {
          connect(adjacency, root, resolveMergedLabel(downLabel, parentMap))
        }
      }
      if (hasRight && hasDown) {
        const downRightLabel = labelsData[idx + width + 1] ?? 0
        if (downRightLabel > 0) {
          connect(adjacency, root, resolveMergedLabel(downRightLabel, parentMap))
        }
      }
      if (hasDown && x - 1 >= 0) {
        const downLeftLabel = labelsData[idx + width - 1] ?? 0
        if (downLeftLabel > 0) {
          connect(adjacency, root, resolveMergedLabel(downLeftLabel, parentMap))
        }
      }
    }
  }
  return adjacency
}
