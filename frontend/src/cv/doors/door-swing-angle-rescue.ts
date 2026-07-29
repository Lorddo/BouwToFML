import type { OpenCV } from '@/cv/loadOpenCV'
import type { FaceDualSpace, FaceGeom, SpacePrefer } from '@/cv/walls/rooms/face-dual-space'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { computeDoorHingeFromFaces } from './door-swing-hinge'
import { exceedsMaxSizeBand } from './door-swing-filter-matching'
import { DOOR_SPACE_POLICY } from './door-space-policy'
import type { DoorSizeBandPx, DoorSwingHypothesis, DoorSwingRefBand } from './types'

export const DOOR_ANGLE_RESCUE_TUNING = {
  /** ±15% op korte as t.o.v. ref-diepte (shallow twins / underdeeps) */
  depthRatio: 0.15,
  /** ±10° t.o.v. ref.swingAngleDeg */
  angleMarginDeg: 10,
  /** Refs met hoek ≥ dit: geen angle-rescue (90°-bogen) */
  maxRefAngleDeg: 60,
  /**
   * Absolute fill-cap: area/(w×h) moet strikt < dit.
   * Dichte blobs (≥ 0.80) blijven afgekeurd — geen tweede kans.
   * (Geen aparte too_full-vs-ref: hinge beslist onder deze cap.)
   */
  maxFillRatio: 0.8,
} as const

export type DoorAngleRescueStatus =
  | 'accepted'
  | 'rejected_too_long'
  | 'rejected_fill_cap'
  | 'rejected_no_hinge'
  | 'rejected_angle_mismatch'

export type DoorAngleRescueDiagnostic = {
  root: number
  status: DoorAngleRescueStatus
  /** Meet-space voor hinge (bij voorkeur white). */
  space: SpacePrefer
  bbox: { x: number; y: number; width: number; height: number }
  areaPx: number
  fill: number
  depthPx: number
  depthRefPx: number
  longPx: number
  wallMaxPx: number
  matchedRefIndex: number | null
  candidateAngleDeg: number | null
  refAngleDeg: number | null
  angleDeltaDeg: number | null
  score: number | null
}

export type DoorSwingAngleRescueResult = {
  accepted: DoorSwingHypothesis[]
  diagnostics: DoorAngleRescueDiagnostic[]
  scannedCount: number
  matchedCount: number
}

function shortSide(bbox: { width: number; height: number }): number {
  return Math.min(bbox.width, bbox.height)
}

function longSide(bbox: { width: number; height: number }): number {
  return Math.max(bbox.width, bbox.height)
}

function fillRatio(areaPx: number, bbox: { width: number; height: number }): number {
  const box = Math.max(1, bbox.width * bbox.height)
  return Math.max(0, Math.min(1, areaPx / box))
}

function depthInBand(shortPx: number, depthRefPx: number): boolean {
  const lo = depthRefPx * (1 - DOOR_ANGLE_RESCUE_TUNING.depthRatio)
  const hi = depthRefPx * (1 + DOOR_ANGLE_RESCUE_TUNING.depthRatio)
  return shortPx >= lo && shortPx <= hi
}

function isRefEligible(ref: DoorSwingRefBand): boolean {
  const angle = ref.swingAngleDeg
  return (
    typeof angle === 'number' &&
    Number.isFinite(angle) &&
    angle < DOOR_ANGLE_RESCUE_TUNING.maxRefAngleDeg
  )
}

