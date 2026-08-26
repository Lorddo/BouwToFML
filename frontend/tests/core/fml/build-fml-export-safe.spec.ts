import { describe, expect, it } from 'vitest'
import { buildFmlV3, maxWallTopHOnFloor } from '@/core/fml/buildFmlV3'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { setElevationViewDrawing } from '@/core/fml/elevation-views'
import { setNokThicknessCm, setSlabThicknessCm } from '@/core/fml/floor-stack'
import {
  makeRoofSurface,
  markRoofSurfaceManual,
  setRidgeSurfacesOnFloor,
} from '@/core/fml/roof-planes'
import { markWallAsRidge, ridgeEndpointExtras, setRidgeWallsOnFloor } from '@/core/fml/ridge-walls'
import type { Wall } from '@/core/fml/types'

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }, h = 280): Wall {
  return {
    id,
    a,
    b,
    thickness: 20,
    openings: [],
    extras: { az: { z: 0, h }, bz: { z: 0, h } },
  }
}

describe('buildFmlV3 Floorplanner-safe export', () => {
  it('stript elevationViews / floorStack / elevationProjection uit settings', () => {
    let plan = createEmptyFloorPlan({ name: 'Export' })
    plan.floors[0].walls = [wall('w1', { x: 0, y: 0 }, { x: 100, y: 0 })]
    plan = setElevationViewDrawing(plan, 'G1', {
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      rotation: 0,
      url: 'data:image/png;base64,aaaa',
      alpha: 50,
    })
    plan = setNokThicknessCm(plan, 30)
    plan = setSlabThicknessCm(plan, 0, 20)

    const raw = JSON.parse(buildFmlV3(plan))
    expect(raw.settings.elevationViews).toBeUndefined()
    expect(raw.settings.elevationProjection).toBeUndefined()
    expect(raw.settings.floorStack).toBeUndefined()
    // In-memory plan behoudt gevel-onderlegger.
    expect(plan.source?.settings?.elevationViews).toBeTruthy()
  })

  it('stript data:/blob: plattegrond-drawing.url; houdt layout; laat https staan', () => {
    const plan = createEmptyFloorPlan({ name: 'Underlay' })
    plan.floors[0].walls = [wall('w1', { x: 0, y: 0 }, { x: 100, y: 0 })]
    plan.floors[0].drawing = {
      x: 10,
      y: 20,
      width: 800,
      height: 600,
      rotation: 0,
      url: 'data:image/png;base64,zzzz',
      alpha: 40,
    }
    const raw = JSON.parse(buildFmlV3(plan))
    expect(raw.floors[0].drawing.url).toBeUndefined()
    expect(raw.floors[0].drawing.width).toBe(800)
    expect(raw.floors[0].drawing.alpha).toBe(40)
    // Sessie behoudt data-URL.
    expect(plan.floors[0].drawing?.url?.startsWith('data:')).toBe(true)

    plan.floors[0].drawing = {
      ...plan.floors[0].drawing,
      url: 'https://cdn.example.com/scan.png',
    }
    const withCdn = JSON.parse(buildFmlV3(plan))
    expect(withCdn.floors[0].drawing.url).toBe('https://cdn.example.com/scan.png')
  })

  it('zet floor.height ≥ hoogste muurtop (scheve/nok-muren)', () => {
    const plan = createEmptyFloorPlan({ name: 'Tall' })
    plan.floors[0].height = 280
    plan.floors[0].walls = [
      {
        ...wall('gable', { x: 0, y: 0 }, { x: 0, y: 100 }),
        extras: { az: { z: 0, h: 280 }, bz: { z: 0, h: 432 } },
      },
    ]
    const ridge = markWallAsRidge(
      wall('ridge', { x: 0, y: 50 }, { x: 100, y: 50 }),
      ridgeEndpointExtras(280, 30, 402),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [
      markRoofSurfaceManual(
        makeRoofSurface({
          id: 'roof-1',
          origin: 'manual',
          poly: [
            { x: 0, y: 0, z: 280 },
            { x: 100, y: 0, z: 280 },
            { x: 100, y: 50, z: 432 },
            { x: 0, y: 50, z: 432 },
          ],
        }),
      ),
    ])

    expect(maxWallTopHOnFloor(plan.floors[0])).toBe(432)
    const raw = JSON.parse(buildFmlV3(plan))
    expect(raw.floors[0].height).toBe(432)
    // Scheve einden blijven staan (UI toont --- / mixed).
    const gable = raw.floors[0].designs[0].walls.find((w: { guid: string }) => w.guid === 'gable')
    expect(gable.az.h).toBe(280)
    expect(gable.bz.h).toBe(432)
  })
})
