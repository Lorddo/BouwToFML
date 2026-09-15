import type { HScaleState } from '@/platform/calibration'
import {
  SCALE_GEOMETRY_FACTOR_MAX,
  SCALE_GEOMETRY_FACTOR_MIN,
  SCALE_RESCALE_MIN_MEASURED_CM,
} from '@/platform/calibration'
import { toCmX, toCmY } from '@/core/plan/extraction-to-plan-geom'
import type { PlanScaleFactors } from '@/core/plan/scale-floor-plan'
import type { Point2D, Wall } from '@/core/plan/types'
import {
  WALL_FACE_SNAP_CM,
  wallFaceSegments,
} from '@/ui/composables/plan-canvas/plan-canvas-wall-face-snap'

/**
 * Pure helpers for stap-4 H/V-liniaal → anisotrope geometry rescale (zoals stap 1).
 * Separated so unit tests need no Vue/workspace harness.
 */

export function resolveRescaleGeometryFactor(measuredCm: number, trueCm: number): number | null {
  if (!(measuredCm >= SCALE_RESCALE_MIN_MEASURED_CM) || !(trueCm > 0)) return null
  if (!Number.isFinite(measuredCm) || !Number.isFinite(trueCm)) return null
  const factor = trueCm / measuredCm
  if (factor < SCALE_GEOMETRY_FACTOR_MIN || factor > SCALE_GEOMETRY_FACTOR_MAX) return null
  if (Math.abs(factor - 1) < 1e-9) return null
  return factor
}

function axisFactor(measuredCm: number, trueMm: number, innerThicknessCm = 0): number | null {
  if (!(measuredCm >= SCALE_RESCALE_MIN_MEASURED_CM) || !(trueMm > 0)) return null
  if (!Number.isFinite(measuredCm) || !Number.isFinite(trueMm)) return null
  const t = innerThicknessCm > 0 && Number.isFinite(innerThicknessCm) ? innerThicknessCm : 0
  // Liniaal = binnenmaat; muurdikte blijft. Hartlijn-factor = (I★ + T) / (I + T).
  const factor = (trueMm / 10 + t) / (measuredCm + t)
  if (factor < SCALE_GEOMETRY_FACTOR_MIN || factor > SCALE_GEOMETRY_FACTOR_MAX) return null
  return factor
}

function centerlineCoordOnAxis(
  wall: Pick<Wall, 'a' | 'b'>,
  point: Point2D,
  axis: 'x' | 'y',
): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return axis === 'x' ? wall.a.x : wall.a.y
  const t = ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / len2
  return axis === 'x' ? wall.a.x + dx * t : wall.a.y + dy * t
}

function faceAlongPad(wall: Pick<Wall, 'thickness'>, radiusCm: number): number {
  return radiusCm + Math.max(0, wall.thickness)
}

/** Afstand handle → hartlijn op deze as, als de handle op een face van die as zit. */
export function handleInnerThicknessCm(
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>,
  point: Point2D,
  axis: 'x' | 'y',
  radiusCm = WALL_FACE_SNAP_CM,
): number {
  if (walls.length === 0 || !(radiusCm > 0)) return 0
  let bestFaceDist = radiusCm
  let bestOffset = 0
  let found = false
  for (const wall of walls) {
    const pad = faceAlongPad(wall, radiusCm)
    for (const face of wallFaceSegments(wall)) {
      if (axis === 'x' && face.axis === 'h') continue
      if (axis === 'y' && face.axis === 'v') continue
      let faceDist: number
      if (face.axis === 'v') {
        const faceX = (face.a.x + face.b.x) / 2
        const minY = Math.min(face.a.y, face.b.y) - pad
        const maxY = Math.max(face.a.y, face.b.y) + pad
        if (point.y < minY || point.y > maxY) continue
        faceDist = Math.abs(point.x - faceX)
      } else if (face.axis === 'h') {
        const faceY = (face.a.y + face.b.y) / 2
        const minX = Math.min(face.a.x, face.b.x) - pad
        const maxX = Math.max(face.a.x, face.b.x) + pad
        if (point.x < minX || point.x > maxX) continue
        faceDist = Math.abs(point.y - faceY)
      } else {
        const dx = face.b.x - face.a.x
        const dy = face.b.y - face.a.y
        const len2 = dx * dx + dy * dy
        if (len2 < 1e-12) continue
        const t = ((point.x - face.a.x) * dx + (point.y - face.a.y) * dy) / len2
        const len = Math.sqrt(len2)
        const padT = pad / len
        if (t < -padT || t > 1 + padT) continue
        const projX = face.a.x + dx * t
        const projY = face.a.y + dy * t
        faceDist = Math.hypot(point.x - projX, point.y - projY)
      }
      if (faceDist >= (found ? bestFaceDist : radiusCm)) continue
      found = true
      bestFaceDist = faceDist
      bestOffset = Math.abs(
        (axis === 'x' ? point.x : point.y) - centerlineCoordOnAxis(wall, point, axis),
      )
    }
  }
  return found ? bestOffset : 0
}

