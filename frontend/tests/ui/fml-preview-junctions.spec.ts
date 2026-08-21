import { describe, expect, it } from 'vitest'
import {
  addRoomRect,
  applyShiftSnapAxisAligned,
  applyShiftSnapFromAllOppositeEnds,
  applyShiftSnapFromOppositeEnd,
  addWallSegment,
  balanceToPercent,
  clampBalance,
  percentToBalance,
  setWallBalance,
  sliderPercentFromDraft,
  slideWallSegmentAlongAxis,
  resolveWallSlidePointerDelta,
  moveJunctionWithWallJoins,
  snapPointToJunctions,
  snapPointToWallCenters,
  snapToNearbyEndpointAxes,
  snapToNearbyPointAxes,
  snapPolygonVertexAxisLock,
  snapToPolygonGeometry,
  closedRingSegments,
  JUNCTION_POINT_SNAP_CM,
  buildJunctions,
  junctionIdsForWall,
  mergeJunctions,
  moveJunction,
  ROOM_DRAW_SNAP_CM,
  setWallThickness,
  setWallsThickness,
  removeWalls,
  findWallAtPoint,
  splitWallAtPoint,
  splitWallAtMidpoint,
  splitWallAtT,
  stableJunctionId,
} from '@/ui/components/fml-preview-junctions'

describe('buildJunctions', () => {
  it('merges wall endpoints at the same junction into one node', () => {
    const junctions = buildJunctions([
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'w2',
        a: { x: 0, y: 0 },
        b: { x: 0, y: 80 },
        thickness: 20,
        openings: [],
      },
    ])

    const corner = junctions.find((junction) => junction.refs.length === 2)
    expect(corner?.refs).toHaveLength(2)
    expect(corner?.id).toBe(
      stableJunctionId([
        { wallId: 'w1', end: 'a' },
        { wallId: 'w2', end: 'a' },
      ]),
    )
  })
})

describe('moveJunction', () => {
  it('moves all connected wall ends together', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'w2',
        a: { x: 0, y: 0 },
        b: { x: 0, y: 80 },
        thickness: 20,
        openings: [],
      },
    ]
    const [corner] = buildJunctions(walls)
    const moved = moveJunction(walls, corner, { x: 10, y: 5 })

    expect(moved.find((wall) => wall.id === 'w1')?.a).toEqual({ x: 10, y: 5 })
    expect(moved.find((wall) => wall.id === 'w2')?.a).toEqual({ x: 10, y: 5 })
  })

  it('reprojects openings to keep their world position when an endpoint moves', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [
          { refid: 'door', t: 0.3, width: 10, type: 'door' as const },
          { refid: 'window', t: 0.7, width: 12, type: 'window' as const },
        ],
      },
    ]
    const endB = buildJunctions(walls).find((junction) =>
      junction.refs.some((ref) => ref.wallId === 'w1' && ref.end === 'b'),
    )!
    const moved = moveJunction(walls, endB, { x: 50, y: 0 })
    const wall = moved.find((item) => item.id === 'w1')!
    expect(wall.b).toEqual({ x: 50, y: 0 })
    // Was x=30 en x=70 op 0→100; na inkorten naar 0→50 blijft x=30, x=70 clampt naar eind.
    expect(wall.openings[0]?.t).toBeCloseTo(0.6, 5)
    expect(wall.openings[0].t * 50).toBeCloseTo(30, 5)
    expect(wall.openings[1]?.t).toBeCloseTo(1, 5)
  })

  it('reprojects openings onto the new wall axis when a corner junction moves', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [{ refid: 'door', t: 0.4, width: 10, type: 'door' as const }],
      },
      {
        id: 'w2',
        a: { x: 0, y: 0 },
        b: { x: 0, y: 80 },
        thickness: 20,
        openings: [{ refid: 'window', t: 0.5, width: 10, type: 'window' as const }],
      },
    ]
    const corner = buildJunctions(walls).find((junction) => junction.refs.length === 2)!
    const moved = moveJunction(walls, corner, { x: 20, y: 10 })
    const w1 = moved.find((wall) => wall.id === 'w1')!
    const w2 = moved.find((wall) => wall.id === 'w2')!

    const project = (
      wall: { a: { x: number; y: number }; b: { x: number; y: number } },
      point: { x: number; y: number },
    ) => {
      const dx = wall.b.x - wall.a.x
      const dy = wall.b.y - wall.a.y
      const lenSq = dx * dx + dy * dy
      const t = Math.max(
        0,
        Math.min(1, ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / lenSq),
      )
      return { x: wall.a.x + t * dx, y: wall.a.y + t * dy, t }
    }
    const door = project(w1, { x: 40, y: 0 })
    const win = project(w2, { x: 0, y: 40 })
    expect(w1.openings[0]?.t).toBeCloseTo(door.t, 5)
    expect(w2.openings[0]?.t).toBeCloseTo(win.t, 5)
    // Zonder herprojectie (vaste t) zou de deur mee-schalen i.p.v. dicht bij (40,0) te blijven.
    expect(w1.openings[0]?.t).not.toBeCloseTo(0.4, 2)
  })
})

describe('mergeJunctions', () => {
  it('snaps a dragged junction onto another junction', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'w2',
        a: { x: 200, y: 0 },
        b: { x: 200, y: 80 },
        thickness: 20,
        openings: [],
      },
    ]
    const junctions = buildJunctions(walls)
    const target = junctions.find((junction) =>
      junction.refs.some((ref) => ref.wallId === 'w1' && ref.end === 'a'),
    )!
    const source = junctions.find((junction) =>
      junction.refs.some((ref) => ref.wallId === 'w2' && ref.end === 'a'),
    )!
    const merged = mergeJunctions(walls, source, target)

    const corner = buildJunctions(merged).find((junction) => junction.refs.length === 2)
    expect(corner?.refs).toHaveLength(2)
    expect(merged.find((wall) => wall.id === 'w2')?.a).toEqual({ x: 0, y: 0 })
  })
})

describe('junctionIdsForWall', () => {
  it('returns stable junction ids that match buildJunctions', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'w2',
        a: { x: 0, y: 0 },
        b: { x: 0, y: 80 },
        thickness: 20,
        openings: [],
      },
    ]
    const junctions = buildJunctions(walls)
    const [aId, bId] = junctionIdsForWall(walls[0], walls)
    expect(junctions.some((junction) => junction.id === aId)).toBe(true)
    expect(junctions.some((junction) => junction.id === bId)).toBe(true)
    expect(aId).toBe(
      stableJunctionId([
        { wallId: 'w1', end: 'a' },
        { wallId: 'w2', end: 'a' },
      ]),
    )
    expect(bId).toBe(stableJunctionId([{ wallId: 'w1', end: 'b' }]))
  })
})

