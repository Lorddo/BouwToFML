import { describe, expect, it } from 'vitest'
import type { FaceDualSpace, FaceGeom } from '@/cv/walls/rooms/face-dual-space'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { ResolvedWindowCandidate } from '@/cv/windows'
import {
  reconcileResolvedWindowForClassification,
  reconcileResolvedWindowsForClassification,
  resolvedWindowsListChanged,
} from '@/ui/composables/workspace/window-faces-reconcile-classification'

function geom(id: number, bbox: { x: number; y: number; width: number; height: number }): FaceGeom {
  return { id, bbox, areaPx: bbox.width * bbox.height, className: 'window' }
}

function emptySpace(byId: Map<number, FaceGeom>): FaceDualSpace['white'] {
  return {
    kind: 'opening-white',
    labelsData: new Int32Array(),
    width: 0,
    height: 0,
    components: [],
    parentMap: new Map(),
    classificationByLabel: new Map(),
    adjacency: new Map(),
    byId,
  }
}

function dualFrom(faces: Array<{ id: number; bbox: FaceGeom['bbox'] }>): FaceDualSpace {
  const byId = new Map(faces.map((f) => [f.id, geom(f.id, f.bbox)]))
  const white = emptySpace(byId)
  const ink = { ...emptySpace(byId), kind: 'wall-ink' as const }
  return {
    white,
    ink,
    geom(id) {
      return byId.get(id)
    },
    unionBBox(ids) {
      let merged: FaceGeom['bbox'] | null = null
      for (const id of ids) {
        const g = byId.get(id)
        if (!g) continue
        merged = merged
          ? {
              x: Math.min(merged.x, g.bbox.x),
              y: Math.min(merged.y, g.bbox.y),
              width:
                Math.max(merged.x + merged.width, g.bbox.x + g.bbox.width) -
                Math.min(merged.x, g.bbox.x),
              height:
                Math.max(merged.y + merged.height, g.bbox.y + g.bbox.height) -
                Math.min(merged.y, g.bbox.y),
            }
          : { ...g.bbox }
      }
      return merged
    },
    space(prefer) {
      return prefer === 'ink' ? ink : white
    },
  }
}

function stackCandidate(): ResolvedWindowCandidate {
  return {
    id: 'window:stack:590+603+722:1',
    sourceHypothesisId: 'stack:x',
    matchedRefIndex: 0,
    orientation: 'horizontal',
    evidence: 'strip_stack',
    faceIds: [590, 603, 722],
    evidenceFaceIds: [590, 603, 611, 722],
    bbox: { x: 405, y: 2276, width: 408, height: 100 },
    centroidPx: { x: 609, y: 2326 },
    widthPx: 378,
    widthCm: 378,
    heightPx: 100,
    heightCm: 100,
    score: 32,
  }
}

