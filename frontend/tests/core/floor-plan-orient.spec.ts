import { describe, expect, it } from 'vitest'
import {
  applyFloorOrientFromCanonical,
  applyFloorOrientOp,
  composeFloorOrient,
  defaultFloorOrient,
  mirrorFloorPlanVertical,
  rotateFloorPlan90,
  type FloorOrientState,
} from '@/core/fml/floor-plan-orient'
import { resolveHingeAtStart, resolveSwingSign } from '@/core/fml/door-swing-symbol'
import type { FloorPlan } from '@/core/fml/types'

function samplePlan(): FloorPlan {
  return {
    name: 'Orient',
    floors: [
      {
        name: 'BG',
        level: 0,
        height: 280,
        walls: [
          {
            id: 'h',
            a: { x: 10, y: 20 },
            b: { x: 110, y: 20 },
            thickness: 15,
            balance: 0.3,
            openings: [
              {
                refid: 'door',
                t: 0.4,
                width: 90,
                type: 'door',
                mirrored: [0, 0],
              },
            ],
          },
          {
            id: 'v',
            a: { x: 110, y: 20 },
            b: { x: 110, y: 120 },
            thickness: 10,
            balance: 0.7,
            c: { x: 105, y: 70 },
            openings: [
              {
                refid: 'win',
                t: 0.25,
                width: 60,
                type: 'window',
                mirrored: [1, 1],
              },
            ],
          },
          {
            id: 'diag',
            a: { x: 0, y: 0 },
            b: { x: 40, y: 30 },
            thickness: 12,
            openings: [],
          },
        ],
        items: [
          {
            refid: 'item',
            x: 50,
            y: 60,
            width: 40,
            height: 40,
            rotation: 30,
            mirrored: [0, 0],
          },
        ],
      },
    ],
  }
}

function nearlyEqual(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps
}

function expectPoint(actual: { x: number; y: number }, expected: { x: number; y: number }): void {
  expect(nearlyEqual(actual.x, expected.x)).toBe(true)
  expect(nearlyEqual(actual.y, expected.y)).toBe(true)
}

describe('mirrorFloorPlanVertical', () => {
  it('spiegelt om x=0; t blijft; mirrored[1] + balance om; (0,0) vast', () => {
    const plan = samplePlan()
    const next = mirrorFloorPlanVertical(plan)
    const floor = next.floors[0]
    expectPoint(floor.walls[0].a, { x: -10, y: 20 })
    expectPoint(floor.walls[0].b, { x: -110, y: 20 })
    expect(floor.walls[0].openings[0].t).toBe(0.4)
    expect(floor.walls[0].openings[0].mirrored).toEqual([0, 1])
    expect(floor.walls[0].balance).toBeCloseTo(0.7)
    expectPoint(floor.walls[1].a, { x: -110, y: 20 })
    expectPoint(floor.walls[1].b, { x: -110, y: 120 })
    expectPoint(floor.walls[1].c!, { x: -105, y: 70 })
    expect(floor.walls[1].openings[0].t).toBe(0.25)
    expect(floor.walls[1].openings[0].mirrored).toEqual([1, 0])
    expect(floor.walls[1].balance).toBeCloseTo(0.3)
    expectPoint(floor.walls[2].a, { x: 0, y: 0 })
    expectPoint(floor.walls[2].b, { x: -40, y: 30 })
    expect(floor.items![0].x).toBe(-50)
    expect(floor.items![0].y).toBe(60)
    expect(floor.items![0].rotation).toBe(-30)
    expect(floor.items![0].mirrored).toEqual([1, 0])
  })

  it('twee keer spiegelen = identiteit', () => {
    const plan = samplePlan()
    const twice = mirrorFloorPlanVertical(mirrorFloorPlanVertical(plan))
    expect(twice.floors[0].walls[0].a).toEqual(plan.floors[0].walls[0].a)
    expect(twice.floors[0].walls[0].b).toEqual(plan.floors[0].walls[0].b)
    expect(twice.floors[0].walls[0].balance).toBe(plan.floors[0].walls[0].balance)
    expect(twice.floors[0].walls[0].openings[0].mirrored).toEqual(
      plan.floors[0].walls[0].openings[0].mirrored,
    )
    expect(twice.floors[0].items![0].rotation).toBe(30)
    expect(twice.floors[0].items![0].mirrored).toEqual([0, 0])
  })

  it('deur: scharnier-einde blijft; zwaai-flag flipped', () => {
    const plan = samplePlan()
    const door = plan.floors[0].walls[0].openings[0]
    expect(resolveHingeAtStart(door.mirrored)).toBe(true)
    expect(resolveSwingSign(door.mirrored)).toBe(-1)
    const next = mirrorFloorPlanVertical(plan)
    const nextDoor = next.floors[0].walls[0].openings[0]
    expect(resolveHingeAtStart(nextDoor.mirrored)).toBe(true)
    expect(resolveSwingSign(nextDoor.mirrored)).toBe(1)
  })
})

