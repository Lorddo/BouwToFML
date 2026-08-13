import { describe, expect, it } from 'vitest'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type {
  ResolvedWindowCandidate,
  WindowAxelHypothesis,
  WindowEvidenceAcceptance,
} from '@/cv/windows'
import {
  promoteOrphanedDoorframesToWindowsInStageCache,
  pruneWindowStageCacheByClassification,
  windowCandidateStillClassifiedAsWindow,
} from '@/ui/composables/workspace/window-stage-cache-prune'

function hyp(id: string, faceIds: number[]): WindowAxelHypothesis {
  return {
    id,
    matchedRefIndex: 0,
    orientation: 'horizontal',
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
    orientation: 'horizontal',
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

  it('strips demoted face from stage4 strip_stack but keeps sibling glass', () => {
    const cache = {
      ...emptyCache(),
      stage4ResolvedWindows: [resolved('stack', [590, 603, 722], 'strip_stack', [590, 603, 722])],
    }
    // Override bbox/width to mimic inflated Stage-4 candidate.
    cache.stage4ResolvedWindows[0] = {
      ...cache.stage4ResolvedWindows[0],
      bbox: { x: 405, y: 2276, width: 408, height: 100 },
      widthPx: 378,
      widthCm: 378,
    }
    const classification = new Map<number, RoomRasterClass>([
      [590, 'unknown'],
      [603, 'window'],
      [722, 'window'],
    ])
    const pruned = pruneWindowStageCacheByClassification(cache, classification)
    expect(pruned.stage4ResolvedWindows).toHaveLength(1)
    expect(pruned.stage4ResolvedWindows[0].faceIds).toEqual([603, 722])
    expect(pruned.stage4ResolvedWindows[0].evidenceFaceIds).toEqual([603, 722])
    // Zonder dual blijft bbox staan; L14-bind herberekent met dual.
    expect(pruned.stage4ResolvedWindows[0].bbox.width).toBe(408)
  })

  it('strips doorframe evidence from framing stage4 after wees-deur demote', () => {
    const cache = {
      ...emptyCache(),
      stage4ResolvedWindows: [resolved('framing', [79, 93, 192], 'framing', [76, 188])],
    }
    cache.stage4ResolvedWindows[0] = {
      ...cache.stage4ResolvedWindows[0],
      bbox: { x: 1762, y: 356, width: 251, height: 65 },
      widthPx: 251,
    }
    const classification = new Map<number, RoomRasterClass>([
      [79, 'window'],
      [93, 'window'],
      [192, 'window'],
      [76, 'wall'],
      [188, 'door'], // stale deur-face in framing evidence
    ])
    const pruned = pruneWindowStageCacheByClassification(cache, classification)
    expect(pruned.stage4ResolvedWindows[0].evidenceFaceIds).toEqual([76])
    expect(pruned.stage4ResolvedWindows[0].faceIds).toEqual([79, 93, 192])
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

describe('promoteOrphanedDoorframesToWindowsInStageCache', () => {
  it('moves orphaned doorframe entries into window stage lists', () => {
    const cache = {
      ...emptyCache(),
      stage3Accepted: [acceptance('w1', [10], 'framing', [11])],
      stage3AcceptedHypotheses: [hyp('w1', [10])],
      stage3AcceptedDoorframes: [
        acceptance('df1', [30], 'framing', [31]),
        acceptance('df2', [40], 'strip_stack', [41]),
      ],
      stage4ResolvedWindows: [resolved('w1', [10], 'framing', [11])],
      stage4ResolvedDoorframes: [
        resolved('df1', [30], 'framing', [31]),
        resolved('df2', [40], 'strip_stack', [41]),
      ],
      stage3AcceptedByFraming: 1,
      stage3DoorframeAcceptedCount: 2,
    }

    const next = promoteOrphanedDoorframesToWindowsInStageCache(cache, [30])

    expect(next.stage3Accepted.map((e) => e.hypothesis.id).sort()).toEqual(['df1', 'w1'])
    expect(next.stage3AcceptedDoorframes.map((e) => e.hypothesis.id)).toEqual(['df2'])
    expect(next.stage4ResolvedWindows.map((w) => w.id).sort()).toEqual(['df1', 'w1'])
    expect(next.stage4ResolvedDoorframes.map((w) => w.id)).toEqual(['df2'])
    expect(next.stage2AcceptedHypotheses.map((h) => h.id)).toEqual(['df1'])
    expect(next.stage3AcceptedByFraming).toBe(2)
    expect(next.stage3AcceptedByStripStack).toBe(0)
    expect(next.stage3DoorframeAcceptedCount).toBe(1)
  })

  it('keeps shared doorframes that were not orphaned', () => {
    const cache = {
      ...emptyCache(),
      stage3AcceptedDoorframes: [acceptance('df1', [30], 'framing')],
      stage4ResolvedDoorframes: [resolved('df1', [30], 'framing')],
      stage3DoorframeAcceptedCount: 1,
    }
    const next = promoteOrphanedDoorframesToWindowsInStageCache(cache, [99])
    expect(next.stage3Accepted).toEqual([])
    expect(next.stage3AcceptedDoorframes.map((e) => e.hypothesis.id)).toEqual(['df1'])
    expect(next.stage4ResolvedDoorframes.map((w) => w.id)).toEqual(['df1'])
  })

  it('does not duplicate when window entry already exists', () => {
    const cache = {
      ...emptyCache(),
      stage2AcceptedHypotheses: [hyp('df1', [30])],
      stage3Accepted: [acceptance('df1', [30], 'framing')],
      stage3AcceptedHypotheses: [hyp('df1', [30])],
      stage3AcceptedDoorframes: [acceptance('df1', [30], 'framing')],
      stage4ResolvedWindows: [resolved('df1', [30], 'framing')],
      stage4ResolvedDoorframes: [resolved('df1', [30], 'framing')],
      stage3AcceptedByFraming: 1,
      stage3DoorframeAcceptedCount: 1,
    }
    const next = promoteOrphanedDoorframesToWindowsInStageCache(cache, [30])
    expect(next.stage3Accepted).toHaveLength(1)
    expect(next.stage4ResolvedWindows).toHaveLength(1)
    expect(next.stage2AcceptedHypotheses).toHaveLength(1)
    expect(next.stage3AcceptedDoorframes).toEqual([])
    expect(next.stage4ResolvedDoorframes).toEqual([])
  })
})
