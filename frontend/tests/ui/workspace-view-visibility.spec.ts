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
