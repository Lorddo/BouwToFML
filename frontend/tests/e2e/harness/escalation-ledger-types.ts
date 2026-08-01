import type { EscalationId } from '@/core/diagnostics'
import type { RunJournalSummary } from '@/core/diagnostics/run-journal'

/**
 * Escalatie-grootboek in `<slug>.layers.json`.
 * `levels` is verplicht: `tally` telt ook geslaagde passages (zie plan § escalatie-grootboek).
 * Geen `events` — die bevatten ruwe floats en churnen.
 */
export type EscalationLedger = {
  escalations: Partial<Record<EscalationId, number>>
  levels: Record<string, number>
  degraded: boolean
  diagnostics: Record<string, number>
}

export function ledgerFromJournal(summary: RunJournalSummary): EscalationLedger {
  return {
    escalations: { ...summary.escalations },
    levels: { ...summary.levels },
    degraded: summary.degraded,
    diagnostics: { ...summary.diagnostics },
  }
}
