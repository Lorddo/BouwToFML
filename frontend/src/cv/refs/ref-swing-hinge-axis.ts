import type { SwingHingeAxis } from './ref-swing-hinge'
import {
  angleDegFromDir,
  angleDiffDeg,
  canonicalizeDirection,
  closestPointDistance,
  directedAngleDeg,
  dot,
  intersectLines,
  magnitude,
  normalize,
  pointInOrOnPolygon,
  pointLineDistance,
  polygonBounds,
  rotate90,
  subtract,
  type Segment2,
  type Vec2,
} from './ref-swing-hinge-geom'
import type { RefBBox, RefPoint } from './types'

/** Muur-as ≈ H/V na straighten (deurblad tegen de openingsas). */
const WALL_AXIS_ALIGN_TOL_DEG = 18
/**
 * Scharnier zit altijd links/rechts (of boven/onder) op de muur-as — nooit middenin.
 * t = positie langs de wall-span in [0,1]; buitenste schijf is geldig.
 */
const HINGE_SIDE_MAX_T = 0.28

export type WallAxisAlignment = 'h' | 'v'

export type AxisCandidate = {
  origin: RefPoint
  dir: Vec2
  angleDeg: number
  supportLength: number
  supportPoints: RefPoint[]
}

export type ResolvedSwingHingeOptions = {
  axisBandPx: number
  minSeedLenPx: number
  minAxisSeparationDeg: number
  /** Alleen gezet als caller een gemeten/ref-hoek doorgeeft — nooit een hardcoded 90°. */
  expectedAngleDeg: number | null
  preferredWallAxis: WallAxisAlignment | null
}

export type PickedSwingAxes = {
  axes: [AxisCandidate, AxisCandidate]
  hinge: RefPoint
  /** Gerichte tip per as (heen de sector in, niet tegengesteld). */
  tips: [RefPoint, RefPoint]
}

export function evaluateAxisCandidate(
  seed: Segment2,
  segments: Segment2[],
  options: ResolvedSwingHingeOptions,
): AxisCandidate | null {
  const normDir = normalize({ x: seed.b.x - seed.a.x, y: seed.b.y - seed.a.y })
  if (!normDir) return null
  const dir = canonicalizeDirection(normDir)
  const angleDeg = angleDegFromDir(dir)
  let supportLength = 0
  const supportPoints: RefPoint[] = []
  for (const segment of segments) {
    const distA = pointLineDistance(segment.a, seed.midpoint, dir)
    const distB = pointLineDistance(segment.b, seed.midpoint, dir)
    if (Math.max(distA, distB) > options.axisBandPx) continue
    supportLength += segment.length
    supportPoints.push(segment.a, segment.b)
  }
  if (supportLength <= 0 || supportPoints.length < 2) return null
  return {
    origin: seed.midpoint,
    dir,
    angleDeg,
    supportLength,
    supportPoints,
  }
}

function sameAxis(a: AxisCandidate, b: AxisCandidate, axisBandPx: number): boolean {
  if (Math.abs(dot(a.dir, b.dir)) < 0.9995) return false
  const dist = pointLineDistance(b.origin, a.origin, a.dir)
  const overlap =
    Math.min(a.supportLength, b.supportLength) / Math.max(a.supportLength, b.supportLength)
  return dist <= axisBandPx && overlap >= 0.75
}

export function dedupeCandidates(
  candidates: AxisCandidate[],
  options: ResolvedSwingHingeOptions,
): AxisCandidate[] {
  const sorted = [...candidates].sort((left, right) => right.supportLength - left.supportLength)
  const out: AxisCandidate[] = []
  for (const candidate of sorted) {
    if (out.some((existing) => sameAxis(existing, candidate, options.axisBandPx))) continue
    out.push(candidate)
  }
  return out
}

