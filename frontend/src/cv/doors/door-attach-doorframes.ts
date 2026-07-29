import {
  resolveClassAtLabel,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import { clampBounds } from './door-wall-snap-geom'
import type { BBoxBounds } from './door-wall-snap-tuning'
import type { ResolvedDoorCandidate } from './types'

type CardinalDir = 'left' | 'right' | 'up' | 'down'

const DIR_DELTA: Record<CardinalDir, readonly [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
}

const ALL_DIRS: readonly CardinalDir[] = ['left', 'right', 'up', 'down']

/** Max doorframe→doorframe hops in de eerste-hop richting (twin-helft 27 naast 28). */
const DIRECTIONAL_GROW_HOP_CAP = 4

/** Sticky/window/bridge doorframes: missing → undefined (niet `'surface'`). */
function classAt(
  label: number,
  parentMap: Map<number, number>,
  classificationByLabel: Map<number, RoomRasterClass>,
): RoomRasterClass | undefined {
  return resolveClassAtLabel(label, parentMap, classificationByLabel, undefined)
}

function isDoorFaceLabel(label: number, faceSet: Set<number>, parentMap: Map<number, number>): boolean {
  if (label <= 0) return false
  if (faceSet.has(label)) return true
  return faceSet.has(resolveMergedLabel(label, parentMap))
}

function rootOf(label: number, parentMap: Map<number, number>): number {
  const root = resolveMergedLabel(label, parentMap)
  return root > 0 ? root : label
}

/**
 * Gericht same-class: vanuit root A één pixelstap in `dir` naar root B.
 * Eenmaal gebouwd per pass (volledige raster-scan) voor `targetClass`.
 */
function buildDirectionalClassEdges(params: {
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  targetClass: RoomRasterClass
}): Map<CardinalDir, Map<number, Set<number>>> {
  const edges = new Map<CardinalDir, Map<number, Set<number>>>()
  for (const dir of ALL_DIRS) edges.set(dir, new Map())

  const { labelsData, width, height, parentMap, classificationByLabel, targetClass } = params
  const addEdge = (dir: CardinalDir, from: number, to: number): void => {
    if (from === to || from <= 0 || to <= 0) return
    const map = edges.get(dir)!
    let set = map.get(from)
    if (!set) {
      set = new Set()
      map.set(from, set)
    }
    set.add(to)
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const label = labelsData[y * width + x] ?? 0
      if (label <= 0) continue
      if (classAt(label, parentMap, classificationByLabel) !== targetClass) continue
      const from = rootOf(label, parentMap)
      for (const dir of ALL_DIRS) {
        const [dx, dy] = DIR_DELTA[dir]
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const nLabel = labelsData[ny * width + nx] ?? 0
        if (nLabel <= 0) continue
        if (classAt(nLabel, parentMap, classificationByLabel) !== targetClass) {
          continue
        }
        addEdge(dir, from, rootOf(nLabel, parentMap))
      }
    }
  }
  return edges
}

/**
 * Alleen ink-pixel adjacency. Eerste hop deur→`targetClass` zet de richting;
 * verdere hops alleen in diezelfde cardinale richting (links blijft links).
 * Geen bbox-near.
 */
