import type { DoorAssetKind } from './opening-refid-catalog'

export interface DoorSwingPoint {
  x: number
  y: number
}

export interface DoorSymbol {
  leafLines: number[][]
  arcPoints: number[][]
  arrowPoints: number[][]
}

export interface BuildDoorSwingSymbolInput {
  kind: DoorAssetKind
  start: DoorSwingPoint
  end: DoorSwingPoint
  wallUnit: DoorSwingPoint
  width: number
  mirrored?: [number, number]
  /** Optioneel: exacte bladlengte (default 0.9×width). FML-viewer gebruikt volle clear span. */
  leafLength?: number
  /**
   * Muurdikte (zelfde eenheid als start/end: cm in FML, px in L12-overlay).
   * Schuifpijlen gaan net buiten de muurgap (zoals rond/half-rond raam-ornament).
   */
  wallThickness?: number
}

/** Extra buiten de muurgap — analoog aan window-ornament `radius + 2`. */
const SLIDING_ARROW_OUTSIDE_GAP = 10
const SLIDING_ARROW_FALLBACK_THICKNESS = 10

function slidingArrowOffset(wallThickness?: number): number {
  const thickness =
    wallThickness != null && wallThickness > 0 ? wallThickness : SLIDING_ARROW_FALLBACK_THICKNESS
  return thickness / 2 + SLIDING_ARROW_OUTSIDE_GAP
}

function midpoint(a: DoorSwingPoint, b: DoorSwingPoint): DoorSwingPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Normaal op muur a→b in schermcoördinaten (Y omlaag).
 * +normal = rechterzijde als je op a staat en naar b kijkt.
 * Dit is het tegengestelde van `floorplannerLeftNormal` (wall `balance`).
 */
function wallNormal(wallUnit: DoorSwingPoint): DoorSwingPoint {
  return { x: -wallUnit.y, y: wallUnit.x }
}

/**
 * CONVENTIE voor `mirrored` (Floorplanner):
 * mirrored[0] → scharnier-einde (0=start/a, 1=eind/b)
 * mirrored[1] → zwaaizijde (0=-normaal, 1=+normaal)
 */
const SWING_NORMAL_SIGN = 1 as const

export function resolveHingeAtStart(mirrored: [number, number] | undefined): boolean {
  return mirrored?.[0] !== 1
}

export function resolveSwingSign(mirrored: [number, number] | undefined): 1 | -1 {
  const base = mirrored?.[1] === 1 ? 1 : -1
  return (base * SWING_NORMAL_SIGN) as 1 | -1
}

export function buildMirrored(hingeAtStart: boolean, swingRight: boolean): [number, number] {
  return [hingeAtStart ? 0 : 1, swingRight ? 1 : 0]
}

