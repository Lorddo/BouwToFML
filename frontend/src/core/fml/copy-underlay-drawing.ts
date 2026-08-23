/**
 * Kopieer een FML-onderlegger (`drawing`) van een andere floor of gevelgroep.
 * Scan + schaal + positie + rotatie gaan mee; geen linialen.
 */
import {
  elevationViewForGroup,
  listElevationViews,
  setElevationViewDrawing,
} from './elevation-views'
import { listFacadeGroups } from './facade-groups'
import type { DrawingMeta, FloorPlan } from './types'

export type UnderlayReuseDonor = {
  id: string
  name: string
}

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

export function listFloorUnderlayDonors(
  plan: FloorPlan,
  excludeIndex: number,
): UnderlayReuseDonor[] {
  const out: UnderlayReuseDonor[] = []
  for (let i = 0; i < plan.floors.length; i++) {
    if (i === excludeIndex) continue
    const floor = plan.floors[i]
    if (!floor || !isReusableUnderlayDrawing(floor.drawing)) continue
    const name = floor.name.trim() || `Verdieping ${i + 1}`
    out.push({ id: String(i), name })
  }
  return out
}

export function listElevationUnderlayDonors(
  plan: FloorPlan,
  excludeGroupId: string,
): UnderlayReuseDonor[] {
  const skip = excludeGroupId.trim()
  const nameById = new Map(listFacadeGroups(plan).map((group) => [group.id, group.name] as const))
  const out: UnderlayReuseDonor[] = []
  for (const view of listElevationViews(plan)) {
    if (view.facadeGroupId === skip) continue
    if (!isReusableUnderlayDrawing(view.drawing)) continue
    out.push({
      id: view.facadeGroupId,
      name: nameById.get(view.facadeGroupId) ?? view.facadeGroupId,
    })
  }
  return out
}

export function copyFloorUnderlay(
  plan: FloorPlan,
  fromIndex: number,
  toIndex: number,
): FloorPlan | null {
  if (fromIndex === toIndex) return null
  const donor = plan.floors[fromIndex]
  const target = plan.floors[toIndex]
  if (!donor || !target || !isReusableUnderlayDrawing(donor.drawing)) return null
  const drawing = cloneDrawingMeta(donor.drawing)
  return {
    ...plan,
    floors: plan.floors.map((floor, i) => (i === toIndex ? { ...floor, drawing } : floor)),
  }
}

export function copyElevationUnderlay(
  plan: FloorPlan,
  fromGroupId: string,
  toGroupId: string,
): FloorPlan | null {
  const from = fromGroupId.trim()
  const to = toGroupId.trim()
  if (!from || !to || from === to) return null
  const donor = elevationViewForGroup(plan, from)?.drawing
  if (!isReusableUnderlayDrawing(donor)) return null
  return setElevationViewDrawing(plan, to, cloneDrawingMeta(donor))
}
