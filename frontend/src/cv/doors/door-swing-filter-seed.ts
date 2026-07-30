import { tally } from '@/core/diagnostics'
import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { DoorSizeBandPx, DoorSwingRefBand } from './types'
import {
  DOOR_SWING_TUNING,
  bestAspectRef,
  clippedArcRescueMatch,
  exceedsMaxSizeBand,
  isWallRescueCandidate,
  type RefMatch,
  type RootFace,
  underWallMinBand,
  wallRescueMatch,
} from './door-swing-filter-matching'
import { DOOR_SPACE_POLICY } from './door-space-policy'
import { absorbInBandNeighbors, growClusterForRef } from './door-swing-filter-cluster'

export type SeedOutcome =
  | { kind: 'not_seed' }
  | { kind: 'rejected_out_of_band' }
  | { kind: 'rejected_no_match' }
  | {
      kind: 'accepted'
      source: 'single' | 'cluster'
      faceIds: number[]
      union: { x: number; y: number; width: number; height: number }
      match: RefMatch
    }

type SingleMatchResolution = {
  isNotSeed: boolean
  singleMatch: RefMatch | null
  /**
   * Geom waarmee de match is gemaakt. Bij wall-rescue Either kan dit white zijn
   * terwijl `aggregateRootFaces` ink heeft (merge); cluster/diag gebruiken dan dit.
   */
  measureFace: RootFace
}

/** Losse size/aspect/area/fill-rescue-poging op één face-geom (één space). */
function tryRescueMatchOnFace(params: {
  face: RootFace
  refBands: DoorSwingRefBand[]
  sizeBand: DoorSizeBandPx
  aspectToleranceRatio: number
  /** Wall: ook wallRescueMatch (striktere aspect) als sizeNear/shallow falen. */
  includeWallRescueMatch: boolean
}): RefMatch | null {
  const strictSingleMatch = bestAspectRef(
    params.face.bbox,
    params.refBands,
    params.aspectToleranceRatio,
    { sizeBand: params.sizeBand },
  )
  // ESC:D-09 (A)
  const sizeNearMatch = !strictSingleMatch
    ? bestAspectRef(
        params.face.bbox,
        params.refBands,
        Math.max(params.aspectToleranceRatio, DOOR_SWING_TUNING.wallFillAspectToleranceRatio),
        { sizeBand: params.sizeBand },
      )
    : null
  const isUnderWallMin = underWallMinBand(params.face.bbox, params.sizeBand)
  // ESC:D-10 (A)
  const looseUnderMinMatch =
    !strictSingleMatch && isUnderWallMin
      ? bestAspectRef(
          params.face.bbox,
          params.refBands,
          params.aspectToleranceRatio + DOOR_SWING_TUNING.shallowRescueAspectToleranceBonus,
          {
            sizeBand: params.sizeBand,
            relaxRatio: DOOR_SWING_TUNING.shallowRescueAxisMinRelaxRatio,
            enforceAbsoluteWallMin: false,
          },
        )
      : null
  const looseWallMatch =
    params.includeWallRescueMatch && !strictSingleMatch
      ? (sizeNearMatch ??
        looseUnderMinMatch ??
        wallRescueMatch(
          params.face.bbox,
          params.refBands,
          params.sizeBand,
          params.aspectToleranceRatio,
        ))
      : null
  const candidateMatch = strictSingleMatch ?? looseWallMatch ?? sizeNearMatch ?? looseUnderMinMatch
  if (!candidateMatch) return null
  if (
    !isWallRescueCandidate({
      face: params.face,
      match: candidateMatch,
      refBands: params.refBands,
    })
  ) {
    return null
  }
  return candidateMatch
}

/**
 * Wall-rescue Either: probeer `wallRescueMatchSpaces` (ink → white) tot één past.
 * Zonder dual: alleen de geaggregeerde (ink) rootFace — unit-tests zonder dual.
 */
function resolveWallRescueEither(params: {
  rootFace: RootFace
  dual: FaceDualSpace | undefined
  refBands: DoorSwingRefBand[]
  sizeBand: DoorSizeBandPx
  aspectToleranceRatio: number
}): { match: RefMatch; measureFace: RootFace } | null {
  // ESC:D-13 (C)
  for (const space of DOOR_SPACE_POLICY.wallRescueMatchSpaces) {
    let face: RootFace
    if (space === 'ink') {
      // Merge injecteert wall-ink components → rootFace is al ink-geom.
      face = params.rootFace
    } else {
      const white = params.dual?.geom(params.rootFace.root, 'white')
      if (!white) continue
      face = {
        root: params.rootFace.root,
        className: params.rootFace.className,
        bbox: { ...white.bbox },
        areaPx: white.areaPx,
      }
    }
    const match = tryRescueMatchOnFace({
      face,
      refBands: params.refBands,
      sizeBand: params.sizeBand,
      aspectToleranceRatio: params.aspectToleranceRatio,
      includeWallRescueMatch: true,
    })
    if (match) {
      tally('D-13', space)
      return { match, measureFace: face }
    }
  }
  tally('D-13', 'none')
  return null
}