/** T per as: som van hart→face op beide liniaalpunten (binnenmaat-compensatie). */
export function innerThicknessFromRescaleState(
  state: HScaleState,
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>,
): { x: number; y: number } {
  return {
    x:
      handleInnerThicknessCm(walls, { x: state.xLeft, y: state.xGuideY }, 'x') +
      handleInnerThicknessCm(walls, { x: state.xRight, y: state.xGuideY }, 'x'),
    y:
      handleInnerThicknessCm(walls, { x: state.yGuideX, y: state.yTop }, 'y') +
      handleInnerThicknessCm(walls, { x: state.yGuideX, y: state.yBottom }, 'y'),
  }
}

/**
 * Aparte H/V-factoren. Liniaal is binnenmaat: optioneel `innerThicknessCm`
 * (hart→binnen, beide zijden) zodat het gat na één ronde op de echte maat zit.
 * Beide spans ≥ 50 cm; minstens één as ≠ 1.
 */
export function resolveRescaleFactorsFromRulers(params: {
  measuredCmX: number
  measuredCmY: number
  trueMmX: number
  trueMmY: number
  innerThicknessCmX?: number
  innerThicknessCmY?: number
}): PlanScaleFactors | null {
  const factorX = axisFactor(params.measuredCmX, params.trueMmX, params.innerThicknessCmX ?? 0)
  const factorY = axisFactor(params.measuredCmY, params.trueMmY, params.innerThicknessCmY ?? 0)
  if (factorX == null || factorY == null) return null
  if (Math.abs(factorX - 1) < 1e-9 && Math.abs(factorY - 1) < 1e-9) return null
  return { x: factorX, y: factorY }
}

/** Stap-4/editor confirm: gemeten span + T uit face-handles. */
export function resolveRescaleFactorsFromInnerRulers(params: {
  state: HScaleState
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>
  trueMmX: number
  trueMmY: number
}): PlanScaleFactors | null {
  const measured = measuredCmFromRescaleState(params.state)
  const thick = innerThicknessFromRescaleState(params.state, params.walls)
  return resolveRescaleFactorsFromRulers({
    measuredCmX: measured.x,
    measuredCmY: measured.y,
    trueMmX: params.trueMmX,
    trueMmY: params.trueMmY,
    innerThicknessCmX: thick.x,
    innerThicknessCmY: thick.y,
  })
}

/** @deprecated alias — gebruik resolveRescaleFactorsFromRulers */
export function resolveRescaleFactorFromRulers(params: {
  measuredCmX: number
  measuredCmY: number
  trueMmX: number
  trueMmY: number
}): PlanScaleFactors | null {
  return resolveRescaleFactorsFromRulers(params)
}

/** |factorX − factorY| / avg als procent (zelfde drempel-idee als stap-1 axisMismatch). */
export function rescaleAxisMismatchPct(params: {
  measuredCmX: number
  measuredCmY: number
  trueMmX: number
  trueMmY: number
}): number {
  const { measuredCmX, measuredCmY, trueMmX, trueMmY } = params
  if (!(measuredCmX > 0) || !(measuredCmY > 0) || !(trueMmX > 0) || !(trueMmY > 0)) return 0
  const factorX = trueMmX / 10 / measuredCmX
  const factorY = trueMmY / 10 / measuredCmY
  const avg = (factorX + factorY) / 2
  if (!(avg > 0)) return 0
  return (Math.abs(factorX - factorY) / avg) * 100
}

