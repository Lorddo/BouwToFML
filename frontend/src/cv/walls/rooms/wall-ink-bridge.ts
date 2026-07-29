import { isWallMaskClass, type RoomRasterClass } from './room-ink-classify'

/**
 * Wit–inkt–wit hop over wall-ink adjacency.
 * Mid-node moet `isWallMaskClass` zijn (wall / window / doorframe).
 *
 * Gedeeld door deur Stage-1 cluster en raam Stage-1 wall-bridge.
 * Domain greedy/geom gates blijven per flow.
 */
export function areLinkedViaWallInkBridge(params: {
  rootA: number
  rootB: number
  wallInkAdjacency: Map<number, Set<number>>
  classificationByLabel: Map<number, RoomRasterClass>
}): boolean {
  const neighborsA = params.wallInkAdjacency.get(params.rootA)
  if (!neighborsA || neighborsA.size <= 0) return false
  for (const mid of neighborsA) {
    if (mid === params.rootB) continue
    const midClass = params.classificationByLabel.get(mid)
    if (!midClass || !isWallMaskClass(midClass)) continue
    if (params.wallInkAdjacency.get(mid)?.has(params.rootB)) return true
  }
  return false
}

/**
 * Cluster-buren: directe adjacency, plus bij `bridgeViaInk` een wit–inkt–wit hop
 * (mid = wall-mask class). Wall zelf wordt niet als kandidaat toegevoegd — callers
 * filteren via domain `isClusterableFace` / seed-classes.
 */
export function collectNeighborsViaWallInkBridge(params: {
  roots: number[]
  adjacency: Map<number, Set<number>>
  seen: Set<number>
  classificationByLabel?: Map<number, RoomRasterClass>
  bridgeViaInk: boolean
}): number[] {
  const neighborSet = new Set<number>()
  for (const root of params.roots) {
    for (const neighbor of params.adjacency.get(root) ?? []) {
      if (params.seen.has(neighbor)) continue
      const midClass = params.classificationByLabel?.get(neighbor)
      if (params.bridgeViaInk && midClass && isWallMaskClass(midClass)) {
        for (const beyond of params.adjacency.get(neighbor) ?? []) {
          if (beyond !== root && !params.seen.has(beyond)) neighborSet.add(beyond)
        }
        continue
      }
      neighborSet.add(neighbor)
    }
  }
  return [...neighborSet]
}
