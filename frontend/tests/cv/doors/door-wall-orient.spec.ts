import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SemanticWallSegment } from '@/core/extraction/types'
import {
  orientBoundDoors,
  resolveFramedOpeningAlongWall,
  type BoundDoor,
  type ResolvedDoorCandidate,
} from '@/cv/doors'
import { computeL12DoorHinge } from '@/cv/doors/door-l12-hinge'

vi.mock('@/cv/doors/door-l12-hinge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/cv/doors/door-l12-hinge')>()
  return {
    ...actual,
    computeL12DoorHinge: vi.fn(),
  }
})

function makeSegment(
  a: { x: number; y: number },
  b: { x: number; y: number },
): SemanticWallSegment {
  return {
    a,
    b,
    thicknessPxMax: 8,
  }
}

function makeResolvedDoor(params: {
  id: string
  kind: ResolvedDoorCandidate['kind']
  widthPx: number
  overhangAlongPx?: number
  overhangOppositePx?: number
  framingAlongPx?: number
  framingOppositePx?: number
  framingPx?: number
  bbox: { x: number; y: number; width: number; height: number }
}): ResolvedDoorCandidate {
  const overhangAlongPx = params.overhangAlongPx ?? params.widthPx
  const overhangOppositePx = params.overhangOppositePx ?? 0
  const framingAlongPx = params.framingAlongPx ?? 0
  const framingOppositePx = params.framingOppositePx ?? 0
  const framingPx = params.framingPx ?? framingAlongPx + framingOppositePx
  return {
    id: params.id,
    source: 'single',
    score: 0.9,
    matchedRefIndex: 0,
    faceIds: [1],
    bbox: params.bbox,
    centroidPx: {
      x: params.bbox.x + params.bbox.width / 2,
      y: params.bbox.y + params.bbox.height / 2,
    },
    swingSpanPx: Math.max(1, overhangAlongPx),
    framingPx,
    overhangAlongPx,
    overhangOppositePx,
    framingAlongPx,
    framingOppositePx,
    ratioBlade: 1,
    widthPx: params.widthPx,
    widthCm: params.widthPx / 10,
    fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
    kind: params.kind,
  }
}

function mockHinge(params: {
  hinge: { x: number; y: number }
  leafAxisSignY: 1 | -1
  openingAxisSignX?: 1 | -1
  overhangAlongPx: number
}) {
  const openingSign = params.openingAxisSignX ?? 1
  return {
    hingePx: params.hinge,
    axes: [
      {
        a: params.hinge,
        b: {
          x: params.hinge.x + openingSign * Math.max(1, params.overhangAlongPx),
          y: params.hinge.y,
        },
        angleDeg: 0,
        supportLength: Math.max(1, params.overhangAlongPx),
      },
      {
        a: params.hinge,
        b: { x: params.hinge.x, y: params.hinge.y + params.leafAxisSignY * 22 },
        angleDeg: 90,
        supportLength: 22,
      },
    ] as [
      {
        a: { x: number; y: number }
        b: { x: number; y: number }
        angleDeg: number
        supportLength: number
      },
      {
        a: { x: number; y: number }
        b: { x: number; y: number }
        angleDeg: number
        supportLength: number
      },
    ],
    swingAngleDeg: 90,
  }
}

describe('door-wall-orient', () => {
  beforeEach(() => {
    vi.mocked(computeL12DoorHinge).mockReset()
  })

  it('zet mirrored voor single deur met swing naar rechts', () => {
    const resolved = makeResolvedDoor({
      id: 'door-1',
      kind: 'single',
      widthPx: 80,
      bbox: { x: 10, y: 10, width: 80, height: 40 },
    })
    vi.mocked(computeL12DoorHinge).mockReturnValue(
      mockHinge({
        hinge: { x: 10, y: 10 },
        leafAxisSignY: 1,
        overhangAlongPx: 80,
      }),
    )
    const bound: BoundDoor = {
      doorId: 'door-1',
      segmentIndex: 0,
      t: 0.5,
      openingAxis: 'h',
      outwardSign: 1,
      contactScore: 1,
      secondaryContactScore: 0,
      snappedBBox: { ...resolved.bbox },
    }
    const oriented = orientBoundDoors({
      cv: {} as never,
      boundDoors: [bound],
      resolvedDoors: [resolved],
      segments: [makeSegment({ x: 0, y: 10 }, { x: 200, y: 10 })],
      whiteLabelsData: new Int32Array(10),
      whiteParentMap: new Map(),
      width: 10,
      height: 1,
    })
    expect(oriented).toHaveLength(1)
    expect(oriented[0]!.mirrored).toEqual([0, 1])
    expect(oriented[0]!.hingePx).toEqual({ x: 10, y: 10 })
    expect(vi.mocked(computeL12DoorHinge).mock.calls[0]?.[0]?.faceIds).toEqual([1])
  })

  it('slaagt over wanneer L12-hinge null is', () => {
    vi.mocked(computeL12DoorHinge).mockReturnValue(null)
    const resolved = makeResolvedDoor({
      id: 'door-skip',
      kind: 'single',
      widthPx: 40,
      bbox: { x: 0, y: 0, width: 40, height: 40 },
    })
    const oriented = orientBoundDoors({
      cv: {} as never,
      boundDoors: [
        {
          doorId: 'door-skip',
          segmentIndex: 0,
          t: 0.2,
          openingAxis: 'h',
          outwardSign: 1,
          contactScore: 1,
          secondaryContactScore: 0,
          snappedBBox: resolved.bbox,
        },
      ],
      resolvedDoors: [resolved],
      segments: [makeSegment({ x: 0, y: 0 }, { x: 100, y: 0 })],
      whiteLabelsData: new Int32Array(4),
      whiteParentMap: new Map(),
      width: 2,
      height: 2,
    })
    expect(oriented).toEqual([])
  })

  it('resolveFramedOpeningAlongWall: overhangs vanaf hinge', () => {
    const framed = resolveFramedOpeningAlongWall({
      hingePx: { x: 50, y: 10 },
      wallUnit: { x: 1, y: 0 },
      freeDir: { x: 1, y: 0 },
      overhangAlongPx: 40,
      overhangOppositePx: 10,
      framingAlongPx: 4,
      framingOppositePx: 4,
    })
    expect(framed.widthPx).toBe(50)
    expect(framed.bladePx).toBe(36)
  })
})
