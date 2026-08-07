import { tally } from '@/core/diagnostics'
import type { OpenCV } from '@/cv/loadOpenCV'
import { approxContoursFromMask } from './ref-face-contour'
import { classifyFaceRoles, labelWhiteFaces } from './ref-face-profile'
import { rankSwingSectorFacesForPick } from './ref-swing-arc'
import {
  axisReachFromHinge,
  dedupeCandidates,
  evaluateAxisCandidate,
  hingeAcceptable,
  hingeSideT,
  isHingeOnWallSide,
  pickWallAxisCornerHinge,
  toOutputAxis,
  type AxisCandidate,
  type PickedSwingAxes,
  type ResolvedSwingHingeOptions,
  type WallAxisAlignment,
} from './ref-swing-hinge-axis'
import {
  angleDiffDeg,
  buildSegments,
  clampCropBBox,
  cross,
  directedAngleDeg,
  distToNearestBBoxCorner,
  dot,
  intersectLines,
  magnitude,
  minSeedLength,
  pointInOrOnPolygon,
  polygonBounds,
  polygonPerimeter,
  simplifyClosedPolygonRdp,
  subtract,
} from './ref-swing-hinge-geom'
import type { SwingHingeOptions, SwingHingeResult, SwingSectorFacePick } from './ref-swing-hinge'
import type { RefBBox, RefPoint } from './types'

const AXIS_BAND_PX = 3
/**
 * Absolute vloer: assen dichterbij dit zijn "bijna-parallel" (willekeurig snijpunt).
 * Geen vaste 35° — dat knalt 30°-kastdeuren eruit. Ondiepe (~14°) blijven mogelijk.
 * Trapjes→valse ~17° chord wordt via RDP-simplify opgelost, niet via hogere vloer.
 */
const DEGENERATE_AXIS_SEPARATION_DEG = 8

/** OpenCV / RDP epsilon t.o.v. contour-perimeter — strakke PDF-lijnen én trapjes. */
export const SWING_HINGE_SIMPLIFY_EPS_RATIOS = [0.005, 0.01, 0.0025] as const

/**
 * As-scheiding uit referentie-booghoek.
 * 90°-ref → ~36°, 30°-ref → 12°, onbekend → 8° (alleen diagonaal-scharnier weren).
 */
export function resolveMinAxisSeparationDeg(expectedAngleDeg?: number | null): number {
  if (!(typeof expectedAngleDeg === 'number') || !(expectedAngleDeg > 0)) {
    return DEGENERATE_AXIS_SEPARATION_DEG
  }
  return Math.max(DEGENERATE_AXIS_SEPARATION_DEG, expectedAngleDeg * 0.4)
}

/**
 * @deprecated Geen gate meer vóór hinge-resolve. Swing-sector is al gekozen
 * (`selectSwingSectorFace` / draaicirkel); schematische deuren zijn 3–4 punten.
 * Blijft geëxporteerd voor oude callers; altijd `true` bij ≥3 verts.
 */
export function hasArcLikeContour(polygon: RefPoint[]): boolean {
  return polygon.length >= 3
}

function scoreSwingHinge(
  result: SwingHingeResult,
  expectedAngleDeg?: number | null,
  picker?: 'wall_axis_corner' | 'classic_axes',
): number {
  const balance = Math.min(result.axes[0].supportLength, result.axes[1].supportLength)
  const support = result.axes[0].supportLength + result.axes[1].supportLength
  let score = balance * 2 + support
  // Muur-hoek (L/R of T/B) wint van classic tip-scharnier — ook na RDP.
  if (picker === 'wall_axis_corner') score += 500
  // Geen 30/90-prior: dat trekt ondiepe (~14°) deuren naar de vrije tip.
  if (typeof expectedAngleDeg === 'number' && expectedAngleDeg > 0) {
    score -= Math.abs(result.angleDeg - expectedAngleDeg) * 4
  }
  return score
}

function buildPolygonVariants(polygon: RefPoint[]): RefPoint[][] {
  const variants: RefPoint[][] = [polygon]
  if (polygon.length <= 8) return variants
  const perimeter = polygonPerimeter(polygon)
  if (!(perimeter > 0)) return variants
  for (const ratio of SWING_HINGE_SIMPLIFY_EPS_RATIOS) {
    const simplified = simplifyClosedPolygonRdp(polygon, perimeter * ratio)
    if (simplified.length >= 3 && simplified.length < polygon.length) {
      variants.push(simplified)
    }
  }
  return variants
}

