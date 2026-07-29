import { pickExtremeKozijnFaces, resolveKopeindeAxisBand } from '@/cv/refs/ref-general-categories'
import { refFaceWithGeom, type RefFaceGeom } from '@/cv/refs/ref-face-dual-space'
import type { OpeningRefProfile, RefFace, RefFaceProfile } from '@/cv/refs/types'
import { expandSizeRange, normalizeSizeRange } from './window-size-range'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import { WINDOW_SPACE_POLICY } from './window-space-policy'
import type { WindowAxelRefBand } from './types'

function rotateRefGeom(geom: RefFaceGeom): RefFaceGeom {
  return {
    ...geom,
    bbox: {
      x: geom.bbox.y,
      y: geom.bbox.x,
      width: geom.bbox.height,
      height: geom.bbox.width,
    },
    centroid: { x: geom.centroid.y, y: geom.centroid.x },
  }
}

/** Framing/rails: WINDOW_SPACE_POLICY.refFramingMeasure; bij vertical-normalize ook geom meedraaien. */
function asInkFace(
  face: RefFace,
  faceProfile: RefFaceProfile,
  orientation: 'horizontal' | 'vertical',
): RefFace {
  let geom = faceProfile.dual?.geom(face.label, WINDOW_SPACE_POLICY.refFramingMeasure)
  if (geom && orientation === 'vertical') geom = rotateRefGeom(geom)
  return refFaceWithGeom(face, geom)
}

/** True als dual een framing-geom heeft (policy refFramingMeasure). */
function hasInkGeom(face: RefFace, faceProfile: RefFaceProfile): boolean {
  return faceProfile.dual?.geom(face.label, WINDOW_SPACE_POLICY.refFramingMeasure) != null
}

const CENTER_BAND_WIDTH_PX = 5
const MERGE_GAP_PX = 0
const SIZE_RANGE_MARGIN_RATIO = 0.4

type AxisInterval = { start: number; end: number }
/** Met as-band: top en/of bottom (asymmetrisch OK). Zonder as-band: beide verplicht. */
type TopBottomRails = { top: RefFace | null; bottom: RefFace | null }

function rotateFace(face: RefFace): RefFace {
  return {
    ...face,
    bbox: {
      x: face.bbox.y,
      y: face.bbox.x,
      width: face.bbox.height,
      height: face.bbox.width,
    },
    centroid: { x: face.centroid.y, y: face.centroid.x },
    relativeCentroid: { x: face.relativeCentroid.y, y: face.relativeCentroid.x },
  }
}

