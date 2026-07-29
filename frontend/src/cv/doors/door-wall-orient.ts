import { buildDoorSwingSymbol, buildMirrored } from '@/core/fml/door-swing-symbol'
import type { SemanticWallSegment } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import { normalizeVector } from './door-geometry-utils'
import { computeL12DoorHinge } from './door-l12-hinge'
import { round2 } from './door-wall-snap-geom'
import type {
  BoundDoor,
  DoorHingeAxis,
  OrientedDoor,
  ResolvedDoorCandidate,
} from './types'

type Vec2 = { x: number; y: number }

type FramedOpening = {
  overhangAlongPx: number
  overhangOppositePx: number
  framingAlongPx: number
  framingOppositePx: number
  widthPx: number
  bladePx: number
  openingStartPx: { x: number; y: number }
  openingEndPx: { x: number; y: number }
  displayStartPx: { x: number; y: number }
  displayEndPx: { x: number; y: number }
  pivotEndPx: { x: number; y: number }
  freeEndPx: { x: number; y: number }
  /** FML mirrored: pivot aan openingStart? */
  hingeAtStart: boolean
  /** Display-symbol: boog-scharnier aan displayStart? */
  displayHingeAtStart: boolean
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

function vectorFromAxis(axis: DoorHingeAxis): Vec2 | null {
  return normalizeVector(axis.b.x - axis.a.x, axis.b.y - axis.a.y)
}

function resolveOpeningAndLeafAxis(
  axes: [DoorHingeAxis, DoorHingeAxis],
  wallUnit: Vec2,
): { openingAxis: Vec2; leafAxis: Vec2 } | null {
  const axisA = vectorFromAxis(axes[0])
  const axisB = vectorFromAxis(axes[1])
  if (!axisA || !axisB) return null
  const axisAScore = Math.abs(dot(axisA, wallUnit))
  const axisBScore = Math.abs(dot(axisB, wallUnit))
  if (axisAScore >= axisBScore) {
    return { openingAxis: axisA, leafAxis: axisB }
  }
  return { openingAxis: axisB, leafAxis: axisA }
}

/** Clear afstanden hinge → doorframe-uiteinden langs freeDir. */
function clearOverhangsFromDoorframeOpening(params: {
  hingePx: { x: number; y: number }
  freeDir: Vec2
  clearOpening: { startPx: { x: number; y: number }; endPx: { x: number; y: number } }
}): { clearAlongPx: number; clearOppositePx: number } {
  const hinge = params.hingePx
  const freeDir = params.freeDir
  const tStart = dot(
    { x: params.clearOpening.startPx.x - hinge.x, y: params.clearOpening.startPx.y - hinge.y },
    freeDir,
  )
  const tEnd = dot(
    { x: params.clearOpening.endPx.x - hinge.x, y: params.clearOpening.endPx.y - hinge.y },
    freeDir,
  )
  const tMin = Math.min(tStart, tEnd)
  const tMax = Math.max(tStart, tEnd)
  return {
    clearAlongPx: Math.max(0, tMax),
    clearOppositePx: Math.max(0, -tMin),
  }
}

function buildDisplayFromHinge(params: {
  hingePx: { x: number; y: number }
  wallUnit: Vec2
  freeDir: Vec2
  bladePx: number
}): {
  displayStartPx: { x: number; y: number }
  displayEndPx: { x: number; y: number }
  displayHingeAtStart: boolean
} {
  const bladeTipPx = {
    x: params.hingePx.x + params.freeDir.x * params.bladePx,
    y: params.hingePx.y + params.freeDir.y * params.bladePx,
  }
  const displayHingeAtStart =
    dot(
      { x: params.hingePx.x - bladeTipPx.x, y: params.hingePx.y - bladeTipPx.y },
      params.wallUnit,
    ) <= 0
  return {
    displayHingeAtStart,
    displayStartPx: displayHingeAtStart ? params.hingePx : bladeTipPx,
    displayEndPx: displayHingeAtStart ? bladeTipPx : params.hingePx,
  }
}

/**
 * Opening vanuit boog-scharnier met asymmetrische ref-overhangs naar beide kozijnranden.
 * FML-pivot = achterkant (overhangOpposite); display-blad = clear opening (kozijnen zichtbaar).
 */
export function resolveFramedOpeningAlongWall(params: {
  hingePx: { x: number; y: number }
  wallUnit: Vec2
  /** Richting langs muur naar vrije tip (openingsas van de boog). */
  freeDir: Vec2
  overhangAlongPx: number
  overhangOppositePx: number
  framingAlongPx?: number
  framingOppositePx?: number
}): FramedOpening {
  const overhangAlongPx = Math.max(0, params.overhangAlongPx)
  const overhangOppositePx = Math.max(0, params.overhangOppositePx)
  const framingAlongPx = Math.max(0, params.framingAlongPx ?? 0)
  const framingOppositePx = Math.max(0, params.framingOppositePx ?? 0)
  const widthPx = Math.max(1, overhangAlongPx + overhangOppositePx)
  const bladePx = Math.max(1, overhangAlongPx - framingAlongPx)
  const hinge = params.hingePx
  const freeDir = params.freeDir

  const freeEndPx = {
    x: hinge.x + freeDir.x * overhangAlongPx,
    y: hinge.y + freeDir.y * overhangAlongPx,
  }
  const pivotEndPx = {
    x: hinge.x - freeDir.x * overhangOppositePx,
    y: hinge.y - freeDir.y * overhangOppositePx,
  }

  const startIsPivot =
    dot({ x: pivotEndPx.x - freeEndPx.x, y: pivotEndPx.y - freeEndPx.y }, params.wallUnit) <= 0
  const openingStartPx = startIsPivot ? pivotEndPx : freeEndPx
  const openingEndPx = startIsPivot ? freeEndPx : pivotEndPx
  const hingeAtStart = startIsPivot

  const display = buildDisplayFromHinge({
    hingePx: hinge,
    wallUnit: params.wallUnit,
    freeDir,
    bladePx,
  })

  return {
    overhangAlongPx,
    overhangOppositePx,
    framingAlongPx,
    framingOppositePx,
    widthPx,
    bladePx,
    openingStartPx,
    openingEndPx,
    displayStartPx: display.displayStartPx,
    displayEndPx: display.displayEndPx,
    pivotEndPx,
    freeEndPx,
    hingeAtStart,
    displayHingeAtStart: display.displayHingeAtStart,
  }
}

/**
 * Path A: L11 doorframe = deurblad (clear). FML = clear-uiteinden + REF framing.
 * Display = clear blad (kozijnen buiten overlay); openingStart/End vanaf L11, niet hinge-rebuild.
 */
function resolveDoorframeLedOpening(params: {
  hingePx: { x: number; y: number }
  wallUnit: Vec2
  freeDir: Vec2
  clearOpening: { startPx: { x: number; y: number }; endPx: { x: number; y: number } }
  framingAlongPx: number
  framingOppositePx: number
}): FramedOpening {
  const clears = clearOverhangsFromDoorframeOpening({
    hingePx: params.hingePx,
    freeDir: params.freeDir,
    clearOpening: params.clearOpening,
  })
  const framingAlongPx = Math.max(0, params.framingAlongPx)
  const framingOppositePx = Math.max(0, params.framingOppositePx)
  // FML kozijn-tot-kozijn = deurblad (L11) + REF framing.
  const overhangAlongPx = clears.clearAlongPx + framingAlongPx
  const overhangOppositePx = clears.clearOppositePx + framingOppositePx
  const widthPx = Math.max(1, overhangAlongPx + overhangOppositePx)
  // Overlay-blad = deurblad (clear); framing blijft buiten display.
  const bladePx = Math.max(1, clears.clearAlongPx)

  const a = params.clearOpening.startPx
  const b = params.clearOpening.endPx
  const tA = dot({ x: a.x - params.hingePx.x, y: a.y - params.hingePx.y }, params.freeDir)
  const tB = dot({ x: b.x - params.hingePx.x, y: b.y - params.hingePx.y }, params.freeDir)
  const clearFreeEnd = tA >= tB ? a : b
  const clearPivotEnd = tA >= tB ? b : a

  // FML-uiteinden = clear-uiteinden naar buiten uitgebreid met REF framing.
  const freeEndPx = {
    x: clearFreeEnd.x + params.freeDir.x * framingAlongPx,
    y: clearFreeEnd.y + params.freeDir.y * framingAlongPx,
  }
  const pivotEndPx = {
    x: clearPivotEnd.x - params.freeDir.x * framingOppositePx,
    y: clearPivotEnd.y - params.freeDir.y * framingOppositePx,
  }

  const startIsPivot =
    dot({ x: pivotEndPx.x - freeEndPx.x, y: pivotEndPx.y - freeEndPx.y }, params.wallUnit) <= 0
  const openingStartPx = startIsPivot ? pivotEndPx : freeEndPx
  const openingEndPx = startIsPivot ? freeEndPx : pivotEndPx

  const display = buildDisplayFromHinge({
    hingePx: params.hingePx,
    wallUnit: params.wallUnit,
    freeDir: params.freeDir,
    bladePx,
  })

  return {
    overhangAlongPx,
    overhangOppositePx,
    framingAlongPx,
    framingOppositePx,
    widthPx,
    bladePx,
    openingStartPx,
    openingEndPx,
    displayStartPx: display.displayStartPx,
    displayEndPx: display.displayEndPx,
    pivotEndPx,
    freeEndPx,
    hingeAtStart: startIsPivot,
    displayHingeAtStart: display.displayHingeAtStart,
  }
}

/**
 * L12: hinge via white-face straighten, daarna mirrored/FML.
 */
export function orientBoundDoors(params: {
  cv: OpenCV
  boundDoors: BoundDoor[]
  resolvedDoors: ResolvedDoorCandidate[]
  segments: SemanticWallSegment[]
  /** Opening-wit labels (`rawLabelsData`). */
  whiteLabelsData: Int32Array
  whiteParentMap: Map<number, number>
  width: number
  height: number
}): OrientedDoor[] {
  if (params.boundDoors.length <= 0 || params.resolvedDoors.length <= 0 || params.segments.length <= 0) {
    return []
  }
  if (params.whiteLabelsData.length < params.width * params.height) return []
  const resolvedById = new Map(params.resolvedDoors.map((door) => [door.id, door]))
  const oriented: OrientedDoor[] = []

  for (const bound of params.boundDoors) {
    const resolved = resolvedById.get(bound.doorId)
    if (!resolved) continue
    const segment = params.segments[bound.segmentIndex]
    if (!segment) continue
    const wallUnit = normalizeVector(segment.b.x - segment.a.x, segment.b.y - segment.a.y)
    if (!wallUnit) continue
    const normal = { x: -wallUnit.y, y: wallUnit.x }

    const hinge = computeL12DoorHinge({
      cv: params.cv,
      labelsData: params.whiteLabelsData,
      parentMap: params.whiteParentMap,
      width: params.width,
      height: params.height,
      faceIds: resolved.faceIds,
      bbox: resolved.bbox,
      wallUnit,
    })
    if (!hinge) continue

    const axisPair = resolveOpeningAndLeafAxis(hinge.axes, wallUnit)
    if (!axisPair) continue

    const freeDir =
      normalizeVector(
        Math.sign(dot(axisPair.openingAxis, wallUnit) || 1) * wallUnit.x,
        Math.sign(dot(axisPair.openingAxis, wallUnit) || 1) * wallUnit.y,
      ) ?? wallUnit

    const swingRight = dot(axisPair.leafAxis, normal) >= 0

    const framed = bound.doorframeClearOpening
      ? resolveDoorframeLedOpening({
          hingePx: hinge.hingePx,
          wallUnit,
          freeDir,
          clearOpening: bound.doorframeClearOpening,
          framingAlongPx: resolved.framingAlongPx,
          framingOppositePx: resolved.framingOppositePx,
        })
      : resolveFramedOpeningAlongWall({
          hingePx: hinge.hingePx,
          wallUnit,
          freeDir,
          overhangAlongPx: resolved.overhangAlongPx,
          overhangOppositePx: resolved.overhangOppositePx,
          framingAlongPx: resolved.framingAlongPx,
          framingOppositePx: resolved.framingOppositePx,
        })

    // FML: Path A = L11 doorframe-uiteinden; Path B = hinge±resolve-overhangs.
    // Overlay-symbol: clear blad om geometrisch scharnier (kozijnen zichtbaar).
    const mirrored = buildMirrored(framed.hingeAtStart, swingRight)
    const displayMirrored = buildMirrored(framed.displayHingeAtStart, swingRight)

    const symbol = buildDoorSwingSymbol({
      kind: resolved.kind,
      start: framed.displayStartPx,
      end: framed.displayEndPx,
      wallUnit,
      width: framed.bladePx,
      mirrored: displayMirrored,
    })

    oriented.push({
      doorId: bound.doorId,
      segmentIndex: bound.segmentIndex,
      junctionAId: bound.junctionAId,
      junctionBId: bound.junctionBId,
      t: bound.t,
      openingAxis: bound.openingAxis,
      outwardSign: bound.outwardSign,
      kind: resolved.kind,
      fmlRefId: resolved.fmlRefId,
      mirrored,
      snappedBBox: { ...bound.snappedBBox },
      hingePx: { x: round2(hinge.hingePx.x), y: round2(hinge.hingePx.y) },
      axes: hinge.axes,
      swingAngleDeg: round2(hinge.swingAngleDeg),
      openingStartPx: { x: round2(framed.openingStartPx.x), y: round2(framed.openingStartPx.y) },
      openingEndPx: { x: round2(framed.openingEndPx.x), y: round2(framed.openingEndPx.y) },
      displayStartPx: { x: round2(framed.displayStartPx.x), y: round2(framed.displayStartPx.y) },
      displayEndPx: { x: round2(framed.displayEndPx.x), y: round2(framed.displayEndPx.y) },
      framingAlongPx: round2(framed.framingAlongPx),
      framingOppositePx: round2(framed.framingOppositePx),
      leafLines: symbol.leafLines.map((line) => line.map(round2)),
      arcPoints: symbol.arcPoints.map((line) => line.map(round2)),
      arrowPoints: symbol.arrowPoints.map((line) => line.map(round2)),
    })
  }
  return oriented
}
