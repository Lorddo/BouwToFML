import { describe, expect, it } from 'vitest'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type {
  ResolvedWindowCandidate,
  WindowAxelHypothesis,
  WindowEvidenceAcceptance,
} from '@/cv/windows'
import {
  pruneWindowStageCacheByClassification,
  windowCandidateStillClassifiedAsWindow,
} from '@/ui/composables/workspace/window-stage-cache-prune'

function hyp(id: string, faceIds: number[]): WindowAxelHypothesis {
  return {
    id,
    matchedRefIndex: 0,
    orientation: 'h',
    faceIds,
    unionBBox: { x: 0, y: 0, width: 10, height: 4 },
    axisSpanPx: 10,
    score: 1,
  }
}

function acceptance(
  id: string,
  faceIds: number[],
  evidence: 'framing' | 'strip_stack',
  evidenceFaceIds: number[] = [],
): WindowEvidenceAcceptance {
  return {
    hypothesis: hyp(id, faceIds),
    evidence,
    evidenceFaceIds,
  }
}

function resolved(
  id: string,
  faceIds: number[],
  evidence: 'framing' | 'strip_stack',
  evidenceFaceIds: number[] = [],
): ResolvedWindowCandidate {
  return {
    id,
    sourceHypothesisId: id,
    matchedRefIndex: 0,
    orientation: 'h',
    evidence,
    faceIds,
    evidenceFaceIds,
    bbox: { x: 0, y: 0, width: 10, height: 4 },
    centroidPx: { x: 5, y: 2 },
    widthPx: 10,
    widthCm: 100,
    heightPx: 4,
    heightCm: 40,
    score: 1,
  }
}

function emptyCache() {
  return {
    stage1Hypotheses: [] as WindowAxelHypothesis[],
    stage2AcceptedHypotheses: [] as WindowAxelHypothesis[],
    stage3AcceptedHypotheses: [] as WindowAxelHypothesis[],
    stage3Accepted: [] as WindowEvidenceAcceptance[],
    stage3AcceptedDoorframes: [] as WindowEvidenceAcceptance[],
    stage4ResolvedWindows: [] as ResolvedWindowCandidate[],
    stage4ResolvedDoorframes: [] as ResolvedWindowCandidate[],
    stage1AcceptedCount: 0,
    stage3AcceptedByFraming: 0,
    stage3AcceptedByStripStack: 0,
    stage3DoorframeAcceptedCount: 0,
  }
}

describe('window-stage-cache-prune', () => {
  it('keeps framing window when glass face is still window', () => {
    const classification = new Map<number, RoomRasterClass>([
      [10, 'window'],
      [11, 'wall'],
    ])
    expect(
      windowCandidateStillClassifiedAsWindow(
        { evidence: 'framing', faceIds: [10], evidenceFaceIds: [11] },
        classification,
      ),
    ).toBe(true)
  })

  it('drops framing window when glass face is demoted (evidence alone insufficient)', () => {
    const classification = new Map<number, RoomRasterClass>([
      [10, 'wall'],
      [11, 'window'],
    ])
    expect(
      windowCandidateStillClassifiedAsWindow(
        { evidence: 'framing', faceIds: [10], evidenceFaceIds: [11] },
        classification,
      ),
    ).toBe(false)
  })

  it('keeps strip_stack when only a rail remains window', () => {
    const classification = new Map<number, RoomRasterClass>([
      [10, 'wall'],
      [20, 'window'],
    ])
    expect(
      windowCandidateStillClassifiedAsWindow(
        { evidence: 'strip_stack', faceIds: [10], evidenceFaceIds: [20] },
        classification,
      ),
    ).toBe(true)
  })

  it('prunes demoted window from all stages and keeps remaining doorframe', () => {
    const cache = {
      ...emptyCache(),
      stage1Hypotheses: [hyp('w1', [10]), hyp('df1', [30]), hyp('gone', [99])],
      stage2AcceptedHypotheses: [hyp('w1', [10]), hyp('w2', [20])],
      stage3Accepted: [
        acceptance('w1', [10], 'framing', [11]),
        acceptance('w2', [20], 'strip_stack', [21]),
      ],
      stage3AcceptedHypotheses: [hyp('w1', [10]), hyp('w2', [20])],
      stage3AcceptedDoorframes: [acceptance('df1', [30], 'framing', [31])],
      stage4ResolvedWindows: [
        resolved('w1', [10], 'framing', [11]),
        resolved('w2', [20], 'strip_stack', [21]),
      ],
      stage4ResolvedDoorframes: [resolved('df1', [30], 'framing', [31])],
      stage1AcceptedCount: 3,
      stage3AcceptedByFraming: 1,
      stage3AcceptedByStripStack: 1,
      stage3DoorframeAcceptedCount: 1,
    }
    const classification = new Map<number, RoomRasterClass>([
      [10, 'wall'], // demoted
      [11, 'wall'],
      [20, 'window'],
      [21, 'window'],
      [30, 'doorframe'],
      [31, 'wall'],
      [99, 'unknown'],
    ])

    const pruned = pruneWindowStageCacheByClassification(cache, classification)

    expect(pruned.stage1Hypotheses.map((h) => h.id)).toEqual(['df1'])
    expect(pruned.stage2AcceptedHypotheses.map((h) => h.id)).toEqual(['w2'])
    expect(pruned.stage3Accepted.map((e) => e.hypothesis.id)).toEqual(['w2'])
    expect(pruned.stage3AcceptedHypotheses.map((h) => h.id)).toEqual(['w2'])
    expect(pruned.stage4ResolvedWindows.map((w) => w.id)).toEqual(['w2'])
    expect(pruned.stage3AcceptedDoorframes.map((e) => e.hypothesis.id)).toEqual(['df1'])
    expect(pruned.stage4ResolvedDoorframes.map((w) => w.id)).toEqual(['df1'])
    expect(pruned.stage3AcceptedByFraming).toBe(0)
    expect(pruned.stage3AcceptedByStripStack).toBe(1)
    expect(pruned.stage3DoorframeAcceptedCount).toBe(1)
    expect(pruned.stage1AcceptedCount).toBe(1)
  })

  it('drops doorframe entries when doorframe faces are demoted', () => {
    const cache = {
      ...emptyCache(),
      stage1Hypotheses: [hyp('df1', [30])],
      stage3AcceptedDoorframes: [acceptance('df1', [30], 'framing', [31])],
      stage4ResolvedDoorframes: [resolved('df1', [30], 'framing', [31])],
      stage3DoorframeAcceptedCount: 1,
      stage1AcceptedCount: 1,
    }
    const classification = new Map<number, RoomRasterClass>([
      [30, 'wall'],
      [31, 'wall'],
    ])

    const pruned = pruneWindowStageCacheByClassification(cache, classification)
    expect(pruned.stage1Hypotheses).toEqual([])
    expect(pruned.stage3AcceptedDoorframes).toEqual([])
    expect(pruned.stage4ResolvedDoorframes).toEqual([])
    expect(pruned.stage3DoorframeAcceptedCount).toBe(0)
  })
})