describe('reconcileResolvedWindowForClassification', () => {
  it('strips demoted rail face and shrinks strip_stack bbox/width for L14', () => {
    const candidate = stackCandidate()
    const classification = new Map<number, RoomRasterClass>([
      [590, 'unknown'], // handmatig gedemote
      [603, 'window'],
      [611, 'window'],
      [722, 'window'],
    ])
    const dual = dualFrom([
      { id: 590, bbox: { x: 435, y: 2276, width: 378, height: 17 } },
      { id: 603, bbox: { x: 405, y: 2311, width: 266, height: 16 } },
      { id: 611, bbox: { x: 421, y: 2332, width: 235, height: 7 } },
      { id: 722, bbox: { x: 405, y: 2359, width: 266, height: 17 } },
    ])

    const next = reconcileResolvedWindowForClassification({
      candidate,
      classification,
      dual,
    })

    expect(next).not.toBeNull()
    expect(next!.faceIds).toEqual([603, 722])
    expect(next!.evidenceFaceIds).toEqual([603, 611, 722])
    expect(next!.bbox.width).toBe(266)
    expect(next!.bbox.x).toBe(405)
    expect(next!.widthPx).toBe(266)
    // Junction ~704 ligt nu buiten de opening.
    expect(next!.bbox.x + next!.bbox.width).toBeLessThan(704)
  })

  it('drops framing candidate when glass faces are demoted', () => {
    const candidate: ResolvedWindowCandidate = {
      id: 'window:framing',
      sourceHypothesisId: 'h',
      matchedRefIndex: 0,
      orientation: 'horizontal',
      evidence: 'framing',
      faceIds: [10],
      evidenceFaceIds: [20],
      bbox: { x: 0, y: 0, width: 100, height: 20 },
      centroidPx: { x: 50, y: 10 },
      widthPx: 100,
      widthCm: 100,
      heightPx: 20,
      heightCm: 20,
      score: 1,
    }
    const next = reconcileResolvedWindowForClassification({
      candidate,
      classification: new Map([
        [10, 'wall'],
        [20, 'wall'],
      ]),
      dual: null,
    })
    expect(next).toBeNull()
  })

  it('keeps framing kozijn evidence that is wall; demoted glass → L14 = glas + kozijn', () => {
    const candidate: ResolvedWindowCandidate = {
      id: 'window:framing',
      sourceHypothesisId: 'h',
      matchedRefIndex: 0,
      orientation: 'horizontal',
      evidence: 'framing',
      faceIds: [10, 11],
      evidenceFaceIds: [20],
      bbox: { x: 100, y: 50, width: 120, height: 30 },
      centroidPx: { x: 160, y: 65 },
      widthPx: 120,
      widthCm: 120,
      heightPx: 30,
      heightCm: 30,
      score: 1,
    }
    const dual = dualFrom([
      { id: 10, bbox: { x: 110, y: 55, width: 100, height: 20 } },
      { id: 11, bbox: { x: 200, y: 55, width: 80, height: 20 } },
      { id: 20, bbox: { x: 100, y: 50, width: 10, height: 30 } },
    ])
    const next = reconcileResolvedWindowForClassification({
      candidate,
      classification: new Map([
        [10, 'window'],
        [11, 'unknown'], // handmatig weg
        [20, 'wall'],
      ]),
      dual,
    })
    expect(next).not.toBeNull()
    expect(next!.faceIds).toEqual([10])
    expect(next!.evidenceFaceIds).toEqual([20]) // wall kozijn-meta blijft
    // Framing-fallback: Stage-4 parity — glas + wall-kozijn (niet widest-strip glass-only).
    expect(next!.bbox.x).toBe(100)
    expect(next!.widthPx).toBe(110)
  })

  it('framing fallback: ids unchanged → behoud Stage-4 breedte (glas+kozijn)', () => {
    const candidate: ResolvedWindowCandidate = {
      id: 'window:framing',
      sourceHypothesisId: 'h',
      matchedRefIndex: 0,
      orientation: 'horizontal',
      evidence: 'framing',
      faceIds: [10],
      evidenceFaceIds: [20, 21],
      bbox: { x: 90, y: 50, width: 120, height: 30 },
      centroidPx: { x: 150, y: 65 },
      widthPx: 120,
      widthCm: 120,
      heightPx: 30,
      heightCm: 30,
      score: 1,
    }
    const next = reconcileResolvedWindowForClassification({
      candidate,
      classification: new Map([
        [10, 'window'],
        [20, 'wall'],
        [21, 'wall'],
      ]),
      dual: dualFrom([
        { id: 10, bbox: { x: 100, y: 55, width: 100, height: 20 } },
        { id: 20, bbox: { x: 90, y: 50, width: 10, height: 30 } },
        { id: 21, bbox: { x: 200, y: 50, width: 10, height: 30 } },
      ]),
    })
    expect(next).toBe(candidate)
    expect(next!.widthPx).toBe(120)
  })

  it('wees-doorframe: door/doorframe jambs strippen → L14 zonder ex-deur', () => {
    // Probe (1880,388): Stage-4 251px met jambs; na demote jambs = door/doorframe.
    const candidate: ResolvedWindowCandidate = {
      id: 'window:window-0-horizontal-79_93_192:1',
      sourceHypothesisId: 'window-0-horizontal-79_93_192',
      matchedRefIndex: 0,
      orientation: 'horizontal',
      evidence: 'framing',
      faceIds: [79, 93, 192],
      evidenceFaceIds: [76, 188], // ex-deur jambs
      bbox: { x: 1762, y: 356, width: 251, height: 65 },
      centroidPx: { x: 1887.5, y: 388.5 },
      widthPx: 251,
      widthCm: 251,
      heightPx: 65,
      heightCm: 65,
      score: 10,
    }
    const dual = dualFrom([
      { id: 79, bbox: { x: 1793, y: 356, width: 177, height: 16 } },
      { id: 93, bbox: { x: 1809, y: 376, width: 144, height: 6 } },
      { id: 192, bbox: { x: 1793, y: 403, width: 177, height: 18 } },
      { id: 76, bbox: { x: 1726, y: 355, width: 65, height: 23 } },
      { id: 188, bbox: { x: 1972, y: 396, width: 61, height: 26 } },
    ])
    const next = reconcileResolvedWindowForClassification({
      candidate,
      classification: new Map([
        [79, 'window'],
        [93, 'window'],
        [192, 'window'],
        [76, 'door'],
        [188, 'doorframe'],
      ]),
      dual,
    })
    expect(next).not.toBeNull()
    expect(next!.faceIds).toEqual([79, 93, 192])
    expect(next!.evidenceFaceIds).toEqual([])
    expect(next!.widthPx).toBe(177)
    expect(next!.bbox.x).toBe(1793)
    expect(next!.bbox.width).toBe(177)
  })

  it('strips door/doorframe evidence from framing (stale wees-deur)', () => {
    const candidate: ResolvedWindowCandidate = {
      id: 'window:framing',
      sourceHypothesisId: 'h',
      matchedRefIndex: 0,
      orientation: 'horizontal',
      evidence: 'framing',
      faceIds: [10],
      evidenceFaceIds: [20, 30],
      bbox: { x: 0, y: 0, width: 200, height: 20 },
      centroidPx: { x: 100, y: 10 },
      widthPx: 200,
      widthCm: 200,
      heightPx: 20,
      heightCm: 20,
      score: 1,
    }
    const dual = dualFrom([
      { id: 10, bbox: { x: 50, y: 0, width: 100, height: 20 } },
      { id: 20, bbox: { x: 0, y: 0, width: 40, height: 20 } },
      { id: 30, bbox: { x: 160, y: 0, width: 40, height: 20 } },
    ])
    const next = reconcileResolvedWindowForClassification({
      candidate,
      classification: new Map([
        [10, 'window'],
        [20, 'door'],
        [30, 'doorframe'],
      ]),
      dual,
    })
    expect(next!.evidenceFaceIds).toEqual([])
    expect(next!.widthPx).toBe(100)
  })

  it('batch + changed helper detect demote shrink', () => {
    const before = [stackCandidate()]
    const after = reconcileResolvedWindowsForClassification({
      resolved: before,
      classification: new Map([
        [590, 'unknown'],
        [603, 'window'],
        [611, 'window'],
        [722, 'window'],
      ]),
      dual: dualFrom([
        { id: 603, bbox: { x: 405, y: 2311, width: 266, height: 16 } },
        { id: 611, bbox: { x: 421, y: 2332, width: 235, height: 7 } },
        { id: 722, bbox: { x: 405, y: 2359, width: 266, height: 17 } },
      ]),
    })
    expect(after).toHaveLength(1)
    expect(resolvedWindowsListChanged(before, after)).toBe(true)
    expect(resolvedWindowsListChanged(after, after)).toBe(false)
  })
})
