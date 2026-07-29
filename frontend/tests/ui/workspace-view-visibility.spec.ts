import { describe, expect, it } from 'vitest'
import {
  isTemplatesInitialDetectionBusy,
  resolveTemplatesInitialDetectionSteps,
} from '@/ui/composables/workspace/workspace-view-visibility'

describe('isTemplatesInitialDetectionBusy', () => {
  const base = {
    flowStep: 'templates' as const,
    roomPhase: 'review' as const,
    classifyingInFlight: false,
    doorInitialPassReady: true,
    windowInitialPassReady: true,
  }

  it('toont overlay tijdens muren-classify', () => {
    expect(
      isTemplatesInitialDetectionBusy({
        ...base,
        roomPhase: 'classifying',
        doorInitialPassReady: false,
        windowInitialPassReady: false,
      }),
    ).toBe(true)
  })

  it('toont overlay in review tot deuren+ramen klaar zijn', () => {
    expect(
      isTemplatesInitialDetectionBusy({
        ...base,
        doorInitialPassReady: true,
        windowInitialPassReady: false,
      }),
    ).toBe(true)
  })

  it('onderdrukt overlay na settled ondanks latere invalidate', () => {
    expect(
      isTemplatesInitialDetectionBusy({
        ...base,
        doorInitialPassReady: false,
        windowInitialPassReady: false,
        initialDetectionSettled: true,
      }),
    ).toBe(false)
  })

  it('toont overlay opnieuw tijdens classifying ook na settled', () => {
    expect(
      isTemplatesInitialDetectionBusy({
        ...base,
        roomPhase: 'classifying',
        initialDetectionSettled: true,
      }),
    ).toBe(true)
  })
})

describe('resolveTemplatesInitialDetectionSteps', () => {
  it('markeert alle stappen done in review met ready flags', () => {
    const steps = resolveTemplatesInitialDetectionSteps({
      roomPhase: 'review',
      classifyingInFlight: false,
      doorInitialPassReady: true,
      windowInitialPassReady: true,
    })
    expect(steps.map((s) => s.status)).toEqual(['done', 'done', 'done'])
  })
})
