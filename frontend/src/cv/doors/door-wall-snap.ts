import type { SemanticWallSegment } from '@/core/extraction/types'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import { buildLabelAdjacency } from '@/cv/walls/rooms/label-adjacency'
import { collectDirectionalAdjacentClassRoots } from './door-attach-doorframes'
import { tryBindDoorToAnchorSegment, tryBindDoorToBounds } from './door-wall-snap-bind'
import {
  buildClassBBoxesByRoot,
  findAdjacentDoorframeUnionBounds,
  growDoorframeUnionAlongAxis,
  resolveExplicitDoorframeUnion,
  tryPathABind,
  unionBBoxBounds,
} from './door-wall-snap-doorframe'
import { bboxContainsDoorFacePixel, clampBounds } from './door-wall-snap-geom'
import { tryBindDoorViaSwingMaskContact } from './door-wall-snap-path-b'
import { DOOR_WALL_SNAP_TUNING, type BBoxBounds } from './door-wall-snap-tuning'
import type { BoundDoor, ResolvedDoorCandidate } from './types'

const T = DOOR_WALL_SNAP_TUNING

/**
 * L11: bind resolved doors to wall segments.
 * Path A (doorframe) → Path B swing-mask → wall-union → legacy wallMask.
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

    // Path A: explicit IDs → 1-hop/bbox discovery → as-grow → bind.
    let doorframeUnion: BBoxBounds | null = null
    if (door.doorframeFaceIds && door.doorframeFaceIds.length > 0) {
      doorframeUnion = resolveExplicitDoorframeUnion({
        doorframeFaceIds: door.doorframeFaceIds,
        parentMap: params.parentMap,
        doorframeBBoxByRoot,
      })
    }
    if (!doorframeUnion) {
      doorframeUnion = findAdjacentDoorframeUnionBounds({
        doorBounds: bounds,
        faceSet,
        labelsData: params.labelsData,
        width: params.width,
        height: params.height,
        parentMap: params.parentMap,
        classificationByLabel,
        doorframeBBoxByRoot,
        expandPx,
      })
    }
    if (!doorframeUnion && doorframeBBoxByRoot.size > 0) {
      const doorRoots = new Set<number>()
      for (const id of faceSet) {
        const root = resolveMergedLabel(id, params.parentMap)
        doorRoots.add(root > 0 ? root : id)
      }
      doorframeUnion = growDoorframeUnionAlongAxis({
        doorBounds: bounds,
        doorRoots,
        adjacency: ensureAdjacency(),
        parentMap: params.parentMap,
        classificationByLabel,
        doorframeBBoxByRoot,
        expandPx,
      })
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
        results.push(pathA)
        continue
      }
    }

    // Path B: eerst gemergde swing-mask ↔ muur (as uit contact), daarna legacy
    // wall-union aspect / wallMask. Voorkomt hoek-FP (verticale wall-component wint).
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
      continue
    }

    const wallUnion =
      adjacentWallBBoxes.length > 0
        ? adjacentWallBBoxes.reduce(
            (acc, box) => (acc ? unionBBoxBounds(acc, box) : { ...box }),
            null as BBoxBounds | null,
          )
        : null
    if (wallUnion) {
      const pathBSeg = tryBindDoorToAnchorSegment({
        door,
        doorBounds: bounds,
        anchorUnion: wallUnion,
        segments: params.segments,
        referenceWallThicknessPx: params.referenceWallThicknessPx,
      })
      if (pathBSeg) {
        results.push(pathBSeg)
        continue
      }
      // Segment-miss: wallMask op wall-unie (+ swing span), niet op pure white swing.
      const wuW = wallUnion.x1 - wallUnion.x0
      const wuH = wallUnion.y1 - wallUnion.y0
      const pathBBounds: BBoxBounds =
        wuH >= wuW
          ? {
              x0: bounds.x0,
              x1: bounds.x1,
              y0: Math.min(bounds.y0, wallUnion.y0),
              y1: Math.max(bounds.y1, wallUnion.y1),
            }
          : {
              x0: Math.min(bounds.x0, wallUnion.x0),
              x1: Math.max(bounds.x1, wallUnion.x1),
              y0: bounds.y0,
              y1: bounds.y1,
            }
      const pathBMask = tryBindDoorToBounds({
        door,
        bounds: pathBBounds,
        wallMask: params.wallMask,
        width: params.width,
        height: params.height,
        segments: params.segments,
        referenceWallThicknessPx: params.referenceWallThicknessPx,
      })
      if (pathBMask) {
        results.push(pathBMask)
        continue
      }
    }

    // Legacy: geen ink-wall adjacency → wallMask op deur-bbox (unit tests / oude fixtures).
    const pathBLegacy = tryBindDoorToBounds({
      door,
      bounds,
      wallMask: params.wallMask,
      width: params.width,
      height: params.height,
      segments: params.segments,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    })
    if (pathBLegacy) results.push(pathBLegacy)
  }
  return results
}
