/**
 * Opening kind ↔ FML refid/guid (via extras.fmlRefid bij unmapped).
 * Hydrate is grotendeels gedekt door `normalizePlanIdentities`; serialize schrijft hashes.
 */
import type { FloorPlan, Opening } from '../../plan/types'
import { fmlRefidForOpeningKind } from './opening-fml-refids'
import { FML_REFID_EXTRA } from './normalize-plan-identities'
import type { FmlConceptAdapter } from './registry'

function serializeOpening(op: Opening, out: Record<string, unknown>): void {
  const preserved =
    typeof op.extras?.[FML_REFID_EXTRA] === 'string'
      ? String(op.extras[FML_REFID_EXTRA]).trim()
      : ''
  out.refid = preserved || fmlRefidForOpeningKind(op.kind)
  out.guid = op.id
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
  // normalizePlanIdentities draait ná de adapter-hydrate in importFmlV3.
}

export const openingKindAdapter: FmlConceptAdapter = {
  id: 'opening-kind',
  hydrate,
  serializeOpening,
}