export function toOutputAxis(axis: AxisCandidate, hinge: RefPoint, tip?: RefPoint): SwingHingeAxis {
  const bestPoint =
    tip ??
    (() => {
      let farthest: RefPoint = {
        x: hinge.x + axis.dir.x * axis.supportLength,
        y: hinge.y + axis.dir.y * axis.supportLength,
      }
      let bestDist = -1
      for (const point of axis.supportPoints) {
        const dist = Math.hypot(point.x - hinge.x, point.y - hinge.y)
        if (dist > bestDist) {
          bestDist = dist
          farthest = point
        }
      }
      return farthest
    })()
  return {
    a: hinge,
    b: bestPoint,
    angleDeg: axis.angleDeg,
    supportLength: axis.supportLength,
  }
}

function axisAlignment(angleDeg: number): WallAxisAlignment | null {
  if (Math.min(angleDeg, 180 - angleDeg) <= WALL_AXIS_ALIGN_TOL_DEG) return 'h'
  if (Math.abs(90 - angleDeg) <= WALL_AXIS_ALIGN_TOL_DEG) return 'v'
  return null
}

export function hingeSideT(hinge: RefPoint, bbox: RefBBox, wallAlign: WallAxisAlignment): number {
  if (wallAlign === 'h') {
    return (hinge.x - bbox.x) / Math.max(1, bbox.width)
  }
  return (hinge.y - bbox.y) / Math.max(1, bbox.height)
}

export function isHingeOnWallSide(t: number): boolean {
  return t <= HINGE_SIDE_MAX_T || t >= 1 - HINGE_SIDE_MAX_T
}

function wallAxisEndPoints(axis: AxisCandidate): {
  minPt: RefPoint
  maxPt: RefPoint
  span: number
} {
  let minProj = Number.POSITIVE_INFINITY
  let maxProj = Number.NEGATIVE_INFINITY
  let minPt = axis.origin
  let maxPt = axis.origin
  for (const point of axis.supportPoints) {
    const proj = dot(subtract(point, axis.origin), axis.dir)
    if (proj < minProj) {
      minProj = proj
      minPt = point
    }
    if (proj > maxProj) {
      maxProj = proj
      maxPt = point
    }
  }
  return { minPt, maxPt, span: Math.max(0, maxProj - minProj) }
}

/** Uiteinde van muur-as: kies steunpunt dichtst bij de sector-bbox-rand (deurblad). */
function refineWallEndToEdge(
  axis: AxisCandidate,
  endPt: RefPoint,
  sectorBBox: RefBBox,
  align: WallAxisAlignment,
): RefPoint {
  const endProj = dot(subtract(endPt, axis.origin), axis.dir)
  let best = endPt
  let bestEdge = Number.POSITIVE_INFINITY
  for (const point of axis.supportPoints) {
    const proj = dot(subtract(point, axis.origin), axis.dir)
    if (Math.abs(proj - endProj) > 5) continue
    const edge =
      align === 'h'
        ? Math.min(
            Math.abs(point.y - sectorBBox.y),
            Math.abs(point.y - (sectorBBox.y + sectorBBox.height)),
          )
        : Math.min(
            Math.abs(point.x - sectorBBox.x),
            Math.abs(point.x - (sectorBBox.x + sectorBBox.width)),
          )
    if (edge < bestEdge) {
      bestEdge = edge
      best = point
    }
  }
  return best
}

/** Welke kant van de muur-as heeft de sector-massa (draaiwijde). */
function sectorSideNormal(wallDir: Vec2, wallOrigin: RefPoint, polygon: RefPoint[]): Vec2 {
  const n1 = rotate90(wallDir)
  const n2 = { x: -n1.x, y: -n1.y }
  let s1 = 0
  let s2 = 0
  for (const point of polygon) {
    const d = dot(subtract(point, wallOrigin), n1)
    if (d > 0) s1 += d
    else s2 += -d
  }
  return s1 >= s2 ? n1 : n2
}

function meanSupportCoord(points: RefPoint[], axis: 'x' | 'y'): number {
  if (points.length === 0) return 0
  let sum = 0
  for (const point of points) sum += axis === 'x' ? point.x : point.y
  return sum / points.length
}