describe('rotateFloorPlan90', () => {
  it('CW om (0,0): (1,0) → (0,1); mirrored/balance ongemoeid', () => {
    const plan: FloorPlan = {
      name: 'R',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'w',
              a: { x: 1, y: 0 },
              b: { x: 2, y: 0 },
              thickness: 10,
              balance: 0.25,
              openings: [{ refid: 'd', t: 0.5, width: 80, type: 'door', mirrored: [0, 1] }],
            },
          ],
          items: [{ refid: 'i', x: 1, y: 0, width: 10, height: 10, rotation: 15 }],
        },
      ],
    }
    const next = rotateFloorPlan90(plan, { x: 0, y: 0 }, 'cw')
    expectPoint(next.floors[0].walls[0].a, { x: 0, y: 1 })
    expectPoint(next.floors[0].walls[0].b, { x: 0, y: 2 })
    expect(next.floors[0].walls[0].balance).toBe(0.25)
    expect(next.floors[0].walls[0].openings[0].mirrored).toEqual([0, 1])
    expect(next.floors[0].walls[0].openings[0].t).toBe(0.5)
    expectPoint({ x: next.floors[0].items![0].x, y: next.floors[0].items![0].y }, { x: 0, y: 1 })
    expect(next.floors[0].items![0].rotation).toBe(105)
  })

  it('4× CW = identiteit; CW+CCW = identiteit', () => {
    const plan = samplePlan()
    let next = plan
    for (let i = 0; i < 4; i++) next = rotateFloorPlan90(next, { x: 0, y: 0 }, 'cw')
    expect(next.floors[0].walls[0].a).toEqual(plan.floors[0].walls[0].a)
    expect(next.floors[0].walls[0].b).toEqual(plan.floors[0].walls[0].b)
    expect(next.floors[0].items![0].rotation).toBe(30)

    const roundTrip = rotateFloorPlan90(
      rotateFloorPlan90(plan, { x: 0, y: 0 }, 'cw'),
      { x: 0, y: 0 },
      'ccw',
    )
    expect(roundTrip.floors[0].walls[0].a).toEqual(plan.floors[0].walls[0].a)
    expect(roundTrip.floors[0].walls[2].b).toEqual(plan.floors[0].walls[2].b)
  })
})

describe('composeFloorOrient / applyFloorOrientFromCanonical', () => {
  it('flip-dan-roteer: visueel CW = canoniek CCW', () => {
    let state = defaultFloorOrient()
    state = composeFloorOrient(state, 'flipX')
    state = composeFloorOrient(state, 'rotCw')
    expect(state).toEqual({ quarterTurnsCw: 3, flipX: true })

    const plan = samplePlan()
    const incremental = applyFloorOrientOp(applyFloorOrientOp(plan, 'flipX'), 'rotCw')
    const fromCanonical = applyFloorOrientFromCanonical(plan, state)
    expect(fromCanonical.floors[0].walls[0].a).toEqual(incremental.floors[0].walls[0].a)
    expect(fromCanonical.floors[0].walls[0].b).toEqual(incremental.floors[0].walls[0].b)
    expect(fromCanonical.floors[0].walls[0].openings[0].mirrored).toEqual(
      incremental.floors[0].walls[0].openings[0].mirrored,
    )
    expect(fromCanonical.floors[0].items![0].x).toBe(incremental.floors[0].items![0].x)
    expect(fromCanonical.floors[0].items![0].y).toBe(incremental.floors[0].items![0].y)
  })

  it('alle D4-ops: incremental knoppen = fromCanonical', () => {
    const ops = ['flipX', 'rotCw', 'rotCcw', 'rotCw', 'flipX', 'rotCcw'] as const
    let state: FloorOrientState = defaultFloorOrient()
    let incremental = samplePlan()
    for (const op of ops) {
      state = composeFloorOrient(state, op)
      incremental = applyFloorOrientOp(incremental, op)
    }
    const fromCanonical = applyFloorOrientFromCanonical(samplePlan(), state)
    for (let i = 0; i < incremental.floors[0].walls.length; i++) {
      expect(fromCanonical.floors[0].walls[i].a).toEqual(incremental.floors[0].walls[i].a)
      expect(fromCanonical.floors[0].walls[i].b).toEqual(incremental.floors[0].walls[i].b)
      expect(fromCanonical.floors[0].walls[i].balance).toBe(incremental.floors[0].walls[i].balance)
    }
  })

  it('floorIndex beperkt tot één verdieping', () => {
    const plan: FloorPlan = {
      name: 'Multi',
      floors: [
        samplePlan().floors[0],
        {
          name: '1e',
          level: 1,
          height: 280,
          walls: [
            {
              id: 'w1',
              a: { x: 5, y: 5 },
              b: { x: 15, y: 5 },
              thickness: 10,
              openings: [],
            },
          ],
        },
      ],
    }
    const next = rotateFloorPlan90(plan, { x: 0, y: 0 }, 'cw', 0)
    expectPoint(next.floors[0].walls[0].a, { x: -20, y: 10 })
    expect(next.floors[1].walls[0].a).toEqual({ x: 5, y: 5 })
  })
})