describe('splitWallAtMidpoint', () => {
  it('splits a wall into two segments sharing a midpoint junction', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const result = splitWallAtMidpoint(walls, 'w1')
    expect(result).not.toBeNull()
    expect(result!.walls).toHaveLength(2)
    expect(result!.walls[0]?.b).toEqual({ x: 50, y: 0 })
    expect(result!.walls[1]?.a).toEqual({ x: 50, y: 0 })
    expect(result!.walls[1]?.b).toEqual({ x: 100, y: 0 })

    const junctions = buildJunctions(result!.walls)
    const mid = junctions.find((junction) => junction.id === result!.junctionId)
    expect(mid?.refs).toHaveLength(2)
  })

  it('redistributes openings across split segments', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [
          { refid: 'door', t: 0.25, width: 90, type: 'door' as const },
          { refid: 'door', t: 0.75, width: 90, type: 'door' as const },
        ],
      },
    ]
    const result = splitWallAtMidpoint(walls, 'w1')!
    expect(result.walls[0]?.openings).toHaveLength(1)
    expect(result.walls[0]?.openings[0]?.t).toBeCloseTo(0.5)
    expect(result.walls[1]?.openings).toHaveLength(1)
    expect(result.walls[1]?.openings[0]?.t).toBeCloseTo(0.5)
  })

  it('keeps opening world centers when splitting away from openings', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 200, y: 0 },
        thickness: 20,
        openings: [
          { refid: 'door', t: 0.2, width: 10, type: 'door' as const },
          { refid: 'window', t: 0.8, width: 12, type: 'window' as const },
        ],
      },
    ]
    const result = splitWallAtT(walls, 'w1', 0.5)!
    const first = result.walls[0]
    const second = result.walls[1]
    const doorX = first.a.x + first.openings[0].t * (first.b.x - first.a.x)
    const winX = second.a.x + second.openings[0].t * (second.b.x - second.a.x)
    expect(doorX).toBeCloseTo(40, 5)
    expect(winX).toBeCloseTo(160, 5)
  })

  it('rejects walls that are too short', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 6, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    expect(splitWallAtMidpoint(walls, 'w1')).toBeNull()
  })
})

describe('splitWallAtT', () => {
  it('splits at arbitrary t along the wall', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const result = splitWallAtT(walls, 'w1', 0.25)
    expect(result).not.toBeNull()
    expect(result!.walls[0]?.b).toEqual({ x: 25, y: 0 })
    expect(result!.walls[1]?.a).toEqual({ x: 25, y: 0 })
    expect(result!.walls[1]?.b).toEqual({ x: 100, y: 0 })
  })

  it('clamps t so both segments stay at least MIN_SPLIT_SEGMENT_CM', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const nearStart = splitWallAtT(walls, 'w1', 0.01)!
    expect(nearStart.walls[0]?.b.x).toBeCloseTo(4)
    const nearEnd = splitWallAtT(walls, 'w1', 0.99)!
    expect(nearEnd.walls[0]?.b.x).toBeCloseTo(96)
  })
})

describe('splitWallAtPoint', () => {
  it('splits a host wall at arbitrary t and remaps openings', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [
          { refid: 'o1', t: 0.2, width: 90, type: 'door' as const },
          { refid: 'o2', t: 0.8, width: 90, type: 'door' as const },
        ],
      },
    ]
    const ok = splitWallAtPoint(walls, walls[0], { x: 50, y: 0 }, 0.5)
    expect(ok).toBe(true)
    expect(walls).toHaveLength(2)
    expect(walls[0]?.openings[0]?.t).toBeCloseTo(0.4, 6)
    expect(walls[1]?.openings[0]?.t).toBeCloseTo(0.6, 6)
  })
})

describe('findWallAtPoint', () => {
  it('finds an interior wall projection within tolerance', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const match = findWallAtPoint(walls, { x: 40, y: 0.6 }, 1)
    expect(match?.wallId).toBe('w1')
    expect(match?.t).toBeCloseTo(0.4, 2)
    expect(match?.projected).toEqual({ x: 40, y: 0 })
  })

  it('rejects endpoint hits for room-corner split', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    expect(findWallAtPoint(walls, { x: 0, y: 0.2 }, 1)).toBeNull()
  })
})

describe('addRoomRect', () => {
  it('reuses existing host edge and splits host wall at room corners', () => {
    const walls = [
      {
        id: 'host',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [{ refid: 'host-door', t: 0.8, width: 90, type: 'door' as const }],
      },
    ]
    const result = addRoomRect(
      walls,
      [
        { x: 20, y: 0 },
        { x: 70, y: 0 },
        { x: 70, y: 40 },
        { x: 20, y: 40 },
      ],
      14,
    )
    expect(result).not.toBeNull()
    expect(result!.wallIds).toHaveLength(3)

    const withDoor = result!.walls.filter((wall) =>
      wall.openings.some((opening) => opening.refid === 'host-door'),
    )
    expect(withDoor).toHaveLength(1)
    expect(withDoor[0]?.openings[0]?.t).toBeCloseTo(1 / 3, 2)

    const junctions = buildJunctions(result!.walls)
    const atLeftCorner = junctions.find(
      (item) => Math.abs(item.x - 20) < 0.1 && Math.abs(item.y) < 0.1,
    )
    const atRightCorner = junctions.find(
      (item) => Math.abs(item.x - 70) < 0.1 && Math.abs(item.y) < 0.1,
    )
    expect(atLeftCorner?.refs.length).toBeGreaterThanOrEqual(2)
    expect(atRightCorner?.refs.length).toBeGreaterThanOrEqual(2)
  })

  it('splits room edges on crossed existing junctions (no single full wall through junction)', () => {
    const walls = [
      {
        id: 'host-top-left',
        a: { x: 0, y: 0 },
        b: { x: 50, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'host-top-right',
        a: { x: 50, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'branch',
        a: { x: 50, y: 0 },
        b: { x: 50, y: -30 },
        thickness: 20,
        openings: [],
      },
    ]
    const result = addRoomRect(
      walls,
      [
        { x: 20, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 40 },
        { x: 20, y: 40 },
      ],
      14,
    )
    expect(result).not.toBeNull()

    const crossingSegment = result!.walls.find(
      (wall) =>
        ((Math.abs(wall.a.x - 20) < 0.01 && Math.abs(wall.b.x - 80) < 0.01) ||
          (Math.abs(wall.a.x - 80) < 0.01 && Math.abs(wall.b.x - 20) < 0.01)) &&
        Math.abs(wall.a.y) < 0.01 &&
        Math.abs(wall.b.y) < 0.01,
    )
    expect(crossingSegment).toBeUndefined()

    const topLeftPiece = result!.walls.find(
      (wall) =>
        ((Math.abs(wall.a.x - 20) < 0.01 && Math.abs(wall.b.x - 50) < 0.01) ||
          (Math.abs(wall.a.x - 50) < 0.01 && Math.abs(wall.b.x - 20) < 0.01)) &&
        Math.abs(wall.a.y) < 0.01 &&
        Math.abs(wall.b.y) < 0.01,
    )
    const topRightPiece = result!.walls.find(
      (wall) =>
        ((Math.abs(wall.a.x - 50) < 0.01 && Math.abs(wall.b.x - 80) < 0.01) ||
          (Math.abs(wall.a.x - 80) < 0.01 && Math.abs(wall.b.x - 50) < 0.01)) &&
        Math.abs(wall.a.y) < 0.01 &&
        Math.abs(wall.b.y) < 0.01,
    )
    expect(topLeftPiece).toBeTruthy()
    expect(topRightPiece).toBeTruthy()
  })
})

describe('setWallThickness', () => {
  it('updates thickness within bounds', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const next = setWallThickness(walls, 'w1', 35)
    expect(next[0]?.thickness).toBe(35)
  })

  it('resets balance to 0.5 when thickness changes', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        balance: 0,
        openings: [],
      },
    ]
    const next = setWallThickness(walls, 'w1', 35)
    expect(next[0]?.thickness).toBe(35)
    expect(next[0]?.balance).toBe(0.5)
  })

  it('resets balance to 0.5 even when thickness is unchanged', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        balance: 0,
        openings: [],
      },
    ]
    const next = setWallThickness(walls, 'w1', 20)
    expect(next[0]?.thickness).toBe(20)
    expect(next[0]?.balance).toBe(0.5)
  })
})

