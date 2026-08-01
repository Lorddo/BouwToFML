/**
 * Run-journaal — één plek waar escalatiepaden en verzwegen fouten zichtbaar worden.
 *
 * Batch nul uit `.cursor/docs/escalatie.md`: **observeren, niets veranderen.**
 * Geen drempel, geen pad, geen gedrag — alleen vastleggen wat er gebeurde.
 *
 * Ontwerp:
 * - **Leaf-module**: importeert niets behalve de gegenereerde ID-registry. Geen UI, geen DOM,
 *   geen OpenCV → veilig in de worker en cyclusvrij t.o.v. de `core ↔ cv`-grens.
 * - **Module-scoped huidig journaal** i.p.v. een parameter door ~130 bestanden. De orkestratie
 *   opent een run met `resetRunJournal(label)` en leest daarna `summarizeRunJournal()`.
 *   Code die buiten een run loopt schrijft in het lopende journaal — nooit in het niets.
 * - **Tellers zijn de waarheid, gebeurtenissen zijn steekproef.** `counts` is per ESC-ID en mapt
 *   1-op-1 op het E2E-grootboek; `events` is begrensd zodat een hot path niet volloopt.
 * - **Allocatievrij in hot paths**: `escalate()` is één Map-increment.
 */
import type { EscalationId } from './escalation-ids.generated'

/** Hoeveel gebeurtenis-steekproeven we per ESC-ID bewaren (tellers lopen door). */
const MAX_EVENTS_PER_ID = 3

/** Absolute bovengrens per run, zodat een rapport nooit ontploft. */
const MAX_EVENTS = 400

export type JournalEventKind =
  /** Een `catch` slikte een exceptie in. Zet de run op `degraded`. */
  | 'swallowed_error'
  /** Resultaat is achteraf afgekeurd en teruggedraaid naar een eerdere toestand. */
  | 'rollback'
  /** Er was geen meting; een default ging naar buiten. */
  | 'missing_measurement'
  /** Er was wél een meting, maar een andere waarde ging naar buiten. */
  | 'measurement_discarded'
  /** Geaccepteerd zonder het bewijs waar de stage om draait. */
  | 'evidence_missing'
  /** Een modus schakelde filters uit die normaal wél draaien. */
  | 'gates_disabled'
  /** Welk niveau van een cascade het resultaat leverde. */
  | 'cascade_level'

/**
 * Observaties die géén escalatiepad uit de inventaris zijn en dus niet in het grootboek horen.
 * Aparte, expliciete lijst — de inventaris is bevroren, dus hier geen verzonnen ESC-ID's.
 */
export type DiagnosticCode = 'REF_COUNT_BELOW_ADVICE'

export type JournalDetail = Record<string, number | string | boolean | null | undefined>

export interface JournalEvent {
  id: EscalationId | DiagnosticCode
  kind: JournalEventKind
  /** Module of functie, bijv. `useWorkspaceDetection.runDetection`. */
  where: string
  message: string
  detail?: JournalDetail
  errorMessage?: string
  errorStack?: string
}

export interface RunJournal {
  label: string
  startedAt: number
  /** ESC-ID → aantal keer gevuurd. Mapt op `EscalationLedger` in de E2E-harness. */
  counts: Map<EscalationId, number>
  /** `<ESC-ID>:<niveau>` → aantal. Los van `counts` zodat het grootboek per ID blijft. */
  levels: Map<string, number>
  /** Observaties buiten de inventaris — los van `counts` zodat het grootboek per ESC-ID blijft. */
  diagnostics: Map<DiagnosticCode, number>
  events: JournalEvent[]
  /** ID → aantal bewaarde steekproeven, zodat de begrenzing O(1) blijft. */
  eventsPerId: Map<EscalationId | DiagnosticCode, number>
  /** Gebeurtenissen die door de begrenzing niet zijn bewaard (tellers zijn wel volledig). */
  droppedEvents: number
  /** Waar of er minstens één exceptie is ingeslikt. */
  degraded: boolean
}

