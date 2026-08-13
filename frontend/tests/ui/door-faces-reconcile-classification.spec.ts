import { describe, expect, it } from 'vitest'
import type { FaceDualSpace, FaceGeom } from '@/cv/walls/rooms/face-dual-space'
import type { ResolvedDoorCandidate } from '@/cv/doors'
import {
  reconcileResolvedDoorForClassification,
  reconcileResolvedDoorsForClassification,
} from '@/ui/composables/workspace/door-faces-reconcile-classification'

function geom(id: number, bbox: FaceGeom['bbox']): FaceGeom {
  return { id, bbox, areaPx: bbox.width * bbox.height, className: 'door' }
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
    unionBBox() {
      return null
    },
    space(prefer) {
      return prefer === 'ink' ? ink : white
    },
  }
}

function door(
  partial: Partial<ResolvedDoorCandidate> & Pick<ResolvedDoorCandidate, 'id'>,
): ResolvedDoorCandidate {
  return {
    source: 'single',
    score: 1,
    matchedRefIndex: 0,
    faceIds: [1],
    bbox: { x: 0, y: 0, width: 100, height: 40 },
    centroidPx: { x: 50, y: 20 },
    swingSpanPx: 100,
    framingPx: 20,
    overhangAlongPx: 110,
    overhangOppositePx: 10,
    framingAlongPx: 10,
    framingOppositePx: 10,
    ratioBlade: 1,
    widthPx: 120,
    widthCm: 120,
    fmlRefId: 'x',
    kind: 'single',
    ...partial,
  }
}

describe('reconcileResolvedDoorForClassification', () => {
  it('strips demoted door faces and stale doorframes promoted to window', () => {
    const candidate = door({
      id: 'd1',
      faceIds: [10, 11],
      doorframeFaceIds: [20, 21],
      bbox: { x: 0, y: 0, width: 200, height: 40 },
      swingSpanPx: 200,
      overhangAlongPx: 220,
      overhangOppositePx: 20,
      widthPx: 240,
      widthCm: 240,
    })
    const dual = dualFrom([
      { id: 10, bbox: { x: 0, y: 0, width: 100, height: 40 } },
      { id: 11, bbox: { x: 100, y: 0, width: 100, height: 40 } },
      { id: 20, bbox: { x: -20, y: 0, width: 20, height: 40 } },
      { id: 21, bbox: { x: 200, y: 0, width: 20, height: 40 } },
    ])
    const next = reconcileResolvedDoorForClassification({
      door: candidate,
      classification: new Map([
        [10, 'door'],
        [11, 'window'], // demoted swing-deel
        [20, 'window'], // wees-DF → window
        [21, 'doorframe'], // twin blijft
      ]),
      dual,
    })
    expect(next).not.toBeNull()
    expect(next!.faceIds).toEqual([10])
    expect(next!.doorframeFaceIds).toEqual([21])
    expect(next!.bbox.width).toBe(100)
    expect(next!.swingSpanPx).toBe(100)
    // width schaalt met swingSpan (240 * 100/200)
    expect(next!.widthPx).toBe(120)
  })

  it('drops door when all faces demoted', () => {
    const next = reconcileResolvedDoorForClassification({
      door: door({ id: 'd1', faceIds: [10] }),
      classification: new Map([[10, 'wall']]),
      dual: null,
    })
    expect(next).toBeNull()
  })

  it('batch strips DF from surviving door after orphan promote', () => {
    const after = reconcileResolvedDoorsForClassification({
      resolved: [
        door({
          id: 'survive',
          faceIds: [1],
          doorframeFaceIds: [50],
        }),
      ],
      classification: new Map([
        [1, 'door'],
        [50, 'window'],
      ]),
      dual: null,
    })
    expect(after).toHaveLength(1)
    expect(after[0].doorframeFaceIds).toBeUndefined()
  })
})