/**
 * Muur-as = langste H/V-kandidaat dicht tegen de sector-bbox-rand (deurblad),
 * niet een trapjes-as midden door de boog.
 */
function pickWallAxisCandidate(
  candidates: AxisCandidate[],
  sectorBBox: RefBBox,
  preferredWallAxis: WallAxisAlignment | null = null,
): { axis: AxisCandidate; align: WallAxisAlignment } | null {
  let best: { axis: AxisCandidate; align: WallAxisAlignment } | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const candidate of candidates) {
    const align = axisAlignment(candidate.angleDeg)
    if (!align) continue
    const ends = wallAxisEndPoints(candidate)
    if (ends.span < 4) continue
    const edgeDist =
      align === 'h'
        ? Math.min(
            Math.abs(meanSupportCoord(candidate.supportPoints, 'y') - sectorBBox.y),
            Math.abs(
              meanSupportCoord(candidate.supportPoints, 'y') - (sectorBBox.y + sectorBBox.height),
            ),
          )
        : Math.min(
            Math.abs(meanSupportCoord(candidate.supportPoints, 'x') - sectorBBox.x),
            Math.abs(
              meanSupportCoord(candidate.supportPoints, 'x') - (sectorBBox.x + sectorBBox.width),
            ),
          )
    // Straffen van as midden in de sector (boog-trapjes).
    let score = ends.span * 2 + candidate.supportLength - edgeDist * 5
    // Breed sector → horizontale muur-as; hoog → verticaal (twin L/R spiegel).
    if (preferredWallAxis != null) {
      score += align === preferredWallAxis ? ends.span * 1.5 : -ends.span * 2
    }
    if (score > bestScore) {
      bestScore = score
      best = { axis: candidate, align }
    }
  }
  return best
}

function angleMatchPenalty(angleDeg: number, expectedAngleDeg: number | null): number {
  if (expectedAngleDeg == null) return 0
  return Math.abs(angleDeg - expectedAngleDeg) * 2.5
}

/**
 * Hoe ver de as vanaf het scharnier de sector in reikt (eenzijdig).
 * Echte radii: support vrijwel geheel aan één kant → ~sectorstraal.
 * Vals boogkoord aan vrije tip: kort. Lijn door midden: beide kanten → straf.
 */
export function axisReachFromHinge(axis: AxisCandidate, hinge: RefPoint): number {
  let maxPos = 0
  let maxNeg = 0
  for (const point of axis.supportPoints) {
    const proj = dot(subtract(point, hinge), axis.dir)
    if (proj > maxPos) maxPos = proj
    if (-proj > maxNeg) maxNeg = -proj
  }
  const major = Math.max(maxPos, maxNeg)
  const minor = Math.min(maxPos, maxNeg)
  if (major <= 1e-6) return 0
  // Support aan beide kanten ≈ geen hoek-scharnier (snijpunt midden in sector).
  if (minor > major * 0.35) return major * 0.15
  return major
}

/**
 * Tweede been vanuit scharnierhoek: bij voorkeur bestaande as-kandidaat,
 * anders synthetisch naar diepste sectorpunt (boog zonder getekend open blad).
 */
