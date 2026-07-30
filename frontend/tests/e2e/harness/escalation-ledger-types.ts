/**
 * Escalatie-grootboek veld voor E2E-snapshots (`<slug>.layers.json`).
 * Teller-implementatie volgt in batch nul; dit type reserveert de sleutel
 * zodat de eerste fixtures geen hergoedkeuring nodig hebben.
 */
import type { EscalationId } from '@/core/diagnostics'

/** Per ESC-ID: hoe vaak het pad vuurde in deze run. Ontbrekende keys = 0. */
export type EscalationLedger = Partial<Record<EscalationId, number>>
