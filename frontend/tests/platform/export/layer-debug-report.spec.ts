import { describe, expect, it } from 'vitest'
import { buildLayerDebugReport } from '@/platform/export/layer-debug-report/build-layer-debug-report'
import { formatLayerDebugMarkdown } from '@/platform/export/layer-debug-report/format-layer-debug-markdown'
import type { BoundDoor, OrientedDoor, ResolvedDoorCandidate } from '@/cv/doors'
import type { BoundWindow, WindowBindRejection } from '@/cv/windows'

describe('layer-debug-report summary junction kinds', () => {
  it('vult junctionKindCounts af vanuit layers als summary ze niet heeft', () => {
    const output = {
      pipelineV3Debug: {
        pipelineVersion: 'v3',
        layers: {
          layer1: {
            segments: [],
            junctions: [
              { x: 0, y: 0, kind: 'I', angleDeg: 0 },
              { x: 1, y: 0, kind: 'T', angleDeg: 90 },
            ],
          },
        },
        summary: {
          segmentCounts: { layer1: 0 },
          junctionCounts: { layer1: 2 },
        },
      },
    } as any

    const report = buildLayerDebugReport({
      drawing: 'dummy.png',
      output,
    })
    expect(report.summary?.junctionKindCounts?.layer1).toEqual({
      I: 1,
      L: 0,
      T: 1,
      X: 0,
    })
  })

  it('rendert junction kind verdeling in markdown per laag', () => {
    const report = {
      version: 1,
      drawing: 'dummy.png',
      exportedAt: '2026-07-08T00:00:00.000Z',
      pipelineVersion: 'v3',
      layers: {
        layer3: {
          segments: [],
          junctions: [
            { x: 0, y: 0, kind: 'L', angleDeg: 3 },
            { x: 1, y: 0, kind: 'L', angleDeg: 4 },
            { x: 2, y: 0, kind: 'T', angleDeg: 90 },
          ],
        },
        layer5: {
          segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, lengthPx: 10 }],
          junctions: [{ x: 0, y: 0, kind: 'L', angleDeg: 90 }],
        },
        layer10: {
          segments: [{ a: { x: 0, y: 0 }, b: { x: 20, y: 0 }, type: 'wall' }],
          junctions: [{ x: 0, y: 0, kind: 'T', angleDeg: 0 }],
        },
      },
      summary: {
        junctionKindCounts: {
          layer3: { I: 0, L: 2, T: 1, X: 0 },
          layer5: { I: 0, L: 1, T: 0, X: 0 },
          layer10: { I: 0, L: 0, T: 1, X: 0 },
        },
      },
    } as any

    const markdown = formatLayerDebugMarkdown(report)
    expect(markdown).toContain('### layer3')
    expect(markdown).toContain('### layer5')
    expect(markdown).toContain('### layer10')
    expect(markdown).toContain('junction_kinds: I=0, L=2, T=1, X=0')
  })

  it('exporteert wallTransitions met dropped segments L9→L10', () => {
    const output = {
      pipelineV3Debug: {
        pipelineVersion: 'v3',
        layers: {
          layer9: {
            segments: [
              { type: 'wall', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
              { type: 'wall', a: { x: 0, y: 50 }, b: { x: 40, y: 50 } },
            ],
            junctions: [
              { x: 0, y: 0, kind: 'L', angleDeg: 0 },
              { x: 100, y: 0, kind: 'I', angleDeg: 0 },
            ],
          },
          layer10: {
            segments: [{ type: 'wall', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }],
            junctions: [
              { x: 0, y: 0, kind: 'L', angleDeg: 0 },
              { x: 100, y: 0, kind: 'I', angleDeg: 0 },
            ],
          },
        },
      },
    } as any

    const report = buildLayerDebugReport({
      drawing: 'drops.png',
      output,
    })

    const t = report.wallTransitions?.find(
      (item) => item.from === 'layer9' && item.to === 'layer10',
    )
    expect(t).toBeTruthy()
    expect(t!.summary.dropped).toBe(1)
    expect(t!.droppedSegments).toEqual([
      expect.objectContaining({
        prevIndex: 1,
        lengthPx: 40,
      }),
    ])

    const markdown = formatLayerDebugMarkdown(report)
    expect(markdown).toContain('## Wall transitions (drops)')
    expect(markdown).toContain('L9→L10')
    expect(markdown).toContain('### L9 → L10 drops')
  })
})

