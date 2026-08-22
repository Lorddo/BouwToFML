import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { Wall } from '@/core/fml/types'
import { snapDrawWallEndpoint } from '@/ui/components/fml-preview-junction-snap'
import {
  isOnDakBoundary,
  snapDakDrawPoint,
  snapDrawPointToWallFaces,
  snapPointToWallFaces,
  snapToNearestDakBoundary,
  wallFaceSegments,
  DAK_FACE_SNAP_CM,
  WALL_FACE_SNAP_CM,
} from '@/ui/components/fml-preview-wall-face-snap'
import { useFmlPreviewMeasure } from '@/ui/composables/fml-preview/useFmlPreviewMeasure'

function wall(partial: Partial<Wall> & Pick<Wall, 'a' | 'b' | 'thickness'>): Wall {
  return {
    id: partial.id ?? 'w',
    a: partial.a,
    b: partial.b,
    thickness: partial.thickness,
    balance: partial.balance,
    openings: [],
  }
}

describe('wallFaceSegments', () => {
  it('horizontale muur balance=0.5: plus/minus op ±t/2', () => {
    const faces = wallFaceSegments(
      wall({ a: { x: 0, y: 20 }, b: { x: 100, y: 20 }, thickness: 20 }),
    )
    const ys = faces.map((f) => f.a.y).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(10)
    expect(ys[1]).toBeCloseTo(30)
    expect(faces.every((f) => f.axis === 'h')).toBe(true)
  })

  it('flush balance=1: lege minus-zijde op hartlijn, plus op volle dikte', () => {
    const faces = wallFaceSegments(
      wall({ a: { x: 0, y: 20 }, b: { x: 100, y: 20 }, thickness: 20, balance: 1 }),
    )
    const ys = faces.map((f) => f.a.y).sort((a, b) => a - b)
    // leftNormal (0,-1): plus → y=0, minus extent 0 → y=20
    expect(ys[0]).toBeCloseTo(0)
    expect(ys[1]).toBeCloseTo(20)
  })
})

describe('snapPointToWallFaces', () => {
  it('horizontale muur: Y snapt naar face, niet naar hartlijn', () => {
    const walls = [wall({ a: { x: 0, y: 20 }, b: { x: 100, y: 20 }, thickness: 20 })]
    const snapped = snapPointToWallFaces(walls, { x: 50, y: 12 }, WALL_FACE_SNAP_CM)
    expect(snapped.x).toBe(50)
    expect(snapped.y).toBeCloseTo(10)
    expect(snapped.y).not.toBeCloseTo(20)
  })

  it('verticale muur: X snapt naar face, niet naar hartlijn', () => {
    const walls = [wall({ a: { x: 40, y: 0 }, b: { x: 40, y: 100 }, thickness: 20 })]
    const snapped = snapPointToWallFaces(walls, { x: 48, y: 50 }, WALL_FACE_SNAP_CM)
    expect(snapped.x).toBeCloseTo(50)
    expect(snapped.y).toBe(50)
    expect(snapped.x).not.toBeCloseTo(40)
  })

  it('L-hoek: buitenhoek = face-snijpunt, niet junction-hartlijn', () => {
    const walls = [
      wall({ id: 'h', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 }),
      wall({ id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, thickness: 20 }),
    ]
    // Buitenhoek: H-face y=-10, V-face x=-10
    const snapped = snapPointToWallFaces(walls, { x: -8, y: -8 }, WALL_FACE_SNAP_CM)
    expect(snapped.x).toBeCloseTo(-10)
    expect(snapped.y).toBeCloseTo(-10)
    expect(snapped).not.toEqual({ x: 0, y: 0 })
  })

  it('pointer ver van faces blijft vrij (geen knoop-snap)', () => {
    const walls = [
      wall({ id: 'h', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 10 }),
      wall({ id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, thickness: 10 }),
    ]
    // Junction (0,0) maar faces op ±5 — pointer 40 cm van faces
    const snapped = snapPointToWallFaces(walls, { x: 40, y: 40 }, WALL_FACE_SNAP_CM)
    expect(snapped).toEqual({ x: 40, y: 40 })
  })

  it('Ctrl/disabled: input ongewijzigd', () => {
    const walls = [wall({ a: { x: 0, y: 20 }, b: { x: 100, y: 20 }, thickness: 20 })]
    const point = { x: 50, y: 12 }
    expect(snapPointToWallFaces(walls, point, WALL_FACE_SNAP_CM, { disabled: true })).toEqual(point)
  })

  it('nok-tekenen: face-snap, niet junction/hartlijn', () => {
    const walls = [
      wall({ id: 'h', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 }),
      wall({ id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, thickness: 20 }),
    ]
    const snapped = snapDrawPointToWallFaces(walls, { x: -8, y: -8 })
    expect(snapped.x).toBeCloseTo(-10)
    expect(snapped.y).toBeCloseTo(-10)
    expect(snapped).not.toEqual({ x: 0, y: 0 })
  })

  it('nok-tekenen: H/V-lock houdt start-as, vrije as opnieuw op face', () => {
    const walls = [
      wall({ id: 'h1', a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20 }),
      wall({ id: 'v', a: { x: 80, y: 0 }, b: { x: 80, y: 100 }, thickness: 20 }),
    ]
    const start = snapDrawPointToWallFaces(walls, { x: 10, y: 8 })
    expect(start.y).toBeCloseTo(10)
    const end = snapDrawPointToWallFaces(
      walls,
      { x: 78, y: 60 },
      {
        axisAnchor: start,
        lockAxis: true,
      },
    )
    expect(end.y).toBeCloseTo(start.y)
    expect(end.x).toBeCloseTo(70)
  })

  it('maatlijn-flow: face-snap daarna Shift H/V-lock', () => {
    const walls = [
      wall({ id: 'h1', a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20 }),
      wall({ id: 'h2', a: { x: 0, y: 100 }, b: { x: 200, y: 100 }, thickness: 20 }),
    ]
    const start = snapPointToWallFaces(walls, { x: 10, y: 8 }, WALL_FACE_SNAP_CM)
    expect(start.y).toBeCloseTo(10)

    const rawEnd = snapPointToWallFaces(walls, { x: 150, y: 95 }, WALL_FACE_SNAP_CM)
    expect(rawEnd.y).toBeCloseTo(90)

    const locked = snapDrawWallEndpoint(start, rawEnd, true)
    expect(locked.x).toBe(rawEnd.x)
    expect(locked.y).toBe(start.y)
  })
})

