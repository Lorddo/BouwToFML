import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { collectNeighborsViaWallInkBridge } from '@/cv/walls/rooms/wall-ink-bridge'
import type {
  DoorSizeBandPx,
  DoorSwingHypothesis,
  DoorSwingRefBand,
} from './types'
import {
  DOOR_SWING_TUNING,
  bestAspectRef,
  clippedArcRescueMatch,
  exceedsMaxSizeBand,
  matchesSingleRef,
  type RefMatch,
  type RootFace,
  unionBbox,
} from './door-swing-filter-matching'
import { DOOR_SPACE_POLICY } from './door-space-policy'

/** Cluster-buren via gedeelde ink-bridge hop (`wall-ink-bridge.ts`). */
function collectBoundaryNeighbors(
  roots: number[],
  adjacency: Map<number, Set<number>>,
  seen: Set<number>,
  classificationByLabel?: Map<number, RoomRasterClass>,
): number[] {
  return collectNeighborsViaWallInkBridge({
    roots,
    adjacency,
    seen,
    classificationByLabel,
    bridgeViaInk: DOOR_SPACE_POLICY.stage1ClusterBridge === 'ink',
  })
}

function isClusterableFace(
  face: RootFace,
  allowedSeedClasses?: ReadonlySet<RoomRasterClass>,
): boolean {
  if (allowedSeedClasses) return allowedSeedClasses.has(face.className)
  return face.className !== 'wall'
}

function bboxAspect(bbox: { width: number; height: number }): number {
  const minSide = Math.max(1, Math.min(bbox.width, bbox.height))
  return Math.max(bbox.width, bbox.height) / minSide
}

function pickBestNeighbor(params: {
  currentBbox: { x: number; y: number; width: number; height: number }
  candidates: number[]
  rootFaces: Map<number, RootFace>
  sizeBand: DoorSizeBandPx
  refBands: DoorSwingRefBand[]
  targetWpx?: number
  targetHpx?: number
  allowedSeedClasses?: ReadonlySet<RoomRasterClass>
}): number | null {
  // Underfill wordt gemeten t.o.v. de doelgrootte: bij cluster-groei richting een
  // specifieke ref is dat de ECHTE ref-afmeting (niet de globale min), zodat de
  // greedy blijft groeien tot de volle boog i.p.v. te stoppen op de globale min.
  const targetWpx = params.targetWpx ?? params.sizeBand.wallMinPx
  const targetHpx = params.targetHpx ?? params.sizeBand.wallMinPx
  const maxWpx = targetWpx * DOOR_SWING_TUNING.growMaxOvershootRatio
  const maxHpx = targetHpx * DOOR_SWING_TUNING.growMaxOvershootRatio
  const refAspect = Math.max(1e-6, params.refBands[0]?.aspectRef ?? 1)
  const baseUnderfill =
    Math.max(0, targetWpx - params.currentBbox.width) +
    Math.max(0, targetHpx - params.currentBbox.height)
  let best: {
    root: number
    underfillReduction: number
    aspectRelDiff: number
    areaPx: number
  } | null = null
  for (const root of params.candidates) {
    const candidate = params.rootFaces.get(root)
    if (!candidate) continue
    if (!isClusterableFace(candidate, params.allowedSeedClasses)) continue
    const nextBbox = unionBbox(params.currentBbox, candidate.bbox)
    if (exceedsMaxSizeBand(nextBbox, params.sizeBand)) continue
    // Tip-faces van een boog (vrije tip naast de sector) verlagen underfill hard
    // door breedte én hoogte tegelijk, maar schieten ver voorbij de ref-target en
    // verzieken de aspect. Sectorstroken (diepte-opbouw) blijven binnen maxW/H.
    if (nextBbox.width > maxWpx && nextBbox.width > params.currentBbox.width) continue
    if (nextBbox.height > maxHpx && nextBbox.height > params.currentBbox.height) continue
    const nextUnderfill =
      Math.max(0, targetWpx - nextBbox.width) +
      Math.max(0, targetHpx - nextBbox.height)
    const reduction = baseUnderfill - nextUnderfill
    if (reduction <= 0) continue
    const aspectRelDiff = Math.abs(bboxAspect(nextBbox) - refAspect) / refAspect
    const row = {
      root,
      underfillReduction: reduction,
      aspectRelDiff,
      areaPx: candidate.areaPx,
    }
    if (!best) {
      best = row
      continue
    }
    if (row.underfillReduction > best.underfillReduction) {
      best = row
      continue
    }
    if (row.underfillReduction < best.underfillReduction) continue
    if (row.aspectRelDiff < best.aspectRelDiff) {
      best = row
      continue
    }
    if (row.aspectRelDiff > best.aspectRelDiff) continue
    if (row.areaPx > best.areaPx) {
      best = row
      continue
    }
    if (row.areaPx < best.areaPx) continue
    if (row.root < best.root) best = row
  }
  return best?.root ?? null
}

