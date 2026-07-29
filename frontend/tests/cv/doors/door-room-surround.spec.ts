import { describe, expect, it } from 'vitest'
import {
  filterRoomSurroundedHypotheses,
  filterWallUntouchedHypotheses,
  type DoorSwingHypothesis,
} from '@/cv/doors'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'

function hyp(params: {
  id: string
  faceIds: number[]
  x?: number
  y?: number
  w?: number
  h?: number
}): DoorSwingHypothesis {
  return {
    id: params.id,
    faceIds: params.faceIds,
    unionBBox: {
      x: params.x ?? 0,
      y: params.y ?? 0,
      width: params.w ?? 8,
      height: params.h ?? 8,
    },
    filledAreaPx: (params.w ?? 8) * (params.h ?? 8),
    score: 0.9,
    source: 'single',
    matchedRefIndex: 0,
  }
}

function adj(entries: Array<[number, number[]]>): Map<number, Set<number>> {
  return new Map(entries.map(([id, ns]) => [id, new Set(ns)]))
}

function run(params: {
  hypotheses: DoorSwingHypothesis[]
  adjacency: Map<number, Set<number>>
  classes: Array<[number, RoomRasterClass]>
}) {
  return filterRoomSurroundedHypotheses({
    hypotheses: params.hypotheses,
    adjacency: params.adjacency,
    parentMap: new Map(),
    classificationByLabel: new Map(params.classes),
  })
}

describe('filterRoomSurroundedHypotheses (ink adjacency)', () => {
  it('rejectt wanneer alle adjacent faces dezelfde room zijn', () => {
    const result = run({
      hypotheses: [hyp({ id: 'island', faceIds: [2] })],
      adjacency: adj([
        [2, [1]],
        [1, [2]],
      ]),
      classes: [
        [1, 'surface'],
        [2, 'unknown'],
      ],
    })
    expect(result.kept).toHaveLength(0)
    expect(result.rejected[0]?.reason).toBe('surrounded_by_room')
  })

  it('rejectt mix: room + unknown adjacent', () => {
    const result = run({
      hypotheses: [hyp({ id: 'mix', faceIds: [2] })],
      adjacency: adj([
        [2, [1, 3]],
        [1, [2]],
        [3, [2]],
      ]),
      classes: [
        [1, 'surface'],
        [2, 'unknown'],
        [3, 'unknown'],
      ],
    })
    expect(result.kept).toHaveLength(0)
    expect(result.rejected[0]?.reason).toBe('surrounded_by_room')
  })

  it('houdt wanneer twee verschillende surface-faces adjacent zijn', () => {
    const result = run({
      hypotheses: [hyp({ id: 'doorlike', faceIds: [2] })],
      adjacency: adj([
        [2, [1, 3]],
        [1, [2]],
        [3, [2]],
      ]),
      classes: [
        [1, 'surface'],
        [2, 'unknown'],
        [3, 'surface'],
      ],
    })
    expect(result.kept.map((h) => h.id)).toEqual(['doorlike'])
  })

  it('houdt wanneer minstens één adjacent wall + room (echte opening)', () => {
    const result = run({
      hypotheses: [hyp({ id: 'doorlike', faceIds: [2] })],
      adjacency: adj([
        [2, [1, 3]],
        [1, [2]],
        [3, [2]],
      ]),
      classes: [
        [1, 'surface'],
        [2, 'door'],
        [3, 'wall'],
      ],
    })
    expect(result.kept.map((h) => h.id)).toEqual(['doorlike'])
  })

  it('rejectt wanneer alle adjacent faces wall zijn', () => {
    const result = run({
      hypotheses: [hyp({ id: 'in-wall', faceIds: [2] })],
      adjacency: adj([
        [2, [1, 3, 4]],
        [1, [2]],
        [3, [2]],
        [4, [2]],
      ]),
      classes: [
        [1, 'wall'],
        [2, 'door'],
        [3, 'wall'],
        [4, 'wall'],
      ],
    })
    expect(result.kept).toHaveLength(0)
    expect(result.rejected[0]?.reason).toBe('surrounded_by_wall')
  })

  it('negeert andere hypothese-faces als adjacent (cluster)', () => {
    const result = run({
      hypotheses: [
        {
          id: 'cluster',
          faceIds: [2, 3],
          unionBBox: { x: 0, y: 0, width: 12, height: 8 },
          filledAreaPx: 96,
          score: 0.9,
          source: 'cluster',
          matchedRefIndex: 0,
        },
      ],
      adjacency: adj([
        [2, [1, 3]],
        [3, [1, 2]],
        [1, [2, 3]],
      ]),
      classes: [
        [1, 'surface'],
        [2, 'unknown'],
        [3, 'unknown'],
      ],
    })
    expect(result.kept).toHaveLength(0)
    expect(result.rejected[0]?.reason).toBe('surrounded_by_room')
  })

  it('houdt wanneer er geen adjacent faces zijn', () => {
    const result = run({
      hypotheses: [hyp({ id: 'lonely', faceIds: [2] })],
      adjacency: adj([[2, []]]),
      classes: [[2, 'door']],
    })
    expect(result.kept.map((h) => h.id)).toEqual(['lonely'])
  })
})