function resolveOptions(options?: SwingHingeOptions): ResolvedSwingHingeOptions {
  const expected =
    typeof options?.expectedAngleDeg === 'number' && options.expectedAngleDeg > 0
      ? options.expectedAngleDeg
      : null
  const minFromOpt =
    typeof options?.minAxisSeparationDeg === 'number' && options.minAxisSeparationDeg > 0
      ? options.minAxisSeparationDeg
      : null
  const preferred: WallAxisAlignment | null =
    options?.preferredWallAxis === 'h' || options?.preferredWallAxis === 'v'
      ? options.preferredWallAxis
      : null
  return {
    axisBandPx: Math.max(1, Math.min(5, options?.axisBandPx ?? AXIS_BAND_PX)),
    minSeedLenPx: Math.max(2, options?.minSeedLenPx ?? 0),
    minAxisSeparationDeg: minFromOpt ?? resolveMinAxisSeparationDeg(expected),
    expectedAngleDeg: expected,
    preferredWallAxis: preferred,
  }
}

function farthestSupportFromHinge(axis: AxisCandidate, hinge: RefPoint): RefPoint {
  let bestPoint: RefPoint = {
    x: hinge.x + axis.dir.x * axis.supportLength,
    y: hinge.y + axis.dir.y * axis.supportLength,
  }
  let bestDist = -1
  for (const point of axis.supportPoints) {
    const dist = Math.hypot(point.x - hinge.x, point.y - hinge.y)
    if (dist > bestDist) {
      bestDist = dist
      bestPoint = point
    }
  }
  return bestPoint
}

function pickBestAxes(
  candidates: AxisCandidate[],
  options: ResolvedSwingHingeOptions,
  polygon: RefPoint[],
): PickedSwingAxes | null {
  if (candidates.length < 2) return null
  const sectorBBox = polygonBounds(polygon)
  const hingeTol = Math.max(
    options.axisBandPx * 2,
    Math.round(Math.min(sectorBBox.width, sectorBBox.height) * 0.05),
  )
  let bestPair: PickedSwingAxes | null = null
  let bestReach = Number.NEGATIVE_INFINITY
  let bestBalance = Number.NEGATIVE_INFINITY
  let bestSupport = Number.NEGATIVE_INFINITY
  let bestAngleError = Number.POSITIVE_INFINITY
  let bestCornerDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < candidates.length; i += 1) {
    const left = candidates[i]
    for (let j = i + 1; j < candidates.length; j += 1) {
      const right = candidates[j]
      const angleDiff = angleDiffDeg(left.angleDeg, right.angleDeg)
      // Bijna-parallel → snijpunt willekeurig; drempel uit ref of degenerate-vloer.
      if (angleDiff < options.minAxisSeparationDeg) continue
      if (angleDiff > 95) continue
      const intersection = intersectLines(left, right)
      if (!intersection) continue
      if (!hingeAcceptable(intersection, polygon, sectorBBox, hingeTol)) continue
      // Nooit midden-scharnier: moet L/R of T/B op de sector-bbox zijn.
      const sideH = isHingeOnWallSide(hingeSideT(intersection, sectorBBox, 'h'))
      const sideV = isHingeOnWallSide(hingeSideT(intersection, sectorBBox, 'v'))
      if (!sideH && !sideV) continue
      const bboxCornerDist = distToNearestBBoxCorner(intersection, sectorBBox)
      // Primair: beide radii moeten vanaf het scharnier ver de sector in reiken.
      // Voorkomt scharnier op de vrije tip (lange muur-as × kort boogkoord).
      const reach = Math.min(
        axisReachFromHinge(left, intersection),
        axisReachFromHinge(right, intersection),
      )
      // Beide radii moeten een meaningful deel van de sector bestrijken.
      const minReachNeeded = Math.min(sectorBBox.width, sectorBBox.height) * 0.35
      if (reach < minReachNeeded) continue
      const balance = Math.min(left.supportLength, right.supportLength)
      const support = left.supportLength + right.supportLength
      const angleError =
        options.expectedAngleDeg != null ? Math.abs(angleDiff - options.expectedAngleDeg) : 0
      const tip0 = farthestSupportFromHinge(left, intersection)
      const tip1 = farthestSupportFromHinge(right, intersection)
      const d0 = subtract(tip0, intersection)
      const d1 = subtract(tip1, intersection)
      // Bijna-collineair tegengesteld (= midden-scharnier met benen L+R) → skip.
      if (dot(d0, d1) < 0 && Math.abs(cross(d0, d1)) < magnitude(d0) * magnitude(d1) * 0.25) {
        continue
      }
      const isBetterReach = reach > bestReach + 1e-6
      const isTieBetterCornerProx =
        Math.abs(reach - bestReach) <= 1e-6 && bboxCornerDist + 1e-6 < bestCornerDistance
      const isTieBetterBalance =
        Math.abs(reach - bestReach) <= 1e-6 &&
        Math.abs(bboxCornerDist - bestCornerDistance) <= 1e-6 &&
        balance > bestBalance + 1e-6
      const isTieBetterAngle =
        Math.abs(reach - bestReach) <= 1e-6 &&
        Math.abs(bboxCornerDist - bestCornerDistance) <= 1e-6 &&
        Math.abs(balance - bestBalance) <= 1e-6 &&
        angleError + 1e-6 < bestAngleError
      const isTieBetterSupport =
        Math.abs(reach - bestReach) <= 1e-6 &&
        Math.abs(bboxCornerDist - bestCornerDistance) <= 1e-6 &&
        Math.abs(balance - bestBalance) <= 1e-6 &&
        Math.abs(angleError - bestAngleError) <= 1e-6 &&
        support > bestSupport + 1e-6
      if (
        isBetterReach ||
        isTieBetterCornerProx ||
        isTieBetterBalance ||
        isTieBetterAngle ||
        isTieBetterSupport
      ) {
        bestReach = reach
        bestBalance = balance
        bestSupport = support
        bestAngleError = angleError
        bestCornerDistance = bboxCornerDist
        const ordered: [AxisCandidate, AxisCandidate] =
          left.supportLength >= right.supportLength ? [left, right] : [right, left]
        const orderedTips: [RefPoint, RefPoint] =
          left.supportLength >= right.supportLength ? [tip0, tip1] : [tip1, tip0]
        bestPair = { axes: ordered, hinge: intersection, tips: orderedTips }
      }
    }
  }
  return bestPair
}