function resolveSingleMatch(params: {
  rootFace: RootFace
  dual?: FaceDualSpace
  refBands: DoorSwingRefBand[]
  sizeBand: DoorSizeBandPx
  aspectToleranceRatio: number
}): SingleMatchResolution {
  const { rootFace } = params
  if (rootFace.className === 'wall') {
    const rescued = resolveWallRescueEither({
      rootFace,
      dual: params.dual,
      refBands: params.refBands,
      sizeBand: params.sizeBand,
      aspectToleranceRatio: params.aspectToleranceRatio,
    })
    if (!rescued) {
      return { isNotSeed: true, singleMatch: null, measureFace: rootFace }
    }
    return {
      isNotSeed: false,
      singleMatch: rescued.match,
      measureFace: rescued.measureFace,
    }
  }

  const strictSingleMatch = bestAspectRef(
    rootFace.bbox,
    params.refBands,
    params.aspectToleranceRatio,
    { sizeBand: params.sizeBand },
  )
  // Size past op muur-as+ref-diepte, aspect iets ruimer (ondiepe refs / tekeningvariatie).
  const sizeNearMatch = !strictSingleMatch
    ? bestAspectRef(
        rootFace.bbox,
        params.refBands,
        Math.max(params.aspectToleranceRatio, DOOR_SWING_TUNING.wallFillAspectToleranceRatio),
        { sizeBand: params.sizeBand },
      )
    : null
  const isUnderWallMin = underWallMinBand(rootFace.bbox, params.sizeBand)
  const looseUnderMinMatch =
    !strictSingleMatch && isUnderWallMin
      ? bestAspectRef(
          rootFace.bbox,
          params.refBands,
          params.aspectToleranceRatio + DOOR_SWING_TUNING.shallowRescueAspectToleranceBonus,
          {
            sizeBand: params.sizeBand,
            relaxRatio: DOOR_SWING_TUNING.shallowRescueAxisMinRelaxRatio,
            enforceAbsoluteWallMin: false,
          },
        )
      : null
  const sizeNearRescue =
    !!sizeNearMatch &&
    isWallRescueCandidate({
      face: rootFace,
      match: sizeNearMatch,
      refBands: params.refBands,
    })
  const shallowRescue =
    !!looseUnderMinMatch &&
    isWallRescueCandidate({
      face: rootFace,
      match: looseUnderMinMatch,
      refBands: params.refBands,
    })
  // Opening-wit: outside mag seed zijn (size-band filtert mega-exterior).
  const clippedSingleMatch = !strictSingleMatch
    ? clippedArcRescueMatch({
        bbox: rootFace.bbox,
        areaPx: rootFace.areaPx,
        refBands: params.refBands,
        sizeBand: params.sizeBand,
        aspectToleranceRatio: params.aspectToleranceRatio,
      })
    : null
  // ESC:D-15 (A)
  const singleMatch =
    strictSingleMatch ??
    clippedSingleMatch ??
    (sizeNearRescue ? sizeNearMatch : null) ??
    (shallowRescue ? looseUnderMinMatch : null)
  // Welk niveau leverde: dit is het signaal of de strikte poging ooit slaagt.
  tally(
    'D-15',
    strictSingleMatch
      ? 'strict'
      : clippedSingleMatch
        ? 'clippedArc'
        : sizeNearRescue
          ? 'sizeNear'
          : shallowRescue
            ? 'shallow'
            : 'none',
  )
  return { isNotSeed: false, measureFace: rootFace, singleMatch }
}

/**
 * Evalueert één seed-root tegen ÉÉN specifieke referentie (scoped `refBands` van
 * lengte 1). Bevat de volledige single/cluster/rescue-logica maar altijd gericht
 * op die ene ref, zodat de cluster-groei niet vroegtijdig op een kleinere ref
 * stopt. De teruggegeven `match.matchedRefIndex` is geremapt naar de echte index.
 */