function collectRootIds(dual: FaceDualSpace): number[] {
  const ids = new Set<number>()
  for (const id of dual.white.byId.keys()) {
    if (id > 0) ids.add(id)
  }
  for (const id of dual.ink.byId.keys()) {
    if (id > 0) ids.add(id)
  }
  return [...ids].sort((a, b) => a - b)
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function preferredWallAxisFromBBox(bbox: { width: number; height: number }): 'h' | 'v' {
  return bbox.width >= bbox.height ? 'h' : 'v'
}

/**
 * Height-gate Either (ink óf white in diepte-band).
 * Hoek/hinge: altijd white wanneer beschikbaar; ink-fallback alleen zonder white-geom
 * (wall-fill seeds zoals face 262).
 */
function resolveMeasureGeom(params: {
  dual: FaceDualSpace
  root: number
  depthRefPx: number
}): { geom: FaceGeom; space: SpacePrefer } | null {
  const white = params.dual.geom(params.root, 'white')
  const ink = params.dual.geom(params.root, 'ink')
  const whiteHit = white != null && depthInBand(shortSide(white.bbox), params.depthRefPx)
  const inkHit = ink != null && depthInBand(shortSide(ink.bbox), params.depthRefPx)
  if (!whiteHit && !inkHit) return null
  if (white) {
    return { geom: white, space: DOOR_SPACE_POLICY.angleRescueMeasurePrefer }
  }
  if (ink) return { geom: ink, space: 'ink' }
  return null
}

function baseDiag(params: {
  root: number
  geom: FaceGeom
  space: SpacePrefer
  depthRefPx: number
  wallMaxPx: number
  matchedRefIndex: number
  refAngleDeg: number
}): Omit<DoorAngleRescueDiagnostic, 'status' | 'candidateAngleDeg' | 'angleDeltaDeg' | 'score'> {
  return {
    root: params.root,
    space: params.space,
    bbox: { ...params.geom.bbox },
    areaPx: Math.max(0, Math.round(params.geom.areaPx)),
    fill: round3(fillRatio(params.geom.areaPx, params.geom.bbox)),
    depthPx: shortSide(params.geom.bbox),
    depthRefPx: params.depthRefPx,
    longPx: longSide(params.geom.bbox),
    wallMaxPx: params.wallMaxPx,
    matchedRefIndex: params.matchedRefIndex,
    refAngleDeg: params.refAngleDeg,
  }
}

/** Preferentie bij meerdere ref-pogingen: accepted wint; anders “dichtste” reject. */
function rejectRank(status: DoorAngleRescueStatus): number {
  switch (status) {
    case 'rejected_angle_mismatch':
      return 4
    case 'rejected_no_hinge':
      return 3
    case 'rejected_fill_cap':
      return 2
    case 'rejected_too_long':
      return 1
    default:
      return 0
  }
}

function keepBetterDiag(
  prev: DoorAngleRescueDiagnostic | undefined,
  next: DoorAngleRescueDiagnostic,
): DoorAngleRescueDiagnostic {
  if (!prev) return next
  if (next.status === 'accepted') return next
  if (prev.status === 'accepted') return prev
  if (rejectRank(next.status) > rejectRank(prev.status)) return next
  if (
    next.status === 'rejected_angle_mismatch' &&
    prev.status === 'rejected_angle_mismatch' &&
    (next.angleDeltaDeg ?? Infinity) < (prev.angleDeltaDeg ?? Infinity)
  ) {
    return next
  }
  return prev
}

/**
 * Stage-2 angle-rescue: diepte ±15% (ink OR white), fill < 0.80,
 * lange as ≤ wallMaxPx, hinge altijd op white (+ expectedAngleDeg + H/V-prefer),
 * hoek ±10° vs REF. Diagnostics per height-hit root.
 */
export function runDoorSwingAngleRescue(params: {
  cv: OpenCV
  dual: FaceDualSpace
  parentMap: Map<number, number>
  refBands: DoorSwingRefBand[]
  sizeBand: DoorSizeBandPx
  claimedFaceIds: ReadonlySet<number>
  /**
   * Optioneel: alleen roots met class in `allowedClasses` scannen.
   * Gebruikt bij existingDoorsOnly zodat unknown≠deur blijft, maar reeds
   * gepinde angle-rescue-deuren (class=door) wel terugkomen in Stage-2/L11.
   */
  classificationByLabel?: ReadonlyMap<number, RoomRasterClass>
  allowedClasses?: ReadonlySet<RoomRasterClass> | readonly RoomRasterClass[]
}): DoorSwingAngleRescueResult {
  const eligibleRefs = params.refBands
    .map((ref, index) => ({ ref, index }))
    .filter((entry) => isRefEligible(entry.ref))
  if (eligibleRefs.length === 0) {
    return { accepted: [], diagnostics: [], scannedCount: 0, matchedCount: 0 }
  }

  const allowedClassSet =
    params.allowedClasses == null
      ? null
      : params.allowedClasses instanceof Set
        ? params.allowedClasses
        : new Set(params.allowedClasses)

  const roots = collectRootIds(params.dual)
  const bestByRoot = new Map<number, DoorSwingHypothesis>()
  const diagByRoot = new Map<number, DoorAngleRescueDiagnostic>()
  const scannedRoots = new Set<number>()

  for (const root of roots) {
    if (params.claimedFaceIds.has(root)) continue
    if (allowedClassSet) {
      const cls = params.classificationByLabel?.get(root)
      if (!cls || !allowedClassSet.has(cls)) continue
    }

    for (const { ref, index: matchedRefIndex } of eligibleRefs) {
      const depthRefPx = Math.min(ref.swingWpx, ref.swingHpx)
      if (!(depthRefPx > 0)) continue
      const measure = resolveMeasureGeom({
        dual: params.dual,
        root,
        depthRefPx,
      })
      if (!measure) continue
      scannedRoots.add(root)

      const refAngle = ref.swingAngleDeg!
      const { geom, space } = measure
      const base = baseDiag({
        root,
        geom,
        space,
        depthRefPx,
        wallMaxPx: params.sizeBand.wallMaxPx,
        matchedRefIndex,
        refAngleDeg: refAngle,
      })

      if (exceedsMaxSizeBand(geom.bbox, params.sizeBand)) {
        diagByRoot.set(
          root,
          keepBetterDiag(diagByRoot.get(root), {
            ...base,
            status: 'rejected_too_long',
            candidateAngleDeg: null,
            angleDeltaDeg: null,
            score: null,
          }),
        )
        continue
      }

      const candidateFill = fillRatio(geom.areaPx, geom.bbox)
      if (candidateFill >= DOOR_ANGLE_RESCUE_TUNING.maxFillRatio) {
        diagByRoot.set(
          root,
          keepBetterDiag(diagByRoot.get(root), {
            ...base,
            status: 'rejected_fill_cap',
            candidateAngleDeg: null,
            angleDeltaDeg: null,
            score: null,
          }),
        )
        continue
      }

      const paint = params.dual.space(space)
      const hinge = computeDoorHingeFromFaces({
        cv: params.cv,
        labelsData: paint.labelsData,
        parentMap: params.parentMap,
        width: paint.width,
        height: paint.height,
        faceIds: [root],
        bbox: geom.bbox,
        options: {
          expectedAngleDeg: refAngle,
          preferredWallAxis: preferredWallAxisFromBBox(geom.bbox),
        },
      })
      if (!hinge) {
        diagByRoot.set(
          root,
          keepBetterDiag(diagByRoot.get(root), {
            ...base,
            status: 'rejected_no_hinge',
            candidateAngleDeg: null,
            angleDeltaDeg: null,
            score: null,
          }),
        )
        continue
      }

      const delta = Math.abs(hinge.swingAngleDeg - refAngle)
      if (delta > DOOR_ANGLE_RESCUE_TUNING.angleMarginDeg) {
        diagByRoot.set(
          root,
          keepBetterDiag(diagByRoot.get(root), {
            ...base,
            status: 'rejected_angle_mismatch',
            candidateAngleDeg: round3(hinge.swingAngleDeg),
            angleDeltaDeg: round3(delta),
            score: null,
          }),
        )
        continue
      }

      const score = Math.max(0, 1 - delta / DOOR_ANGLE_RESCUE_TUNING.angleMarginDeg)
      const candidate: DoorSwingHypothesis = {
        id: `door-swing-angle-rescue-${root}`,
        faceIds: [root],
        unionBBox: { ...geom.bbox },
        filledAreaPx: Math.max(0, Math.round(geom.areaPx)),
        score,
        source: 'angle_rescue',
        matchedRefIndex,
      }
      const prev = bestByRoot.get(root)
      if (!prev || candidate.score > prev.score) {
        bestByRoot.set(root, candidate)
      }
      diagByRoot.set(root, {
        ...base,
        status: 'accepted',
        candidateAngleDeg: round3(hinge.swingAngleDeg),
        angleDeltaDeg: round3(delta),
        score: round3(score),
      })
    }
  }

  const accepted = [...bestByRoot.values()].sort((a, b) => a.faceIds[0] - b.faceIds[0])
  const diagnostics = [...diagByRoot.values()].sort((a, b) => a.root - b.root)
  return {
    accepted,
    diagnostics,
    scannedCount: scannedRoots.size,
    matchedCount: accepted.length,
  }
}
