/**
 * Fixture kind ↔ FML refid/guid.
 */
import type { FloorItem, FloorPlan } from '../../fml/types'
import { fmlRefidForFixtureKind } from './fixture-fml-refids'
import { FML_REFID_EXTRA } from './normalize-plan-identities'
import type { FmlConceptAdapter } from './registry'

function serializeItem(item: FloorItem, out: Record<string, unknown>): void {
  const preserved =
    typeof item.extras?.[FML_REFID_EXTRA] === 'string'
      ? String(item.extras[FML_REFID_EXTRA]).trim()
      : ''
  out.refid = preserved || fmlRefidForFixtureKind(item.kind)
  out.guid = item.id
  delete out.kind
  delete out.id
  if (out.extras && typeof out.extras === 'object') {
    const extras = { ...(out.extras as Record<string, unknown>) }
    delete extras[FML_REFID_EXTRA]
    if (Object.keys(extras).length === 0) delete out.extras
    else out.extras = extras
  }
}

function hydrate(_plan: FloorPlan): void {
  // normalizePlanIdentities draait ná hydrate in importFmlV3.
}

export const fixtureKindAdapter: FmlConceptAdapter = {
  id: 'fixture-kind',
  hydrate,
  serializeItem,
}