function findBestSwingSectorFace(params: {
  bwData: Uint8Array
  width: number
  height: number
  unitBBox: RefBBox
}): SwingSectorFacePick | null {
  const cropBBox = clampCropBBox(params.width, params.height, params.unitBBox)
  if (!cropBBox) return null
  if (cropBBox.width < 8 || cropBBox.height < 8) return null
  const white = labelWhiteFaces(params.bwData, params.width, params.height, cropBBox)
  const roles = classifyFaceRoles(white.faces, cropBBox.width, cropBBox.height)
  const ranked = rankSwingSectorFacesForPick(roles, cropBBox.width, cropBBox.height)
  const preferred = ranked.filter((row) => row.face.role === 'interior')
  const top = preferred[0]
  if (!top) return null
  return {
    face: top.face,
    cropBBox,
    cropWidth: cropBBox.width,
    cropHeight: cropBBox.height,
    labels: white.labels,
    rankedFaces: preferred.map((row) => row.face),
  }
}

function resolveSwingHingeFromPolygonOnce(
  polygon: RefPoint[],
  options: ResolvedSwingHingeOptions,
): { result: SwingHingeResult; picker: 'wall_axis_corner' | 'classic_axes' } | null {
  if (polygon.length < 3) return null
  const minLen = options.minSeedLenPx > 0 ? options.minSeedLenPx : minSeedLength(polygon)
  const segments = buildSegments(polygon, minLen)
  if (segments.length < 2) return null

  const rawCandidates: AxisCandidate[] = []
  for (const segment of segments) {
    const candidate = evaluateAxisCandidate(segment, segments, options)
    if (candidate) rawCandidates.push(candidate)
  }
  const candidates = dedupeCandidates(rawCandidates, options)
  // ESC:REF-13 (A)
  // 1) Muur-as-hoek (L/R of T/B) — voorkomt midden-scharnier op boogkoord × trapjes-as.
  // 2) Fallback: klassieke as-paar picker mét side-guard.
  const wallCorner = pickWallAxisCornerHinge(candidates, options, polygon)
  const picked = wallCorner ?? pickBestAxes(candidates, options, polygon)
  if (!picked) return null

  const hinge = picked.hinge
  const sectorBBox = polygonBounds(polygon)
  const hingeTol = Math.max(
    options.axisBandPx * 2,
    Math.round(Math.min(sectorBBox.width, sectorBBox.height) * 0.05),
  )
  if (!hingeAcceptable(hinge, polygon, sectorBBox, hingeTol)) return null

  const outAxisH = toOutputAxis(picked.axes[0], hinge, picked.tips[0])
  const outAxisL = toOutputAxis(picked.axes[1], hinge, picked.tips[1])
  const directedAngle = directedAngleDeg(subtract(outAxisH.b, hinge), subtract(outAxisL.b, hinge))
  return {
    result: {
      hinge,
      axes: [outAxisH, outAxisL],
      angleDeg:
        directedAngle > 1e-6 ? directedAngle : angleDiffDeg(outAxisH.angleDeg, outAxisL.angleDeg),
      sectorPolygon: polygon,
      sectorBBox,
    },
    picker: wallCorner ? 'wall_axis_corner' : 'classic_axes',
  }
}