function normalizeFaceProfile(
  profile: RefFaceProfile,
  orientation: 'horizontal' | 'vertical',
): RefFaceProfile {
  if (orientation === 'horizontal') return profile
  return {
    ...profile,
    faces: profile.faces.map((face) => rotateFace(face)),
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

function isHorizontalRailFace(face: RefFace, spanW: number): boolean {
  if (face.role !== 'interior') return false
  if (face.areaPx < 4) return false
  return face.bbox.width > face.bbox.height * 2.5 && face.bbox.width > spanW * 0.15
}

/**
 * Echte top/bottom rails: horizontale faces **buiten** de as-band.
 * Met `axisBand`: top en/of bottom onafhankelijk (geen fallthrough naar as-glas).
 * Zonder `axisBand` (geen kozijnen): extreme Y onder horizontale faces — beide verplicht.
 */
function pickExtremeHorizontalRails(params: {
  faces: RefFace[]
  spanW: number
  axisBand?: { yMin: number; yMax: number } | null
}): TopBottomRails | null {
  const rails = params.faces.filter((face) => isHorizontalRailFace(face, params.spanW))
  if (params.axisBand) {
    const topCandidates = rails.filter((face) => face.centroid.y < params.axisBand!.yMin)
    const bottomCandidates = rails.filter((face) => face.centroid.y > params.axisBand!.yMax)
    const top =
      topCandidates.length > 0
        ? [...topCandidates].sort((a, b) => b.bbox.width - a.bbox.width)[0]!
        : null
    const bottom =
      bottomCandidates.length > 0
        ? [...bottomCandidates].sort((a, b) => b.bbox.width - a.bbox.width)[0]!
        : null
    if (!top && !bottom) return null
    if (top && bottom && top.label === bottom.label) return null
    return { top, bottom }
  }
  if (rails.length < 2) return null
  const sorted = [...rails].sort((a, b) => a.centroid.y - b.centroid.y)
  const top = sorted[0]!
  const bottom = sorted[sorted.length - 1]!
  if (top.label === bottom.label) return null
  return { top, bottom }
}

function resolveAxisBandFromRails(rails: {
  top: RefFace
  bottom: RefFace
}): { yMin: number; yMax: number } | null {
  const yMin = rails.top.bbox.y + rails.top.bbox.height
  const yMax = rails.bottom.bbox.y - 1
  if (yMax < yMin) return null
  return { yMin, yMax }
}

function rangeFromFaces(
  faces: RefFace[],
  axisBandHeightPx: number,
): WindowAxelRefBand['framingSizeRange'] {
  if (faces.length <= 0) return null
  const minWidthPx = Math.min(...faces.map((face) => face.bbox.width))
  const minHeightPx = Math.min(...faces.map((face) => face.bbox.height))
  const maxWidthPx = Math.max(...faces.map((face) => face.bbox.width))
  const maxHeightPx = Math.max(...faces.map((face) => face.bbox.height))
  const absolute = expandSizeRange(
    minWidthPx,
    minHeightPx,
    maxWidthPx,
    maxHeightPx,
    SIZE_RANGE_MARGIN_RATIO,
  )
  // Schaal-normalisatie in de ref-build (niet opnieuw per detectiestap).
  return normalizeSizeRange(absolute, axisBandHeightPx)
}

function collectVerticalBandHeights(params: {
  faces: RefFace[]
  centerX: number
  axisYMin: number
  axisYMax: number
}): number[] {
  const half = Math.floor((CENTER_BAND_WIDTH_PX - 1) / 2)
  const bandCenter = Math.round(params.centerX)
  const bandMin = bandCenter - half
  const bandMax = bandMin + CENTER_BAND_WIDTH_PX - 1
  const intervals: AxisInterval[] = []
  for (const face of params.faces) {
    const faceXMin = face.bbox.x
    const faceXMax = face.bbox.x + face.bbox.width - 1
    if (faceXMax < bandMin || faceXMin > bandMax) continue
    const y0 = Math.max(face.bbox.y, params.axisYMin)
    const y1 = Math.min(face.bbox.y + face.bbox.height - 1, params.axisYMax)
    if (y1 < y0) continue
    intervals.push({ start: y0, end: y1 })
  }
  if (intervals.length <= 0) return []
  intervals.sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: AxisInterval[] = []
  for (const interval of intervals) {
    const last = merged[merged.length - 1]
    if (!last || interval.start > last.end + MERGE_GAP_PX + 1) {
      merged.push({ ...interval })
      continue
    }
    if (interval.end > last.end) last.end = interval.end
  }
  return merged
    .map((interval) => interval.end - interval.start + 1)
    .filter((heightPx) => heightPx > 0)
    .sort((a, b) => a - b)
}

/**
 * Stage-1 raam-signature:
 * - Alleen on-axis faces (tussen kopeinden)
 * - Exclusief framing-faces (extreme kozijn links/rechts)
 * - Focus op lange strips met vergelijkbare hoogte
 */
export function analyzeWindowAxelRef(params: {
  refIndex: number
  profile: OpeningRefProfile
}): WindowAxelRefBand | null {
  assertSpacePolicy('window REF strip measure', WINDOW_SPACE_POLICY.refStripMeasure, 'white')
  assertSpacePolicy('window REF framing measure', WINDOW_SPACE_POLICY.refFramingMeasure, 'ink')
  const { refIndex, profile } = params
  if (profile.kind !== 'window') return null

  let best: {
    stripHeightsPx: number[]
    fullStripHeightsPx: number[]
    axisBandHeightPx: number
  } | null = null
  const framingFaces: RefFace[] = []
  /** Opening-wit rails — presence + Stage-3 stack heights. */
  const topRailFacesWhite: RefFace[] = []
  const bottomRailFacesWhite: RefFace[] = []
  /** Wall-ink rails — dual-aanbod / size-ranges. */
  const topRailFacesInk: RefFace[] = []
  const bottomRailFacesInk: RefFace[] = []

  for (const unit of profile.units) {
    const faceProfile = normalizeFaceProfile(unit.faceProfile, profile.orientation)
    const spanW = profile.orientation === 'horizontal' ? profile.cropWidth : profile.cropHeight
    const fullYMax =
      (profile.orientation === 'horizontal' ? profile.cropHeight : profile.cropWidth) - 1
    const extreme = pickExtremeKozijnFaces(faceProfile.faces, spanW)
    let axisBand = resolveKopeindeAxisBand(faceProfile, spanW)
    let excludedLabels = new Set<number>()
    let kozijnExcludedLabels = new Set<number>()
    let anchorAreaPx = 0
    let centerX = 0

    const pushRails = (rails: TopBottomRails) => {
      // White = presence + stack-dikte; ink per rail onafhankelijk (asymmetrisch OK).
      if (rails.top) {
        topRailFacesWhite.push(rails.top)
        if (hasInkGeom(rails.top, faceProfile)) {
          topRailFacesInk.push(asInkFace(rails.top, faceProfile, profile.orientation))
        }
      }
      if (rails.bottom) {
        bottomRailFacesWhite.push(rails.bottom)
        if (hasInkGeom(rails.bottom, faceProfile)) {
          bottomRailFacesInk.push(asInkFace(rails.bottom, faceProfile, profile.orientation))
        }
      }
    }

    if (extreme && axisBand) {
      excludedLabels = new Set([extreme.left.label, extreme.right.label])
      kozijnExcludedLabels = excludedLabels
      // Framing: ink-inclusieve geom; strips blijven white (axisFaces hieronder).
      framingFaces.push(
        asInkFace(extreme.left, faceProfile, profile.orientation),
        asInkFace(extreme.right, faceProfile, profile.orientation),
      )
      anchorAreaPx = (extreme.left.areaPx + extreme.right.areaPx) / 2
      centerX = (extreme.left.centroid.x + extreme.right.centroid.x) / 2
      const rails = pickExtremeHorizontalRails({
        faces: faceProfile.faces,
        spanW,
        axisBand,
      })
      if (rails) pushRails(rails)
    } else {
      const rails = pickExtremeHorizontalRails({
        faces: faceProfile.faces,
        spanW,
        axisBand: null,
      })
      if (!rails?.top || !rails.bottom) continue
      const fallbackBand = resolveAxisBandFromRails({ top: rails.top, bottom: rails.bottom })
      if (!fallbackBand) continue
      axisBand = fallbackBand
      excludedLabels = new Set([rails.top.label, rails.bottom.label])
      // Fullstack-telling: rails blijven strips; alleen echte kozijnen uitsluiten (hier geen).
      kozijnExcludedLabels = new Set()
      pushRails(rails)
      anchorAreaPx = (rails.top.areaPx + rails.bottom.areaPx) / 2
      centerX = (rails.top.centroid.x + rails.bottom.centroid.x) / 2
    }
    if (!axisBand) continue
    const minAxisFaceAreaPx = Math.max(1, anchorAreaPx * 0.5)
    const axisFaces = faceProfile.faces.filter((face) => {
      if (face.role !== 'interior') return false
      if (excludedLabels.has(face.label)) return false
      if (face.centroid.y < axisBand.yMin || face.centroid.y > axisBand.yMax) return false
      if (face.areaPx < minAxisFaceAreaPx) return false
      return face.bbox.width >= face.bbox.height * 1.2
    })
    if (axisFaces.length <= 0) continue
    const stripHeightsPx = collectVerticalBandHeights({
      faces: axisFaces,
      centerX,
      axisYMin: axisBand.yMin,
      axisYMax: axisBand.yMax,
    })
    if (stripHeightsPx.length <= 0) continue
    // Hartlijn over hele REF-hoogte: top/midden/bottom mee, kozijnen L/R niet.
    const fullStripFaces = faceProfile.faces.filter((face) => {
      if (face.role !== 'interior') return false
      if (kozijnExcludedLabels.has(face.label)) return false
      return face.bbox.width >= face.bbox.height * 1.2
    })
    const fullStripHeightsPx = collectVerticalBandHeights({
      faces: fullStripFaces,
      centerX,
      axisYMin: 0,
      axisYMax: Math.max(0, fullYMax),
    })
    const candidate = {
      stripHeightsPx,
      fullStripHeightsPx: fullStripHeightsPx.length > 0 ? fullStripHeightsPx : stripHeightsPx,
      axisBandHeightPx: axisBand.yMax - axisBand.yMin + 1,
    }
    if (!best || candidate.stripHeightsPx.length > best.stripHeightsPx.length) {
      best = candidate
    }
  }

  if (!best) return null
  const stripCount = best.stripHeightsPx.length
  if (stripCount <= 0) return null
  const targetStripHeightPx = round1(median(best.stripHeightsPx))
  if (!(targetStripHeightPx > 0)) return null

  const axisBandHeightPx = Math.max(1, best.axisBandHeightPx)
  const fullStripHeightsPx = best.fullStripHeightsPx
  const fullStripCount = Math.max(1, fullStripHeightsPx.length)
  // Asymmetrisch: top en bottom onafhankelijk (alleen echte rails buiten as-band).
  const topRailHeightPx =
    topRailFacesWhite.length > 0
      ? round1(median(topRailFacesWhite.map((face) => face.bbox.height)))
      : null
  const bottomRailHeightPx =
    bottomRailFacesWhite.length > 0
      ? round1(median(bottomRailFacesWhite.map((face) => face.bbox.height)))
      : null
  const topRailHeightInkPx =
    topRailFacesInk.length > 0
      ? round1(median(topRailFacesInk.map((face) => face.bbox.height)))
      : null
  const bottomRailHeightInkPx =
    bottomRailFacesInk.length > 0
      ? round1(median(bottomRailFacesInk.map((face) => face.bbox.height)))
      : null
  // Size-range: ink wanneer dual voor die rail; anders white.
  const topRailRangeFaces =
    topRailFacesInk.length > 0
      ? topRailFacesInk
      : topRailFacesWhite.length > 0
        ? topRailFacesWhite
        : []
  const bottomRailRangeFaces =
    bottomRailFacesInk.length > 0
      ? bottomRailFacesInk
      : bottomRailFacesWhite.length > 0
        ? bottomRailFacesWhite
        : []
  return {
    refIndex,
    stripCount,
    stripHeightsPx: best.stripHeightsPx,
    targetStripHeightPx,
    targetStripHeightRatio: targetStripHeightPx / axisBandHeightPx,
    axisBandHeightPx,
    orientation: profile.orientation,
    fullStripCount,
    fullStripHeightsPx,
    framingSizeRange: rangeFromFaces(framingFaces, axisBandHeightPx),
    topRailRange: rangeFromFaces(topRailRangeFaces, axisBandHeightPx),
    bottomRailRange: rangeFromFaces(bottomRailRangeFaces, axisBandHeightPx),
    topRailHeightPx,
    bottomRailHeightPx,
    topRailHeightInkPx,
    bottomRailHeightInkPx,
  }
}
