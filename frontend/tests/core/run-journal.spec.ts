import { beforeEach, describe, expect, it } from 'vitest'
import {
  escalate,
  getRunJournal,
  mergeRunJournalSummary,
  noteCascadeLevel,
  noteDiagnostic,
  noteDiscardedMeasurement,
  noteSwallowedError,
  resetRunJournal,
  summarizeRunJournal,
  tally,
} from '@/core/diagnostics'

describe('run-journal', () => {
  beforeEach(() => {
    resetRunJournal('test')
  })

  it('telt per ESC-ID en levert het grootboek-veld', () => {
    escalate('W-07')
    escalate('W-07')
    escalate('D-15')

    const summary = summarizeRunJournal()
    expect(summary.escalations).toEqual({ 'W-07': 2, 'D-15': 1 })
    expect(summary.totalEscalations).toBe(3)
  })

  it('houdt een niveau-verdeling bij naast de teller', () => {
    tally('W-14', 'sampled')
    tally('W-14', 'sampled')
    tally('W-14', 'reference')

    const summary = summarizeRunJournal()
    expect(summary.escalations['W-14']).toBe(3)
    expect(summary.levels).toEqual({ 'W-14:sampled': 2, 'W-14:reference': 1 })
  })

  it('zet de run op gedegradeerd bij een ingeslikte fout en bewaart de stack', () => {
    expect(getRunJournal().degraded).toBe(false)

    noteSwallowedError('O-36', 'door-faces-snap.orientBoundDoors', new Error('cv weg'))

    const summary = summarizeRunJournal()
    expect(summary.degraded).toBe(true)
    const event = summary.events.find((entry) => entry.id === 'O-36')
    expect(event?.kind).toBe('swallowed_error')
    expect(event?.errorMessage).toBe('cv weg')
    expect(event?.errorStack).toBeTruthy()
  })

  it('een nieuwe run wist de vorige staat', () => {
    noteSwallowedError('O-36', 'ergens', new Error('x'))
    resetRunJournal('volgende')

    const summary = summarizeRunJournal()
    expect(summary.degraded).toBe(false)
    expect(summary.escalations).toEqual({})
    expect(summary.label).toBe('volgende')
  })

  it('legt bij een weggegooide meting beide waarden vast', () => {
    noteDiscardedMeasurement('X-01', 'harmonizeFmlWallThickness', 0.34, 0.5)

    const event = summarizeRunJournal().events[0]
    expect(event?.detail).toMatchObject({ measured: 0.34, exported: 0.5 })
  })

  it('begrenst gebeurtenissen per ID maar blijft doortellen', () => {
    for (let i = 0; i < 10; i += 1) {
      noteCascadeLevel('D-15', 'seed', 'strict')
    }

    const summary = summarizeRunJournal()
    expect(summary.escalations['D-15']).toBe(10)
    expect(summary.events).toHaveLength(3)
    expect(summary.droppedEvents).toBe(7)
    expect(summary.levels['D-15:strict']).toBe(10)
  })

  it('houdt observaties buiten de inventaris los van het grootboek', () => {
    noteDiagnostic('REF_COUNT_BELOW_ADVICE', 'window-refs', '1 referentie')

    const summary = summarizeRunJournal()
    expect(summary.escalations).toEqual({})
    expect(summary.diagnostics).toEqual({ REF_COUNT_BELOW_ADVICE: 1 })
  })

  it('voegt een elders opgebouwd journaal samen', () => {
    escalate('W-07')
    const other = summarizeRunJournal(
      (() => {
        const journal = resetRunJournal('worker')
        escalate('W-07')
        tally('R-16', 'framing')
        noteSwallowedError('X-23', 'worker', new Error('cv'))
        return journal
      })(),
    )

    resetRunJournal('hoofd')
    escalate('W-07')
    mergeRunJournalSummary(other)

    const summary = summarizeRunJournal()
    expect(summary.escalations['W-07']).toBe(2)
    expect(summary.levels['R-16:framing']).toBe(1)
    expect(summary.degraded).toBe(true)
  })
})
