import { describe, expect, it } from 'vitest'
import {
  isTemplatesFinalizeBusy,
  isTemplatesInitialDetectionBusy,
  resolveTemplatesFinalizeSteps,
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

  it('toont overlay tijdens OCR-scan', () => {
    expect(
      isTemplatesInitialDetectionBusy({
        ...base,
        roomPhase: 'idle',
        doorInitialPassReady: false,
        windowInitialPassReady: false,
        ocrEnabled: true,
        ocrScanning: true,
        ocrInitialPassReady: false,
      }),
    ).toBe(true)
  })

  it('toont overlay tot ocrInitialPassReady', () => {
    expect(
      isTemplatesInitialDetectionBusy({
        ...base,
        roomPhase: 'idle',
        doorInitialPassReady: false,
        windowInitialPassReady: false,
        ocrEnabled: true,
        ocrScanning: false,
        ocrInitialPassReady: false,
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
    expect(steps.map((s) => s.id)).toEqual(['walls', 'doors', 'windows'])
    expect(steps.map((s) => s.status)).toEqual(['done', 'done', 'done'])
  })

  it('voegt OCR-stap toe wanneer ocrEnabled', () => {
    const steps = resolveTemplatesInitialDetectionSteps({
      roomPhase: 'idle',
      classifyingInFlight: false,
      doorInitialPassReady: false,
      windowInitialPassReady: false,
      ocrEnabled: true,
      ocrScanning: true,
      ocrInitialPassReady: false,
    })
    expect(steps.map((s) => s.id)).toEqual(['ocr', 'walls', 'doors', 'windows'])
    expect(steps[0]?.status).toBe('active')
    expect(steps[1]?.status).toBe('pending')
  })

  it('markeert OCR done en walls active na scan', () => {
    const steps = resolveTemplatesInitialDetectionSteps({
      roomPhase: 'classifying',
      classifyingInFlight: true,
      doorInitialPassReady: false,
      windowInitialPassReady: false,
      ocrEnabled: true,
      ocrScanning: false,
      ocrInitialPassReady: true,
    })
    expect(steps.map((s) => s.status)).toEqual(['done', 'active', 'pending', 'pending'])
  })
})

describe('isTemplatesFinalizeBusy', () => {
  it('is busy zolang finalizePhase gezet is', () => {
    expect(isTemplatesFinalizeBusy(null)).toBe(false)
    expect(isTemplatesFinalizeBusy('walls')).toBe(true)
    expect(isTemplatesFinalizeBusy('doors')).toBe(true)
    expect(isTemplatesFinalizeBusy('windows')).toBe(true)
  })
})

describe('resolveTemplatesFinalizeSteps', () => {
  it('markeert muren active bij walls-fase', () => {
    const steps = resolveTemplatesFinalizeSteps('walls')
    expect(steps.map((s) => s.id)).toEqual(['walls', 'doors', 'windows'])
    expect(steps.map((s) => s.status)).toEqual(['active', 'pending', 'pending'])
  })

  it('markeert deuren active na muren', () => {
    expect(resolveTemplatesFinalizeSteps('doors').map((s) => s.status)).toEqual([
      'done',
      'active',
      'pending',
    ])
  })

  it('markeert ramen active na deuren', () => {
    expect(resolveTemplatesFinalizeSteps('windows').map((s) => s.status)).toEqual([
      'done',
      'done',
      'active',
    ])
  })

  it('houdt alles pending zonder fase', () => {
    expect(resolveTemplatesFinalizeSteps(null).map((s) => s.status)).toEqual([
      'pending',
      'pending',
      'pending',
    ])
  })
})