describe('setWallsThickness', () => {
  it('updates multiple walls at once', () => {
    const walls = [
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, openings: [] },
      { id: 'w2', a: { x: 0, y: 100 }, b: { x: 100, y: 100 }, thickness: 12, openings: [] },
      { id: 'w3', a: { x: 0, y: 200 }, b: { x: 100, y: 200 }, thickness: 30, openings: [] },
    ]
    const next = setWallsThickness(walls, ['w1', 'w3'], 24)
    expect(next[0]?.thickness).toBe(24)
    expect(next[1]?.thickness).toBe(12)
    expect(next[2]?.thickness).toBe(24)
  })

  it('resets balance on selected walls even if some already have that thickness', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        balance: 0,
        openings: [],
      },
      {
        id: 'w2',
        a: { x: 0, y: 100 },
        b: { x: 100, y: 100 },
        thickness: 12,
        balance: 1,
        openings: [],
      },
      {
        id: 'w3',
        a: { x: 0, y: 200 },
        b: { x: 100, y: 200 },
        thickness: 24,
        balance: 0.25,
        openings: [],
      },
    ]
    const next = setWallsThickness(walls, ['w1', 'w2', 'w3'], 24)
    expect(next[0]?.balance).toBe(0.5)
    expect(next[1]?.balance).toBe(0.5)
    expect(next[2]?.balance).toBe(0.5)
    expect(next[0]?.a).toEqual({ x: 0, y: 0 })
    expect(next[1]?.a).toEqual({ x: 0, y: 100 })
  })
})

describe('removeWalls', () => {
  it('removes multiple walls', () => {
    const walls = [
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, openings: [] },
      { id: 'w2', a: { x: 0, y: 100 }, b: { x: 100, y: 100 }, thickness: 12, openings: [] },
    ]
    const next = removeWalls(walls, ['w1', 'w2'])
    expect(next).toHaveLength(0)
  })
})

describe('addWallSegment', () => {
  it('voegt een muur toe met minimale lengte', () => {
    const result = addWallSegment([], { x: 0, y: 0 }, { x: 100, y: 0 }, 20)
    expect(result?.walls).toHaveLength(1)
    expect(result?.walls[0]?.thickness).toBe(20)
    expect(result?.wallId).toMatch(/^wall-/)
    expect(result?.wallIds).toEqual([result?.wallId])
  })

  it('weigert te korte segmenten', () => {
    expect(addWallSegment([], { x: 0, y: 0 }, { x: 1, y: 0 }, 20)).toBeNull()
  })

  it('splits host and new wall at crossing into a shared junction', () => {
    const walls = [
      {
        id: 'host',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const result = addWallSegment(walls, { x: 50, y: -40 }, { x: 50, y: 40 }, 14)
    expect(result).not.toBeNull()
    expect(result!.wallIds).toHaveLength(2)
    expect(result!.walls).toHaveLength(4)

    const fullCrossing = result!.walls.find(
      (wall) =>
        ((Math.abs(wall.a.y + 40) < 0.01 && Math.abs(wall.b.y - 40) < 0.01) ||
          (Math.abs(wall.a.y - 40) < 0.01 && Math.abs(wall.b.y + 40) < 0.01)) &&
        Math.abs(wall.a.x - 50) < 0.01 &&
        Math.abs(wall.b.x - 50) < 0.01,
    )
    expect(fullCrossing).toBeUndefined()

    const hostLeft = result!.walls.find(
      (wall) =>
        ((Math.abs(wall.a.x) < 0.01 && Math.abs(wall.b.x - 50) < 0.01) ||
          (Math.abs(wall.a.x - 50) < 0.01 && Math.abs(wall.b.x) < 0.01)) &&
        Math.abs(wall.a.y) < 0.01 &&
        Math.abs(wall.b.y) < 0.01,
    )
    const hostRight = result!.walls.find(
      (wall) =>
        ((Math.abs(wall.a.x - 50) < 0.01 && Math.abs(wall.b.x - 100) < 0.01) ||
          (Math.abs(wall.a.x - 100) < 0.01 && Math.abs(wall.b.x - 50) < 0.01)) &&
        Math.abs(wall.a.y) < 0.01 &&
        Math.abs(wall.b.y) < 0.01,
    )
    expect(hostLeft).toBeTruthy()
    expect(hostRight).toBeTruthy()

    const junctions = buildJunctions(result!.walls)
    const cross = junctions.find((item) => Math.abs(item.x - 50) < 0.1 && Math.abs(item.y) < 0.1)
    expect(cross?.refs.length).toBeGreaterThanOrEqual(4)
  })

  it('keeps host openings on the correct piece after cross-cut', () => {
    const walls = [
      {
        id: 'host',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [{ refid: 'host-door', t: 0.8, width: 90, type: 'door' as const }],
      },
    ]
    const result = addWallSegment(walls, { x: 50, y: -40 }, { x: 50, y: 40 }, 14)
    expect(result).not.toBeNull()

    const withDoor = result!.walls.filter((wall) =>
      wall.openings.some((opening) => opening.refid === 'host-door'),
    )
    expect(withDoor).toHaveLength(1)
    const hostPiece = withDoor[0]
    const door = hostPiece.openings[0]
    const doorX = hostPiece.a.x + door.t * (hostPiece.b.x - hostPiece.a.x)
    expect(doorX).toBeCloseTo(80, 5)
    expect(Math.min(hostPiece.a.x, hostPiece.b.x)).toBeCloseTo(50, 5)
    expect(Math.max(hostPiece.a.x, hostPiece.b.x)).toBeCloseTo(100, 5)
  })

  it('T-junction (Geveltest): binnenmuur knipt oost/west; oude id op één helft', () => {
    const walls = [
      { id: 'west', a: { x: 0, y: 0 }, b: { x: 0, y: 600 }, thickness: 20, openings: [] },
      { id: 'east', a: { x: 800, y: 0 }, b: { x: 800, y: 600 }, thickness: 20, openings: [] },
      { id: 'north', a: { x: 0, y: 0 }, b: { x: 800, y: 0 }, thickness: 20, openings: [] },
      { id: 'south', a: { x: 0, y: 600 }, b: { x: 800, y: 600 }, thickness: 20, openings: [] },
    ]
    const result = addWallSegment(walls, { x: 0, y: 300 }, { x: 800, y: 300 }, 14)
    expect(result).not.toBeNull()
    expect(result!.walls.some((wall) => wall.id === 'west')).toBe(true)
    expect(result!.walls.some((wall) => wall.id === 'east')).toBe(true)
    const splitHosts = result!.walls.filter((wall) => wall.id.startsWith('split-host-'))
    expect(splitHosts.length).toBeGreaterThanOrEqual(2)

    const westPieces = result!.walls.filter(
      (wall) =>
        Math.abs(wall.a.x) < 0.01 &&
        Math.abs(wall.b.x) < 0.01 &&
        (Math.abs(wall.a.y - 300) < 0.01 || Math.abs(wall.b.y - 300) < 0.01),
    )
    const eastPieces = result!.walls.filter(
      (wall) =>
        Math.abs(wall.a.x - 800) < 0.01 &&
        Math.abs(wall.b.x - 800) < 0.01 &&
        (Math.abs(wall.a.y - 300) < 0.01 || Math.abs(wall.b.y - 300) < 0.01),
    )
    expect(westPieces).toHaveLength(2)
    expect(eastPieces).toHaveLength(2)
    expect(westPieces.some((wall) => wall.id === 'west')).toBe(true)
    expect(eastPieces.some((wall) => wall.id === 'east')).toBe(true)

    const junctions = buildJunctions(result!.walls)
    const westT = junctions.find((item) => Math.abs(item.x) < 0.1 && Math.abs(item.y - 300) < 0.1)
    const eastT = junctions.find(
      (item) => Math.abs(item.x - 800) < 0.1 && Math.abs(item.y - 300) < 0.1,
    )
    expect(westT?.refs.length).toBeGreaterThanOrEqual(3)
    expect(eastT?.refs.length).toBeGreaterThanOrEqual(3)
  })
})

describe('snapPointToJunctions', () => {
  it('snapt naar dichtstbijzijnd hoekpunt binnen tolerantie', () => {
    const junctions = buildJunctions([
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, openings: [] },
    ])
    const snapped = snapPointToJunctions(junctions, { x: 1, y: 1 }, 3)
    expect(snapped).toEqual({ x: 0, y: 0 })
  })
})

describe('applyShiftSnapFromOppositeEnd', () => {
  it('snaps horizontally relative to the fixed other wall end', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const snapped = applyShiftSnapFromOppositeEnd(walls, [{ wallId: 'w1', end: 'a' }], {
      x: 40,
      y: 25,
    })
    expect(snapped).toEqual({ x: 40, y: 0 })
  })

  it('snaps vertically relative to the fixed other wall end', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 0, y: 100 },
        thickness: 20,
        openings: [],
      },
    ]
    const snapped = applyShiftSnapFromOppositeEnd(walls, [{ wallId: 'w1', end: 'a' }], {
      x: 25,
      y: 40,
    })
    expect(snapped).toEqual({ x: 0, y: 40 })
  })
})