function buildSingleDoorSymbol(params: {
  start: DoorSwingPoint
  end: DoorSwingPoint
  wallUnit: DoorSwingPoint
  width: number
  mirrored?: [number, number]
  swingDegrees?: 45 | 90
  showArc?: boolean
  leafLength?: number
  hingeAtStartOverride?: boolean
  swingSignOverride?: 1 | -1
}): DoorSymbol {
  const normal = wallNormal(params.wallUnit)
  const hingeAtStart = params.hingeAtStartOverride ?? resolveHingeAtStart(params.mirrored)
  const swingSign = params.swingSignOverride ?? resolveSwingSign(params.mirrored)
  const hingePoint = hingeAtStart ? params.start : params.end
  const dirAlong = hingeAtStart ? params.wallUnit : { x: -params.wallUnit.x, y: -params.wallUnit.y }
  const spanLength = Math.hypot(params.end.x - params.start.x, params.end.y - params.start.y)
  const baseWidth = params.width > 0 ? params.width : spanLength
  const leafLength = params.leafLength ?? Math.max(10, baseWidth * 0.9)
  const swingDegrees = params.swingDegrees ?? 90
  const showArc = params.showArc ?? true

  const rad = (swingDegrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const leafEnd: DoorSwingPoint = {
    x: hingePoint.x + (dirAlong.x * cos + normal.x * swingSign * sin) * leafLength,
    y: hingePoint.y + (dirAlong.y * cos + normal.y * swingSign * sin) * leafLength,
  }

  const startAngle = Math.atan2(dirAlong.y, dirAlong.x)
  const leafAngle = Math.atan2(leafEnd.y - hingePoint.y, leafEnd.x - hingePoint.x)
  let sweep = leafAngle - startAngle
  while (sweep > Math.PI) sweep -= Math.PI * 2
  while (sweep <= -Math.PI) sweep += Math.PI * 2

  const arcPoints =
    showArc && Math.abs(sweep) > 0.05
      ? [sampleSwingArc(hingePoint, leafLength, startAngle, sweep > 0 ? 1 : -1, Math.abs(sweep))]
      : []

  return {
    leafLines: [[hingePoint.x, hingePoint.y, leafEnd.x, leafEnd.y]],
    arcPoints,
    arrowPoints: [],
  }
}

function buildWideDoubleLeafSymbol(params: {
  start: DoorSwingPoint
  end: DoorSwingPoint
  wallUnit: DoorSwingPoint
  width: number
  mirrored?: [number, number]
  leafLength?: number
}): DoorSymbol {
  const mid = midpoint(params.start, params.end)
  const halfSpan = Math.hypot(mid.x - params.start.x, mid.y - params.start.y)
  const leafLength =
    params.leafLength != null ? Math.max(10, params.leafLength / 2) : Math.max(10, halfSpan * 0.92)
  const swingSign = resolveSwingSign(params.mirrored)
  const left = buildSingleDoorSymbol({
    start: params.start,
    end: mid,
    wallUnit: params.wallUnit,
    width: params.width,
    mirrored: params.mirrored,
    leafLength,
    hingeAtStartOverride: true,
    swingSignOverride: swingSign,
  })
  const right = buildSingleDoorSymbol({
    start: mid,
    end: params.end,
    wallUnit: params.wallUnit,
    width: params.width,
    mirrored: params.mirrored,
    leafLength,
    hingeAtStartOverride: false,
    swingSignOverride: swingSign,
  })
  return {
    leafLines: [...left.leafLines, ...right.leafLines],
    arcPoints: [...left.arcPoints, ...right.arcPoints],
    arrowPoints: [],
  }
}

function buildArrowLine(
  center: DoorSwingPoint,
  direction: DoorSwingPoint,
  length: number,
): number[] {
  const half = length / 2
  const tipX = center.x + direction.x * half
  const tipY = center.y + direction.y * half
  const tailX = center.x - direction.x * half
  const tailY = center.y - direction.y * half
  const headLen = Math.min(10, length * 0.28)
  const angle = Math.atan2(direction.y, direction.x)
  const leftX = tipX - headLen * Math.cos(angle - 0.45)
  const leftY = tipY - headLen * Math.sin(angle - 0.45)
  const rightX = tipX - headLen * Math.cos(angle + 0.45)
  const rightY = tipY - headLen * Math.sin(angle + 0.45)
  return [tailX, tailY, tipX, tipY, leftX, leftY, tipX, tipY, rightX, rightY]
}

function panelDividerLine(params: {
  start: DoorSwingPoint
  end: DoorSwingPoint
  wallUnit: DoorSwingPoint
}): number[] {
  const mid = midpoint(params.start, params.end)
  const normal = wallNormal(params.wallUnit)
  const half = 6
  return [
    mid.x - normal.x * half,
    mid.y - normal.y * half,
    mid.x + normal.x * half,
    mid.y + normal.y * half,
  ]
}

function arrowAlongWall(
  center: DoorSwingPoint,
  wallUnit: DoorSwingPoint,
  length: number,
  towardEnd: boolean,
): number[] {
  const dir = towardEnd ? wallUnit : { x: -wallUnit.x, y: -wallUnit.y }
  return buildArrowLine(center, dir, length)
}

/** Pijl-lane loodrecht op de muur; `mirrored[1]` kiest de zichtzijde (±normaal). */
function slidingArrowLane(
  center: DoorSwingPoint,
  wallUnit: DoorSwingPoint,
  offset: number,
  mirrored?: [number, number],
): DoorSwingPoint {
  const normal = wallNormal(wallUnit)
  const sign = resolveSwingSign(mirrored)
  return {
    x: center.x + normal.x * sign * offset,
    y: center.y + normal.y * sign * offset,
  }
}

/** Pocketdeur: één pijl (richting via mirrored[0]; default naar eind/b = rechts bij a→b). */
function buildSlidingPocketSymbol(params: {
  start: DoorSwingPoint
  end: DoorSwingPoint
  wallUnit: DoorSwingPoint
  mirrored?: [number, number]
  wallThickness?: number
}): DoorSymbol {
  const span = Math.hypot(params.end.x - params.start.x, params.end.y - params.start.y)
  const arrowLen = Math.max(18, span * 0.35)
  const center = midpoint(params.start, params.end)
  const offset = slidingArrowOffset(params.wallThickness)
  const lane = slidingArrowLane(center, params.wallUnit, offset, params.mirrored)
  const towardEnd = !resolveHingeAtStart(params.mirrored)
  return {
    leafLines: [],
    arcPoints: [],
    arrowPoints: [arrowAlongWall(lane, params.wallUnit, arrowLen, towardEnd)],
  }
}

/**
 * Schuifpui 1 schuivend deel: middenstreep + 1 pijl (along via mirrored[0],
 * muurzijde via mirrored[1]).
 */
function buildSlidingSingleSymbol(params: {
  start: DoorSwingPoint
  end: DoorSwingPoint
  wallUnit: DoorSwingPoint
  mirrored?: [number, number]
  wallThickness?: number
}): DoorSymbol {
  const span = Math.hypot(params.end.x - params.start.x, params.end.y - params.start.y)
  const arrowLen = Math.max(16, span * 0.2)
  const mid = midpoint(params.start, params.end)
  const offset = slidingArrowOffset(params.wallThickness)
  const leftCenter = slidingArrowLane(
    { x: (params.start.x + mid.x) / 2, y: (params.start.y + mid.y) / 2 },
    params.wallUnit,
    offset,
    params.mirrored,
  )
  const rightCenter = slidingArrowLane(
    { x: (mid.x + params.end.x) / 2, y: (mid.y + params.end.y) / 2 },
    params.wallUnit,
    offset,
    params.mirrored,
  )
  const hingeAtStart = resolveHingeAtStart(params.mirrored)
  // Default [0,0]: pijl op linker deel naar rechts t.o.v. muur a→b (omgekeerd van hingeAtStart-mapping).
  const arrowCenter = hingeAtStart ? rightCenter : leftCenter
  const towardEnd = !hingeAtStart
  return {
    leafLines: [panelDividerLine(params)],
    arcPoints: [],
    arrowPoints: [arrowAlongWall(arrowCenter, params.wallUnit, arrowLen, towardEnd)],
  }
}

/**
 * Schuifpui 2 schuivende delen: middenstreep + twee pijlen naar elkaar toe
 * (along via mirrored[0], muurzijde via mirrored[1]).
 */
function buildSlidingDoubleSymbol(params: {
  start: DoorSwingPoint
  end: DoorSwingPoint
  wallUnit: DoorSwingPoint
  mirrored?: [number, number]
  wallThickness?: number
}): DoorSymbol {
  const span = Math.hypot(params.end.x - params.start.x, params.end.y - params.start.y)
  const arrowLen = Math.max(16, span * 0.18)
  const mid = midpoint(params.start, params.end)
  const offset = slidingArrowOffset(params.wallThickness)
  const leftCenter = slidingArrowLane(
    { x: (params.start.x + mid.x) / 2, y: (params.start.y + mid.y) / 2 },
    params.wallUnit,
    offset,
    params.mirrored,
  )
  const rightCenter = slidingArrowLane(
    { x: (mid.x + params.end.x) / 2, y: (mid.y + params.end.y) / 2 },
    params.wallUnit,
    offset,
    params.mirrored,
  )
  const swap = !resolveHingeAtStart(params.mirrored)
  const a = swap ? rightCenter : leftCenter
  const b = swap ? leftCenter : rightCenter
  return {
    leafLines: [panelDividerLine(params)],
    arcPoints: [],
    arrowPoints: [
      arrowAlongWall(a, params.wallUnit, arrowLen, !swap),
      arrowAlongWall(b, params.wallUnit, arrowLen, swap),
    ],
  }
}

function sampleSwingArc(
  center: DoorSwingPoint,
  radius: number,
  startAngle: number,
  swingSign: 1 | -1,
  sweepRadians: number,
  samples = 10,
): number[] {
  const endAngle = startAngle + swingSign * sweepRadians
  const points: number[] = []
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples
    const angle = startAngle + (endAngle - startAngle) * t
    points.push(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius)
  }
  return points
}