export interface RunJournalSummary {
  label: string
  degraded: boolean
  /** Som van alle tellers. */
  totalEscalations: number
  /** Serialiseerbare vorm van `counts` — dit is het grootboek-veld. */
  escalations: Partial<Record<EscalationId, number>>
  levels: Record<string, number>
  /** Observaties buiten de inventaris; niet onderdeel van het grootboek. */
  diagnostics: Record<string, number>
  events: JournalEvent[]
  droppedEvents: number
}

export function createRunJournal(label: string): RunJournal {
  return {
    label,
    startedAt: Date.now(),
    counts: new Map(),
    levels: new Map(),
    diagnostics: new Map(),
    events: [],
    eventsPerId: new Map(),
    droppedEvents: 0,
    degraded: false,
  }
}

let current: RunJournal = createRunJournal('startup')

/** Start een nieuwe run. Aanroepen door de orkestratie bij een top-level actie. */
export function resetRunJournal(label: string): RunJournal {
  current = createRunJournal(label)
  return current
}

export function getRunJournal(): RunJournal {
  return current
}

/** Één hit op een escalatiepad. Hot-path veilig: geen allocatie, geen string-opbouw. */
export function escalate(id: EscalationId, times = 1): void {
  current.counts.set(id, (current.counts.get(id) ?? 0) + times)
}

/**
 * Alleen tellen, geen gebeurtenis. Voor paden die per segment of per knik vuren: zo krijgt een
 * fallback zowel teller als noemer (`tally(id, 'sampled')` naast `tally(id, 'reference')`)
 * zonder dat er per aanroep een event-object wordt gebouwd.
 */
export function tally(id: EscalationId, level: string): void {
  escalate(id)
  bumpLevel(id, level)
}

function bumpLevel(id: EscalationId, level: string): void {
  const key = `${id}:${level}`
  current.levels.set(key, (current.levels.get(key) ?? 0) + 1)
}

function pushEventInto(journal: RunJournal, event: JournalEvent): void {
  const seenForId = journal.eventsPerId.get(event.id) ?? 0
  if (journal.events.length >= MAX_EVENTS || seenForId >= MAX_EVENTS_PER_ID) {
    journal.droppedEvents += 1
    return
  }
  journal.eventsPerId.set(event.id, seenForId + 1)
  journal.events.push(event)
}

function pushEvent(event: JournalEvent): void {
  pushEventInto(current, event)
}

/**
 * Een ingeslikte exceptie. Dit is het enige signaal dat de run op `degraded` zet:
 * een half mislukte run mag er niet meer uitzien als een geslaagde.
 */
export function noteSwallowedError(
  id: EscalationId,
  where: string,
  error: unknown,
  detail?: JournalDetail,
): void {
  escalate(id)
  bumpLevel(id, 'swallowed_error')
  current.degraded = true
  const asError = error instanceof Error ? error : undefined
  pushEvent({
    id,
    kind: 'swallowed_error',
    where,
    message: 'exceptie ingeslikt',
    ...(detail ? { detail } : {}),
    errorMessage: asError?.message ?? String(error),
    ...(asError?.stack ? { errorStack: asError.stack } : {}),
  })
}

/** Resultaat afgekeurd en teruggedraaid. Geen exceptie, dus geen `degraded`. */
export function noteRollback(
  id: EscalationId,
  where: string,
  message: string,
  detail?: JournalDetail,
): void {
  escalate(id)
  bumpLevel(id, 'rollback')
  pushEvent({ id, kind: 'rollback', where, message, ...(detail ? { detail } : {}) })
}

/** Geen meting beschikbaar → default naar buiten. Teller loopt altijd, sample is begrensd. */
export function noteMissingMeasurement(
  id: EscalationId,
  where: string,
  message: string,
  detail?: JournalDetail,
): void {
  escalate(id)
  bumpLevel(id, 'missing_measurement')
  pushEvent({ id, kind: 'missing_measurement', where, message, ...(detail ? { detail } : {}) })
}