export function collectDirectionalAdjacentClassRoots(params: {
  doorBounds: BBoxBounds
  faceSet: Set<number>
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  targetClass: RoomRasterClass
  /** Optioneel hergebruik over meerdere deuren in één pass. */
  directionalEdges?: Map<CardinalDir, Map<number, Set<number>>>
}): number[] {
  const {
    labelsData,
    width,
    height,
    parentMap,
    classificationByLabel,
    faceSet,
    doorBounds,
    targetClass,
  } = params
  const seedsByDir = new Map<CardinalDir, Set<number>>()

  const trySeed = (x: number, y: number, dir: CardinalDir): void => {
    const [dx, dy] = DIR_DELTA[dir]
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
    const nLabel = labelsData[ny * width + nx] ?? 0
    if (nLabel <= 0) return
    if (isDoorFaceLabel(nLabel, faceSet, parentMap)) return
    if (classAt(nLabel, parentMap, classificationByLabel) !== targetClass) return
    const key = rootOf(nLabel, parentMap)
    let set = seedsByDir.get(dir)
    if (!set) {
      set = new Set()
      seedsByDir.set(dir, set)
    }
    set.add(key)
  }

  for (let y = doorBounds.y0; y < doorBounds.y1; y += 1) {
    for (let x = doorBounds.x0; x < doorBounds.x1; x += 1) {
      const label = labelsData[y * width + x] ?? 0
      if (!isDoorFaceLabel(label, faceSet, parentMap)) continue
      for (const dir of ALL_DIRS) trySeed(x, y, dir)
    }
  }

  if (seedsByDir.size <= 0) return []

  const edges =
    params.directionalEdges ??
    buildDirectionalClassEdges({
      labelsData,
      width,
      height,
      parentMap,
      classificationByLabel,
      targetClass,
    })

  const collected = new Set<number>()
  for (const [dir, seeds] of seedsByDir) {
    const dirEdges = edges.get(dir) ?? new Map<number, Set<number>>()
    const queue: Array<{ root: number; hops: number }> = []
    for (const root of seeds) {
      if (collected.has(root)) continue
      collected.add(root)
      queue.push({ root, hops: 0 })
    }
    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.hops >= DIRECTIONAL_GROW_HOP_CAP) continue
      for (const next of dirEdges.get(current.root) ?? []) {
        if (collected.has(next)) continue
        collected.add(next)
        queue.push({ root: next, hops: current.hops + 1 })
      }
    }
  }

  return [...collected].sort((a, b) => a - b)
}

/**
 * Sticky/class doorframe pins op resolved deuren (na window-pass / vóór L11).
 * Alleen directionele ink-adjacency — geen bbox-near.
 * Kozijnfaces in `faceIds` (cluster) → `doorframeFaceIds`.
 */
export function attachDoorframesToResolvedDoors(params: {
  doors: ResolvedDoorCandidate[]
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  referenceWallThicknessPx?: number
}): ResolvedDoorCandidate[] {
  if (params.doors.length <= 0) return params.doors
  if (params.classificationByLabel.size <= 0) return params.doors
  if (params.labelsData.length < params.width * params.height) return params.doors

  const directionalEdges = buildDirectionalClassEdges({
    labelsData: params.labelsData,
    width: params.width,
    height: params.height,
    parentMap: params.parentMap,
    classificationByLabel: params.classificationByLabel,
    targetClass: 'doorframe',
  })

  return params.doors.map((door) => {
    const bounds = clampBounds(door.bbox, params.width, params.height)
    if (!bounds) return door
    const rawFaceIds = door.faceIds.filter((id) => id > 0)
    if (rawFaceIds.length <= 0) return door

    const peeledFrameRoots: number[] = []
    const swingFaceIds: number[] = []
    for (const id of rawFaceIds) {
      const key = rootOf(id, params.parentMap)
      if (classAt(key, params.parentMap, params.classificationByLabel) === 'doorframe') {
        peeledFrameRoots.push(key)
      } else {
        swingFaceIds.push(id)
      }
    }
    const nextFaceIds = swingFaceIds.length > 0 ? swingFaceIds : rawFaceIds
    const peeledOk = swingFaceIds.length > 0 ? peeledFrameRoots : []
    const faceSet = new Set(nextFaceIds)

    const adjacent = collectDirectionalAdjacentClassRoots({
      doorBounds: bounds,
      faceSet,
      labelsData: params.labelsData,
      width: params.width,
      height: params.height,
      parentMap: params.parentMap,
      classificationByLabel: params.classificationByLabel,
      targetClass: 'doorframe',
      directionalEdges,
    })

    // Alleen adjacency + peel — oude foute doorframeFaceIds weggooien.
    const nextDf = [...new Set([...peeledOk, ...adjacent].filter((id) => id > 0))].sort(
      (a, b) => a - b,
    )
    const prevDf = door.doorframeFaceIds ?? []
    const facesChanged =
      nextFaceIds.length !== door.faceIds.length ||
      nextFaceIds.some((id, i) => id !== door.faceIds[i])
    const dfChanged =
      nextDf.length !== prevDf.length || nextDf.some((id, i) => id !== prevDf[i])
    if (!facesChanged && !dfChanged) return door
    if (nextDf.length <= 0 && !facesChanged) return door
    return {
      ...door,
      faceIds: nextFaceIds,
      ...(nextDf.length > 0 ? { doorframeFaceIds: nextDf } : {}),
    }
  })
}
