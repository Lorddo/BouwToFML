/**
 * Fixture kind ↔ FML refid/guid.
 * Dakraam-dakvlak: `roofSurfaceId` ↔ FML `plgRoofSurfaceId` (lossy extras).
 */
import type { FloorItem, FloorPlan } from '../../plan/types'
import { fmlRefidForFixtureKind } from './fixture-fml-refids'
import { FML_REFID_EXTRA } from './normalize-plan-identities'
import { FML_ROOF_SURFACE_ID_EXTRA } from './plg-fml-extras'
import type { FmlConceptAdapter } from './registry'

function serializeItem(item: FloorItem, out: Record<string, unknown>): void {
  out.refid = fmlRefidForFixtureKind(item.kind)
  out.guid = item.id
  delete out.kind
  delete out.id
  delete out.roofSurfaceId
  delete out.pitchDeg
  const roofId = item.roofSurfaceId?.trim()
  if (roofId) out[FML_ROOF_SURFACE_ID_EXTRA] = roofId
  else delete out[FML_ROOF_SURFACE_ID_EXTRA]
  if (out.extras && typeof out.extras === 'object') {
    const extras = { ...(out.extras as Record<string, unknown>) }
    delete extras[FML_REFID_EXTRA]
    delete extras[FML_ROOF_SURFACE_ID_EXTRA]
    if (Object.keys(extras).length === 0) delete out.extras
    else out.extras = extras
  }
}

function hydrateItem(item: FloorItem): void {
  if (item.roofSurfaceId?.trim()) {
    if (item.extras && FML_ROOF_SURFACE_ID_EXTRA in item.extras) {
      const next = { ...item.extras }
      delete next[FML_ROOF_SURFACE_ID_EXTRA]
      item.extras = Object.keys(next).length > 0 ? next : undefined
    }
    return
  }
  const raw = item.extras?.[FML_ROOF_SURFACE_ID_EXTRA]
  if (typeof raw !== 'string' || !raw.trim()) return
  item.roofSurfaceId = raw.trim()
  const next = { ...(item.extras ?? {}) }
  delete next[FML_ROOF_SURFACE_ID_EXTRA]
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