/**
 * Frans balkon: draaideur naar binnen (tegengesteld aan FML mirrored[1])
 * + balustrade op de FML-zwaaizijde (buiten, pal voor de gevel).
 * Anna/Ostade: mirrored[1]=0 ⇒ hek op −normaal, blad naar binnen.
 */
function buildFrenchBalconySymbol(params: {
  start: DoorSwingPoint
  end: DoorSwingPoint
  wallUnit: DoorSwingPoint
  width: number
  mirrored?: [number, number]
  leafLength?: number
  wallThickness?: number
}): DoorSymbol {
  const railSign = resolveSwingSign(params.mirrored)
  const inwardSign = railSign === 1 ? -1 : 1
  const door = buildSingleDoorSymbol({
    start: params.start,
    end: params.end,
    wallUnit: params.wallUnit,
    width: params.width,
    mirrored: params.mirrored,
    leafLength: params.leafLength,
    swingSignOverride: inwardSign,
  })
  const thickness =
    params.wallThickness != null && params.wallThickness > 0 ? params.wallThickness : 10
  const face = thickness / 2
  const railOffset = face + 4
  const normal = wallNormal(params.wallUnit)
  const railStart = {
    x: params.start.x + normal.x * railSign * railOffset,
    y: params.start.y + normal.y * railSign * railOffset,
  }
  const railEnd = {
    x: params.end.x + normal.x * railSign * railOffset,
    y: params.end.y + normal.y * railSign * railOffset,
  }
  const span = Math.hypot(params.end.x - params.start.x, params.end.y - params.start.y)
  const n = Math.max(3, Math.round(span / 16))
  const balusters: number[][] = []
  for (let i = 0; i <= n; i += 1) {
    const t = i / n
    const ax = params.start.x + (params.end.x - params.start.x) * t
    const ay = params.start.y + (params.end.y - params.start.y) * t
    balusters.push([
      ax + normal.x * railSign * face,
      ay + normal.y * railSign * face,
      ax + normal.x * railSign * railOffset,
      ay + normal.y * railSign * railOffset,
    ])
  }
  return {
    leafLines: [...door.leafLines, [railStart.x, railStart.y, railEnd.x, railEnd.y], ...balusters],
    arcPoints: door.arcPoints,
    arrowPoints: [],
  }
}

