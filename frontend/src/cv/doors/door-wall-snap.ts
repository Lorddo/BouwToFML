import type { SemanticWallSegment } from '@/core/extraction/types'
import { noteCascadeLevel } from '@/core/diagnostics'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import { buildLabelAdjacency } from '@/cv/walls/rooms/label-adjacency'
import { collectDirectionalAdjacentClassRoots } from './door-attach-doorframes'
import {
  buildClassBBoxesByRoot,
  growDoorframeUnionAlongAxis,
  resolveExplicitDoorframeUnion,
  tryPathABind,
} from './door-wall-snap-doorframe'
import { bboxContainsDoorFacePixel, clampBounds } from './door-wall-snap-geom'
import { tryBindDoorViaSwingMaskContact } from './door-wall-snap-path-b'
import { DOOR_WALL_SNAP_TUNING, type BBoxBounds } from './door-wall-snap-tuning'
import type { BoundDoor, ResolvedDoorCandidate } from './types'

const T = DOOR_WALL_SNAP_TUNING

/**
 * L11: bind resolved doors to wall segments.
 * Path A (doorframe) → Path B swing-mask (D-48). Legacy wall-union/bbox (D-50..D-52) weg.
 */
export function snapDoorsToWalls(params: {
  doors: ResolvedDoorCandidate[]
  wallMask: Uint8Array
  width: number
  height: number
  labelsData: Int32Array
  parentMap: Map<number, number>
  segments: SemanticWallSegment[]
  referenceWallThicknessPx?: number
  /** Face-class map (door/doorframe/wall/…); Path A via doorframe, Path B via wall. */
  classificationByLabel?: Map<number, RoomRasterClass>
}): BoundDoor[] {
  if (params.doors.length <= 0 || params.segments.length <= 0) return []
  if (params.wallMask.length < params.width * params.height) return []
  if (params.labelsData.length < params.width * params.height) return []

  const classificationByLabel = params.classificationByLabel ?? new Map<number, RoomRasterClass>()
  const expandPx = Math.max(
    T.expandMinPx,
    Math.round(params.referenceWallThicknessPx ?? T.expandThicknessFallbackPx),
  )
  const classBBoxes =
    classificationByLabel.size > 0
      ? buildClassBBoxesByRoot({
          labelsData: params.labelsData,
          width: params.width,
          height: params.height,
          parentMap: params.parentMap,
          classificationByLabel,
        })
      : { doorframe: new Map<number, BBoxBounds>(), wall: new Map<number, BBoxBounds>() }
  const doorframeBBoxByRoot = classBBoxes.doorframe
  const wallBBoxByRoot = classBBoxes.wall

  let adjacency: Map<number, Set<number>> | null = null
  const ensureAdjacency = (): Map<number, Set<number>> => {
    if (!adjacency) {
      adjacency = buildLabelAdjacency({
        labelsData: params.labelsData,
        width: params.width,
        height: params.height,
        parentMap: params.parentMap,
      })
    }
    return adjacency
  }

  const results: BoundDoor[] = []
  for (const door of params.doors) {
    const bounds = clampBounds(door.bbox, params.width, params.height)
    if (!bounds) continue
    const faceSet = new Set(door.faceIds.filter((id) => id > 0))
    if (faceSet.size <= 0) continue
    const hasDoorFacePixel = bboxContainsDoorFacePixel({
      labelsData: params.labelsData,
      width: params.width,
      height: params.height,
      parentMap: params.parentMap,
      faceSet,
      bounds,
    })
    if (!hasDoorFacePixel) continue

    // ESC:D-44 (P) — sticky doorframeFaceIds alleen (geen zoekpad); Path A primair.
    // Path A: expliciete doorframeFaceIds → as-grow → bind.
    // ESC:D-45 (A) — VERWIJDERD 2026-07-31: 1-hop discovery; geen losse doorframes zonder sticky IDs.
    let doorframeUnion: BBoxBounds | null = null
    let pathASource: 'D-44' | 'D-46' | null = null
    if (door.doorframeFaceIds && door.doorframeFaceIds.length > 0) {
      doorframeUnion = resolveExplicitDoorframeUnion({
        doorframeFaceIds: door.doorframeFaceIds,
        parentMap: params.parentMap,
        doorframeBBoxByRoot,
      })
      if (doorframeUnion) pathASource = 'D-44'
    }
    // ESC:D-46 (A) — as-grow; bij hit → sticky IDs + class doorframe (volgende keer D-44).
    if (!doorframeUnion && doorframeBBoxByRoot.size > 0) {
      const doorRoots = new Set<number>()
      for (const id of faceSet) {
        const root = resolveMergedLabel(id, params.parentMap)
        doorRoots.add(root > 0 ? root : id)
      }
      const grown = growDoorframeUnionAlongAxis({
        doorBounds: bounds,
        doorRoots,
        adjacency: ensureAdjacency(),
        parentMap: params.parentMap,
        classificationByLabel,
        doorframeBBoxByRoot,
        expandPx,
      })
      if (grown) {
        doorframeUnion = grown.union
        pathASource = 'D-46'
        const sticky = new Set<number>(door.doorframeFaceIds ?? [])
        for (const root of grown.roots) {
          sticky.add(root)
          classificationByLabel.set(root, 'doorframe')
        }
        door.doorframeFaceIds = [...sticky]
      }
    }

    if (doorframeUnion) {
      const pathA = tryPathABind({
        door,
        doorBounds: bounds,
        doorframeUnion,
        wallMask: params.wallMask,
        width: params.width,
        height: params.height,
        segments: params.segments,
        referenceWallThicknessPx: params.referenceWallThicknessPx,
      })
      if (pathA) {
        if (pathASource) {
          noteCascadeLevel(pathASource, 'door-wall-snap.snapDoorsToWalls', 'path_a_hit', {
            doorId: door.id,
          })
        }
        results.push(pathA)
        continue
      }
    }

    // Path B: swing-mask ↔ muur (as uit contact). ESC:D-48.
    // ESC:D-50 (A) — VERWIJDERD 2026-07-31: wall-union → segment-bind
    // ESC:D-51 (A) — VERWIJDERD 2026-07-31: wall-union → wallMask bounds
    // ESC:D-52 (A) — VERWIJDERD 2026-07-31: legacy wallMask op deur-bbox
    const adjacentWallBBoxes: BBoxBounds[] = []
    if (wallBBoxByRoot.size > 0) {
      const wallRoots = collectDirectionalAdjacentClassRoots({
        doorBounds: bounds,
        faceSet,
        labelsData: params.labelsData,
        width: params.width,
        height: params.height,
        parentMap: params.parentMap,
        classificationByLabel,
        targetClass: 'wall',
      })
      for (const root of wallRoots) {
        const bbox = wallBBoxByRoot.get(root)
        if (bbox) adjacentWallBBoxes.push(bbox)
      }
    }

    const pathBSwing = tryBindDoorViaSwingMaskContact({
      door,
      doorBounds: bounds,
      wallMask: params.wallMask,
      width: params.width,
      height: params.height,
      labelsData: params.labelsData,
      parentMap: params.parentMap,
      segments: params.segments,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
      adjacentWallBBoxes,
    })
    if (pathBSwing) {
      results.push(pathBSwing)
    }
  }
  return results
}