/**
 * Hinge uit sector-contour. Raw eerst: als muur-hoek (L/R/T/B) lukt, klaar
 * (ondiepe ~14° Project4). Anders RDP-simplified (0.5%/1%/0.25% perimeter) voor
 * PDF-strakke driehoeken / trapjes-bogen — echte as-hoek voor angle-rescue.
 */
export function resolveSwingHingeFromPolygon(params: {
  polygon: RefPoint[]
  options?: SwingHingeOptions
}): SwingHingeResult | null {
  if (params.polygon.length < 3) return null
  const options = resolveOptions(params.options)
  const raw = resolveSwingHingeFromPolygonOnce(params.polygon, options)
  // ESC:REF-13 (A) — wall-corner op raw wint altijd (geen RDP die tip-scharnier promoveert).
  if (raw?.picker === 'wall_axis_corner') {
    tally('REF-13', 'wall_axis_corner')
    return {
      ...raw.result,
      sectorPolygon: params.polygon,
      sectorBBox: polygonBounds(params.polygon),
    }
  }

  let best: SwingHingeResult | null = raw?.result ?? null
  let bestScore = raw
    ? scoreSwingHinge(raw.result, options.expectedAngleDeg, raw.picker)
    : Number.NEGATIVE_INFINITY
  let bestPicker: 'wall_axis_corner' | 'classic_axes' = raw?.picker ?? 'classic_axes'
  let usedSimplify = false

  for (const variant of buildPolygonVariants(params.polygon)) {
    if (variant === params.polygon) continue
    const resolved = resolveSwingHingeFromPolygonOnce(variant, options)
    if (!resolved) continue
    const score = scoreSwingHinge(resolved.result, options.expectedAngleDeg, resolved.picker)
    if (score <= bestScore) continue
    best = resolved.result
    bestScore = score
    bestPicker = resolved.picker
    usedSimplify = true
  }
  if (!best) {
    tally('REF-13', 'none')
    return null
  }
  tally('REF-13', usedSimplify ? `${bestPicker}_simplified` : bestPicker)
  return { ...best, sectorPolygon: params.polygon, sectorBBox: polygonBounds(params.polygon) }
}

export function computeSwingHinge(params: {
  cv: OpenCV
  bwData: Uint8Array
  width: number
  height: number
  unitBBox: RefBBox
  options?: SwingHingeOptions
}): SwingHingeResult | null {
  const pick = findBestSwingSectorFace({
    bwData: params.bwData,
    width: params.width,
    height: params.height,
    unitBBox: params.unitBBox,
  })
  if (!pick) return null

  let best: SwingHingeResult | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  const bandPx = Math.max(1, Math.min(5, params.options?.axisBandPx ?? AXIS_BAND_PX))

  for (const face of pick.rankedFaces) {
    const sectorMask = new Uint8Array(pick.cropWidth * pick.cropHeight)
    for (let i = 0; i < pick.labels.length; i += 1) {
      if ((pick.labels[i] ?? 0) === face.label) sectorMask[i] = 255
    }
    // Multi-epsilon: strakke PDF-lijnen willen grotere approx; trapjes kleinere.
    for (const epsilonFactor of SWING_HINGE_SIMPLIFY_EPS_RATIOS) {
      const polygons = approxContoursFromMask({
        cv: params.cv,
        maskData: sectorMask,
        width: pick.cropWidth,
        height: pick.cropHeight,
        epsilonFactor,
      })
      for (const polygon of polygons) {
        if (polygon.length < 3) continue
        const globalPolygon = polygon.map((point) => ({
          x: point.x + pick.cropBBox.x,
          y: point.y + pick.cropBBox.y,
        }))
        const resolved = resolveSwingHingeFromPolygon({
          polygon: globalPolygon,
          options: params.options,
        })
        if (!resolved) continue
        if (!pointInOrOnPolygon(resolved.axes[0].b, globalPolygon, bandPx)) continue
        if (!pointInOrOnPolygon(resolved.axes[1].b, globalPolygon, bandPx)) continue
        const score = scoreSwingHinge(resolved, params.options?.expectedAngleDeg)
        if (score <= bestScore) continue
        best = resolved
        bestScore = score
      }
    }
  }

  return best
}
