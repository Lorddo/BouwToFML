import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@/core/fml/types'
import { seedViewerDefaultsFromPlan } from '@/core/fml/viewer-session-defaults'

describe('seedViewerDefaultsFromPlan', () => {
  it('leest floor.height en modus van openings', () => {
    const plan: FloorPlan = {
      name: 't',
      source: { settings: { wallHeight: 300 } },
      floors: [
        {
          name: 'bg',
          level: 0,
          height: 275,
          walls: [
            {
              id: 'w1',
              a: { x: 0, y: 0 },
              b: { x: 10, y: 0 },
              thickness: 20,
              openings: [
                { type: 'door', refid: 'd', t: 0.3, width: 90, z_height: 220 },
                { type: 'door', refid: 'd', t: 0.7, width: 90, z_height: 220 },
                {
                  type: 'window',
                  refid: 'w',
                  t: 0.5,
                  width: 100,
                  z: 70,
                  z_height: 150,
                  bovenlicht: true,
                  bovenlichtHeightCm: 40,
                  bovenlichtGapCm: 10,
                },
              ],
            },
          ],
        },
      ],
    }
    const defaults = seedViewerDefaultsFromPlan(plan, 0)
    expect(defaults.wallHeightCm).toBe(275)
    expect(defaults.doorHeightCm).toBe(220)
    expect(defaults.windowHeightCm).toBe(150)
    expect(defaults.windowSillZCm).toBe(70)
    expect(defaults.windowBovenlichtDefault).toBe(true)
    expect(defaults.bovenlichtHeightCm).toBe(40)
    expect(defaults.bovenlichtGapCm).toBe(10)
  })

  it('floorOnly leest alleen die verdieping', () => {
    const plan: FloorPlan = {
      name: 't',
      floors: [
        {
          name: 'bg',
          level: 0,
          height: 260,
          walls: [
            {
              id: 'w0',
              a: { x: 0, y: 0 },
              b: { x: 10, y: 0 },
              thickness: 20,
              openings: [{ type: 'door', refid: 'd', t: 0.5, width: 90, z_height: 200 }],
            },
          ],
        },
        {
          name: '1e',
          level: 1,
          height: 300,
          walls: [
            {
              id: 'w1',
              a: { x: 0, y: 0 },
              b: { x: 10, y: 0 },
              thickness: 20,
              openings: [{ type: 'door', refid: 'd', t: 0.5, width: 90, z_height: 230 }],
            },
          ],
        },
      ],
    }
    const floor1 = seedViewerDefaultsFromPlan(plan, 1, { floorOnly: true })
    expect(floor1.wallHeightCm).toBe(300)
    expect(floor1.doorHeightCm).toBe(230)
  })
})
