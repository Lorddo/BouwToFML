import { describe, expect, it } from 'vitest'
import {
  detectTargetsForTab,
  elementClassToDetectionLayer,
  isFinalizeTabOutput,
  isValidTabOutput,
} from '@/cv/workspace/layer-flow'

describe('layer-flow', () => {
  it('maps tabs to detect targets', () => {
    expect(detectTargetsForTab('ocr')).toEqual({})
    expect(detectTargetsForTab('gaps')).toEqual({})
    expect(detectTargetsForTab('doors')).toEqual({})
    expect(detectTargetsForTab('windows')).toEqual({})
    expect(detectTargetsForTab('walls')).toEqual({
      walls: true,
      wallJunctionStrategy: 'room_first',
    })
  })

  it('heeft Int muur en Gaten in preprocess/template orders (OCR alleen stap 3)', async () => {
    const { WORKSPACE_PREPROCESS_LAYER_ORDER, WORKSPACE_TEMPLATE_LAYER_ORDER } = await import(
      '@/cv/workspace/layer-flow'
    )
    const { usesWallBwUnderlay, usesGapsFaceOverlay, usesDoorSwingOverlay } = await import(
      '@/cv/preprocess/layer-preprocess'
    )
    expect([...WORKSPACE_PREPROCESS_LAYER_ORDER]).toEqual(['walls', 'inkWall', 'gaps'])
    expect([...WORKSPACE_TEMPLATE_LAYER_ORDER]).toEqual(['ocr', 'walls', 'gaps', 'doors', 'windows'])
    expect(usesWallBwUnderlay('gaps')).toBe(true)
    expect(usesWallBwUnderlay('doors')).toBe(true)
    expect(usesWallBwUnderlay('windows')).toBe(true)
    expect(usesGapsFaceOverlay('gaps')).toBe(true)
    expect(usesGapsFaceOverlay('doors')).toBe(false)
    expect(usesDoorSwingOverlay('doors')).toBe(true)
    expect(usesGapsFaceOverlay('windows')).toBe(false)
  })

  it('maps element class to detection layer', () => {
    expect(elementClassToDetectionLayer('wall')).toBe('walls')
    expect(() => elementClassToDetectionLayer('door')).toThrow()
    expect(() => elementClassToDetectionLayer('window')).toThrow()
  })

  it('rejects noop extractor output', () => {
    expect(isValidTabOutput(null)).toBe(false)
    expect(
      isValidTabOutput({
        candidates: [],
        meta: { extractorId: 'noop', elapsedMs: 0.01 },
      }),
    ).toBe(false)
    expect(
      isValidTabOutput({
        candidates: [],
        meta: { extractorId: 'geometry-lbe', elapsedMs: 120 },
      }),
    ).toBe(true)
  })

  it('herkent finalize output met roomClassifyState', () => {
    expect(
      isFinalizeTabOutput({
        candidates: [],
        pipelineV3Debug: {
          pipelineVersion: 'v3',
          layers: { layer1: { segments: [], junctions: [] } },
        },
        meta: {
          extractorId: 'geometry-lbe',
          elapsedMs: 10,
          roomPipelinePhase: 'finalize',
          roomClassifyState: {
            width: 4,
            height: 4,
            labelsData: new Int32Array(16),
            parentMap: [],
            classificationByLabel: [],
            threshold: 0.8,
            mergedFaceCount: 1,
          },
        },
      }),
    ).toBe(true)
    expect(
      isFinalizeTabOutput({
        candidates: [],
        meta: { extractorId: 'geometry-lbe', elapsedMs: 10, roomPipelinePhase: 'classify' },
      }),
    ).toBe(false)
  })

  it('vereist layer1 debug voor v3 finalize output', () => {
    expect(
      isFinalizeTabOutput({
        candidates: [],
        pipelineV3Debug: {
          pipelineVersion: 'v3',
          layers: {
            layer1: {
              segments: [],
              junctions: [],
            },
          },
        },
        meta: {
          extractorId: 'geometry-lbe',
          elapsedMs: 10,
          roomPipelinePhase: 'finalize',
          wallPipelineVersion: 'v3',
          roomClassifyState: {
            width: 4,
            height: 4,
            labelsData: new Int32Array(16),
            parentMap: [],
            classificationByLabel: [],
            threshold: 0.8,
            mergedFaceCount: 1,
          },
        },
      }),
    ).toBe(true)

    expect(
      isFinalizeTabOutput({
        candidates: [],
        meta: {
          extractorId: 'geometry-lbe',
          elapsedMs: 10,
          roomPipelinePhase: 'finalize',
          wallPipelineVersion: 'v3',
          roomClassifyState: {
            width: 4,
            height: 4,
            labelsData: new Int32Array(16),
            parentMap: [],
            classificationByLabel: [],
            threshold: 0.8,
            mergedFaceCount: 1,
          },
        },
      }),
    ).toBe(false)
  })
})