describe('layer-debug-report openings L11/L12/L14', () => {
  const resolvedDoor: ResolvedDoorCandidate = {
    id: 'door-a',
    source: 'single',
    score: 1,
    matchedRefIndex: 0,
    faceIds: [3],
    bbox: { x: 10, y: 20, width: 40, height: 80 },
    centroidPx: { x: 30, y: 60 },
    swingSpanPx: 40,
    framingPx: 4,
    overhangAlongPx: 36,
    overhangOppositePx: 4,
    framingAlongPx: 4,
    framingOppositePx: 4,
    ratioBlade: 0.9,
    widthPx: 40,
    widthCm: 90,
    fmlRefId: 'door.0',
    kind: 'single',
  }

  const unboundDoor: ResolvedDoorCandidate = {
    ...resolvedDoor,
    id: 'door-b',
    centroidPx: { x: 200, y: 200 },
    bbox: { x: 180, y: 160, width: 40, height: 80 },
  }

  const boundDoor: BoundDoor = {
    doorId: 'door-a',
    segmentIndex: 2,
    t: 0.42,
    openingAxis: 'v',
    outwardSign: 1,
    contactScore: 0.88,
    secondaryContactScore: 0.1,
    snappedBBox: { x: 12, y: 20, width: 40, height: 80 },
  }

  const orientedDoor: OrientedDoor = {
    ...boundDoor,
    kind: 'single',
    fmlRefId: 'door.0',
    mirrored: [0, 1],
    hingePx: { x: 12, y: 60 },
    axes: [
      { a: { x: 12, y: 20 }, b: { x: 12, y: 100 }, angleDeg: 90, supportLength: 80 },
      { a: { x: 12, y: 60 }, b: { x: 52, y: 60 }, angleDeg: 0, supportLength: 40 },
    ],
    swingAngleDeg: 90,
    openingStartPx: { x: 12, y: 20 },
    openingEndPx: { x: 12, y: 100 },
    displayStartPx: { x: 12, y: 24 },
    displayEndPx: { x: 12, y: 96 },
    framingAlongPx: 4,
    framingOppositePx: 4,
    leafLines: [[12, 60, 52, 60]],
    arcPoints: [[12, 60, 32, 40, 52, 60]],
    arrowPoints: [],
  }

  const boundWindow: BoundWindow = {
    windowId: 'win-1',
    segmentIndex: 5,
    t: 0.55,
    openingAxis: 'h',
    openingBBox: { x: 100, y: 40, width: 60, height: 12 },
    openingStartPx: { x: 100, y: 46 },
    openingEndPx: { x: 160, y: 46 },
    widthPx: 60,
    widthCm: 120,
    fmlRefId: 'window.concept',
    evidence: 'strip_stack',
    faceIds: [11, 12],
  }

  const rejected: WindowBindRejection = {
    reason: 'junction_in_window',
    candidate: {
      id: 'win-2',
      sourceHypothesisId: 'hyp-2',
      matchedRefIndex: 0,
      orientation: 'horizontal',
      faceIds: [20],
      evidenceFaceIds: [20],
      bbox: { x: 300, y: 40, width: 50, height: 12 },
      centroidPx: { x: 325, y: 46 },
      widthPx: 50,
      widthCm: 100,
      heightPx: 12,
      heightCm: 24,
      score: 0.8,
      evidence: 'framing',
    },
  }

  it('exporteert L11 unbound + L12 oriented + L14 rejected met reden', () => {
    const output = {
      pipelineV3Debug: {
        pipelineVersion: 'v3',
        layers: {
          layer5: {
            segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, lengthPx: 10 }],
            junctions: [],
          },
        },
      },
    } as any

    const report = buildLayerDebugReport({
      drawing: 'openings.png',
      output,
      openings: {
        resolvedDoors: [resolvedDoor, unboundDoor],
        boundDoors: [boundDoor],
        orientedDoors: [orientedDoor],
        boundWindows: [boundWindow],
        windowBindRejections: [rejected],
      },
    })

    expect(report.openings?.layer11?.bound).toHaveLength(1)
    expect(report.openings?.layer11?.unbound).toEqual([
      expect.objectContaining({
        doorId: 'door-b',
        reason: 'no_segment_match',
      }),
    ])
    expect(report.openings?.layer12?.oriented[0]).toEqual(
      expect.objectContaining({
        doorId: 'door-a',
        mirrored: [0, 1],
      }),
    )
    expect(report.openings?.layer12?.oriented[0]).not.toHaveProperty('leafLines')
    expect(report.openings?.layer14?.bound).toHaveLength(1)
    expect(report.openings?.layer14?.rejected).toEqual([
      expect.objectContaining({
        windowId: 'win-2',
        reason: 'junction_in_window',
      }),
    ])
    expect(report.openingsSummary?.layer14?.rejectedByReason).toEqual({
      junction_in_window: 1,
    })

    const markdown = formatLayerDebugMarkdown(report)
    expect(markdown).toContain('### layer11 — Door-wall snap')
    expect(markdown).toContain('door-b')
    expect(markdown).toContain('no_segment_match')
    expect(markdown).toContain('## Opening drops')
    expect(markdown).toContain('### L11 unbound')
    expect(markdown).toContain('### L14 rejected')
    expect(markdown).toContain('### layer12 — Deur swing orient')
    expect(markdown).toContain('### layer14 — Raam segment-bind')
    expect(markdown).toContain('junction_in_window')
    expect(markdown).toContain('L13: niet in gebruik')
  })

  it('markeert L12 skipped wanneer bound deur niet oriënteert', () => {
    const report = buildLayerDebugReport({
      drawing: null,
      output: null,
      openings: {
        boundDoors: [boundDoor],
        orientedDoors: [],
      },
    })
    expect(report.openings?.layer12?.skipped).toEqual([
      { doorId: 'door-a', reason: 'orient_failed', segmentIndex: 2 },
    ])
  })
})
