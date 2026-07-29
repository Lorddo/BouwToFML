import {
  resolvePixelClassification,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import type { DoorSizeBandPx, DoorSwingRefBand } from './types'

export const DOOR_SWING_TUNING = {
  defaultAspectToleranceRatio: 0.05,
  defaultMaxClusterSize: 10,
  refAxisMinRelaxRatio: 0.75,
  // Ref-gebonden bovengrens: een gematchte blob mag niet veel groter zijn dan de
  // referentie zelf. Voorheen was de bovengrens de absolute muur-max (~1200mm),
  // waardoor een 222×123 blob als dezelfde "deur" telde als een 70×39 referentie
  // puur omdat de aspect toevallig klopte. Nu: muur-as ∩ ref-muur, diepte alleen ref.
  refAxisMaxRelaxRatio: 2.0,
  wallRescueAxisMinRelaxRatio: 0.65,
  // Ondiepe plan-fragmenten liggen vaak ~55% van de ref-swing (2D_3E kast).
  // 0.55 liet 44px net zakken (0.55×81=44.55) terwijl 45px wel door kwam.
  shallowRescueAxisMinRelaxRatio: 0.5,
  shallowRescueAspectToleranceBonus: 0.03,
  // Cluster-groei mag de ref-target licht overschrijden (clipped-arc deuren
  // zijn soms ~15% breder), maar tip-faces die ver voorbij de target-as
  // schieten (dubbele-deur vrije tip) worden geweigerd — anders wint pure
  // underfill-greedy en verziekt de aspect (probe-1 rechter vleugel).
  growMaxOvershootRatio: 1.2,
  // Stage-2 wall-fill (pass A): Otsu-ingekleurde deuren zijn vaak iets "dikker"
  // in bbox dan de ref-swing (muurstrook meegenomen) → aspect-relDiff ~10–17%.
  // Strikte 5% (Stage-1) blokkeert die vóór fill; hier ruimer zodat fill beslist.
  wallFillAspectToleranceRatio: 0.18,
  wallRescueMaxRelAreaDiff: 0.52,
  wallRescueMaxFillDiff: 0.18,
  wallRescueMinFill: 0.45,
  wallRescueMaxFill: 0.9,
  clippedArcMaxAspectScale: 1.3,
  clippedArcMinAreaRatio: 0.6,
  clippedArcMaxAreaRatio: 1.2,
  clippedArcMaxFillDiff: 0.23,
  clippedArcMinFill: 0.4,
  clippedArcMaxFill: 0.97,
  // Na een match nog kleine aanliggende puntjes in de mask meepakken zolang de
  // union binnen de band blijft. Guard voorkomt dat een even grote buurkamer
  // wordt opgeslokt; de aspect-bonus laat een puntje dat de bbox iets oprekt toe.
  absorbMaxNeighborAreaRatio: 0.5,
  absorbAspectToleranceBonus: 0.08,
  // Een single-match die (veel) kleiner is dan de bbox van de gematchte ref wordt
  // eerst als cluster geprobeerd: misschien is het een deelvlak van de volle boog.
  // Alleen als clustering geen grotere match oplevert blijft de single staan.
  undersizedSingleRefAreaRatio: 0.55,
  // clippedArcRescueMatch score: gewogen penalty + vloer (zelfde waarden als vóór named const).
  clippedArcScoreClippedWeight: 0.55,
  clippedArcScoreAreaWeight: 0.3,
  clippedArcScoreFillWeight: 0.15,
  clippedArcScoreFloor: 0.55,
} as const

export type RootFace = {
  root: number
  areaPx: number
  bbox: { x: number; y: number; width: number; height: number }
  className: RoomRasterClass
}

const CLASS_PRIORITY: Record<RoomRasterClass, number> = {
  wall: 5,
  window: 5,
  doorframe: 5,
  door: 4,
  unknown: 3,
  surface: 2,
  outside: 1,
}

export type RefMatch = {
  matchedRefIndex: number
  score: number
}

export function unionBbox(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x + a.width, b.x + b.width)
  const maxY = Math.max(a.y + a.height, b.y + b.height)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function computeAspect(bbox: { width: number; height: number }): number {
  const minSide = Math.max(1, Math.min(bbox.width, bbox.height))
  const maxSide = Math.max(bbox.width, bbox.height)
  return maxSide / minSide
}

/** Lange as = muur/opening, korte as = draaidiepte (ondiepe boog). */
function orientedWallDepth(width: number, height: number): { wallPx: number; depthPx: number } {
  return width >= height ? { wallPx: width, depthPx: height } : { wallPx: height, depthPx: width }
}

function refSwingSpanPx(ref: DoorSwingRefBand): number {
  return Math.max(1, ref.swingSpanPx ?? 0, ref.swingWpx, ref.swingHpx)
}

function resolveRefWallDepthRatios(ref: DoorSwingRefBand): {
  wallRatio: number
  depthRatio: number
} {
  const span = refSwingSpanPx(ref)
  const fallbackWall = Math.max(ref.swingWpx, ref.swingHpx) / span
  const fallbackDepth = Math.min(ref.swingWpx, ref.swingHpx) / span
  const wallRatio = Math.max(1e-6, ref.wallRatio ?? fallbackWall)
  const depthRatio = Math.max(1e-6, ref.depthRatio ?? fallbackDepth)
  if (wallRatio >= depthRatio) return { wallRatio, depthRatio }
  return { wallRatio: depthRatio, depthRatio: wallRatio }
}

function resolveRefAreaSpan2Ratio(ref: DoorSwingRefBand): number {
  const fallback = ref.areaPx / Math.max(1, refSwingSpanPx(ref) * refSwingSpanPx(ref))
  return Math.max(1e-6, ref.areaSpan2Ratio ?? fallback)
}

function resolveRefFillRatio(ref: DoorSwingRefBand): number {
  const legacy = fillRatio(ref.areaPx, { width: ref.swingWpx, height: ref.swingHpx })
  const { wallRatio, depthRatio } = resolveRefWallDepthRatios(ref)
  const denom = wallRatio * depthRatio
  if (!(denom > 1e-6)) return legacy
  return resolveRefAreaSpan2Ratio(ref) / denom
}

/**
 * Muur-as: absolute mm-band ∩ ref-muur ± relax (tenzij `enforceAbsoluteWallMin=false`
 * bij under-wall-min rescue: dan alleen ref-relatief).
 * Diepte-as: alleen ref-diepte ± relax (geen DOOR_MIN_MM).
 */
function fitsSizeBandForRef(
  bbox: { width: number; height: number },
  sizeBand: DoorSizeBandPx,
  refBand: DoorSwingRefBand,
  relaxRatio?: number,
  maxRelaxRatio?: number,
  enforceAbsoluteWallMin = true,
): boolean {
  const minRelax = relaxRatio ?? DOOR_SWING_TUNING.refAxisMinRelaxRatio
  const maxRelax = maxRelaxRatio ?? DOOR_SWING_TUNING.refAxisMaxRelaxRatio
  const refSpan = refSwingSpanPx(refBand)
  const refRatios = resolveRefWallDepthRatios(refBand)
  const ref = {
    wallPx: Math.max(1, Math.round(refSpan * refRatios.wallRatio)),
    depthPx: Math.max(1, Math.round(refSpan * refRatios.depthRatio)),
  }
  const box = orientedWallDepth(bbox.width, bbox.height)

  const refWallMin = Math.max(1, Math.round(ref.wallPx * minRelax))
  const wallMin = enforceAbsoluteWallMin ? Math.max(sizeBand.wallMinPx, refWallMin) : refWallMin
  const wallMax = Math.min(sizeBand.wallMaxPx, Math.round(ref.wallPx * maxRelax))
  if (wallMin > wallMax) return false
  if (box.wallPx < wallMin || box.wallPx > wallMax) return false

  const depthMin = Math.max(1, Math.round(ref.depthPx * minRelax))
  const depthMax = Math.max(depthMin, Math.round(ref.depthPx * maxRelax))
  if (box.depthPx < depthMin || box.depthPx > depthMax) return false

  return true
}

/** Aspect + ref-gebonden maatband tegen ÉÉN specifieke referentie (per-ref). */
export function matchesSingleRef(
  bbox: { width: number; height: number },
  ref: DoorSwingRefBand,
  sizeBand: DoorSizeBandPx,
  aspectToleranceRatio: number,
): number | null {
  if (!fitsSizeBandForRef(bbox, sizeBand, ref)) return null
  const refAspect = Math.max(1e-6, ref.aspectRef)
  const relDiff = Math.abs(computeAspect(bbox) - refAspect) / refAspect
  if (relDiff > aspectToleranceRatio) return null
  return Math.max(0, 1 - relDiff)
}

/** Alleen de muur-as mag de absolute max (1200mm) overschrijden. */
export function exceedsMaxSizeBand(
  bbox: { width: number; height: number },
  sizeBand: DoorSizeBandPx,
): boolean {
  return Math.max(bbox.width, bbox.height) > sizeBand.wallMaxPx
}

export function bestAspectRef(
  bbox: { width: number; height: number },
  refBands: DoorSwingRefBand[],
  aspectToleranceRatio: number,
  opts?: {
    sizeBand?: DoorSizeBandPx
    relaxRatio?: number
    /** false = under-wall-min rescue: alleen ref-relatief, geen absolute DOOR_MIN. */
    enforceAbsoluteWallMin?: boolean
  },
): RefMatch | null {
  if (refBands.length === 0) return null
  const aspect = computeAspect(bbox)
  let bestIndex = -1
  let bestDiff = Number.POSITIVE_INFINITY
  for (let i = 0; i < refBands.length; i += 1) {
    const ref = refBands[i]
    if (
      opts?.sizeBand &&
      !fitsSizeBandForRef(
        bbox,
        opts.sizeBand,
        ref,
        opts.relaxRatio,
        undefined,
        opts.enforceAbsoluteWallMin ?? true,
      )
    ) {
      continue
    }
    const refAspect = Math.max(1e-6, ref.aspectRef)
    const relDiff = Math.abs(aspect - refAspect) / refAspect
    if (relDiff > aspectToleranceRatio) continue
    if (relDiff < bestDiff) {
      bestDiff = relDiff
      bestIndex = i
    }
  }
  if (bestIndex < 0) return null
  return { matchedRefIndex: bestIndex, score: Math.max(0, 1 - bestDiff) }
}

export function wallRescueMatch(
  bbox: { width: number; height: number },
  refBands: DoorSwingRefBand[],
  sizeBand: DoorSizeBandPx,
  aspectToleranceRatio: number,
): RefMatch | null {
  return bestAspectRef(bbox, refBands, aspectToleranceRatio, {
    sizeBand,
    relaxRatio: DOOR_SWING_TUNING.wallRescueAxisMinRelaxRatio,
  })
}

function fillRatio(areaPx: number, bbox: { width: number; height: number }): number {
  const boxArea = Math.max(1, bbox.width * bbox.height)
  return areaPx / boxArea
}

function swingSpanOfBbox(bbox: { width: number; height: number }): number {
  return Math.max(1, bbox.width, bbox.height)
}

/**
 * Verwachte filled area bij uniforme boog-schaal (lengte én diepte).
 * Kozijn/AS schaalt niet mee — alleen het sector-vlak; daarom span² i.p.v. abs area.
 */
function expectedSwingAreaPx(
  ref: DoorSwingRefBand,
  candidateBbox: { width: number; height: number },
): number {
  const candidateSpan = swingSpanOfBbox(candidateBbox)
  return Math.max(1, resolveRefAreaSpan2Ratio(ref) * candidateSpan * candidateSpan)
}

export function isWallRescueCandidate(params: {
  face: RootFace
  match: RefMatch
  refBands: DoorSwingRefBand[]
}): boolean {
  const ref = params.refBands[params.match.matchedRefIndex]
  if (!ref) return false
  const expectedArea = expectedSwingAreaPx(ref, params.face.bbox)
  const areaRelDiff = Math.abs(params.face.areaPx - expectedArea) / expectedArea
  if (areaRelDiff > DOOR_SWING_TUNING.wallRescueMaxRelAreaDiff) return false
  const candidateFill = fillRatio(params.face.areaPx, params.face.bbox)
  if (
    candidateFill < DOOR_SWING_TUNING.wallRescueMinFill ||
    candidateFill > DOOR_SWING_TUNING.wallRescueMaxFill
  ) {
    return false
  }
  const refFill = resolveRefFillRatio(ref)
  const fillDiff = Math.abs(candidateFill - refFill)
  return fillDiff <= DOOR_SWING_TUNING.wallRescueMaxFillDiff
}

export function clippedArcRescueMatch(params: {
  bbox: { width: number; height: number }
  areaPx: number
  refBands: DoorSwingRefBand[]
  sizeBand: DoorSizeBandPx
  aspectToleranceRatio: number
}): RefMatch | null {
  if (params.refBands.length === 0) return null
  const aspect = computeAspect(params.bbox)
  const candidateFill = fillRatio(params.areaPx, params.bbox)
  if (
    candidateFill < DOOR_SWING_TUNING.clippedArcMinFill ||
    candidateFill > DOOR_SWING_TUNING.clippedArcMaxFill
  ) {
    return null
  }
  let best: { index: number; score: number } | null = null
  for (let i = 0; i < params.refBands.length; i += 1) {
    const ref = params.refBands[i]
    if (!fitsSizeBandForRef(params.bbox, params.sizeBand, ref)) continue
    const refAspect = Math.max(1e-6, ref.aspectRef)
    const strictLimit = refAspect * (1 + params.aspectToleranceRatio)
    if (aspect <= strictLimit) continue
    const looseLimit = refAspect * DOOR_SWING_TUNING.clippedArcMaxAspectScale
    if (aspect > looseLimit) continue
    const expectedArea = expectedSwingAreaPx(ref, params.bbox)
    const areaRatio = params.areaPx / expectedArea
    if (
      areaRatio < DOOR_SWING_TUNING.clippedArcMinAreaRatio ||
      areaRatio > DOOR_SWING_TUNING.clippedArcMaxAreaRatio
    ) {
      continue
    }
    const refFill = resolveRefFillRatio(ref)
    const fillDiff = Math.abs(candidateFill - refFill)
    if (fillDiff > DOOR_SWING_TUNING.clippedArcMaxFillDiff) continue
    const clippedRel = (aspect - strictLimit) / Math.max(1e-6, looseLimit - strictLimit)
    const areaPenalty = Math.abs(1 - areaRatio)
    const fillPenalty = fillDiff / DOOR_SWING_TUNING.clippedArcMaxFillDiff
    const totalPenalty =
      clippedRel * DOOR_SWING_TUNING.clippedArcScoreClippedWeight +
      areaPenalty * DOOR_SWING_TUNING.clippedArcScoreAreaWeight +
      fillPenalty * DOOR_SWING_TUNING.clippedArcScoreFillWeight
    const score = Math.max(DOOR_SWING_TUNING.clippedArcScoreFloor, 1 - totalPenalty)
    if (!best || score > best.score) {
      best = { index: i, score }
    }
  }
  if (!best) return null
  return { matchedRefIndex: best.index, score: best.score }
}

export function aggregateRootFaces(params: {
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  classificationGroupBy?: 'merged' | 'component'
}): Map<number, RootFace> {
  const roots = new Map<number, RootFace>()
  for (const component of params.components) {
    const root = resolveMergedLabel(component.label, params.parentMap)
    const componentClass = resolvePixelClassification(
      component.label,
      params.parentMap,
      params.classificationByLabel,
      params.classificationGroupBy ?? 'component',
    )
    const existing = roots.get(root)
    if (!existing) {
      roots.set(root, {
        root,
        areaPx: component.areaPx,
        bbox: { ...component.bbox },
        className: componentClass,
      })
      continue
    }
    existing.areaPx += component.areaPx
    existing.bbox = unionBbox(existing.bbox, component.bbox)
    if (CLASS_PRIORITY[componentClass] > CLASS_PRIORITY[existing.className]) {
      existing.className = componentClass
    }
  }
  return roots
}

/** Muur-as korter dan absolute DOOR_MIN (diepte telt niet). */
export function underWallMinBand(
  bbox: { width: number; height: number },
  sizeBand: DoorSizeBandPx,
): boolean {
  return Math.max(bbox.width, bbox.height) < sizeBand.wallMinPx
}
