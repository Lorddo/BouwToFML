import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { displayAreaLabel } from '@/core/fml/roomtype-catalog'
import type { FloorPlan } from '@/core/fml/types'

const KINDERDIJK = resolve(
  __dirname,
  '../../../examples/FML(current)/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam.json.fml',
)

describe('FML areas/surfaces roundtrip', () => {
  it('Kinderdijkstraat: 12 areas + 1 balkon-surface', () => {
    const { plan } = importFmlV3(JSON.parse(readFileSync(KINDERDIJK, 'utf8')))
    const floor = plan.floors[0]
    expect(floor.areas?.length).toBe(12)
    expect(floor.surfaces?.length).toBe(1)

    const kast = floor.areas?.find((a) => a.role === 10 && a.customName === 'MK')
    expect(kast).toBeTruthy()
    expect(displayAreaLabel(kast!)).toBe('MK')

    const balkon = floor.surfaces?.[0]
    expect(balkon?.role).toBe(13)
    expect(balkon?.name?.toLowerCase()).toContain('balkon')
    expect(balkon?.poly.length).toBeGreaterThanOrEqual(3)
  })

  it('buildFmlV3 → importFmlV3 behoudt role/name/customName/poly', () => {
    const plan: FloorPlan = {
      name: 'Areas-test',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'w1',
              a: { x: 0, y: 0 },
              b: { x: 400, y: 0 },
              thickness: 10,
              balance: 0.5,
              c: null,
              openings: [],
            },
          ],
          areas: [
            {
              id: 'a1',
              poly: [
                { x: 10, y: 10 },
                { x: 110, y: 10 },
                { x: 110, y: 90 },
                { x: 10, y: 90 },
              ],
              role: 2,
              name: 'Keuken',
              customName: 'Kookhoek',
              color: '#CEEDF3',
              showAreaLabel: true,
              name_x: 5,
              name_y: -3,
            },
          ],
          surfaces: [
            {
              id: 's1',
              poly: [
                { x: 200, y: 200, z: 0 },
                { x: 280, y: 200, z: 0 },
                { x: 280, y: 250, z: 0 },
                { x: 200, y: 250, z: 0 },
              ],
              role: 13,
              name: 'Balkon',
              color: '#A6A695',
              showAreaLabel: true,
            },
          ],
        },
      ],
    }

    const parsed = importFmlV3(buildFmlV3(plan))
    const floor = parsed.plan.floors[0]
    expect(floor.areas).toHaveLength(1)
    expect(floor.surfaces).toHaveLength(1)
    expect(floor.areas![0].role).toBe(2)
    expect(floor.areas![0].name).toBe('Keuken')
    expect(floor.areas![0].customName).toBe('Kookhoek')
    expect(floor.areas![0].color.toUpperCase()).toBe('#CEEDF3')
    expect(floor.areas![0].poly).toHaveLength(4)
    expect(floor.areas![0].name_x).toBe(5)
    expect(floor.surfaces![0].role).toBe(13)
    expect(floor.surfaces![0].poly[0]).toMatchObject({ x: 200, y: 200 })
  })

  it('Ctrl+klik-kleur blijft op area; settings-default wordt niet meegeschreven in FML', () => {
    const plan: FloorPlan = {
      name: 'Color-instance',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [],
          areas: [
            {
              id: 'a1',
              poly: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 },
              ],
              role: 0,
              name: 'Woonkamer',
              color: '#123456',
              showAreaLabel: true,
            },
          ],
        },
      ],
    }
    const raw = JSON.parse(buildFmlV3(plan))
    expect(raw.floors[0].designs[0].areas[0].color.toUpperCase()).toBe('#123456')
  })
})