export function absorbInBandNeighbors(params: {
  acceptedRoots: number[]
  union: { x: number; y: number; width: number; height: number }
  rootFaces: Map<number, RootFace>
  adjacency: Map<number, Set<number>>
  classificationByLabel: Map<number, RoomRasterClass>
  sizeBand: DoorSizeBandPx
  refBands: DoorSwingRefBand[]
  matchedRefIndex: number
  aspectToleranceRatio: number
  maxClusterSize: number
  allowedSeedClasses?: ReadonlySet<RoomRasterClass>
}): { roots: number[]; union: { x: number; y: number; width: number; height: number } } {
  const roots = [...params.acceptedRoots]
  const seen = new Set<number>(roots)
  let union = { ...params.union }
  // Absorptie is PER REFERENTIE gebonden: de union mag alleen groeien zolang die
  // binnen dezelfde gematchte referentie (aspect + ref-gebonden maatband) blijft.
  // Zo kan een hypothese niet opgeblazen worden doordat de grotere union toevallig
  // bij een ANDERE referentie past (dat gaf de scheve dubbele-deur velden).
  const matchRef = params.refBands[params.matchedRefIndex]
  if (!matchRef) return { roots, union }
  const absorbAspectTolerance =
    params.aspectToleranceRatio + DOOR_SWING_TUNING.absorbAspectToleranceBonus
  while (roots.length < params.maxClusterSize) {
    const candidateRoots = collectBoundaryNeighbors(
      roots,
      params.adjacency,
      seen,
      params.classificationByLabel,
    )
    if (candidateRoots.length === 0) break
    const candidates = candidateRoots
      .map((root) => params.rootFaces.get(root))
      .filter((face): face is RootFace => !!face && isClusterableFace(face, params.allowedSeedClasses))
      .sort((a, b) => a.areaPx - b.areaPx || a.root - b.root)
    let absorbedAny = false
    for (const candidate of candidates) {
      if (roots.length >= params.maxClusterSize) break
      if (seen.has(candidate.root)) continue
      const nextUnion = unionBbox(union, candidate.bbox)
      if (exceedsMaxSizeBand(nextUnion, params.sizeBand)) continue
      const currentUnionArea = Math.max(1, union.width * union.height)
      if (candidate.areaPx > DOOR_SWING_TUNING.absorbMaxNeighborAreaRatio * currentUnionArea) {
        continue
      }
      const stillMatches = matchesSingleRef(
        nextUnion,
        matchRef,
        params.sizeBand,
        absorbAspectTolerance,
      )
      if (stillMatches === null) continue
      roots.push(candidate.root)
      seen.add(candidate.root)
      union = nextUnion
      absorbedAny = true
    }
    if (!absorbedAny) break
  }
  return { roots, union }
}

/** Ref-bbox georiënteerd naar de union (lange/korte as volgen de union-oriëntatie). */
function orientedRefTarget(
  union: { width: number; height: number },
  ref: DoorSwingRefBand,
): { w: number; h: number } {
  const span = Math.max(1, ref.swingSpanPx ?? 0, ref.swingWpx, ref.swingHpx)
  const fallbackLongRatio = Math.max(ref.swingWpx, ref.swingHpx) / span
  const fallbackShortRatio = Math.min(ref.swingWpx, ref.swingHpx) / span
  const wallRatio = Math.max(1e-6, ref.wallRatio ?? fallbackLongRatio)
  const depthRatio = Math.max(1e-6, ref.depthRatio ?? fallbackShortRatio)
  const long = Math.max(1, span * Math.max(wallRatio, depthRatio))
  const short = Math.max(1, span * Math.min(wallRatio, depthRatio))
  return union.width >= union.height ? { w: long, h: short } : { w: short, h: long }
}

/**
 * Groeit een cluster vanaf een seed richting de ECHTE afmeting van één ref en
 * houdt de GROOTSTE union bij die de ref matcht (niet de eerste piepkleine match
 * die alleen door de globale min-vloer heen komt). Stopt zodra de union de
 * ref-grootte bereikt of geen buur meer dichterbij de ref-grootte brengt.
 */
