/**
 * Kopieer een FML-onderlegger (`drawing`) van een andere floor of gevelgroep.
 * Richting: bron (heeft scan) → doel (vaak nog leeg). Scan + schaal + positie + rotatie;
 * geen linialen.
 *
 * Op Gevels zijn verdiepingen óók bronnen: de knop zoekt niet alleen andere gevels.
 */
import {
  elevationViewForGroup,
  listElevationViews,
  setElevationViewDrawing,
} from './elevation-views'
import { listFacadeGroups } from './facade-groups'
import type { DrawingMeta, FloorPlan } from './types'

export type UnderlayReuseKind = 'floor' | 'elevation'

export type UnderlayReuseDonor = {
  id: string
  name: string
  kind: UnderlayReuseKind
}

export type UnderlayReuseTarget =
  { kind: 'floor'; index: number } | { kind: 'elevation'; groupId: string }

const FLOOR_PREFIX = 'floor:'
const ELEV_PREFIX = 'elev:'

export function cloneDrawingMeta(drawing: DrawingMeta): DrawingMeta {
  const next: DrawingMeta = {
    x: drawing.x,
    y: drawing.y,
    width: drawing.width,
    height: drawing.height,
    rotation: drawing.rotation,
  }
  if (drawing.url != null) next.url = drawing.url
  if (drawing.alpha != null) next.alpha = drawing.alpha
  if (drawing.visible != null) next.visible = drawing.visible
  if (drawing.extras) next.extras = { ...drawing.extras }
  return next
}

export function isReusableUnderlayDrawing(
  drawing: DrawingMeta | undefined,
): drawing is DrawingMeta {
  return (
    !!drawing &&
    drawing.width > 0 &&
    drawing.height > 0 &&
    typeof drawing.url === 'string' &&
    drawing.url.trim().length > 0
  )
}

export function encodeUnderlayDonorId(kind: UnderlayReuseKind, key: string): string {
  return kind === 'floor' ? `${FLOOR_PREFIX}${key}` : `${ELEV_PREFIX}${key}`
}

export function parseUnderlayDonorId(id: string): { kind: UnderlayReuseKind; key: string } | null {
  if (id.startsWith(FLOOR_PREFIX)) return { kind: 'floor', key: id.slice(FLOOR_PREFIX.length) }
  if (id.startsWith(ELEV_PREFIX)) return { kind: 'elevation', key: id.slice(ELEV_PREFIX.length) }
  if (/^\d+$/.test(id)) return { kind: 'floor', key: id }
  if (id.trim()) return { kind: 'elevation', key: id.trim() }
  return null
}

function drawingFromDonor(
  plan: FloorPlan,
  donor: { kind: UnderlayReuseKind; key: string },
): DrawingMeta | null {
  if (donor.kind === 'floor') {
    const index = Number(donor.key)
    if (!Number.isInteger(index)) return null
    const drawing = plan.floors[index]?.drawing
    return isReusableUnderlayDrawing(drawing) ? drawing : null
  }
  const drawing = elevationViewForGroup(plan, donor.key)?.drawing
  return isReusableUnderlayDrawing(drawing) ? drawing : null
}

export function listUnderlayReuseDonors(
  plan: FloorPlan,
  exclude: { floorIndex?: number | null; elevationGroupId?: string | null } = {},
): UnderlayReuseDonor[] {
  const out: UnderlayReuseDonor[] = []
  const skipFloor = exclude.floorIndex
  for (let i = 0; i < plan.floors.length; i++) {
    if (skipFloor === i) continue
    const floor = plan.floors[i]
    if (!floor || !isReusableUnderlayDrawing(floor.drawing)) continue
    const name = floor.name.trim() || `Verdieping ${i + 1}`
    out.push({ id: encodeUnderlayDonorId('floor', String(i)), name, kind: 'floor' })
  }
  const skipElev = exclude.elevationGroupId?.trim() ?? ''
  const nameById = new Map(listFacadeGroups(plan).map((group) => [group.id, group.name] as const))
  for (const view of listElevationViews(plan)) {
    if (view.facadeGroupId === skipElev) continue
    if (!isReusableUnderlayDrawing(view.drawing)) continue
    out.push({
      id: encodeUnderlayDonorId('elevation', view.facadeGroupId),
      name: nameById.get(view.facadeGroupId) ?? view.facadeGroupId,
      kind: 'elevation',
    })
  }
  return out
}

export function copyUnderlayFromDonor(
  plan: FloorPlan,
  donorId: string,
  target: UnderlayReuseTarget,
): FloorPlan | null {
  const parsed = parseUnderlayDonorId(donorId)
  if (!parsed) return null
  if (target.kind === 'floor' && parsed.kind === 'floor' && Number(parsed.key) === target.index) {
    return null
  }
  if (
    target.kind === 'elevation' &&
    parsed.kind === 'elevation' &&
    parsed.key.trim() === target.groupId.trim()
  ) {
    return null
  }
  const drawing = drawingFromDonor(plan, parsed)
  if (!drawing) return null
  const clone = cloneDrawingMeta(drawing)
  if (target.kind === 'floor') {
    const dest = plan.floors[target.index]
    if (!dest) return null
    return {
      ...plan,
      floors: plan.floors.map((floor, i) =>
        i === target.index ? { ...floor, drawing: clone } : floor,
      ),
    }
  }
  const groupId = target.groupId.trim()
  if (!groupId) return null
  return setElevationViewDrawing(plan, groupId, clone)
}

/** @deprecated gebruik listUnderlayReuseDonors */
export function listFloorUnderlayDonors(
  plan: FloorPlan,
  excludeIndex: number,
): UnderlayReuseDonor[] {
  return listUnderlayReuseDonors(plan, { floorIndex: excludeIndex, elevationGroupId: null }).filter(
    (donor) => donor.kind === 'floor',
  )
}

/** @deprecated gebruik listUnderlayReuseDonors */
export function listElevationUnderlayDonors(
  plan: FloorPlan,
  excludeGroupId: string,
): UnderlayReuseDonor[] {
  return listUnderlayReuseDonors(plan, { elevationGroupId: excludeGroupId }).filter(
    (donor) => donor.kind === 'elevation',
  )
}

export function copyFloorUnderlay(
  plan: FloorPlan,
  fromIndex: number,
  toIndex: number,
): FloorPlan | null {
  return copyUnderlayFromDonor(plan, encodeUnderlayDonorId('floor', String(fromIndex)), {
    kind: 'floor',
    index: toIndex,
  })
}

export function copyElevationUnderlay(
  plan: FloorPlan,
  fromGroupId: string,
  toGroupId: string,
): FloorPlan | null {
  return copyUnderlayFromDonor(plan, encodeUnderlayDonorId('elevation', fromGroupId), {
    kind: 'elevation',
    groupId: toGroupId,
  })
}
