import { describe, expect, it } from 'vitest'
import {
  pickPointInteriorCm,
  pickRoomInteriorCm,
  pointDeltaForInterior,
  roomSpanFromPoint,
  roomSpanFromWall,
  wallSlideDeltaForInterior,
} from '@/core/plan/precise-move-room-span'
import type { FloorArea, Wall } from '@/core/plan/types'

function hWall(
  id: string,
  y: number,
  x0 = 0,
  x1 = 400,
  thickness = 20,
): Wall {
  return {
    id,
    a: { x: x0, y },
    b: { x: x1, y },
    thickness,
    balance: 0.5,
    openings: [],
  }
}

function vWall(
  id: string,
  x: number,
  y0 = 0,
  y1 = 400,
  thickness = 20,
): Wall {
  return {
    id,
    a: { x, y: y0 },
    b: { x, y: y1 },
    thickness,
    balance: 0.5,
    openings: [],
  }
}

function area(id: string, poly: FloorArea['poly']): FloorArea {
  return {
    id,
    poly,
    color: '#fff',
    showAreaLabel: false,
  }
}

describe('precise-move-room-span', () => {
  /**
   * Horizontale muur y=0, dikte 20 → left face y=-10, right face y=+10.
   * Kamer noord (left): binnen 350. Kamer zuid (right): binnen 420.
   */
  const midWall = hWall('mid', 0)
  const northRoom = area('north', [
    { x: 0, y: -10 },
    { x: 400, y: -10 },
    { x: 400, y: -360 },
    { x: 0, y: -360 },
  ])
  const southRoom = area('south', [
    { x: 0, y: 10 },
    { x: 400, y: 10 },
    { x: 400, y: 430 },
    { x: 0, y: 430 },
  ])

  it('rechthoek: hover noord = 350, hover zuid = 420', () => {
    const north = pickRoomInteriorCm(midWall, [northRoom, southRoom], { x: 0, y: -1 })
    expect(north).not.toBeNull()
    expect(north!.interiorCm).toBeCloseTo(350, 5)

    const south = pickRoomInteriorCm(midWall, [northRoom, southRoom], { x: 0, y: 1 })
    expect(south).not.toBeNull()
    expect(south!.interiorCm).toBeCloseTo(420, 5)
  })

  it('gevel-fallback: geen kamer aan hover-zijde → andere kamer', () => {
    const pick = pickRoomInteriorCm(midWall, [southRoom], { x: 0, y: -1 })
    expect(pick).not.toBeNull()
    expect(pick!.interiorCm).toBeCloseTo(420, 5)
    expect(pick!.intoUnit.y).toBeGreaterThan(0)
  })

  it('L-lokaal: dichtstbijzijnde evenwijdige rand (niet de verre vleugel)', () => {
    // Trap: rechts diepte 120, links diepte 390. Overlap op muurspan -> min = 120.
    const lRoom = area('L', [
      { x: 0, y: -10 },
      { x: 400, y: -10 },
      { x: 400, y: -130 },
      { x: 250, y: -130 },
      { x: 250, y: -400 },
      { x: 0, y: -400 },
    ])
    const pick = pickRoomInteriorCm(midWall, [lRoom], { x: 0, y: -1 })
    expect(pick).not.toBeNull()
    expect(pick!.interiorCm).toBeCloseTo(120, 5)
  })

  it('koof: korte evenwijdige stub verliest van volle tegenwand', () => {
    // Verticale gevel x=0; kamer rechts. Koof-face op x=70 (y=20..100), volle wand x=430.
    const left = vWall('left', 0, 0, 400)
    const room = area('room', [
      { x: 10, y: 0 },
      { x: 430, y: 0 },
      { x: 430, y: 400 },
      { x: 10, y: 400 },
      { x: 10, y: 100 },
      { x: 70, y: 100 },
      { x: 70, y: 20 },
      { x: 10, y: 20 },
    ])
    const pick = pickRoomInteriorCm(left, [room], { x: 1, y: 0 })
    expect(pick).not.toBeNull()
    // Sterke overlap met volle achterwand (~420), niet de koof op ~60.
    expect(pick!.interiorCm).toBeCloseTo(420, 5)
    expect(pick!.spanOrigin).toBeDefined()
  })

    it('groter typen aan −slideDir-zijde → positieve delta (muur de andere kant op)', () => {
    const intoUnit = { x: 0, y: -1 }
    const slideDir = { x: 0, y: 1 }
    // Kamer noord: groter typen → muur naar zuid (+slideDir).
    expect(wallSlideDeltaForInterior(350, 400, intoUnit, slideDir)).toBeCloseTo(50, 6)
    // Kamer zuid: groter typen → muur naar noord (−slideDir).
    expect(wallSlideDeltaForInterior(420, 500, { x: 0, y: 1 }, slideDir)).toBeCloseTo(-80, 6)
  })

  it('null zonder kamer en zonder tegenmuur', () => {
    expect(pickRoomInteriorCm(midWall, [], { x: 0, y: -1 })).toBeNull()
  })

  it('wall-face-fallback: evenwijdige tegenmuur zonder areas', () => {
    const south = hWall('south', 370)
    // mid right face y=10, south left face: wall at 370, left normal (0,-1), plus=10 → y=360
    // afstand 10 → 360 = 350
    const pick = pickRoomInteriorCm(midWall, [], { x: 0, y: 1 }, [midWall, south])
    expect(pick).not.toBeNull()
    expect(pick!.interiorCm).toBeCloseTo(350, 4)
  })

  it('verticale muur: links/rechts binnenmaat', () => {
    const wall = vWall('v', 0)
    // a=(0,0) b=(0,400), dir=(0,1), leftNormal=(1,0) → left = +X
    const east = area('east', [
      { x: 10, y: 0 },
      { x: 360, y: 0 },
      { x: 360, y: 400 },
      { x: 10, y: 400 },
    ])
    const west = area('west', [
      { x: -10, y: 0 },
      { x: -430, y: 0 },
      { x: -430, y: 400 },
      { x: -10, y: 400 },
    ])
    const right = pickRoomInteriorCm(wall, [east, west], { x: 1, y: 0 })
    expect(right!.interiorCm).toBeCloseTo(350, 5)
    const left = pickRoomInteriorCm(wall, [east, west], { x: -1, y: 0 })
    expect(left!.interiorCm).toBeCloseTo(420, 5)
  })

  it('punt-span: as-lock + lokale diepte; kleiner typen schuift de kamer in', () => {
    const room = area('room', [
      { x: 0, y: 0 },
      { x: 350, y: 0 },
      { x: 350, y: 300 },
      { x: 0, y: 300 },
    ])
    const origin = { x: 0, y: 150 }
    const pick = pickPointInteriorCm(origin, [room], { x: 40, y: 5 })
    expect(pick).not.toBeNull()
    expect(pick!.interiorCm).toBeCloseTo(350, 5)
    expect(pick!.intoUnit.x).toBeGreaterThan(0)
    const delta = pointDeltaForInterior(pick!.interiorCm, 300, pick!.intoUnit)
    expect(delta.x).toBeCloseTo(50, 5)
    expect(delta.y).toBeCloseTo(0, 5)
  })

  it('roomSpanFromWall: mid face → kamer in', () => {
    const pick = pickRoomInteriorCm(midWall, [southRoom], { x: 0, y: 1 })
    expect(pick).not.toBeNull()
    const span = roomSpanFromWall(midWall, pick!.intoUnit, pick!.interiorCm)
    expect(span).not.toBeNull()
    // Right face mid y=+10, span 420 zuid → b.y = 430
    expect(span!.a.y).toBeCloseTo(10, 5)
    expect(span!.b.y).toBeCloseTo(430, 5)
    expect((span!.a.x + span!.b.x) / 2).toBeCloseTo(200, 5)
  })

  it('roomSpanFromPoint: origin → intoUnit × length', () => {
    const span = roomSpanFromPoint({ x: 10, y: 20 }, { x: 1, y: 0 }, 100)
    expect(span).not.toBeNull()
    expect(span!.a).toEqual({ x: 10, y: 20 })
    expect(span!.b.x).toBeCloseTo(110, 5)
    expect(span!.b.y).toBeCloseTo(20, 5)
  })
})
