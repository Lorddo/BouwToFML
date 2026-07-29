import type { RootFace } from './window-axel-strip-geometry'
import {
  axisCenter,
  axisSpan,
  overlapLength,
  overlapRatioAlongAxis,
  perpEnd,
  perpGapPx,
  perpSpan,
  perpStart,
} from './window-evidence-geom'
import { WINDOW_EVIDENCE_TUNING } from './window-evidence-tuning'
import type {
  WindowAxelHypothesis,
  WindowAxelOrientation,
  WindowAxelRefBand,
} from './types'

function medianNumber(values: number[]): number {
  if (values.length <= 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

export function isOrientedStripHypothesis(
  hypothesis: WindowAxelHypothesis,
  orientation: WindowAxelOrientation,
): boolean {
  if (hypothesis.orientation !== orientation) return false
  const along = axisSpan(hypothesis.unionBBox, orientation)
  const across = Math.max(1, perpSpan(hypothesis.unionBBox, orientation))
  return along >= across * WINDOW_EVIDENCE_TUNING.minStripAxisToPerpRatio
}

/**
 * Alle REF full-stack stripdiktes (px) — glas én rails, geen rail-only filter.
 * ±20% match is relatief t.o.v. elke expected (1px-ref → tol 0.2).
 */
export function resolveStackExpectedHeightsPx(refBands: WindowAxelRefBand[]): number[] {
  const heights: number[] = []
  for (const ref of refBands) {
    for (const h of ref.fullStripHeightsPx) {
      if (h > 0) heights.push(h)
    }
    if (typeof ref.topRailHeightPx === 'number' && ref.topRailHeightPx > 0) {
      heights.push(ref.topRailHeightPx)
    }
    if (typeof ref.bottomRailHeightPx === 'number' && ref.bottomRailHeightPx > 0) {
      heights.push(ref.bottomRailHeightPx)
    }
  }
  return [...new Set(heights.map((h) => Math.round(h * 10) / 10))].filter((h) => h > 0)
}

function thicknessMatchesStackExpectation(params: {
  thicknessPx: number
  expectedHeightsPx: number[]
}): boolean {
  const { thicknessPx, expectedHeightsPx } = params
  if (!(thicknessPx > 0) || expectedHeightsPx.length <= 0) return false
  for (const expected of expectedHeightsPx) {
    if (!(expected > 0)) continue
    const tol = expected * WINDOW_EVIDENCE_TUNING.stackExpectMargin
    if (Math.abs(thicknessPx - expected) <= tol + 1e-6) return true
  }
  return false
}

function faceStripThicknessPx(
  bbox: RootFace['bbox'],
  orientation: WindowAxelOrientation,
): number {
  return orientation === 'horizontal' ? bbox.height : bbox.width
}

export function allowedFullStripCounts(refBands: WindowAxelRefBand[]): Set<number> {
  const counts = new Set<number>()
  for (const ref of refBands) {
    if (ref.fullStripCount > 0) counts.add(ref.fullStripCount)
  }
  return counts
}

/** Faces raken elkaar loodrecht (inkt tussen wit-stroken is ≤1px gap). */
function facesPerpTouch(params: {
  a: RootFace['bbox']
  b: RootFace['bbox']
  orientation: WindowAxelOrientation
  maxGapPx?: number
}): boolean {
  const maxGapPx = params.maxGapPx ?? WINDOW_EVIDENCE_TUNING.defaultPerpTouchGapPx
  if (perpGapPx({ a: params.a, b: params.b, orientation: params.orientation }) > maxGapPx + 1e-6) {
    return false
  }
  // Sterke as-overlap: anders hoek-touch / framing aan uiteinde.
  return (
    overlapRatioAlongAxis({
      a: params.a,
      b: params.b,
      orientation: params.orientation,
    }) >= WINDOW_EVIDENCE_TUNING.minStackAxisOverlapRatio
  )
}

/**
 * Stage-3 full stack — ALLEEN parallelle strips op de glas-as (lokale perp-stapel).
 * Framing (as-uiteinden L/R of T/B) doet het andere pad; hier niet naartoe groeien.
 * Wall-ink = alleen lokale bruggen; geen gevel-lange BFS.
 */
export function growFullStackFromSeedFaces(params: {
  seedFaceIds: number[]
  orientation: WindowAxelOrientation
  seedBbox: WindowAxelHypothesis['unionBBox']
  /** Opening-wit faces — enige bron van stack-leden. */
  whiteFaces: RootFace[]
  /** Wall-ink faces — alleen connectivity-bruggen. */
  inkFaces: RootFace[]
  wallInkAdjacency: Map<number, Set<number>>
  expectedHeightsPx: number[]
  maxFaceCount: number
}): number[] {
  const {
    seedFaceIds,
    orientation,
    seedBbox,
    whiteFaces,
    inkFaces,
    wallInkAdjacency,
    expectedHeightsPx,
    maxFaceCount,
  } = params
  const whiteByRoot = new Map(whiteFaces.map((f) => [f.root, f]))
  const inkByRoot = new Map(inkFaces.map((f) => [f.root, f]))
  const seedIds = [...new Set(seedFaceIds.filter((id) => id > 0 && whiteByRoot.has(id)))]
  const seedFaces = seedIds
    .map((id) => whiteByRoot.get(id))
    .filter((f): f is RootFace => !!f)
  const seedSpans = seedFaces.map((f) => axisSpan(f.bbox, orientation)).filter((s) => s > 0)
  const seedMedianSpan = medianNumber(seedSpans)
  if (!(seedMedianSpan > 0) || expectedHeightsPx.length <= 0) {
    return seedIds.sort((a, b) => a - b)
  }
  const maxSpan = seedMedianSpan * WINDOW_EVIDENCE_TUNING.maxStripAxisSpanRatio
  const seedAxisMid = axisCenter(seedBbox, orientation)
  const seedAxisLen = Math.max(1, axisSpan(seedBbox, orientation))
  /** Hoe ver een stack-lid van het seed-midden mag liggen langs de glas-as (niet naar framing-uiteinden). */
  const maxAxisCenterOffsetPx = seedAxisLen * WINDOW_EVIDENCE_TUNING.axisSideCenterRatio
  /** Lokale stack-dikte: seed ± N×max REF-hoogte (N = fullStripCount), geen gevel-BFS. */
  const maxExpectedH = Math.max(1, ...expectedHeightsPx)
  const stackPadPx = Math.max(1, maxExpectedH * Math.max(1, maxFaceCount) + Math.max(1, maxFaceCount))
  const bandPerp0 = perpStart(seedBbox, orientation) - stackPadPx
  const bandPerp1 = perpEnd(seedBbox, orientation) + stackPadPx
  /** Wit↔wit: alleen dunne inkt-gap. Grotere sprongen = framing-territorium. */
  const maxWhiteGapPx = WINDOW_EVIDENCE_TUNING.maxWhiteGapPx

  const inLocalStackBand = (bbox: RootFace['bbox']): boolean => {
    const overlap = overlapLength(
      bandPerp0,
      bandPerp1,
      perpStart(bbox, orientation),
      perpEnd(bbox, orientation),
    )
    return overlap > 1e-6
  }

  const onGlassAxis = (bbox: RootFace['bbox']): boolean => {
    if (
      overlapRatioAlongAxis({
        a: seedBbox,
        b: bbox,
        orientation,
      }) < WINDOW_EVIDENCE_TUNING.minStackAxisOverlapRatio
    ) {
      return false
    }
    // Framing-posts zitten aan as-uiteinden; stack-rails blijven bij het glas-midden.
    return Math.abs(axisCenter(bbox, orientation) - seedAxisMid) <= maxAxisCenterOffsetPx + 1e-6
  }

  const isStackMemberFace = (face: RootFace): boolean => {
    const along = axisSpan(face.bbox, orientation)
    const across = Math.max(1, perpSpan(face.bbox, orientation))
    // Geen L/R kozijn-posts: stack-strook is langer langs de muur-as.
    if (along < across * WINDOW_EVIDENCE_TUNING.minStripAxisToPerpRatio) return false
    if (along > maxSpan + 1e-6) return false
    if (!inLocalStackBand(face.bbox)) return false
    if (!onGlassAxis(face.bbox)) return false
    return thicknessMatchesStackExpectation({
      thicknessPx: faceStripThicknessPx(face.bbox, orientation),
      expectedHeightsPx,
    })
  }

  const matched = new Set<number>(seedIds)
  const inkVisited = new Set<number>()
  const inkQueue: number[] = []

  const enqueueInk = (inkId: number) => {
    if (inkVisited.has(inkId)) return
    const ink = inkByRoot.get(inkId)
    if (!ink || !inLocalStackBand(ink.bbox)) return
    // Ink-brug mag langer zijn; as-overlap met seed wél vereist (blijf op deze opening).
    if (
      overlapRatioAlongAxis({
        a: seedBbox,
        b: ink.bbox,
        orientation,
      }) < WINDOW_EVIDENCE_TUNING.minStackAxisOverlapRatio
    ) {
      return
    }
    inkVisited.add(inkId)
    inkQueue.push(inkId)
  }

  const recruitWhitesTouching = (other: RootFace['bbox'], maxGapPx: number) => {
    for (const white of whiteFaces) {
      if (matched.has(white.root)) continue
      if (matched.size >= maxFaceCount) return
      if (!facesPerpTouch({ a: other, b: white.bbox, orientation, maxGapPx })) continue
      if (!isStackMemberFace(white)) continue
      matched.add(white.root)
    }
  }

  // Entry: alleen ink die seed raakt én in lokale stack-band zit.
  for (const ink of inkFaces) {
    if (!inLocalStackBand(ink.bbox)) continue
    const touchesSeed = seedFaces.some((seed) =>
      facesPerpTouch({
        a: seed.bbox,
        b: ink.bbox,
        orientation,
        maxGapPx: WINDOW_EVIDENCE_TUNING.defaultPerpTouchGapPx,
      }),
    )
    if (touchesSeed) enqueueInk(ink.root)
  }

  // BFS alleen via adjacency binnen de lokale band — geen gevel-flood.
  while (inkQueue.length > 0 && matched.size < maxFaceCount) {
    const inkId = inkQueue.shift()
    if (inkId == null) continue
    const ink = inkByRoot.get(inkId)
    if (!ink) continue
    recruitWhitesTouching(ink.bbox, WINDOW_EVIDENCE_TUNING.defaultPerpTouchGapPx)
    const neighbors = wallInkAdjacency.get(inkId)
    if (!neighbors) continue
    for (const neighborId of neighbors) enqueueInk(neighborId)
  }

  // Wit↔wit: strakke gap, zelfde glas-as, lokale band (rails dicht op glas).
  let grew = true
  while (grew && matched.size < maxFaceCount) {
    grew = false
    const matchedFaces = [...matched]
      .map((id) => whiteByRoot.get(id))
      .filter((f): f is RootFace => !!f)
    for (const white of whiteFaces) {
      if (matched.has(white.root) || matched.size >= maxFaceCount) continue
      if (!isStackMemberFace(white)) continue
      const near = matchedFaces.some((seed) =>
        facesPerpTouch({
          a: seed.bbox,
          b: white.bbox,
          orientation,
          maxGapPx: maxWhiteGapPx,
        }),
      )
      if (!near) continue
      matched.add(white.root)
      grew = true
    }
  }

  return [...matched].sort((a, b) => a - b)
}

export function stackMatchesFullStripCount(params: {
  evidenceFaceIds: number[]
  allowedCounts: Set<number>
}): boolean {
  return params.allowedCounts.has(params.evidenceFaceIds.length)
}
