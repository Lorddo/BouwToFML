/**
 * Fixture kind ↔ FML refid/guid.
 * Dakraam-dakvlak: `roofSurfaceId` ↔ FML `btfRoofSurfaceId` (lossy extras).
 */
import type { FloorItem, FloorPlan } from '../../plan/types'
import { fmlRefidForFixtureKind } from './fixture-fml-refids'
import { FML_REFID_EXTRA } from './normalize-plan-identities'
import type { FmlConceptAdapter } from './registry'

/** FML/extras-sleutel voor gekoppeld dakvlak (Floorplanner-hostile). */
export const BTF_ROOF_SURFACE_ID_EXTRA = 'btfRoofSurfaceId'

function serializeItem(item: FloorItem, out: Record<string, unknown>): void {
  out.refid = fmlRefidForFixtureKind(item.kind)
  out.guid = item.id
  delete out.kind
  delete out.id
  delete out.roofSurfaceId
  const roofId = item.roofSurfaceId?.trim()
  if (roofId) out[BTF_ROOF_SURFACE_ID_EXTRA] = roofId
  else delete out[BTF_ROOF_SURFACE_ID_EXTRA]
  if (out.extras && typeof out.extras === 'object') {
    const extras = { ...(out.extras as Record<string, unknown>) }
    delete extras[FML_REFID_EXTRA]
    delete extras[BTF_ROOF_SURFACE_ID_EXTRA]
    if (Object.keys(extras).length === 0) delete out.extras
    else out.extras = extras
  }
}

function hydrateItem(item: FloorItem): void {
  if (item.roofSurfaceId?.trim()) {
    if (item.extras && BTF_ROOF_SURFACE_ID_EXTRA in item.extras) {
      const next = { ...item.extras }
      delete next[BTF_ROOF_SURFACE_ID_EXTRA]
      item.extras = Object.keys(next).length > 0 ? next : undefined
    }
    return
  }
  const raw = item.extras?.[BTF_ROOF_SURFACE_ID_EXTRA]
  if (typeof raw !== 'string' || !raw.trim()) return
  item.roofSurfaceId = raw.trim()
  const next = { ...(item.extras ?? {}) }
  delete next[BTF_ROOF_SURFACE_ID_EXTRA]
  item.extras = Object.keys(next).length > 0 ? next : undefined
}

function hydrate(plan: FloorPlan): void {
  for (const floor of plan.floors) {
    for (const item of floor.items ?? []) hydrateItem(item)
    for (const design of floor.designs ?? []) {
      for (const item of design.items ?? []) hydrateItem(item)
    }
  }
}

export const fixtureKindAdapter: FmlConceptAdapter = {
  id: 'fixture-kind',
  hydrate,
  serializeItem,
}