function runWallTouch(params: {
  hypotheses: DoorSwingHypothesis[]
  adjacency: Map<number, Set<number>>
  classes: Array<[number, RoomRasterClass]>
}) {
  return filterWallUntouchedHypotheses({
    hypotheses: params.hypotheses,
    adjacency: params.adjacency,
    parentMap: new Map(),
    classificationByLabel: new Map(params.classes),
  })
}

describe('filterWallUntouchedHypotheses (ink adjacency)', () => {
  it('houdt wanneer wall + room adjacent', () => {
    const result = runWallTouch({
      hypotheses: [hyp({ id: 'doorlike', faceIds: [2] })],
      adjacency: adj([
        [2, [1, 3]],
        [1, [2]],
        [3, [2]],
      ]),
      classes: [
        [1, 'surface'],
        [2, 'door'],
        [3, 'wall'],
      ],
    })
    expect(result.kept.map((h) => h.id)).toEqual(['doorlike'])
    expect(result.rejected).toHaveLength(0)
  })

  it('rejectt alleen room/unknown (ook twee surfaces)', () => {
    const result = runWallTouch({
      hypotheses: [hyp({ id: 'island', faceIds: [2] })],
      adjacency: adj([
        [2, [1, 3]],
        [1, [2]],
        [3, [2]],
      ]),
      classes: [
        [1, 'surface'],
        [2, 'unknown'],
        [3, 'surface'],
      ],
    })
    expect(result.kept).toHaveLength(0)
    expect(result.rejected[0]?.reason).toBe('no_wall_touch')
  })

  it('rejectt wanneer er geen adjacent faces zijn', () => {
    const result = runWallTouch({
      hypotheses: [hyp({ id: 'lonely', faceIds: [2] })],
      adjacency: adj([[2, []]]),
      classes: [[2, 'door']],
    })
    expect(result.kept).toHaveLength(0)
    expect(result.rejected[0]?.reason).toBe('no_wall_touch')
  })

  it('houdt wanneer alleen doorframe adjacent', () => {
    const result = runWallTouch({
      hypotheses: [hyp({ id: 'near-frame', faceIds: [2] })],
      adjacency: adj([
        [2, [5]],
        [5, [2]],
      ]),
      classes: [
        [2, 'door'],
        [5, 'doorframe'],
      ],
    })
    expect(result.kept.map((h) => h.id)).toEqual(['near-frame'])
  })

  it('houdt wanneer alleen window adjacent', () => {
    const result = runWallTouch({
      hypotheses: [hyp({ id: 'near-window', faceIds: [2] })],
      adjacency: adj([
        [2, [8]],
        [8, [2]],
      ]),
      classes: [
        [2, 'door'],
        [8, 'window'],
      ],
    })
    expect(result.kept.map((h) => h.id)).toEqual(['near-window'])
  })

  it('houdt cluster wanneer één face wall raakt', () => {
    const result = runWallTouch({
      hypotheses: [
        {
          id: 'cluster',
          faceIds: [2, 3],
          unionBBox: { x: 0, y: 0, width: 12, height: 8 },
          filledAreaPx: 96,
          score: 0.9,
          source: 'cluster',
          matchedRefIndex: 0,
        },
      ],
      adjacency: adj([
        [2, [3, 1]],
        [3, [2]],
        [1, [2]],
      ]),
      classes: [
        [1, 'wall'],
        [2, 'unknown'],
        [3, 'unknown'],
      ],
    })
    expect(result.kept.map((h) => h.id)).toEqual(['cluster'])
  })
})