describe('applyShiftSnapFromAllOppositeEnds', () => {
  it('snaps split-wall junction using both segment anchors', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 50, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'w2',
        a: { x: 50, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const refs = [
      { wallId: 'w1', end: 'b' as const },
      { wallId: 'w2', end: 'a' as const },
    ]
    const snapped = applyShiftSnapFromAllOppositeEnds(walls, refs, { x: 55, y: 12 })
    expect(snapped).toEqual({ x: 55, y: 0 })
  })

  it('snaps split vertical wall junction on both segments', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 0, y: 50 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'w2',
        a: { x: 0, y: 50 },
        b: { x: 0, y: 100 },
        thickness: 20,
        openings: [],
      },
    ]
    const refs = [
      { wallId: 'w1', end: 'b' as const },
      { wallId: 'w2', end: 'a' as const },
    ]
    const snapped = applyShiftSnapFromAllOppositeEnds(walls, refs, { x: 8, y: 55 })
    expect(snapped).toEqual({ x: 0, y: 55 })
  })
})

describe('resolveWallSlidePointerDelta', () => {
  it('verticale muur: horizontale muis → horizontale verschuiving', () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 0, y: 80 } }
    const result = resolveWallSlidePointerDelta({ x: 7, y: 1 }, wall)
    expect(result.delta).toBeCloseTo(7, 6)
    expect(result.slideDir).toEqual({ x: 1, y: 0 })
  })

  it('horizontale muur: horizontale muis → geen verschuiving (alleen loodrecht)', () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }
    const result = resolveWallSlidePointerDelta({ x: 12, y: 2 }, wall)
    expect(result.delta).toBeCloseTo(2, 6)
    expect(result.slideDir).toEqual({ x: 0, y: 1 })
  })

  it('horizontale muur: verticale muis → verticale verschuiving', () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }
    const result = resolveWallSlidePointerDelta({ x: 2, y: -8 }, wall)
    expect(result.delta).toBeCloseTo(-8, 6)
    expect(result.slideDir).toEqual({ x: 0, y: 1 })
  })

  it('verticale muur: verticale muis → geen verschuiving (alleen loodrecht)', () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 0, y: 80 } }
    const result = resolveWallSlidePointerDelta({ x: -5, y: -9 }, wall)
    expect(result.delta).toBeCloseTo(-5, 6)
    expect(result.slideDir).toEqual({ x: 1, y: 0 })
  })

  it('schuine muur: verschuiving loodrecht op segment', () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 40, y: 40 } }
    const u = Math.SQRT1_2
    const result = resolveWallSlidePointerDelta({ x: 6, y: 0 }, wall)
    expect(result.delta).toBeCloseTo(6 * u, 4)
    expect(result.slideDir.x).toBeCloseTo(u, 4)
    expect(result.slideDir.y).toBeCloseTo(-u, 4)
  })
})

