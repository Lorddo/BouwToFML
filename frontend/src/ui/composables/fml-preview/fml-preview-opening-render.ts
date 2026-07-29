import type { Opening, OpeningType } from '@/core/fml/types'
import type { OpeningAssetKind, resolveOpeningCatalog } from '@/core/fml/opening-refid-catalog'
import { clamp01 } from '@/core/fml/extraction-to-plan-geom'

export { clamp01 }

export function openingFillColor(type: OpeningType, selected: boolean): string {
  if (selected) return '#f97316'
  return type === 'door' ? '#38bdf8' : '#e879f9'
}

export function buildOpeningGapPolygon(params: {
  startCm: { x: number; y: number }
  endCm: { x: number; y: number }
  wallUnit: { x: number; y: number }
  thicknessCm: number
  toStagePoint: (x: number, y: number) => { x: number; y: number }
}): number[] {
  const half = Math.max(1, params.thicknessCm / 2)
  const normal = { x: -params.wallUnit.y, y: params.wallUnit.x }
  const corners = [
    {
      x: params.startCm.x + normal.x * half,
      y: params.startCm.y + normal.y * half,
    },
    {
      x: params.endCm.x + normal.x * half,
      y: params.endCm.y + normal.y * half,
    },
    {
      x: params.endCm.x - normal.x * half,
      y: params.endCm.y - normal.y * half,
    },
    {
      x: params.startCm.x - normal.x * half,
      y: params.startCm.y - normal.y * half,
    },
  ]
  return corners.flatMap((corner) => {
    const point = params.toStagePoint(corner.x, corner.y)
    return [point.x, point.y]
  })
}

function windowPanelCount(widthCm: number): 1 | 2 | 3 {
  if (widthCm >= 220) return 3
  if (widthCm >= 140) return 2
  return 1
}

export function windowTypeLabel(panelCount: 1 | 2 | 3, kind?: OpeningAssetKind): string {
  if (kind === 'round') return 'rond raam'
  if (kind === 'half_round') return 'half-rond raam'
  if (panelCount === 1) return 'enkel raam'
  if (panelCount === 2) return 'dubbel raam'
  return 'driedelig raam'
}

export function resolveWindowPanelCount(
  widthCm: number,
  kind: ReturnType<typeof resolveOpeningCatalog>['kind'],
  panels?: 1 | 2 | 3,
): 1 | 2 | 3 {
  if (kind === 'round' || kind === 'half_round') return 1
  if (panels === 1 || panels === 2 || panels === 3) return panels
  if (kind !== 'multi') return 1
  return windowPanelCount(widthCm)
}

/** Vaste UI-diameter voor rond/half-rond ornament (px), ongeacht raamformaat. */
export const WINDOW_ORNAMENT_DIAMETER_PX = 10

export interface WindowOrnament {
  kind: 'round' | 'half_round'
  centerX: number
  centerY: number
  radius: number
  /** Polyline voor half-rond (of volle cirkel als fallback). */
  points: number[]
}

export function buildWindowSymbol(params: {
  startCm: { x: number; y: number }
  endCm: { x: number; y: number }
  thicknessCm: number
  toStagePoint: (x: number, y: number) => { x: number; y: number }
  panelCount: 1 | 2 | 3
  kind?: OpeningAssetKind
}): {
  basePoints: number[]
  mullions: number[][]
  ornament: WindowOrnament | null
} {
  const start = params.toStagePoint(params.startCm.x, params.startCm.y)
  const end = params.toStagePoint(params.endCm.x, params.endCm.y)
  const basePoints = [start.x, start.y, end.x, end.y]
  const mullions: number[][] = []
  const segmentCount = params.panelCount
  const dx = params.endCm.x - params.startCm.x
  const dy = params.endCm.y - params.startCm.y
  const span = Math.hypot(dx, dy) || 1
  const wallUnit = { x: dx / span, y: dy / span }
  const normal = { x: -wallUnit.y, y: wallUnit.x }

  // Begin-, eind- en (bij multi) indelingstrepen binnen de muurgap.
  const halfThicknessCm = Math.max(0.5, params.thicknessCm / 2)

  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount
    const anchor = {
      x: params.startCm.x + dx * t,
      y: params.startCm.y + dy * t,
    }
    const m0 = params.toStagePoint(
      anchor.x - normal.x * halfThicknessCm,
      anchor.y - normal.y * halfThicknessCm,
    )
    const m1 = params.toStagePoint(
      anchor.x + normal.x * halfThicknessCm,
      anchor.y + normal.y * halfThicknessCm,
    )
    mullions.push([m0.x, m0.y, m1.x, m1.y])
  }

  const ornament = buildWindowOrnament({
    startCm: params.startCm,
    endCm: params.endCm,
    thicknessCm: params.thicknessCm,
    wallUnit,
    normal,
    toStagePoint: params.toStagePoint,
    kind: params.kind,
  })

  return { basePoints, mullions, ornament }
}

