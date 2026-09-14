/**
 * B8 — plan.settings.bovenlichtPacked ↔ FML source.settings.bovenlichtPacked.
 *
 * Anders dan andere concepten: deze key wordt wél naar FML geschreven.
 * Fold-bij-import / expand-bij-export blijft in de legacy-keten
 * (vóór hydrate / via readBovenlichtPacked); de adapter houdt de FML-key synchroon.
 */
import { readBovenlichtPacked } from '../../plan/bovenlicht'
import type { FloorPlan } from '../../plan/types'
import type { FmlConceptAdapter } from './registry'

function hydratePlan(plan: FloorPlan): void {
  const raw = plan.source?.settings?.bovenlichtPacked
  if (plan.settings?.bovenlichtPacked != null) {
    // Typed field al gezet; legacy key opruimen.
  } else if (raw === false) {
    plan.settings = { ...(plan.settings ?? {}), bovenlichtPacked: false }
  } else if (raw === true) {
    plan.settings = { ...(plan.settings ?? {}), bovenlichtPacked: true }
  }
  // Ontbrekend → default true via readBovenlichtPacked; geen expliciete write nodig.

  if (plan.source?.settings && 'bovenlichtPacked' in plan.source.settings) {
    const next = { ...plan.source.settings }
    delete next.bovenlichtPacked
    plan.source.settings = Object.keys(next).length > 0 ? next : undefined
  }
}

function serializePlanSettings(plan: FloorPlan, settings: Record<string, unknown>): void {
  // Zelfde waarde als buildFmlV3 al zet via readBovenlichtPacked — houdt FML synchroon
  // ook als die expliciete regel later verdwijnt.
  settings.bovenlichtPacked = readBovenlichtPacked(plan)
}

export const bovenlichtAdapter: FmlConceptAdapter = {
  id: 'bovenlicht',
  hydrate: hydratePlan,
  serializePlanSettings,
}