describe('snapDakDrawPoint', () => {
  it('snapt naar binnen- én buitenface, niet alleen de buitenhoek', () => {
    const walls = [wall({ a: { x: 0, y: 20 }, b: { x: 100, y: 20 }, thickness: 20 })]
    const outer = snapDakDrawPoint({ x: 50, y: 12 }, { walls })
    const inner = snapDakDrawPoint({ x: 50, y: 28 }, { walls })
    expect(outer.y).toBeCloseTo(10)
    expect(inner.y).toBeCloseTo(30)
  })

  it('nok: snapt naar hoek (eindpunten) van andere nokken', () => {
    const walls = [wall({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 })]
    const ridges = [
      { a: { x: 40, y: 10 }, b: { x: 40, y: 80 } },
      { a: { x: 40, y: 80 }, b: { x: 90, y: 80 } },
    ]
    const snapped = snapDakDrawPoint({ x: 43, y: 78 }, { walls, ridges })
    expect(snapped.x).toBeCloseTo(40)
    expect(snapped.y).toBeCloseTo(80)
  })

  it('dakvlak: snapt naar hoek van een bestaand dakvlak', () => {
    const walls = [wall({ a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20 })]
    const roofRings = [
      [
        { x: 20, y: 10 },
        { x: 120, y: 10 },
        { x: 70, y: 90 },
      ],
    ]
    const snapped = snapDakDrawPoint({ x: 73, y: 87 }, { walls, roofRings })
    expect(snapped.x).toBeCloseTo(70)
    expect(snapped.y).toBeCloseTo(90)
  })

  it('trekt een bedekt punt naar de dichtstbijzijnde muurface', () => {
    const walls = [wall({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 })]
    const snapped = snapToNearestDakBoundary(walls, [], { x: 50, y: 80 })
    expect(snapped?.x).toBeCloseTo(50)
    expect(snapped?.y).toBeCloseTo(10)
  })

  it('dakvlak: krapper face-bereik dan gewone muur-snap', () => {
    const walls = [wall({ a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20 })]
    const mid = { x: 80, y: 10 + 12 }
    expect(snapPointToWallFaces(walls, mid, WALL_FACE_SNAP_CM).y).toBeCloseTo(10)
    expect(snapDakDrawPoint(mid, { walls })).toEqual(mid)
    const near = snapDakDrawPoint({ x: 80, y: 10 + 6 }, { walls })
    expect(near.y).toBeCloseTo(10)
    expect(DAK_FACE_SNAP_CM).toBeLessThan(WALL_FACE_SNAP_CM)
  })

  it('bedekt punt op een dakvlak-rand telt als toegestane landing', () => {
    const walls = [wall({ a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20 })]
    const roofRings = [
      [
        { x: 20, y: 10 },
        { x: 180, y: 10 },
        { x: 100, y: 90 },
      ],
    ]
    const clamped = snapToNearestDakBoundary(walls, [], { x: 100, y: 50 }, roofRings)
    expect(clamped).not.toBeNull()
    expect(isOnDakBoundary(walls, [], clamped!, roofRings)).toBe(true)
  })

  it('nok zonder dakvlak-ringen: geen snap naar een dakhoek', () => {
    const walls = [wall({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 })]
    const ridges = [{ a: { x: 10, y: 10 }, b: { x: 90, y: 10 } }]
    const roofRings = [
      [
        { x: 200, y: 200 },
        { x: 260, y: 200 },
        { x: 230, y: 250 },
      ],
    ]
    const snapped = snapDakDrawPoint({ x: 202, y: 198 }, { walls, ridges })
    expect(snapped).toEqual({ x: 202, y: 198 })
    const withRoof = snapDakDrawPoint({ x: 202, y: 198 }, { walls, ridges, roofRings })
    expect(withRoof).toEqual({ x: 200, y: 200 })
  })
})

describe('useFmlPreviewMeasure face-snap', () => {
  it('start én eind snappen naar faces (zonder resolvePoint-indirection)', () => {
    const walls = [
      wall({ id: 'h', a: { x: 0, y: 20 }, b: { x: 100, y: 20 }, thickness: 20 }),
      wall({ id: 'v', a: { x: 40, y: 0 }, b: { x: 40, y: 100 }, thickness: 20 }),
    ]

    const api = useFmlPreviewMeasure({
      hitTest: {
        clientToCm: (x, y) => ({ x, y }),
        hitTestJunctionAtCm: () => null,
      },
      hoveredJunctionId: ref(null),
      getWalls: () => walls,
      shiftPressed: ref(false),
      beforeBegin: () => {},
      getMode: () => 'tape',
      canPersist: () => false,
    })

    const start = api.resolveMeasureCm({ x: 50, y: 12 })
    expect(start.y).toBeCloseTo(10)

    const end = api.resolveMeasureCm({ x: 48, y: 50 }, { axisAnchor: start })
    expect(end.x).toBeCloseTo(50)
    expect(end.y).toBe(50)
  })
})