export function evaluateSeedForRef(params: {
  root: number
  rootFace: RootFace
  dual?: FaceDualSpace
  refBands: DoorSwingRefBand[]
  realRefIndex: number
  rootFaces: Map<number, RootFace>
  adjacency: Map<number, Set<number>>
  classificationByLabel: Map<number, RoomRasterClass>
  sizeBand: DoorSizeBandPx
  aspectToleranceRatio: number
  maxClusterSize: number
  allowedSeedClasses?: ReadonlySet<RoomRasterClass>
}): SeedOutcome {
  const { rootFace, refBands, sizeBand, aspectToleranceRatio, maxClusterSize } = params
  if (params.allowedSeedClasses && !params.allowedSeedClasses.has(rootFace.className)) {
    return { kind: 'not_seed' }
  }
  const remap = (match: RefMatch): RefMatch => ({
    matchedRefIndex: params.realRefIndex,
    score: match.score,
  })

  const singleResolution = resolveSingleMatch({
    rootFace,
    dual: params.dual,
    refBands,
    sizeBand,
    aspectToleranceRatio,
  })
  if (singleResolution.isNotSeed) {
    return { kind: 'not_seed' }
  }
  // ESC:D-16 (C)
  // Wall-rescue Either kan white-geom kiezen terwijl aggregate ink heeft.
  const measureFace = singleResolution.measureFace
  if (
    measureFace.areaPx !== rootFace.areaPx ||
    measureFace.bbox.width !== rootFace.bbox.width ||
    measureFace.bbox.height !== rootFace.bbox.height ||
    measureFace.bbox.x !== rootFace.bbox.x ||
    measureFace.bbox.y !== rootFace.bbox.y
  ) {
    params.rootFaces.set(params.root, measureFace)
  }
  const ref = refBands[0]
  const refSpan = Math.max(1, ref.swingSpanPx ?? 0, ref.swingWpx, ref.swingHpx)
  const refAreaSpan2Ratio = Math.max(
    1e-6,
    ref.areaSpan2Ratio ?? ref.areaPx / Math.max(1, refSpan * refSpan),
  )
  const refBoxArea = Math.max(1, refAreaSpan2Ratio * refSpan * refSpan)

  const finalizeCluster = (clustered: {
    roots: number[]
    union: { x: number; y: number; width: number; height: number }
    match: RefMatch
  }): SeedOutcome => {
    const absorbed = absorbInBandNeighbors({
      acceptedRoots: clustered.roots,
      union: clustered.union,
      rootFaces: params.rootFaces,
      adjacency: params.adjacency,
      classificationByLabel: params.classificationByLabel,
      sizeBand,
      refBands,
      matchedRefIndex: clustered.match.matchedRefIndex,
      aspectToleranceRatio,
      maxClusterSize,
      allowedSeedClasses: params.allowedSeedClasses,
    })
    return {
      kind: 'accepted',
      source: 'cluster',
      faceIds: [...absorbed.roots].sort((a, b) => a - b),
      union: absorbed.union,
      match: remap(clustered.match),
    }
  }

  const singleMatch = singleResolution.singleMatch
  if (singleMatch) {
    const absorbed = absorbInBandNeighbors({
      acceptedRoots: [params.root],
      union: measureFace.bbox,
      rootFaces: params.rootFaces,
      adjacency: params.adjacency,
      classificationByLabel: params.classificationByLabel,
      sizeBand,
      refBands,
      matchedRefIndex: singleMatch.matchedRefIndex,
      aspectToleranceRatio,
      maxClusterSize,
      allowedSeedClasses: params.allowedSeedClasses,
    })
    const singleArea = absorbed.union.width * absorbed.union.height
    // Undersized single: veel kleiner dan de ref-bbox → eerst proberen naar de
    // volle boog te clusteren. Lukt dat (grotere passende union), gebruik die.
    // ESC:D-17 (A)
    if (singleArea < DOOR_SWING_TUNING.undersizedSingleRefAreaRatio * refBoxArea) {
      const clustered = growClusterForRef({
        seed: params.root,
        rootFace: measureFace,
        refBands,
        rootFaces: params.rootFaces,
        adjacency: params.adjacency,
        classificationByLabel: params.classificationByLabel,
        sizeBand,
        aspectToleranceRatio,
        maxClusterSize,
        allowedSeedClasses: params.allowedSeedClasses,
      })
      if (clustered && clustered.union.width * clustered.union.height > singleArea) {
        return finalizeCluster(clustered)
      }
    }
    return {
      kind: 'accepted',
      source: 'single',
      faceIds: [...absorbed.roots].sort((a, b) => a - b),
      union: absorbed.union,
      match: remap(singleMatch),
    }
  }
  // Cluster-pad: vlakken die de absolute muur-max al overschrijden kunnen geen
  // cluster-onderdeel worden (clusteren vergroot de bbox alleen maar).
  if (exceedsMaxSizeBand(measureFace.bbox, sizeBand)) {
    return { kind: 'rejected_out_of_band' }
  }

  const clustered = growClusterForRef({
    seed: params.root,
    rootFace: measureFace,
    refBands,
    rootFaces: params.rootFaces,
    adjacency: params.adjacency,
    classificationByLabel: params.classificationByLabel,
    sizeBand,
    aspectToleranceRatio,
    maxClusterSize,
    allowedSeedClasses: params.allowedSeedClasses,
  })
  if (!clustered) {
    return { kind: 'rejected_no_match' }
  }
  return finalizeCluster(clustered)
}
