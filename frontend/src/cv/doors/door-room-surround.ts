import {
  isWallMaskClass,
  resolveClassAtLabel,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import type { DoorSwingHypothesis } from './types'

/** Surround / wall-touch: missing → `'surface'` (niet `undefined`). */
function classAt(
  label: number,
  parentMap: Map<number, number>,
  classificationByLabel: Map<number, RoomRasterClass>,
): RoomRasterClass {
  return resolveClassAtLabel(label, parentMap, classificationByLabel, 'surface') ?? 'surface'
}

/** Unieke adjacent roots van de hypothese-faces (hypothese zelf uitgesloten). */
function collectAdjacentRoots(params: {
  faceIds: readonly number[]
  adjacency: Map<number, Set<number>>
  parentMap: Map<number, number>
}): Set<number> {
  const resolve = (label: number) => resolveMergedLabel(label, params.parentMap)
  const skipRoots = new Set<number>()
  for (const faceId of params.faceIds) {
    if (faceId > 0) skipRoots.add(resolve(faceId))
  }
  const neighbors = new Set<number>()
  for (const root of skipRoots) {
    for (const raw of params.adjacency.get(root) ?? []) {
      const n = resolve(raw)
      if (n > 0 && !skipRoots.has(n)) neighbors.add(n)
    }
  }
  return neighbors
}

/**
 * Alle adjacent faces = mix van éénzelfde `surface`-room en/of `unknown`.
 * Één wall/outside/door → niet omsloten door room.
 */
function isHypothesisSurroundedByRoom(
  neighbors: ReadonlySet<number>,
  parentMap: Map<number, number>,
  classificationByLabel: Map<number, RoomRasterClass>,
): boolean {
  if (neighbors.size === 0) return false
  let roomRoot: number | null = null
  for (const root of neighbors) {
    const cls = classAt(root, parentMap, classificationByLabel)
    if (cls === 'unknown') continue
    if (cls === 'surface') {
      if (roomRoot == null) {
        roomRoot = root
        continue
      }
      if (roomRoot !== root) return false
      continue
    }
    return false
  }
  return true
}

/** Alle adjacent faces = `wall`. */
function isHypothesisSurroundedByWall(
  neighbors: ReadonlySet<number>,
  parentMap: Map<number, number>,
  classificationByLabel: Map<number, RoomRasterClass>,
): boolean {
  if (neighbors.size === 0) return false
  for (const root of neighbors) {
    if (classAt(root, parentMap, classificationByLabel) !== 'wall') return false
  }
  return true
}

export type DoorRoomSurroundRejection = {
  hypothesis: DoorSwingHypothesis
  reason: 'surrounded_by_room' | 'surrounded_by_wall'
}

/**
 * Stage-2: drop hypotheses waarvan **alle ink-adjacent** faces
 * dezelfde room/unknown zijn, of allemaal wall.
 *
 * Geen white labels, geen bbox-rays — alleen `adjacency` (wall-ink + detached parentMap).
 */
export function filterRoomSurroundedHypotheses(params: {
  hypotheses: DoorSwingHypothesis[]
  adjacency: Map<number, Set<number>>
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
}): {
  kept: DoorSwingHypothesis[]
  rejected: DoorRoomSurroundRejection[]
} {
  const kept: DoorSwingHypothesis[] = []
  const rejected: DoorRoomSurroundRejection[] = []

  for (const hypothesis of params.hypotheses) {
    const neighbors = collectAdjacentRoots({
      faceIds: hypothesis.faceIds,
      adjacency: params.adjacency,
      parentMap: params.parentMap,
    })
    if (isHypothesisSurroundedByWall(neighbors, params.parentMap, params.classificationByLabel)) {
      rejected.push({ hypothesis, reason: 'surrounded_by_wall' })
      continue
    }
    if (isHypothesisSurroundedByRoom(neighbors, params.parentMap, params.classificationByLabel)) {
      rejected.push({ hypothesis, reason: 'surrounded_by_room' })
      continue
    }
    kept.push(hypothesis)
  }

  return { kept, rejected }
}

/** ≥1 ink-adjacent root is wall-mask class (`wall` / `window` / `doorframe`). */
export function hypothesisTouchesWall(params: {
  faceIds: readonly number[]
  adjacency: Map<number, Set<number>>
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
}): boolean {
  const neighbors = collectAdjacentRoots({
    faceIds: params.faceIds,
    adjacency: params.adjacency,
    parentMap: params.parentMap,
  })
  for (const root of neighbors) {
    const cls = classAt(root, params.parentMap, params.classificationByLabel)
    if (isWallMaskClass(cls)) return true
  }
  return false
}

export type DoorWallTouchRejection = {
  hypothesis: DoorSwingHypothesis
  reason: 'no_wall_touch'
}

/**
 * Stage-2 wall-touch: drop hypotheses zonder ink-adjacent muur
 * (`wall` / `window` / `doorframe`). Draait ná surround + angle-rescue.
 */
export function filterWallUntouchedHypotheses(params: {
  hypotheses: DoorSwingHypothesis[]
  adjacency: Map<number, Set<number>>
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
}): {
  kept: DoorSwingHypothesis[]
  rejected: DoorWallTouchRejection[]
} {
  const kept: DoorSwingHypothesis[] = []
  const rejected: DoorWallTouchRejection[] = []

  for (const hypothesis of params.hypotheses) {
    if (
      hypothesisTouchesWall({
        faceIds: hypothesis.faceIds,
        adjacency: params.adjacency,
        parentMap: params.parentMap,
        classificationByLabel: params.classificationByLabel,
      })
    ) {
      kept.push(hypothesis)
      continue
    }
    rejected.push({ hypothesis, reason: 'no_wall_touch' })
  }

  return { kept, rejected }
}