function resolveBladeFromCorner(params: {
  hinge: RefPoint
  wallDirIntoSector: Vec2
  wallAxis: AxisCandidate
  candidates: AxisCandidate[]
  polygon: RefPoint[]
  sectorNormal: Vec2
  options: ResolvedSwingHingeOptions
}): { axis: AxisCandidate; tip: RefPoint; angleDeg: number } | null {
  const { hinge, wallDirIntoSector, candidates, polygon, sectorNormal, options } = params
  const hingeTol = Math.max(
    options.axisBandPx * 2,
    Math.round(Math.min(polygonBounds(polygon).width, polygonBounds(polygon).height) * 0.08),
  )

  let best: { axis: AxisCandidate; tip: RefPoint; angleDeg: number; score: number } | null = null
  for (const candidate of candidates) {
    if (candidate === params.wallAxis) continue
    const angleDiff = angleDiffDeg(params.wallAxis.angleDeg, candidate.angleDeg)
    if (angleDiff < options.minAxisSeparationDeg) continue
    if (angleDiff > 95) continue
    const intersection = intersectLines(params.wallAxis, candidate)
    if (!intersection) continue
    if (Math.hypot(intersection.x - hinge.x, intersection.y - hinge.y) > hingeTol) continue
    const reach = axisReachFromHinge(candidate, hinge)
    if (reach < 3) continue
    // Tip = verste support in de sector-helft (zelfde half-plane als sectorNormal).
    let tip: RefPoint | null = null
    let tipProj = 0
    for (const point of candidate.supportPoints) {
      const delta = subtract(point, hinge)
      if (dot(delta, sectorNormal) < -1) continue
      const proj = magnitude(delta)
      if (proj > tipProj) {
        tipProj = proj
        tip = point
      }
    }
    if (!tip || tipProj < 3) continue
    const bladeDir = normalize(subtract(tip, hinge))
    if (!bladeDir) continue
    // Beide benen dezelfde sector-kant: blade mag niet tegengesteld aan wallDir wijzen.
    if (dot(bladeDir, wallDirIntoSector) < -0.15) continue
    const angleDeg = directedAngleDeg(wallDirIntoSector, bladeDir)
    if (angleDeg < options.minAxisSeparationDeg || angleDeg > 95) continue
    const score =
      reach * 2 -
      angleMatchPenalty(angleDeg, options.expectedAngleDeg) +
      candidate.supportLength * 0.25
    if (!best || score > best.score) {
      best = { axis: candidate, tip, angleDeg, score }
    }
  }

  // Synthetisch blad: langste radius de sector in (gemeten hoek volgt uit de benen).
  // Geen 90°-bias — ondiepe ~14° deuren moeten ook winnen op bladlengte.
  let deepTip: RefPoint | null = null
  let deepScore = Number.NEGATIVE_INFINITY
  const minDeep = Math.max(6, options.axisBandPx * 3)
  for (const point of polygon) {
    const delta = subtract(point, hinge)
    const alongNormal = dot(delta, sectorNormal)
    if (alongNormal < minDeep) continue
    const bladeDir = normalize(delta)
    if (!bladeDir) continue
    if (dot(bladeDir, wallDirIntoSector) < -0.15) continue
    const angleDeg = directedAngleDeg(wallDirIntoSector, bladeDir)
    if (angleDeg < options.minAxisSeparationDeg || angleDeg > 95) continue
    const radial = magnitude(delta)
    const score =
      radial + alongNormal * 0.15 - angleMatchPenalty(angleDeg, options.expectedAngleDeg)
    if (score > deepScore) {
      deepScore = score
      deepTip = point
    }
  }
  if (deepTip) {
    const bladeDir = normalize(subtract(deepTip, hinge))
    if (bladeDir) {
      const angleDeg = directedAngleDeg(wallDirIntoSector, bladeDir)
      const synth: AxisCandidate = {
        origin: hinge,
        dir: canonicalizeDirection(bladeDir),
        angleDeg: angleDegFromDir(bladeDir),
        supportLength: magnitude(subtract(deepTip, hinge)),
        supportPoints: [hinge, deepTip],
      }
      const score =
        magnitude(subtract(deepTip, hinge)) * 1.5 -
        angleMatchPenalty(angleDeg, options.expectedAngleDeg)
      if (!best || score > best.score) {
        best = { axis: synth, tip: deepTip, angleDeg, score }
      }
    }
  }

  return best ? { axis: best.axis, tip: best.tip, angleDeg: best.angleDeg } : null
}

/**
 * Primair pad: scharnier = L/R (of T/B) einde van de muur-as; beide benen de sector in.
 * Met expectedAngleDeg (o.a. angle-rescue): beide einden blijven kandidaten;
 * dichtste hoek wint — voorkomt dat balance de verkeerde (spiegel)kant kiest.
 */