/**
 * Garagedeur: parallelle paneellijnen langs de opening (geen boog/pijl).
 * Voorlopig preview-symbool; FP-export-check bepaalt of refid klopt.
 */
function buildGarageSymbol(params: {
  start: DoorSwingPoint
  end: DoorSwingPoint
  wallUnit: DoorSwingPoint
}): DoorSymbol {
  const normal = wallNormal(params.wallUnit)
  const leafLines: number[][] = []
  for (const offset of [3, 6, 9]) {
    leafLines.push([
      params.start.x - normal.x * offset,
      params.start.y - normal.y * offset,
      params.end.x - normal.x * offset,
      params.end.y - normal.y * offset,
    ])
  }
  return { leafLines, arcPoints: [], arrowPoints: [] }
}

export function buildDoorSwingSymbol(params: BuildDoorSwingSymbolInput): DoorSymbol {
  switch (params.kind) {
    case 'double_wide':
      return buildWideDoubleLeafSymbol({
        start: params.start,
        end: params.end,
        wallUnit: params.wallUnit,
        width: params.width,
        mirrored: params.mirrored,
        leafLength: params.leafLength,
      })
    case 'sliding':
      return buildSlidingDoubleSymbol({
        start: params.start,
        end: params.end,
        wallUnit: params.wallUnit,
        mirrored: params.mirrored,
        wallThickness: params.wallThickness,
      })
    case 'sliding_single':
      return buildSlidingSingleSymbol({
        start: params.start,
        end: params.end,
        wallUnit: params.wallUnit,
        mirrored: params.mirrored,
        wallThickness: params.wallThickness,
      })
    case 'sliding_pocket':
      return buildSlidingPocketSymbol({
        start: params.start,
        end: params.end,
        wallUnit: params.wallUnit,
        mirrored: params.mirrored,
        wallThickness: params.wallThickness,
      })
    case 'garage':
      return buildGarageSymbol({
        start: params.start,
        end: params.end,
        wallUnit: params.wallUnit,
      })
    case 'passage':
      return { leafLines: [], arcPoints: [], arrowPoints: [] }
    case 'closet45':
      return buildSingleDoorSymbol({
        start: params.start,
        end: params.end,
        wallUnit: params.wallUnit,
        width: params.width,
        mirrored: params.mirrored,
        swingDegrees: 45,
        showArc: true,
        leafLength: params.leafLength,
      })
    case 'french_balcony':
      return buildFrenchBalconySymbol({
        start: params.start,
        end: params.end,
        wallUnit: params.wallUnit,
        width: params.width,
        mirrored: params.mirrored,
        leafLength: params.leafLength,
        wallThickness: params.wallThickness,
      })
    default:
      return buildSingleDoorSymbol({
        start: params.start,
        end: params.end,
        wallUnit: params.wallUnit,
        width: params.width,
        mirrored: params.mirrored,
        leafLength: params.leafLength,
      })
  }
}
