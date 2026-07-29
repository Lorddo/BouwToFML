import { describe, expect, it } from 'vitest'
import type { ExtractionOutput } from '@/core/extraction'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import {
  cloneTabOutputsForSnapshot,
  enrichWallsOutputWithFaceState,
  restoreTabOutputsFromSnapshot,
  type JsonTabDetectionOutputs,
} from '@/platform/dev-workspace/tab-outputs-serialize'

function wallsOutputWithLabels(labels: number[]): ExtractionOutput {
  return {
    candidates: [],
    segments: [],
    masks: [],
    meta: {
      extractorId: 'geometry-lbe',
      elapsedMs: 0,
      roomPipelinePhase: 'classify',
      roomClassifyState: {
        width: 2,
        height: 2,
        labelsData: new Int32Array(labels),
        rawLabelsData: new Int32Array(labels),
        baselineWallBwData: new Uint8Array([255, 0, 255, 0]),
        parentMap: [[1, 0]],
        classificationByLabel: [[1, 'surface']],
        threshold: 0.7,
        mergedFaceCount: 1,
      },
    },
  }
}

describe('tab-outputs-serialize', () => {
  it('roundtrips Int32Array labels through JSON', () => {
    const outputs: TabDetectionOutputs = {
      walls: wallsOutputWithLabels([0, 1, 0, 2]),
    }
    const snapshot = cloneTabOutputsForSnapshot(outputs)
    const json = JSON.parse(JSON.stringify(snapshot)) as JsonTabDetectionOutputs
    const restored = restoreTabOutputsFromSnapshot(json)
    const state = restored.walls?.meta?.roomClassifyState
    expect(state?.labelsData).toBeInstanceOf(Int32Array)
    expect(Array.from(state?.labelsData ?? [])).toEqual([0, 1, 0, 2])
    expect(state?.rawLabelsData).toBeInstanceOf(Int32Array)
    expect(state?.baselineWallBwData).toBeInstanceOf(Uint8Array)
    expect(Array.from(state?.baselineWallBwData ?? [])).toEqual([255, 0, 255, 0])
  })

  it('merges live overrides into walls output', () => {
    const outputs: TabDetectionOutputs = {
      walls: wallsOutputWithLabels([0, 1, 0, 1]),
    }
    const enriched = enrichWallsOutputWithFaceState(outputs, [[1, 'wall']], [1])
    expect(enriched.walls?.meta?.roomClassifyState?.faceOverrides).toEqual([[1, 'wall']])
    expect(enriched.walls?.meta?.roomClassifyState?.pinnedRoots).toEqual([1])
  })

  it('prefers live classify state over stale tab output', () => {
    const outputs: TabDetectionOutputs = {
      walls: wallsOutputWithLabels([0, 1, 0, 1]),
    }
    const liveLabels = new Int32Array([0, 2, 0, 2])
    const enriched = enrichWallsOutputWithFaceState(outputs, [[2, 'unknown']], [2], {
      width: 2,
      height: 2,
      labelsData: liveLabels,
      rawLabelsData: liveLabels,
      parentMap: [[2, 0]],
      classificationByLabel: [[2, 'surface']],
      threshold: 0.7,
      mergedFaceCount: 1,
    })
    expect(Array.from(enriched.walls?.meta?.roomClassifyState?.labelsData ?? [])).toEqual([
      0, 2, 0, 2,
    ])
    expect(enriched.walls?.meta?.roomClassifyState?.faceOverrides).toEqual([[2, 'unknown']])
  })

  it('creates walls output from live state when tab output is missing', () => {
    const liveLabels = new Int32Array([0, 2, 0, 2])
    const enriched = enrichWallsOutputWithFaceState({ walls: null }, [[2, 'wall']], [2], {
      width: 2,
      height: 2,
      labelsData: liveLabels,
      rawLabelsData: liveLabels,
      parentMap: [[2, 0]],
      classificationByLabel: [[2, 'surface']],
      threshold: 0.7,
      mergedFaceCount: 1,
    })
    expect(enriched.walls?.meta?.roomPipelinePhase).toBe('classify')
    expect(Array.from(enriched.walls?.meta?.roomClassifyState?.labelsData ?? [])).toEqual([
      0, 2, 0, 2,
    ])
    expect(enriched.walls?.meta?.roomClassifyState?.faceOverrides).toEqual([[2, 'wall']])
  })
})
