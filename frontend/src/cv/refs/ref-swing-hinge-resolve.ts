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
  angleDegFromDir,
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
  normalize,
  pointInOrOnPolygon,
  polygonBounds,
  subtract,
} from './ref-swing-hinge-geom'
import type { SwingHingeOptions, SwingHingeResult, SwingSectorFacePick } from './ref-swing-hinge'
import type { RefBBox, RefPoint } from './types'

const AXIS_BAND_PX = 3
/**
 * Absolute vloer: assen dichterbij dit zijn "bijna-parallel" (willekeurig snijpunt).
 * Geen vaste 35° — dat knalt 30°-kastdeuren eruit. Strengere drempel komt uit de ref.
 */
const DEGENERATE_AXIS_SEPARATION_DEG = 8

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

export function hasArcLikeContour(polygon: RefPoint[]): boolean {
  if (polygon.length < 6) return false
  const dirs: { x: number; y: number }[] = []
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const dir = normalize({ x: b.x - a.x, y: b.y - a.y })
    if (!dir) continue
    dirs.push(dir)
  }
  if (dirs.length < 5) return false
  let gradualTurnCount = 0
  for (let i = 0; i < dirs.length; i += 1) {
    const d0 = dirs[i]!
    const d1 = dirs[(i + 1) % dirs.length]!
    const a0 = angleDegFromDir(d0)
    const a1 = angleDegFromDir(d1)
    const diff = angleDiffDeg(a0, a1)
    if (diff >= 6 && diff <= 45) gradualTurnCount += 1
  }
  return gradualTurnCount >= 4
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
    const left = candidates[i]!
    for (let j = i + 1; j < candidates.length; j += 1) {
      const right = candidates[j]!
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

export function resolveSwingHingeFromPolygon(params: {
  polygon: RefPoint[]
  options?: SwingHingeOptions
}): SwingHingeResult | null {
  if (params.polygon.length < 3) return null
  const options = resolveOptions(params.options)
  const minLen = options.minSeedLenPx > 0 ? options.minSeedLenPx : minSeedLength(params.polygon)
  const segments = buildSegments(params.polygon, minLen)
  if (segments.length < 2) return null

  const rawCandidates: AxisCandidate[] = []
  for (const segment of segments) {
    const candidate = evaluateAxisCandidate(segment, segments, options)
    if (candidate) rawCandidates.push(candidate)
  }
  const candidates = dedupeCandidates(rawCandidates, options)
  // 1) Muur-as-hoek (L/R of T/B) — voorkomt midden-scharnier op boogkoord × trapjes-as.
  // 2) Fallback: klassieke as-paar picker mét side-guard.
  const picked =
    pickWallAxisCornerHinge(candidates, options, params.polygon) ??
    pickBestAxes(candidates, options, params.polygon)
  if (!picked) return null

  const hinge = picked.hinge
  const sectorBBox = polygonBounds(params.polygon)
  const hingeTol = Math.max(
    options.axisBandPx * 2,
    Math.round(Math.min(sectorBBox.width, sectorBBox.height) * 0.05),
  )
  if (!hingeAcceptable(hinge, params.polygon, sectorBBox, hingeTol)) return null

  const outAxisH = toOutputAxis(picked.axes[0], hinge, picked.tips[0])
  const outAxisL = toOutputAxis(picked.axes[1], hinge, picked.tips[1])
  const directedAngle = directedAngleDeg(subtract(outAxisH.b, hinge), subtract(outAxisL.b, hinge))
  return {
    hinge,
    axes: [outAxisH, outAxisL],
    angleDeg:
      directedAngle > 1e-6 ? directedAngle : angleDiffDeg(outAxisH.angleDeg, outAxisL.angleDeg),
    sectorPolygon: params.polygon,
    sectorBBox,
  }
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

  for (const face of pick.rankedFaces) {
    const sectorMask = new Uint8Array(pick.cropWidth * pick.cropHeight)
    for (let i = 0; i < pick.labels.length; i += 1) {
      if ((pick.labels[i] ?? 0) === face.label) sectorMask[i] = 255
    }
    const polygons = approxContoursFromMask({
      cv: params.cv,
      maskData: sectorMask,
      width: pick.cropWidth,
      height: pick.cropHeight,
      epsilonFactor: 0.0025,
    })
    const polygon = polygons[0]
    if (!polygon || polygon.length < 3) continue

    const globalPolygon = polygon.map((point) => ({
      x: point.x + pick.cropBBox.x,
      y: point.y + pick.cropBBox.y,
    }))
    if (!hasArcLikeContour(globalPolygon)) continue
    const resolved = resolveSwingHingeFromPolygon({
      polygon: globalPolygon,
      options: params.options,
    })
    if (!resolved) continue

    const bandPx = Math.max(1, Math.min(5, params.options?.axisBandPx ?? AXIS_BAND_PX))
    if (!pointInOrOnPolygon(resolved.axes[0].b, globalPolygon, bandPx)) continue
    if (!pointInOrOnPolygon(resolved.axes[1].b, globalPolygon, bandPx)) continue

    const score = resolved.axes[0].supportLength + resolved.axes[1].supportLength
    if (score > bestScore) {
      best = resolved
      bestScore = score
    }
  }

  return best
}
