import { describe, expect, it } from 'vitest'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import {
  applyJunctionSanitizeToPlan,
  materializeWallJunctions,
} from '@/core/fml/materialize-wall-junctions'
import { wallsSanitizeChanged } from '@/core/fml/sanitize-fml-walls'
import type { FloorPlan, Wall } from '@/core/fml/types'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  openings: Wall['openings'] = [],
): Wall {
  return { id, a, b, thickness: 10, balance: 0.5, openings }
}

describe('materializeWallJunctions', () => {
  it('T: knipt host, houdt oude id op eerste helft', () => {
    const out = materializeWallJunctions([
      wall('host', { x: 0, y: 0 }, { x: 100, y: 0 }),
      wall('branch', { x: 40, y: 0 }, { x: 40, y: 30 }),
    ])
    expect(out.some((item) => item.id === 'host')).toBe(true)
    expect(out.some((item) => item.id.startsWith('split-host-'))).toBe(true)
    const hostPieces = out.filter((item) => Math.abs(item.a.y) < 0.01 && Math.abs(item.b.y) < 0.01)
    expect(hostPieces).toHaveLength(2)
  })

  it('X: knipt beide muren op de kruising', () => {
    const out = materializeWallJunctions([
      wall('h', { x: 0, y: 40 }, { x: 100, y: 40 }),
      wall('v', { x: 50, y: 0 }, { x: 50, y: 80 }),
    ])
    expect(out).toHaveLength(4)
    expect(out.some((item) => item.id === 'h')).toBe(true)
    expect(out.some((item) => item.id === 'v')).toBe(true)
    expect(out.filter((item) => item.id.startsWith('split-host-'))).toHaveLength(2)
  })

  it('werkt op niet-H/V T', () => {
    const out = materializeWallJunctions([
      wall('diag', { x: 0, y: 0 }, { x: 80, y: 60 }),
      wall('stub', { x: 40, y: 30 }, { x: 10, y: 50 }),
    ])
    expect(out.length).toBeGreaterThan(2)
    expect(out.some((item) => item.id === 'diag')).toBe(true)
    expect(out.some((item) => item.id.startsWith('split-host-'))).toBe(true)
  })

  it('tweede run is idempotent', () => {
    const once = materializeWallJunctions([
      wall('west', { x: 0, y: 0 }, { x: 0, y: 100 }),
      wall('inner', { x: 0, y: 50 }, { x: 80, y: 50 }),
    ])
    const twice = materializeWallJunctions(once)
    expect(twice).toBe(once)
    expect(wallsSanitizeChanged(once, twice)).toBe(false)
  })

  it('az/bz worden gesplitst op de knip', () => {
    const host = wall('host', { x: 0, y: 0 }, { x: 100, y: 0 })
    host.extras = { az: { z: 0, h: 200 }, bz: { z: 0, h: 400 } }
    const out = materializeWallJunctions([host, wall('branch', { x: 50, y: 0 }, { x: 50, y: 20 })])
    const first = out.find((item) => item.id === 'host')!
    const second = out.find((item) => item.id.startsWith('split-host-'))!
    expect((first.extras?.bz as { h: number }).h).toBe(300)
    expect((second.extras?.az as { h: number }).h).toBe(300)
    expect((first.extras?.az as { h: number }).h).toBe(200)
    expect((second.extras?.bz as { h: number }).h).toBe(400)
  })
})

describe('applyJunctionSanitizeToPlan', () => {
  it('loopt alle floors + designs; no-op houdt dezelfde referentie', () => {
    const plan: FloorPlan = {
      name: 't',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 260,
          walls: [
            wall('a', { x: 0, y: 0 }, { x: 40, y: 0 }),
            wall('b', { x: 40, y: 0 }, { x: 40, y: 40 }),
          ],
        },
      ],
    }
    expect(applyJunctionSanitizeToPlan(plan)).toBe(plan)
  })

  it('knipt T op inactive design én plat walls', () => {
    const tWalls = [
      wall('host', { x: 0, y: 0 }, { x: 100, y: 0 }),
      wall('branch', { x: 50, y: 0 }, { x: 50, y: 40 }),
    ]
    const plan: FloorPlan = {
      name: 't',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 260,
          walls: tWalls,
          designs: [
            { name: 'A', walls: tWalls },
            {
              name: 'B',
              walls: [
                wall('h2', { x: 0, y: 0 }, { x: 80, y: 0 }),
                wall('v2', { x: 40, y: 0 }, { x: 40, y: 20 }),
              ],
            },
          ],
          activeDesignIndex: 0,
        },
      ],
    }
    const next = applyJunctionSanitizeToPlan(plan)
    expect(next).not.toBe(plan)
    expect(next.floors[0].walls.length).toBeGreaterThan(2)
    expect(next.floors[0].designs?.[1].walls.length).toBeGreaterThan(2)
  })

  it('FmltestJunction via importFmlV3: knipt oost- en westgevel op y=300', () => {
    const { plan } = importFmlV3({
      name: 'Fmltest',
      floors: [
        {
          name: 'Begane grond',
          level: 0,
          height: 280,
          designs: [
            {
              name: 'Begane grond',
              walls: [
                {
                  guid: '11111111-2222-4333-8444-555555555551',
                  a: { x: 0, y: 0 },
                  b: { x: 800, y: 0 },
                  thickness: 20,
                  openings: [],
                },
                {
                  guid: 'wall-4cd9f36b',
                  a: { x: 800, y: 0 },
                  b: { x: 800, y: 600 },
                  thickness: 20,
                  openings: [
                    {
                      refid: 'win',
                      t: 0.5,
                      type: 'window',
                      width: 140,
                    },
                  ],
                },
                {
                  guid: 'wall-voorgevel',
                  a: { x: 800, y: 600 },
                  b: { x: 0, y: 600 },
                  thickness: 20,
                  openings: [],
                },
                {
                  guid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1-G1',
                  a: { x: 0, y: 600 },
                  b: { x: 0, y: 0 },
                  thickness: 20,
                  openings: [],
                },
                {
                  guid: 'split-host-ef54b8c6',
                  a: { x: 0, y: 300 },
                  b: { x: 800, y: 300 },
                  thickness: 10,
                  openings: [],
                },
              ],
            },
          ],
        },
      ],
    })
    const next = applyJunctionSanitizeToPlan(plan)
    const walls = next.floors[0].walls
    const eastPieces = walls.filter(
      (item) => Math.abs(item.a.x - 800) < 0.01 && Math.abs(item.b.x - 800) < 0.01,
    )
    const westPieces = walls.filter(
      (item) => Math.abs(item.a.x) < 0.01 && Math.abs(item.b.x) < 0.01,
    )
    expect(eastPieces).toHaveLength(2)
    expect(westPieces).toHaveLength(2)
    expect(eastPieces.some((item) => item.id === 'wall-4cd9f36b')).toBe(true)
    expect(westPieces.some((item) => item.id === 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1-G1')).toBe(
      true,
    )
    expect(walls.filter((item) => item.id.startsWith('split-host-')).length).toBeGreaterThanOrEqual(
      2,
    )
    const eastWindow = eastPieces.flatMap((item) => item.openings)
    expect(eastWindow).toHaveLength(1)
    const host = eastPieces.find((item) => item.openings.length > 0)!
    const t = host.openings[0].t
    const y = host.a.y + t * (host.b.y - host.a.y)
    expect(y).toBeCloseTo(300, 5)
  })
})