export function measuredCmFromRescaleState(state: HScaleState): { x: number; y: number } {
  return {
    x: Math.abs(state.xRight - state.xLeft),
    y: Math.abs(state.yBottom - state.yTop),
  }
}

export type PlanRescaleImageLayout = {
  origin: Point2D
  pxPerMmX: number
  pxPerMmY: number
}

/**
 * Stap-1 pixel-handles → FML-cm via huidige underlay-layout.
 * Nulpunt zit in `origin` (wallCm = imageCm − origin); plek op de scan blijft.
 */
export function rescaleStateFromImageHandles(
  state: HScaleState,
  layout: PlanRescaleImageLayout,
): HScaleState | null {
  if (!(layout.pxPerMmX > 0) || !(layout.pxPerMmY > 0)) return null
  if (!Number.isFinite(layout.pxPerMmX) || !Number.isFinite(layout.pxPerMmY)) return null
  return {
    xLeft: toCmX(state.xLeft, layout.pxPerMmX) - layout.origin.x,
    xRight: toCmX(state.xRight, layout.pxPerMmX) - layout.origin.x,
    xGuideY: toCmY(state.xGuideY, layout.pxPerMmY) - layout.origin.y,
    yTop: toCmY(state.yTop, layout.pxPerMmY) - layout.origin.y,
    yBottom: toCmY(state.yBottom, layout.pxPerMmY) - layout.origin.y,
    yGuideX: toCmX(state.yGuideX, layout.pxPerMmX) - layout.origin.x,
  }
}

/** Stap-1 handles als die er zijn; anders ~70% van de muur-bbox. */
export function resolvePlanRescaleState(params: {
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b'>>
  imageState?: HScaleState | null
  layout?: PlanRescaleImageLayout | null
}): HScaleState | null {
  if (params.imageState && params.layout) {
    const fromStep1 = rescaleStateFromImageHandles(params.imageState, params.layout)
    if (fromStep1) return fromStep1
  }
  return initPlanRescaleStateFromWalls(params.walls)
}

/** Stap-1-achtige H/V-handles in image-pixels (35% span, midden). */
export function initImageScaleHandles(width: number, height: number): HScaleState | null {
  if (!(width > 0) || !(height > 0)) return null
  const centerX = width / 2
  const centerY = height / 2
  const spanX = width * 0.35
  const spanY = height * 0.35
  if (!(spanX > 3) || !(spanY > 3)) return null
  return {
    xLeft: Math.round(centerX - spanX / 2),
    xRight: Math.round(centerX + spanX / 2),
    xGuideY: Math.round(centerY),
    yTop: Math.round(centerY - spanY / 2),
    yBottom: Math.round(centerY + spanY / 2),
    yGuideX: Math.round(centerX),
  }
}

/** Start-H/V-linialen in FML-cm, ~70% van de muur-bbox. */
export function initPlanRescaleStateFromWalls(
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b'>>,
): HScaleState | null {
  if (walls.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const wall of walls) {
    minX = Math.min(minX, wall.a.x, wall.b.x)
    minY = Math.min(minY, wall.a.y, wall.b.y)
    maxX = Math.max(maxX, wall.a.x, wall.b.x)
    maxY = Math.max(maxY, wall.a.y, wall.b.y)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const insetX = spanX * 0.15
  const insetY = spanY * 0.15
  return {
    xLeft: minX + insetX,
    xRight: maxX - insetX,
    xGuideY: (minY + maxY) / 2,
    yTop: minY + insetY,
    yBottom: maxY - insetY,
    yGuideX: (minX + maxX) / 2,
  }
}

/** Scale image-cm nulpunt (pixel blijft op FML 0,0). */
export function scaleNulpuntImageCm(
  point: { x: number; y: number },
  factor: number | PlanScaleFactors,
): { x: number; y: number } {
  const fx = typeof factor === 'number' ? factor : factor.x
  const fy = typeof factor === 'number' ? factor : factor.y
  return { x: point.x * fx, y: point.y * fy }
}
