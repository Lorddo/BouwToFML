import { describe, expect, it } from 'vitest'
import { classifyTransitionEffects } from '@/platform/export/layer-debug/classify-transition-effects'
import { compareLayerTransition } from '@/platform/export/layer-debug/compare-layer-transition'
import { buildLayerDebugReportFromLayers } from '@/platform/export/layer-debug/build-layer-debug-report'
import { formatLayerDebugMarkdown } from '@/platform/export/layer-debug/format-layer-diff-markdown'
import type { FlatLayer } from '@/platform/export/layer-debug/types'

function seg(
  a: [number, number],
  b: [number, number],
  lengthPx?: number,
): FlatLayer['segments'][number] {
  const len = lengthPx ?? Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]))
  return { a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, lengthPx: len }
}

describe('compareLayerTransition', () => {
  it('houdt identiek segment als kept', () => {
    const layer: FlatLayer = {
      segments: [seg([0, 0], [100, 0])],
      junctions: [],
    }
    const diff = compareLayerTransition('B', 'C', layer, layer)
    expect(diff.summary.kept).toBe(1)
    expect(diff.summary.dropped).toBe(0)
  })

  it('detecteert moved segment bij endpoint-shift', () => {
    const prev: FlatLayer = {
      segments: [seg([0, 0], [100, 0])],
      junctions: [],
    }
    const next: FlatLayer = {
      segments: [seg([0, 5], [100, 5])],
      junctions: [],
    }
    const diff = compareLayerTransition('B', 'C', prev, next)
    expect(diff.summary.moved).toBe(1)
    expect(diff.segments.moved[0]?.endpointErrorPx).toBe(5)
  })

  it('markeert kort B-segment als likely_spur_prune in B→C', () => {
    const prev: FlatLayer = {
      segments: [seg([0, 0], [30, 0], 30)],
      junctions: [],
    }
    const next: FlatLayer = { segments: [], junctions: [] }
    const diff = compareLayerTransition('B', 'C', prev, next)
    expect(diff.summary.dropped).toBe(1)
    expect(diff.segments.dropped[0]?.dropReasonHint).toBe('likely_spur_prune')
  })

  it('detecteert collinear merge A→B', () => {
    const prev: FlatLayer = {
      segments: [seg([0, 0], [50, 0]), seg([50, 0], [100, 0])],
      junctions: [],
    }
    const next: FlatLayer = {
      segments: [seg([0, 0], [100, 0])],
      junctions: [],
    }
    const diff = compareLayerTransition('A', 'B', prev, next)
    expect(diff.summary.merged).toBe(1)
    expect(diff.segments.merged[0]?.prev.length).toBe(2)
  })

  it('detecteert junction shift', () => {
    const prev: FlatLayer = {
      segments: [],
      junctions: [{ x: 100, y: 100, kind: 'L', angleDeg: 90 }],
    }
    const next: FlatLayer = {
      segments: [],
      junctions: [{ x: 106, y: 103, kind: 'T', angleDeg: 90 }],
    }
    const diff = compareLayerTransition('B', 'C', prev, next)
    expect(diff.summary.junctionShifted).toBe(1)
    expect(diff.junctions.shifted[0]?.kindChanged).toBe(true)
  })
})

describe('classifyTransitionEffects', () => {
  it('classificeert collinear merge als verbetering', () => {
    const prev: FlatLayer = {
      segments: [seg([0, 0], [50, 0]), seg([50, 0], [100, 0])],
      junctions: [],
    }
    const next: FlatLayer = {
      segments: [seg([0, 0], [100, 0])],
      junctions: [],
    }
    const diff = compareLayerTransition('A', 'B', prev, next)
    const effects = classifyTransitionEffects(diff)
    expect(effects.summary.improvements).toBeGreaterThanOrEqual(1)
    expect(effects.improvements.some((e) => e.category === 'collinear_consolidated')).toBe(true)
  })

  it('classificeert lang verloren segment als regressie', () => {
    const prev: FlatLayer = {
      segments: [seg([0, 0], [200, 0], 200)],
      junctions: [],
    }
    const next: FlatLayer = { segments: [], junctions: [] }
    const diff = compareLayerTransition('B', 'C', prev, next)
    const effects = classifyTransitionEffects(diff)
    expect(effects.regressions.some((e) => e.category === 'segment_lost')).toBe(true)
  })

  it('classificeert korte spur als intentional prune (verbetering)', () => {
    const prev: FlatLayer = {
      segments: [seg([0, 0], [30, 0], 30)],
      junctions: [],
    }
    const next: FlatLayer = { segments: [], junctions: [] }
    const diff = compareLayerTransition('B', 'C', prev, next)
    const effects = classifyTransitionEffects(diff)
    expect(effects.improvements.some((e) => e.category === 'intentional_spur_prune')).toBe(true)
  })
})

describe('formatLayerDebugMarkdown', () => {
  it('bevat verbeteringen en regressies secties', () => {
    const report = buildLayerDebugReportFromLayers({
      drawing: 'test.png',
      exportedAt: '2026-07-04T00:00:00.000Z',
      layerCounts: {
        B: { segmentCount: 2, junctionCount: 0, junctionKinds: { I: 0, L: 0, T: 0, X: 0 } },
        C: { segmentCount: 1, junctionCount: 0, junctionKinds: { I: 0, L: 0, T: 0, X: 0 } },
      },
      layers: {
        B: { segments: [seg([0, 0], [100, 0]), seg([0, 50], [0, 150])], junctions: [] },
        C: { segments: [seg([0, 0], [100, 0])], junctions: [] },
      },
    })
    const md = formatLayerDebugMarkdown(report)
    expect(md).toContain('B → C')
    expect(md).toContain('Verbeteringen')
    expect(md).toContain('Regressies')
  })
})