export function pickWallAxisCornerHinge(
  candidates: AxisCandidate[],
  options: ResolvedSwingHingeOptions,
  polygon: RefPoint[],
): PickedSwingAxes | null {
  const sectorBBox = polygonBounds(polygon)
  const wall = pickWallAxisCandidate(candidates, sectorBBox, options.preferredWallAxis)
  if (!wall) return null
  const ends = wallAxisEndPoints(wall.axis)
  if (ends.span < 4) return null
  const leftEnd = refineWallEndToEdge(wall.axis, ends.minPt, sectorBBox, wall.align)
  const rightEnd = refineWallEndToEdge(wall.axis, ends.maxPt, sectorBBox, wall.align)
  const sectorNormal = sectorSideNormal(wall.axis.dir, wall.axis.origin, polygon)
  const preferAngleMatch = options.expectedAngleDeg != null

  let best: (PickedSwingAxes & { score: number; angleDeg: number; angleError: number }) | null =
    null
  for (const [hinge, other] of [
    [leftEnd, rightEnd],
    [rightEnd, leftEnd],
  ] as const) {
    const t = hingeSideT(hinge, sectorBBox, wall.align)
    if (!isHingeOnWallSide(t)) continue
    const wallDirInto = normalize(subtract(other, hinge))
    if (!wallDirInto) continue
    const blade = resolveBladeFromCorner({
      hinge,
      wallDirIntoSector: wallDirInto,
      wallAxis: wall.axis,
      candidates,
      polygon,
      sectorNormal,
      options,
    })
    if (!blade) continue
    const angleError = preferAngleMatch ? Math.abs(blade.angleDeg - options.expectedAngleDeg!) : 0
    const wallReach = magnitude(subtract(other, hinge))
    const bladeReach = magnitude(subtract(blade.tip, hinge))
    // Stub-blad (2–3px) = valse radius op een trapje; echte open-radius heeft lengte.
    const minBlade = Math.max(8, wallReach * 0.18)
    if (bladeReach < minBlade) continue
    // Primair: beide benen vergelijkbare lengte (echte scharnierhoek).
    // Vrije tip van de muur-as → lange diagonaal-koorde ≠ gebalanceerde radii.
    // Geen 90°-prior: 14° en 90° winnen beide op balans + bladlengte.
    const balance = Math.min(wallReach, bladeReach)
    const imbalance = Math.abs(wallReach - bladeReach)
    const score = balance * 4 - imbalance * 1.5 + bladeReach * 0.25 - angleError * 2
    if (best) {
      if (preferAngleMatch) {
        if (angleError > best.angleError + 1e-6) continue
        if (Math.abs(angleError - best.angleError) <= 1e-6 && score <= best.score) continue
      } else if (score <= best.score) {
        continue
      }
    }
    best = {
      axes: [wall.axis, blade.axis],
      hinge,
      tips: [other, blade.tip],
      score,
      angleDeg: blade.angleDeg,
      angleError,
    }
  }
  if (!best) return null
  return { axes: best.axes, hinge: best.hinge, tips: best.tips }
}

/**
 * Contour-approx chamfert vaak de echte scharnierhoek → snijpunt ligt net buiten de poly
 * maar wél op/nabij een sector-bbox-hoek. Geen extrapolatie ver buiten de bbox
 * (dat gaf scharniers voorbij de vrije tip).
 */
export function hingeAcceptable(
  hinge: RefPoint,
  polygon: RefPoint[],
  sectorBBox: RefBBox,
  tolerancePx: number,
): boolean {
  // Kleine tol: anders telt "nabij endpoint" als op de rand → scharnier voorbij vrije tip.
  if (pointInOrOnPolygon(hinge, polygon, Math.min(2, tolerancePx))) return true
  const eps = 1
  const inBBox =
    hinge.x >= sectorBBox.x - eps &&
    hinge.y >= sectorBBox.y - eps &&
    hinge.x <= sectorBBox.x + sectorBBox.width + eps &&
    hinge.y <= sectorBBox.y + sectorBBox.height + eps
  if (!inBBox) return false
  return closestPointDistance(hinge, polygon) <= Math.max(tolerancePx, 4)
}
