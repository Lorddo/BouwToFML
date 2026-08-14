import { describe, expect, it } from 'vitest'
import {
  applyNulpunt,
  reapplyNulpuntImageCm,
  translateFloorPlan,
} from '@/core/fml/translate-floor-plan'
import type { FloorPlan } from '@/core/fml/types'

function samplePlan(): FloorPlan {
  return {
    name: 'Test',
    floors: [
      {
        name: 'BG',
        level: 0,
        height: 280,
        walls: [
          {
            id: 'w1',
            a: { x: 10, y: 20 },
            b: { x: 110, y: 20 },
            thickness: 15,
            openings: [{ refid: 'door', t: 0.5, width: 90, type: 'door' }],
          },
          {
            id: 'w2',
            a: { x: 110, y: 20 },
            b: { x: 110, y: 120 },
            c: { x: 105, y: 70 },
            thickness: 10,
            openings: [],
          },
        ],
        items: [{ refid: 'item', x: 50, y: 60, width: 40, height: 40 }],
      },
    ],
  }
}

describe('translateFloorPlan / applyNulpunt', () => {
  it('translateFloorPlan verschuift muren a/b/c en items; openings t blijft', () => {
    const plan = samplePlan()
    const next = translateFloorPlan(plan, -10, -20)
    const floor = next.floors[0]
    expect(floor.walls[0].a).toEqual({ x: 0, y: 0 })
    expect(floor.walls[0].b).toEqual({ x: 100, y: 0 })
    expect(floor.walls[0].openings[0].t).toBe(0.5)
    expect(floor.walls[1].c).toEqual({ x: 95, y: 50 })
    expect(floor.items![0].x).toBe(40)
    expect(floor.items![0].y).toBe(40)
  })

  it('applyNulpunt zet P op (0,0) en houdt wall+origin invariant', () => {
    const plan = samplePlan()
    const layout = { origin: { x: 200, y: 300 }, pxPerMmX: 2, pxPerMmY: 2 }
    const wallImageBefore = {
      x: plan.floors[0].walls[0].a.x + layout.origin.x,
      y: plan.floors[0].walls[0].a.y + layout.origin.y,
    }
    const p = { x: 10, y: 20 }
    const applied = applyNulpunt(plan, layout, p)
    expect(applied.plan.floors[0].walls[0].a).toEqual({ x: 0, y: 0 })
    expect(applied.layout.origin).toEqual({ x: 210, y: 320 })
    expect(applied.nulpuntImageCm).toEqual({ x: 210, y: 320 })
    const wallImageAfter = {
      x: applied.plan.floors[0].walls[0].a.x + applied.layout.origin.x,
      y: applied.plan.floors[0].walls[0].a.y + applied.layout.origin.y,
    }
    expect(wallImageAfter).toEqual(wallImageBefore)
  })

  it('reapplyNulpuntImageCm herplaatst nulpunt na bbox-generate', () => {
    // Verse generate: muren relatief t.o.v. bbox-min origin (100, 200)
    const generated: FloorPlan = {
      name: 'Gen',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'w1',
              a: { x: 0, y: 0 },
              b: { x: 50, y: 0 },
              thickness: 10,
              openings: [],
            },
          ],
        },
      ],
    }
    const baseLayout = { origin: { x: 100, y: 200 }, pxPerMmX: 1, pxPerMmY: 1 }
    // Gebruiker had nulpunt op image (150, 250) gezet (= FML (50,50) t.o.v. oude origin)
    const nulpuntImageCm = { x: 150, y: 250 }
    const applied = reapplyNulpuntImageCm(generated, baseLayout, nulpuntImageCm)
    expect(applied.layout.origin).toEqual({ x: 150, y: 250 })
    expect(applied.plan.floors[0].walls[0].a).toEqual({ x: -50, y: -50 })
    // Image-positie van muur blijft (100,200)
    expect(applied.plan.floors[0].walls[0].a.x + applied.layout.origin.x).toBe(100)
    expect(applied.plan.floors[0].walls[0].a.y + applied.layout.origin.y).toBe(200)
  })

  it('applyNulpunt vertaalt alleen de gekozen floor-index', () => {
    const plan: FloorPlan = {
      name: 'Multi',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'w0',
              a: { x: 10, y: 20 },
              b: { x: 110, y: 20 },
              thickness: 15,
              openings: [],
            },
          ],
          items: [],
        },
        {
          name: '1e',
          level: 1,
          height: 280,
          walls: [
            {
              id: 'w1',
              a: { x: 50, y: 60 },
              b: { x: 150, y: 60 },
              thickness: 15,
              openings: [],
            },
          ],
          items: [],
        },
      ],
    }
    const layout = { origin: { x: 0, y: 0 }, pxPerMmX: 1, pxPerMmY: 1 }
    const applied = applyNulpunt(plan, layout, { x: 10, y: 20 }, 0)
    expect(applied.plan.floors[0].walls[0].a).toEqual({ x: 0, y: 0 })
    expect(applied.plan.floors[1].walls[0].a).toEqual({ x: 50, y: 60 })
    expect(applied.layout.origin).toEqual({ x: 10, y: 20 })
  })
})
