import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { Wall } from '@/core/fml/types'
import { snapDrawWallEndpoint } from '@/ui/components/fml-preview-junction-snap'
import {
  snapPointToWallFaces,
  wallFaceSegments,
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