describe('slideWallSegmentAlongAxis', () => {
  const collinearChainWithT = () => [
    {
      id: 'w1',
      a: { x: 0, y: 0 },
      b: { x: 50, y: 0 },
      thickness: 20,
      openings: [],
    },
    {
      id: 'w2',
      a: { x: 50, y: 0 },
      b: { x: 80, y: 0 },
      thickness: 20,
      openings: [],
    },
    {
      id: 'w3',
      a: { x: 80, y: 0 },
      b: { x: 100, y: 0 },
      thickness: 20,
      openings: [],
    },
    {
      id: 'wBranch',
      a: { x: 50, y: 0 },
      b: { x: 50, y: 40 },
      thickness: 20,
      openings: [],
    },
  ]

  function hasHorizontalSegment(
    walls: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>,
    x0: number,
    x1: number,
    y = 0,
  ): boolean {
    const lo = Math.min(x0, x1)
    const hi = Math.max(x0, x1)
    const spans = walls
      .filter((wall) => Math.abs(wall.a.y - y) <= 0.05 && Math.abs(wall.b.y - y) <= 0.05)
      .map(
        (wall) => [Math.min(wall.a.x, wall.b.x), Math.max(wall.a.x, wall.b.x)] as [number, number],
      )
      .sort((left, right) => left[0] - right[0])
    let cursor = lo
    for (const [spanLo, spanHi] of spans) {
      if (spanHi + 0.05 < cursor) continue
      if (spanLo - 0.05 > cursor) return false
      cursor = Math.max(cursor, spanHi)
      if (cursor + 0.05 >= hi) return true
    }
    return cursor + 0.05 >= hi
  }

  it('T→L: middelste segment schuift rigide langs trunk; branch blijft op oude junction', () => {
    const walls = collinearChainWithT()
    const moved = slideWallSegmentAlongAxis(walls, 'w2', 10)

    expect(moved.find((wall) => wall.id === 'wBranch')?.a).toEqual({ x: 50, y: 0 })
    expect(moved.find((wall) => wall.id === 'w1')?.b).toEqual({ x: 50, y: 0 })
    expect(moved.find((wall) => wall.id === 'w2')?.a).toEqual({ x: 60, y: 0 })
    expect(moved.find((wall) => wall.id === 'w2')?.b).toEqual({ x: 90, y: 0 })
    expect(moved.find((wall) => wall.id === 'w3')?.a).toEqual({ x: 90, y: 0 })

    const w2 = moved.find((wall) => wall.id === 'w2')!
    expect(Math.hypot(w2.b.x - w2.a.x, w2.b.y - w2.a.y)).toBeCloseTo(30, 4)

    const junctions = buildJunctions(moved)
    const branchJunction = junctions.find((junction) =>
      junction.refs.some((ref) => ref.wallId === 'wBranch'),
    )
    expect(branchJunction?.refs).toHaveLength(3)
    expect(branchJunction?.x).toBeCloseTo(50, 4)
    expect(branchJunction?.y).toBeCloseTo(0, 4)

    const stub = moved.find((wall) => wall.id.startsWith('slide-stub-'))
    expect(stub?.a).toEqual({ x: 50, y: 0 })
    expect(stub?.b).toEqual({ x: 60, y: 0 })
  })

  it('T-junction naar binnen schuiven: split staying-muur, geen losse relink-stub', () => {
    const walls = collinearChainWithT()
    const moved = slideWallSegmentAlongAxis(walls, 'w2', -40)

    const relink = moved.find((wall) => wall.id.startsWith('slide-relink-'))
    expect(relink).toBeUndefined()
    expect(moved.some((wall) => wall.id.startsWith('slide-stub-'))).toBe(false)

    expect(moved.find((wall) => wall.id === 'w1')?.a).toEqual({ x: 0, y: 0 })
    expect(moved.find((wall) => wall.id === 'w1')?.b).toEqual({ x: 10, y: 0 })
    expect(moved.find((wall) => wall.id === 'w2')?.a).toEqual({ x: 10, y: 0 })
    expect(moved.find((wall) => wall.id === 'w2')?.b).toEqual({ x: 40, y: 0 })
    expect(hasHorizontalSegment(moved, 10, 50)).toBe(true)
    expect(collinearOverlapIds(moved)).toEqual([])

    const junctions = buildJunctions(moved)
    const atTen = junctions.find(
      (junction) => Math.abs(junction.x - 10) < 0.01 && Math.abs(junction.y) < 0.01,
    )
    expect(atTen?.refs.length).toBeGreaterThanOrEqual(2)

    const branchJunction = junctions.find((junction) =>
      junction.refs.some((ref) => ref.wallId === 'wBranch'),
    )
    expect(branchJunction?.x).toBeCloseTo(50, 4)
    expect(branchJunction?.y).toBeCloseTo(0, 4)
  })

  it('T-junction naar buiten schuiven: tussennode op opposite + connector naar nieuw punt', () => {
    const walls = [
      {
        id: 'wDrag',
        a: { x: 80, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'wStay',
        a: { x: 80, y: 0 },
        b: { x: 120, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'wBranch',
        a: { x: 80, y: 0 },
        b: { x: 80, y: 40 },
        thickness: 20,
        openings: [],
      },
    ]

    const moved = slideWallSegmentAlongAxis(walls, 'wDrag', 60, { x: 1, y: 0 })

    expect(moved.some((wall) => wall.id.startsWith('slide-stub-'))).toBe(false)
    const relink = moved.find((wall) => wall.id.startsWith('slide-relink-'))
    expect(relink).toBeTruthy()
    expect(relink?.a).toEqual({ x: 120, y: 0 })
    expect(relink?.b).toEqual({ x: 140, y: 0 })

    expect(moved.find((wall) => wall.id === 'wStay')?.a).toEqual({ x: 80, y: 0 })
    expect(moved.find((wall) => wall.id === 'wStay')?.b).toEqual({ x: 120, y: 0 })
    expect(moved.find((wall) => wall.id === 'wDrag')?.a).toEqual({ x: 140, y: 0 })
    expect(moved.find((wall) => wall.id === 'wDrag')?.b).toEqual({ x: 160, y: 0 })

    const junctions = buildJunctions(moved)
    const oldJunction = junctions.find((junction) =>
      junction.refs.some((ref) => ref.wallId === 'wBranch'),
    )
    expect(oldJunction?.x).toBeCloseTo(80, 4)
    expect(oldJunction?.y).toBeCloseTo(0, 4)
  })

  it('outwards met openingen op staying-muur: geen parallelle stub, wel connector', () => {
    const walls = [
      {
        id: 'wDrag',
        a: { x: 80, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'wStay',
        a: { x: 80, y: 0 },
        b: { x: 120, y: 0 },
        thickness: 20,
        openings: [
          { type: 'door' as const, refid: 'd1', t: 0.25, width: 8 },
          { type: 'door' as const, refid: 'd2', t: 0.5, width: 8 },
          { type: 'door' as const, refid: 'd3', t: 0.75, width: 8 },
        ],
      },
      {
        id: 'wBranch',
        a: { x: 80, y: 0 },
        b: { x: 80, y: 40 },
        thickness: 20,
        openings: [],
      },
    ]

    const moved = slideWallSegmentAlongAxis(walls, 'wDrag', 60, { x: 1, y: 0 })
    expect(moved.some((wall) => wall.id.startsWith('slide-stub-'))).toBe(false)

    const relink = moved.find((wall) => wall.id.startsWith('slide-relink-'))
    expect(relink).toBeTruthy()
    expect(relink?.a).toEqual({ x: 120, y: 0 })
    expect(relink?.b).toEqual({ x: 140, y: 0 })

    const stay = moved.find((wall) => wall.id === 'wStay')
    expect(stay?.a).toEqual({ x: 80, y: 0 })
    expect(stay?.b).toEqual({ x: 120, y: 0 })
    expect(stay?.openings).toHaveLength(3)
  })

  it('kleine inwards slide houdt junctions verbonden via host-split, zonder relink', () => {
    const walls = collinearChainWithT()
    const moved = slideWallSegmentAlongAxis(walls, 'w2', -2)

    const connector = moved.find((wall) => wall.id.startsWith('slide-relink-'))
    expect(connector).toBeUndefined()
    expect(hasHorizontalSegment(moved, 48, 50)).toBe(true)
    expect(collinearOverlapIds(moved)).toEqual([])
  })

  it('fallback op host-split: geen parallelle stub wanneer old/new op bestaande host liggen', () => {
    const walls = [
      {
        id: 'wDrag',
        a: { x: 20, y: 0 },
        b: { x: 20, y: 50 },
        thickness: 10,
        openings: [],
      },
      {
        id: 'wBranchMove',
        a: { x: 20, y: 0 },
        b: { x: 0, y: 0 },
        thickness: 10,
        openings: [],
      },
      {
        id: 'wStayJunction',
        a: { x: 20, y: 0 },
        b: { x: 20, y: -30 },
        thickness: 10,
        openings: [],
      },
      {
        id: 'wHost',
        a: { x: 40, y: 0 },
        b: { x: 0, y: 0 },
        thickness: 10,
        openings: [],
      },
    ]

    const moved = slideWallSegmentAlongAxis(walls, 'wDrag', 20, { x: 1, y: 0 })
    expect(moved.some((wall) => wall.id.startsWith('slide-stub-'))).toBe(false)

    const hostParts = moved.filter(
      (wall) =>
        Math.abs(wall.a.y) < 0.01 &&
        Math.abs(wall.b.y) < 0.01 &&
        ((Math.abs(wall.a.x - 40) < 0.01 && Math.abs(wall.b.x - 20) < 0.01) ||
          (Math.abs(wall.a.x - 20) < 0.01 && Math.abs(wall.b.x - 0) < 0.01)),
    )
    expect(hostParts.length).toBeGreaterThanOrEqual(2)
  })

  it('splitst gekruiste bestaande muur en maakt tussennode i.p.v. full stub', () => {
    const walls = [
      {
        id: 'wDrag',
        a: { x: 10, y: 0 },
        b: { x: 10, y: 30 },
        thickness: 10,
        openings: [],
      },
      {
        id: 'wMoveTop',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        thickness: 10,
        openings: [],
      },
      {
        id: 'wStayTop',
        a: { x: 10, y: 0 },
        b: { x: 10, y: -20 },
        thickness: 10,
        openings: [],
      },
      {
        id: 'wCross',
        a: { x: 20, y: -10 },
        b: { x: 20, y: 10 },
        thickness: 10,
        openings: [],
      },
    ]

    const moved = slideWallSegmentAlongAxis(walls, 'wDrag', 20, { x: 1, y: 0 })

    // Geen volle connector van oude naar nieuwe junction.
    const fullStub = moved.find(
      (wall) =>
        wall.id.startsWith('slide-stub-') &&
        ((Math.abs(wall.a.x - 10) < 0.01 && Math.abs(wall.b.x - 30) < 0.01) ||
          (Math.abs(wall.a.x - 30) < 0.01 && Math.abs(wall.b.x - 10) < 0.01)) &&
        Math.abs(wall.a.y) < 0.01 &&
        Math.abs(wall.b.y) < 0.01,
    )
    expect(fullStub).toBeUndefined()

    // De gekruiste muur wordt gesplitst op het kruispunt (20, 0).
    const verticalAt20 = moved.filter(
      (wall) => Math.abs(wall.a.x - 20) < 0.01 && Math.abs(wall.b.x - 20) < 0.01,
    )
    expect(verticalAt20.length).toBeGreaterThanOrEqual(2)
    expect(
      verticalAt20.some((wall) => Math.abs(wall.a.y) < 0.01 || Math.abs(wall.b.y) < 0.01),
    ).toBe(true)
  })

  it('collineaire junction schuift mee bij slide van rechter segment', () => {
    const walls = collinearChainWithT()
    const moved = slideWallSegmentAlongAxis(walls, 'w3', 10)

    expect(moved.find((wall) => wall.id === 'w2')?.b).toEqual({ x: 90, y: 0 })
    expect(moved.find((wall) => wall.id === 'w3')?.a).toEqual({ x: 90, y: 0 })
    expect(moved.find((wall) => wall.id === 'w3')?.b).toEqual({ x: 110, y: 0 })
    expect(moved.find((wall) => wall.id === 'wBranch')?.a).toEqual({ x: 50, y: 0 })
  })

  it('aligning junction: openingen op buur houden wereldpositie; op gesleepte muur schuiven mee', () => {
    const walls = [
      {
        id: 'wLeft',
        a: { x: 0, y: 0 },
        b: { x: 50, y: 0 },
        thickness: 20,
        openings: [{ refid: 'door-left', t: 0.4, width: 10, type: 'door' as const }],
      },
      {
        id: 'wDrag',
        a: { x: 50, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [{ refid: 'door-drag', t: 0.5, width: 10, type: 'door' as const }],
      },
    ]

    // Haakse slide: shared aligning junction beweegt mee → wLeft asymmetrisch, wDrag rigide.
    const moved = slideWallSegmentAlongAxis(walls, 'wDrag', 10, { x: 0, y: 1 })
    const left = moved.find((wall) => wall.id === 'wLeft')!
    const drag = moved.find((wall) => wall.id === 'wDrag')!

    expect(drag.a).toEqual({ x: 50, y: 10 })
    expect(drag.b).toEqual({ x: 100, y: 10 })
    expect(left.a).toEqual({ x: 0, y: 0 })
    expect(left.b).toEqual({ x: 50, y: 10 })

    // Buur: herprojectie vanaf oude wereldpositie (20,0) op nieuwe as (niet vaste t=0.4).
    const dx = left.b.x - left.a.x
    const dy = left.b.y - left.a.y
    const lenSq = dx * dx + dy * dy
    const expectedT = Math.max(0, Math.min(1, ((20 - left.a.x) * dx + (0 - left.a.y) * dy) / lenSq))
    expect(left.openings[0].t).toBeCloseTo(expectedT, 5)
    expect(left.openings[0].t).not.toBeCloseTo(0.4, 2)

    // Gesleepte muur: deur schuift rigide mee (t blijft 0.5 → y=10).
    expect(drag.openings[0].t).toBeCloseTo(0.5, 5)
    expect(drag.a.y + (drag.b.y - drag.a.y) * drag.openings[0].t).toBeCloseTo(10, 4)
  })

  it('L-hoek slide: opening op stilstaande been houdt wereldpositie', () => {
    const walls = [
      {
        id: 'h1',
        a: { x: 0, y: 0 },
        b: { x: 50, y: 0 },
        thickness: 20,
        openings: [{ refid: 'door', t: 0.4, width: 10, type: 'door' as const }],
      },
      {
        id: 'v1',
        a: { x: 50, y: 0 },
        b: { x: 50, y: 80 },
        thickness: 20,
        openings: [{ refid: 'win', t: 0.5, width: 10, type: 'window' as const }],
      },
    ]

    const moved = slideWallSegmentAlongAxis(walls, 'v1', 10, { x: 1, y: 0 })
    const h1 = moved.find((wall) => wall.id === 'h1')!
    const v1 = moved.find((wall) => wall.id === 'v1')!

    expect(h1.b).toEqual({ x: 60, y: 0 })
    expect(v1.a).toEqual({ x: 60, y: 0 })
    expect(v1.b).toEqual({ x: 60, y: 80 })

    // Horizontaal been verlengd: deur blijft op x=20 (was t=0.4 op 0→50).
    expect(h1.openings[0].t * (h1.b.x - h1.a.x)).toBeCloseTo(20, 4)
    // Verticaal been rigide: raam schuift mee op t=0.5.
    expect(v1.openings[0].t).toBeCloseTo(0.5, 5)
  })

  it('schuine muur: rigide translatie langs eigen as', () => {
    const walls = [
      {
        id: 'diag',
        a: { x: 0, y: 0 },
        b: { x: 40, y: 40 },
        thickness: 20,
        openings: [],
      },
    ]
    const moved = slideWallSegmentAlongAxis(walls, 'diag', 10)
    const diag = moved.find((wall) => wall.id === 'diag')!
    const u = Math.SQRT1_2
    expect(diag.a.x).toBeCloseTo(10 * u, 4)
    expect(diag.a.y).toBeCloseTo(10 * u, 4)
    expect(diag.b.x).toBeCloseTo(40 + 10 * u, 4)
    expect(diag.b.y).toBeCloseTo(40 + 10 * u, 4)
    expect(Math.hypot(diag.b.x - diag.a.x, diag.b.y - diag.a.y)).toBeCloseTo(40 * Math.SQRT2, 3)
  })

  it('L-hoek blijft verbonden bij haakse slide van verticale muur', () => {
    const walls = [
      {
        id: 'h1',
        a: { x: 0, y: 0 },
        b: { x: 50, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'v1',
        a: { x: 50, y: 0 },
        b: { x: 50, y: 80 },
        thickness: 20,
        openings: [],
      },
    ]

    const movedRight = slideWallSegmentAlongAxis(walls, 'v1', 10, { x: 1, y: 0 })
    expect(movedRight.find((wall) => wall.id === 'h1')?.b).toEqual({ x: 60, y: 0 })
    expect(movedRight.find((wall) => wall.id === 'v1')?.a).toEqual({ x: 60, y: 0 })
    expect(movedRight.find((wall) => wall.id === 'v1')?.b).toEqual({ x: 60, y: 80 })

    const movedLeft = slideWallSegmentAlongAxis(walls, 'v1', -10, { x: 1, y: 0 })
    expect(movedLeft.find((wall) => wall.id === 'h1')?.b).toEqual({ x: 40, y: 0 })
    expect(movedLeft.find((wall) => wall.id === 'v1')?.a).toEqual({ x: 40, y: 0 })
    expect(movedLeft.find((wall) => wall.id === 'v1')?.b).toEqual({ x: 40, y: 80 })
  })

  it('haakse slide met vaste rechter branch: stub op slide-as per junction', () => {
    const walls = [
      {
        id: 'hTop',
        a: { x: 0, y: 0 },
        b: { x: 50, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'hBot',
        a: { x: 0, y: 80 },
        b: { x: 50, y: 80 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'vMid',
        a: { x: 50, y: 0 },
        b: { x: 50, y: 80 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'vTopRight',
        a: { x: 50, y: 0 },
        b: { x: 50, y: -40 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'vBotRight',
        a: { x: 50, y: 80 },
        b: { x: 50, y: 120 },
        thickness: 20,
        openings: [],
      },
    ]

    const moved = slideWallSegmentAlongAxis(walls, 'vMid', 10, { x: 1, y: 0 })

    expect(moved.find((wall) => wall.id === 'vMid')?.a).toEqual({ x: 60, y: 0 })
    expect(moved.find((wall) => wall.id === 'vMid')?.b).toEqual({ x: 60, y: 80 })
    expect(moved.find((wall) => wall.id === 'vTopRight')?.a).toEqual({ x: 50, y: 0 })
    expect(moved.find((wall) => wall.id === 'vBotRight')?.a).toEqual({ x: 50, y: 80 })

    const connectors = moved.filter((wall) => {
      const xVals = [wall.a.x, wall.b.x].sort((left, right) => left - right)
      const yVals = [wall.a.y, wall.b.y].sort((left, right) => left - right)
      return (
        Math.abs(xVals[0] - 50) < 0.01 &&
        Math.abs(xVals[1] - 60) < 0.01 &&
        (Math.abs(yVals[0] - 0) < 0.01 ||
          (Math.abs(yVals[0] - 80) < 0.01 && Math.abs(yVals[1] - 80) < 0.01))
      )
    })
    expect(connectors.length).toBeGreaterThanOrEqual(2)
  })

  it('bestaande muur over andere slepen: beide splitsen tot junction', () => {
    const walls = [
      {
        id: 'h1',
        a: { x: 40, y: 40 },
        b: { x: 100, y: 40 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'v1',
        a: { x: 20, y: 0 },
        b: { x: 20, y: 80 },
        thickness: 20,
        openings: [],
      },
    ]

    const moved = slideWallSegmentAlongAxis(walls, 'v1', 30, { x: 1, y: 0 })
    expect(moved).toHaveLength(4)

    const junctions = buildJunctions(moved)
    const cross = junctions.find(
      (junction) => Math.abs(junction.x - 50) < 0.01 && Math.abs(junction.y - 40) < 0.01,
    )
    expect(cross?.refs.length).toBeGreaterThanOrEqual(4)

    const coversCross = (wall: { a: { x: number; y: number }; b: { x: number; y: number } }) => {
      const onSeg =
        Math.min(wall.a.x, wall.b.x) - 0.01 <= 50 &&
        50 <= Math.max(wall.a.x, wall.b.x) + 0.01 &&
        Math.min(wall.a.y, wall.b.y) - 0.01 <= 40 &&
        40 <= Math.max(wall.a.y, wall.b.y) + 0.01
      return onSeg
    }
    expect(moved.filter(coversCross).length).toBe(4)
  })

  function collinearOverlapIds(
    walls: Array<{ id: string; a: { x: number; y: number }; b: { x: number; y: number } }>,
  ): Array<[string, string]> {
    const pairs: Array<[string, string]> = []
    for (let i = 0; i < walls.length; i += 1) {
      for (let j = i + 1; j < walls.length; j += 1) {
        const left = walls[i]
        const right = walls[j]
        const dax = left.b.x - left.a.x
        const day = left.b.y - left.a.y
        const dbx = right.b.x - right.a.x
        const dby = right.b.y - right.a.y
        const lenA = Math.hypot(dax, day)
        const lenB = Math.hypot(dbx, dby)
        if (lenA < 0.5 || lenB < 0.5) continue
        if (Math.abs(dax * dby - day * dbx) > 0.05 * Math.max(lenA, lenB)) continue
        const dist = Math.abs((right.a.x - left.a.x) * day - (right.a.y - left.a.y) * dax) / lenA
        if (dist > 0.5) continue
        const axis: 'x' | 'y' = Math.abs(dax) >= Math.abs(day) ? 'x' : 'y'
        const a0 = Math.min(left.a[axis], left.b[axis])
        const a1 = Math.max(left.a[axis], left.b[axis])
        const b0 = Math.min(right.a[axis], right.b[axis])
        const b1 = Math.max(right.a[axis], right.b[axis])
        if (Math.min(a1, b1) - Math.max(a0, b0) > 1) pairs.push([left.id, right.id])
      }
    }
    return pairs
  }

  const hallLivingT = () => {
    const x = 163.23422707243168
    const tY = 641.6458290819224
    const southY = 750.6653045768137
    const northY = 500.2538310675391
    return [
      {
        id: 'vSouth',
        a: { x, y: southY },
        b: { x, y: tY },
        thickness: 10,
        openings: [],
      },
      {
        id: 'vNorth',
        a: { x, y: tY },
        b: { x, y: northY },
        thickness: 10,
        openings: [],
      },
      {
        id: 'hStem',
        a: { x: 0, y: tY },
        b: { x, y: tY },
        thickness: 10,
        openings: [],
      },
      {
        id: 'hBot',
        a: { x, y: southY },
        b: { x: 352.57, y: southY },
        thickness: 10,
        openings: [],
      },
      {
        id: 'hTop',
        a: { x, y: northY },
        b: { x: 299.05, y: northY },
        thickness: 10,
        openings: [],
      },
      {
        id: 'vOuter',
        a: { x: 0, y: 1335.11 },
        b: { x: 0, y: tY },
        thickness: 20,
        openings: [],
      },
      {
        id: 'vExt',
        a: { x, y: northY },
        b: { x, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
  }

  it('hal/woonkamer T: stam-tak voorbij het stam-einde geeft geen dubbele muur', () => {
    const cases: Array<{ id: string; delta: number; dir: { x: number; y: number } }> = [
      { id: 'hStem', delta: 20, dir: { x: 0, y: 1 } },
      { id: 'hStem', delta: 80, dir: { x: 0, y: 1 } },
      { id: 'hStem', delta: 120, dir: { x: 0, y: 1 } },
      { id: 'hStem', delta: -80, dir: { x: 0, y: 1 } },
      { id: 'vSouth', delta: 20, dir: { x: 1, y: 0 } },
      { id: 'vSouth', delta: -20, dir: { x: 1, y: 0 } },
      { id: 'vNorth', delta: 20, dir: { x: 1, y: 0 } },
      { id: 'vNorth', delta: -20, dir: { x: 1, y: 0 } },
    ]
    for (const item of cases) {
      const moved = slideWallSegmentAlongAxis(hallLivingT(), item.id, item.delta, item.dir)
      expect(collinearOverlapIds(moved), `${item.id} delta=${item.delta}`).toEqual([])
    }
  })
})

describe('moveJunctionWithWallJoins', () => {
  it('eindpunt over muur slepen: host splitst tot T-junction', () => {
    const walls = [
      {
        id: 'h1',
        a: { x: 0, y: 40 },
        b: { x: 100, y: 40 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'v1',
        a: { x: 50, y: 0 },
        b: { x: 50, y: 10 },
        thickness: 20,
        openings: [],
      },
    ]
    const node = buildJunctions(walls).find((junction) =>
      junction.refs.some((ref) => ref.wallId === 'v1' && ref.end === 'b'),
    )!
    const moved = moveJunctionWithWallJoins(walls, node, { x: 50, y: 40 })
    expect(moved.length).toBeGreaterThanOrEqual(3)

    const junctions = buildJunctions(moved)
    const tee = junctions.find(
      (junction) => Math.abs(junction.x - 50) < 0.01 && Math.abs(junction.y - 40) < 0.01,
    )
    expect(tee?.refs.length).toBeGreaterThanOrEqual(3)
  })

  it('eindpunt door muur slepen: kruising wordt X-junction', () => {
    const walls = [
      {
        id: 'h1',
        a: { x: 0, y: 40 },
        b: { x: 100, y: 40 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'v1',
        a: { x: 50, y: 0 },
        b: { x: 50, y: 10 },
        thickness: 20,
        openings: [],
      },
    ]
    const node = buildJunctions(walls).find((junction) =>
      junction.refs.some((ref) => ref.wallId === 'v1' && ref.end === 'b'),
    )!
    const moved = moveJunctionWithWallJoins(walls, node, { x: 50, y: 80 })
    expect(moved).toHaveLength(4)

    const junctions = buildJunctions(moved)
    const cross = junctions.find(
      (junction) => Math.abs(junction.x - 50) < 0.01 && Math.abs(junction.y - 40) < 0.01,
    )
    expect(cross?.refs.length).toBeGreaterThanOrEqual(4)
  })
})

describe('snapPointToWallCenters', () => {
  it('snapt naar hartlijn van muur binnen radius', () => {
    const walls = [
      {
        id: 'h1',
        a: { x: 0, y: 40 },
        b: { x: 100, y: 40 },
        thickness: 20,
        openings: [],
      },
    ]
    const snapped = snapPointToWallCenters(walls, { x: 50, y: 45 }, 15)
    expect(snapped.x).toBeCloseTo(50, 4)
    expect(snapped.y).toBeCloseTo(40, 4)
  })

  it('kamer-snap: 12 cm naast hartlijn blijft vrij (kleine schacht)', () => {
    const walls = [
      {
        id: 'h1',
        a: { x: 0, y: 40 },
        b: { x: 100, y: 40 },
        thickness: 20,
        openings: [],
      },
    ]
    const snapped = snapPointToWallCenters(walls, { x: 50, y: 52 }, ROOM_DRAW_SNAP_CM)
    expect(snapped).toEqual({ x: 50, y: 52 })
  })

  it('muur-teken-snap: 15 cm hartlijn (niet de 4 cm van kamer)', () => {
    const walls = [
      {
        id: 'h1',
        a: { x: 0, y: 40 },
        b: { x: 100, y: 40 },
        thickness: 20,
        openings: [],
      },
    ]
    const at14 = snapPointToWallCenters(walls, { x: 50, y: 54 }, JUNCTION_POINT_SNAP_CM)
    expect(at14.x).toBeCloseTo(50, 4)
    expect(at14.y).toBeCloseTo(40, 4)
    const at16 = snapPointToWallCenters(walls, { x: 50, y: 56 }, JUNCTION_POINT_SNAP_CM)
    expect(at16).toEqual({ x: 50, y: 56 })
  })

  it('kamer-snap: dicht op hartlijn landt op de muur', () => {
    const walls = [
      {
        id: 'h1',
        a: { x: 0, y: 40 },
        b: { x: 100, y: 40 },
        thickness: 20,
        openings: [],
      },
    ]
    const snapped = snapPointToWallCenters(walls, { x: 50, y: 43 }, ROOM_DRAW_SNAP_CM)
    expect(snapped.x).toBeCloseTo(50, 4)
    expect(snapped.y).toBeCloseTo(40, 4)
  })
})

describe('snapToNearbyEndpointAxes', () => {
  it('snapt x en y onafhankelijk binnen radius', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 50 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'w2',
        a: { x: 200, y: 0 },
        b: { x: 300, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const snapped = snapToNearbyEndpointAxes(
      walls,
      [{ wallId: 'w1', end: 'a' }],
      { x: 98, y: 2 },
      3,
    )
    expect(snapped).toEqual({ x: 100, y: 0 })
  })

  it('snapt niet buiten radius', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const snapped = snapToNearbyEndpointAxes(
      walls,
      [{ wallId: 'w1', end: 'a' }],
      { x: 90, y: 90 },
      3,
    )
    expect(snapped).toEqual({ x: 90, y: 90 })
  })
})

describe('snapToNearbyPointAxes', () => {
  it('snapt een bijna-horizontale ribbe op de y van het vorige punt', () => {
    const snapped = snapToNearbyPointAxes([{ x: 0, y: 0 }], { x: 500, y: 8 }, 15)
    expect(snapped).toEqual({ x: 500, y: 0 })
  })

  it('snapt x en y onafhankelijk naar verschillende hoeken (rechthoek sluiten)', () => {
    const snapped = snapToNearbyPointAxes(
      [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 80 },
      ],
      { x: 3, y: 78 },
      15,
    )
    expect(snapped).toEqual({ x: 0, y: 80 })
  })
})

describe('snapPolygonVertexAxisLock', () => {
  it('houdt een rechthoekhoek H/V t.o.v. beide buren', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ]
    expect(snapPolygonVertexAxisLock(poly, 2, { x: 98, y: 75 })).toEqual({ x: 100, y: 80 })
  })
})

describe('snapToPolygonGeometry', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ]
  const segs = closedRingSegments(square)

  it('snapt naar een hoek van een andere polygoon', () => {
    expect(snapToPolygonGeometry({ x: 3, y: 2 }, square, segs, 15)).toEqual({ x: 0, y: 0 })
  })

  it('snapt naar het midden van een ribbe', () => {
    const hit = snapToPolygonGeometry({ x: 50, y: 6 }, square, segs, 15)
    expect(hit).toEqual({ x: 50, y: 0 })
  })

  it('laat een hoek winnen van een nabije ribbe', () => {
    const hit = snapToPolygonGeometry({ x: 4, y: 3 }, square, segs, 15)
    expect(hit).toEqual({ x: 0, y: 0 })
  })

  it('snapt niet buiten radius', () => {
    expect(snapToPolygonGeometry({ x: 50, y: 40 }, square, segs, 15)).toBeNull()
  })
})

describe('setWallBalance', () => {
  it('writes balance keep-axis (centerline stays, overshoot allowed)', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        balance: 0.5,
        openings: [],
      },
    ]
    expect(clampBalance(-2.5)).toBe(-2.5)
    expect(clampBalance(10)).toBe(10)
    expect(clampBalance(12)).toBe(10)
    expect(clampBalance(0)).toBe(0)
    expect(clampBalance(1)).toBe(1)
    const updated = setWallBalance(walls, 'w1', 0.72)
    expect(updated[0]?.balance).toBe(0.72)
    expect(updated[0]?.a).toEqual({ x: 0, y: 0 })
    expect(updated[0]?.b).toEqual({ x: 100, y: 0 })
  })

  it('converts percent for the toolbelt (slider 0–100, input may overshoot)', () => {
    expect(balanceToPercent(0.5)).toBe(50)
    expect(balanceToPercent(0.72)).toBe(72)
    expect(percentToBalance(50)).toBe(0.5)
    expect(percentToBalance(-250)).toBe(-2.5)
    expect(percentToBalance(1000)).toBe(10)
    expect(sliderPercentFromDraft(-250)).toBe(0)
    expect(sliderPercentFromDraft(1000)).toBe(100)
    expect(sliderPercentFromDraft(72)).toBe(72)
  })
})

describe('applyShiftSnapAxisAligned', () => {
  it('keeps horizontal split segments aligned when dragging diagonally', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 50, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'w2',
        a: { x: 50, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const refs = [
      { wallId: 'w1', end: 'b' as const },
      { wallId: 'w2', end: 'a' as const },
    ]
    const snapped = applyShiftSnapAxisAligned(walls, refs, { x: 55, y: 40 })
    expect(snapped).toEqual({ x: 55, y: 0 })
  })

  it('locks L-corner junction to both wall axes', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'w2',
        a: { x: 100, y: 0 },
        b: { x: 100, y: 80 },
        thickness: 20,
        openings: [],
      },
    ]
    const refs = [
      { wallId: 'w1', end: 'b' as const },
      { wallId: 'w2', end: 'a' as const },
    ]
    const snapped = applyShiftSnapAxisAligned(walls, refs, { x: 120, y: 30 })
    expect(snapped).toEqual({ x: 100, y: 0 })
  })
})