export function growClusterForRef(params: {
  seed: number
  rootFace: RootFace
  refBands: DoorSwingRefBand[]
  rootFaces: Map<number, RootFace>
  adjacency: Map<number, Set<number>>
  classificationByLabel: Map<number, RoomRasterClass>
  sizeBand: DoorSizeBandPx
  aspectToleranceRatio: number
  maxClusterSize: number
  allowedSeedClasses?: ReadonlySet<RoomRasterClass>
}): { roots: number[]; union: { x: number; y: number; width: number; height: number }; match: RefMatch } | null {
  const ref = params.refBands[0]
  if (!ref) return null
  const clusterRoots: number[] = [params.seed]
  const seen = new Set<number>(clusterRoots)
  let union = { ...params.rootFace.bbox }
  let unionAreaPx = params.rootFace.areaPx
  const bestHolder: {
    current: {
      roots: number[]
      union: { x: number; y: number; width: number; height: number }
      match: RefMatch
    } | null
  } = { current: null }
  const consider = () => {
    // Zelfde matchbreedte als het single-pad: strikt óf clipped-arc (langgerekte
    // maar geldige boog). Anders zou een geclusterde boog die net iets langgerekter
    // is dan de ref (zoals de gestapelde stroken van een dubbele deur) nooit matchen
    // terwijl één enkel vlak van dezelfde vorm wél via clipped-arc geaccepteerd wordt.
    const match =
      bestAspectRef(union, params.refBands, params.aspectToleranceRatio, {
        sizeBand: params.sizeBand,
      }) ??
      clippedArcRescueMatch({
        bbox: union,
        areaPx: unionAreaPx,
        refBands: params.refBands,
        sizeBand: params.sizeBand,
        aspectToleranceRatio: params.aspectToleranceRatio,
      })
    if (!match) return
    // Kies de BEST scorende union (dichtst bij de ref qua aspect/fill), niet de
    // grootste. Anders slokt de groei een extra tussenvlak op zolang de bredere
    // union nog nét binnen de clipped-arc marge valt (bijv. het middenstrookje
    // tussen twee dubbele-deur bladen → union 176×122 clipped-score 0.55 i.p.v.
    // de schone boog 138×122). Bij gelijke score wint het grotere oppervlak.
    const area = union.width * union.height
    const current = bestHolder.current
    const isBetter =
      !current ||
      match.score > current.match.score + 1e-9 ||
      (Math.abs(match.score - current.match.score) <= 1e-9 &&
        area > current.union.width * current.union.height)
    if (isBetter) {
      bestHolder.current = { roots: [...clusterRoots], union: { ...union }, match }
    }
  }
  consider()
  while (clusterRoots.length < params.maxClusterSize) {
    const target = orientedRefTarget(union, ref)
    if (union.width >= target.w && union.height >= target.h) break
    const candidates = collectBoundaryNeighbors(
      clusterRoots,
      params.adjacency,
      seen,
      params.classificationByLabel,
    )
    if (candidates.length === 0) break
    const bestNeighbor = pickBestNeighbor({
      currentBbox: union,
      candidates,
      rootFaces: params.rootFaces,
      sizeBand: params.sizeBand,
      refBands: params.refBands,
      targetWpx: target.w,
      targetHpx: target.h,
      allowedSeedClasses: params.allowedSeedClasses,
    })
    if (bestNeighbor == null) break
    const bestFace = params.rootFaces.get(bestNeighbor)
    if (!bestFace) break
    clusterRoots.push(bestNeighbor)
    seen.add(bestNeighbor)
    union = unionBbox(union, bestFace.bbox)
    unionAreaPx += bestFace.areaPx
    consider()
  }
  const bestCluster = bestHolder.current
  if (!bestCluster || bestCluster.roots.length <= 1) return null
  return bestCluster
}

export function makeHypothesis(params: {
  source: 'single' | 'cluster'
  faceIds: number[]
  unionBBox: { x: number; y: number; width: number; height: number }
  filledAreaPx: number
  match: RefMatch
  serial: number
}): DoorSwingHypothesis {
  const sorted = [...params.faceIds].sort((a, b) => a - b)
  return {
    id: `door-swing-${params.source}-${params.serial}`,
    faceIds: sorted,
    unionBBox: params.unionBBox,
    filledAreaPx: Math.max(0, Math.round(params.filledAreaPx)),
    score: params.match.score,
    source: params.source,
    matchedRefIndex: params.match.matchedRefIndex,
  }
}