/** Er was een meting en er ging iets anders naar buiten — beide waarden vastleggen. */
export function noteDiscardedMeasurement(
  id: EscalationId,
  where: string,
  measured: number | null,
  exported: number | null,
  detail?: JournalDetail,
): void {
  escalate(id)
  bumpLevel(id, 'measurement_discarded')
  pushEvent({
    id,
    kind: 'measurement_discarded',
    where,
    message: 'meting overschreven',
    detail: { measured, exported, ...detail },
  })
}

/** Geaccepteerd zonder het bewijs waar de stage om draait (bijv. raam zonder rails/framing). */
export function noteEvidenceMissing(
  id: EscalationId,
  where: string,
  message: string,
  detail?: JournalDetail,
): void {
  escalate(id)
  bumpLevel(id, 'evidence_missing')
  pushEvent({ id, kind: 'evidence_missing', where, message, ...(detail ? { detail } : {}) })
}

/** Een modus zette filters uit die normaal wel draaien. */
export function noteGatesDisabled(
  id: EscalationId,
  where: string,
  gates: readonly string[],
  detail?: JournalDetail,
): void {
  escalate(id)
  bumpLevel(id, 'gates_disabled')
  pushEvent({
    id,
    kind: 'gates_disabled',
    where,
    message: `gates uitgeschakeld: ${gates.join(', ')}`,
    ...(detail ? { detail } : {}),
  })
}

/**
 * Welk niveau van een cascade leverde. Telt per niveau in `levels` — dit is het signaal
 * waarmee later blijkt of een primaire poging ooit slaagt (sectie 4 van de aanpak).
 */
export function noteCascadeLevel(
  id: EscalationId,
  where: string,
  level: string,
  detail?: JournalDetail,
): void {
  escalate(id)
  bumpLevel(id, level)
  pushEvent({
    id,
    kind: 'cascade_level',
    where,
    message: `niveau ${level}`,
    ...(detail ? { detail } : {}),
  })
}

/** Observatie buiten de inventaris (bijv. te weinig referentievakken). */
export function noteDiagnostic(
  code: DiagnosticCode,
  where: string,
  message: string,
  detail?: JournalDetail,
): void {
  current.diagnostics.set(code, (current.diagnostics.get(code) ?? 0) + 1)
  pushEvent({
    id: code,
    kind: 'missing_measurement',
    where,
    message,
    ...(detail ? { detail } : {}),
  })
}

export function summarizeRunJournal(journal: RunJournal = current): RunJournalSummary {
  const escalations: Partial<Record<EscalationId, number>> = {}
  let total = 0
  for (const [id, count] of journal.counts) {
    escalations[id] = count
    total += count
  }
  return {
    label: journal.label,
    degraded: journal.degraded,
    totalEscalations: total,
    escalations,
    levels: Object.fromEntries(journal.levels),
    diagnostics: Object.fromEntries(journal.diagnostics),
    events: journal.events,
    droppedEvents: journal.droppedEvents,
  }
}

/**
 * Voeg een elders opgebouwd journaal samen met het lopende. Bedoeld voor het moment dat CV
 * naar een worker verhuist en zijn journaal terugstuurt; nu nog ongebruikt in productie.
 */
export function mergeRunJournalSummary(
  summary: RunJournalSummary,
  into: RunJournal = current,
): void {
  for (const [id, count] of Object.entries(summary.escalations)) {
    if (count == null) continue
    const key = id as EscalationId
    into.counts.set(key, (into.counts.get(key) ?? 0) + count)
  }
  for (const [key, count] of Object.entries(summary.levels)) {
    into.levels.set(key, (into.levels.get(key) ?? 0) + count)
  }
  for (const [code, count] of Object.entries(summary.diagnostics)) {
    const key = code as DiagnosticCode
    into.diagnostics.set(key, (into.diagnostics.get(key) ?? 0) + count)
  }
  for (const event of summary.events) pushEventInto(into, event)
  into.droppedEvents += summary.droppedEvents
  if (summary.degraded) into.degraded = true
}