function buildWindowOrnament(params: {
  startCm: { x: number; y: number }
  endCm: { x: number; y: number }
  thicknessCm: number
  wallUnit: { x: number; y: number }
  normal: { x: number; y: number }
  toStagePoint: (x: number, y: number) => { x: number; y: number }
  kind?: OpeningAssetKind
}): WindowOrnament | null {
  if (params.kind !== 'round' && params.kind !== 'half_round') return null

  const midCm = {
    x: (params.startCm.x + params.endCm.x) / 2,
    y: (params.startCm.y + params.endCm.y) / 2,
  }
  // Anchor net buiten de muurgap aan −normal (“onder” het raam).
  const gapEdgeCm = {
    x: midCm.x - params.normal.x * (params.thicknessCm / 2),
    y: midCm.y - params.normal.y * (params.thicknessCm / 2),
  }
  const gapEdge = params.toStagePoint(gapEdgeCm.x, gapEdgeCm.y)
  const mid = params.toStagePoint(midCm.x, midCm.y)
  const nStage = { x: gapEdge.x - mid.x, y: gapEdge.y - mid.y }
  const nLen = Math.hypot(nStage.x, nStage.y) || 1
  const unitN = { x: nStage.x / nLen, y: nStage.y / nLen }

  const radius = WINDOW_ORNAMENT_DIAMETER_PX / 2
  const center = {
    x: gapEdge.x + unitN.x * (radius + 2),
    y: gapEdge.y + unitN.y * (radius + 2),
  }

  if (params.kind === 'round') {
    const points: number[] = []
    const samples = 24
    for (let i = 0; i <= samples; i += 1) {
      const a = (i / samples) * Math.PI * 2
      points.push(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius)
    }
    return {
      kind: 'round',
      centerX: center.x,
      centerY: center.y,
      radius,
      points,
    }
  }

  // Half-rond: diameter langs de muur + boog (geflipt t.o.v. eerdere richting) + platte kant.
  const wallStage = {
    x: params.toStagePoint(params.endCm.x, params.endCm.y).x - mid.x,
    y: params.toStagePoint(params.endCm.x, params.endCm.y).y - mid.y,
  }
  const wLen = Math.hypot(wallStage.x, wallStage.y) || 1
  const unitW = { x: wallStage.x / wLen, y: wallStage.y / wLen }
  const startAngle = Math.atan2(unitW.y, unitW.x)
  // Geflipte boog t.o.v. −normal (platte kant blijft diameter langs muur).
  const sweepSign =
    unitW.x * unitN.y - unitW.y * unitN.x >= 0 ? -1 : 1
  const points: number[] = []
  const samples = 16
  for (let i = 0; i <= samples; i += 1) {
    const a = startAngle + sweepSign * Math.PI * (i / samples)
    points.push(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius)
  }
  // Platte kant: sluit boog-eindpunten (diameter).
  points.push(points[0]!, points[1]!)
  return {
    kind: 'half_round',
    centerX: center.x,
    centerY: center.y,
    radius,
    points,
  }
}

export function flattenStagePoints(
  cmPoints: number[],
  toStagePoint: (x: number, y: number) => { x: number; y: number },
): number[] {
  const result: number[] = []
  for (let i = 0; i < cmPoints.length; i += 2) {
    const point = toStagePoint(cmPoints[i], cmPoints[i + 1])
    result.push(point.x, point.y)
  }
  return result
}

function doorDirectionLabel(opening: Opening): string {
  const side = opening.mirrored?.[0] === 1 ? 'naar andere zijde' : 'standaard zijde'
  const hinge = opening.mirrored?.[1] === 1 ? 'scharnier aan begin' : 'scharnier aan eind'
  return `${side}, ${hinge}`
}

export function doorGroupDetail(group: {
  openings: Opening[]
  isDouble: boolean
}): string {
  const parts: string[] = []
  const refid = group.openings[0]?.refid
  if (refid) parts.push(refid.slice(0, 12))
  if (group.isDouble) {
    parts.push('dubbel openslaand')
  } else if (group.openings.length === 1) {
    parts.push(doorDirectionLabel(group.openings[0]))
  }
  return parts.join(' · ')
}
