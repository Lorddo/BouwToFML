import { describe, expect, it } from 'vitest'
import { scaleFloorPlan } from '@/core/fml/scale-floor-plan'
import type { Floor, FloorPlan, Wall } from '@/core/fml/types'
import { buildAreaSideDims } from '@/ui/composables/plan-canvas/plan-canvas-area-side-dims'
import {
  regenerateFloorAreas,
  scaleFloorPlanAndRegenAreas,
} from '@/ui/composables/plan-canvas/regenerate-floor-areas'
import { snapHoleRingsToWallFaces } from '@/ui/composables/plan-canvas/snap-area-holes-to-faces'

function wall(
  id: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  thickness = 10,
  balance = 0.5,
): Wall {
  return {
    id,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thickness,
    balance,
    openings: [],
  }
}

/** Hartlijn 30 × 110, dikte 10 → binnenmaat 20 × 100. */
function typedRoomWalls(): Wall[] {
  return [
    wall('n', 0, 0, 30, 0),
    wall('e', 30, 0, 30, 110),
    wall('s', 30, 110, 0, 110),
    wall('w', 0, 110, 0, 0),
  ]
}

function floorOf(walls: Wall[]): Floor {
  return { name: 'bg', level: 0, height: 260, walls }
}

describe('snapHoleRingsToWallFaces', () => {
  it('zet clipper-krimp terug op binnenfaces (hoek = snijpunt)', () => {
    const hole = [
      { x: 5.05, y: 5.2 },
      { x: 24.95, y: 5.2 },
      { x: 24.95, y: 104.8 },
      { x: 5.05, y: 104.8 },
    ]
    const snapped = snapHoleRingsToWallFaces([hole], typedRoomWalls())[0]
    expect(snapped).toEqual([
      { x: 5, y: 5 },
      { x: 25, y: 5 },
      { x: 25, y: 105 },
      { x: 5, y: 105 },
    ])
  })

  it('laat vertices buiten snap-afstand met rust', () => {
    const hole = [{ x: 80, y: 80 }]
    expect(snapHoleRingsToWallFaces([hole], typedRoomWalls())[0][0]).toEqual({ x: 80, y: 80 })
  })

  it('buitenmiter voorbij het as-eind snapt naar het facesnijpunt (niet +0,1 cm)', () => {
    const walls = [wall('h', 0, 0, 87, 0, 10), wall('v', 87, 0, 87, 80, 10)]
    const snapped = snapHoleRingsToWallFaces([[{ x: 92.05, y: -5.08 }]], walls)[0][0]
    expect(snapped.x).toBeCloseTo(92, 5)
    expect(snapped.y).toBeCloseTo(-5, 5)
  })
})

describe('regenerateFloorAreas typed inner', () => {
  it('T+L 10 cm: buiten − binnen is 10, geen 10.1', () => {
    const walls = [
      wall('stem', 0, -50, 0, 80, 10),
      wall('h', 0, 0, 87, 0, 10),
      wall('down', 87, 0, 87, 80, 10),
      wall('bot', 87, 80, 0, 80, 10),
      wall('top', 0, -50, 97, -50, 10),
      wall('tr', 97, -50, 97, 0, 10),
      wall('stub', 97, 0, 87, 0, 10),
    ]
    const next = regenerateFloorAreas(floorOf(walls))
    const dims = buildAreaSideDims(next.areas, { unit: 'cm' })
    const alongH = dims.filter(
      (d) => Math.abs(d.a.y - d.b.y) < 1 && Math.abs((d.a.y + d.b.y) / 2) < 8,
    )
    const lengths = alongH.map((d) => d.lengthCm).sort((a, b) => a - b)
    expect(lengths.length).toBeGreaterThanOrEqual(2)
    expect(lengths[lengths.length - 1] - lengths[0]).toBeCloseTo(10, 5)
    expect(lengths.every((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-6)).toBe(true)
  })

  it('L + dikte 10: binnen 330 en buiten 340, geen 340.1', () => {
    const walls = [
      wall('ltop', 0, 0, 90, 0, 10),
      wall('v', 90, -10, 90, 340, 10),
      wall('lbot', 90, 340, 0, 340, 10),
      wall('lleft', 0, 340, 0, 0, 10),
      wall('rtop', 90, -10, 180, -10, 10),
      wall('rright', 180, -10, 180, 340, 10),
      wall('rbot', 180, 340, 90, 340, 10),
    ]
    const next = regenerateFloorAreas(floorOf(walls))
    const dims = buildAreaSideDims(next.areas, { unit: 'cm' })
    const verticals = dims
      .filter((d) => Math.abs(d.a.x - d.b.x) < 1)
      .map((d) => Math.round(d.lengthCm * 10) / 10)
      .sort((a, b) => a - b)
    expect(verticals).toContain(330)
    expect(verticals).toContain(340)
    expect(verticals).not.toContain(340.1)
  })

  it('schuine muur: binnenmaat is de gemiterde face, niet de aslengte', () => {
    const walls = [
      wall('w', 0, 80, 0, 0, 10),
      wall('s', 0, 80, 60, 100, 10),
      wall('e', 60, 100, 60, 0, 10),
      wall('n', 60, 0, 0, 0, 10),
    ]
    const next = regenerateFloorAreas(floorOf(walls))
    const dims = buildAreaSideDims(next.areas, { unit: 'cm' })
    const sloped = dims.find((d) => Math.abs(d.a.y - d.b.y) > 5 && Math.abs(d.a.x - d.b.x) > 5)
    expect(sloped).toBeTruthy()
    expect(sloped!.lengthCm).not.toBeCloseTo(Math.hypot(60, 20), 1)
  })

  it('west balance 0: binnenbreedte 390, niet 380 (face, niet hartlijn/2)', () => {
    const walls = [
      wall('n', 0, 0, 400, 0, 20),
      wall('s', 0, 300, 400, 300, 20),
      wall('w', 0, 0, 0, 300, 20, 0),
      wall('e', 400, 0, 400, 300, 20),
    ]
    const next = regenerateFloorAreas(floorOf(walls))
    const dims = buildAreaSideDims(next.areas, { unit: 'cm' })
    const lengths = dims.map((d) => Math.round(d.lengthCm * 10) / 10).sort((a, b) => a - b)
    expect(lengths).toEqual([280, 280, 390, 390])
  })

  it('houdt 0,2 × 1,0 m binnenmaat bij 10 cm muren (geen 19,9 / 99,6)', () => {
    const next = regenerateFloorAreas(floorOf(typedRoomWalls()))
    const dims = buildAreaSideDims(next.areas, { unit: 'm' })
    const lengths = dims.map((d) => Math.round(d.lengthCm * 10) / 10).sort((a, b) => a - b)
    expect(lengths).toEqual([20, 20, 100, 100])
    expect(dims.every((d) => d.label === '0.2 m' || d.label === '1 m')).toBe(true)
  })

  it('neemt trapgat-cutout niet op als kamer-gat', () => {
    const walls = [
      wall('n', 0, 0, 200, 0, 10),
      wall('e', 200, 0, 200, 200, 10),
      wall('s', 200, 200, 0, 200, 10),
      wall('w', 0, 200, 0, 0, 10),
      wall('tn', 80, 80, 140, 80, 8),
      wall('te', 140, 80, 140, 140, 8),
      wall('ts', 140, 140, 80, 140, 8),
      wall('tw', 80, 140, 80, 80, 8),
    ]
    const floor: Floor = {
      ...floorOf(walls),
      surfaces: [
        {
          id: 'cut',
          poly: [
            { x: 84, y: 84 },
            { x: 136, y: 84 },
            { x: 136, y: 136 },
            { x: 84, y: 136 },
          ],
          color: '#fff',
          showAreaLabel: true,
          customName: 'Trapgat',
          isCutout: true,
        },
      ],
    }
    const next = regenerateFloorAreas(floor)
    expect(next.areas).toHaveLength(1)
    const poly = next.areas![0].poly
    const xs = poly.map((p) => p.x)
    const ys = poly.map((p) => p.y)
    expect(Math.min(...xs)).toBeLessThan(20)
    expect(Math.max(...xs)).toBeGreaterThan(180)
    expect(Math.min(...ys)).toBeLessThan(20)
    expect(Math.max(...ys)).toBeGreaterThan(180)
  })
})

describe('scaleFloorPlanAndRegenAreas', () => {
  it('zet kamermaten op nieuwe binnenfaces (dikte blijft, poly-schaal alleen is te kort)', () => {
    const seeded = regenerateFloorAreas(floorOf(typedRoomWalls()))
    const plan: FloorPlan = { name: 't', floors: [seeded] }
    const onlyScaled = scaleFloorPlan(plan, 2, 0)
    const scaledDims = buildAreaSideDims(onlyScaled.floors[0]?.areas, { unit: 'cm' })
      .map((d) => Math.round(d.lengthCm * 10) / 10)
      .sort((a, b) => a - b)
    expect(scaledDims).toEqual([40, 40, 200, 200])

    const next = scaleFloorPlanAndRegenAreas(plan, 2, 0)
    const dims = buildAreaSideDims(next.floors[0]?.areas, { unit: 'cm' })
    const lengths = dims.map((d) => Math.round(d.lengthCm * 10) / 10).sort((a, b) => a - b)
    // Hartlijn 60 × 220, dikte 10 → binnen 50 × 210 (niet 40 × 200).
    expect(lengths).toEqual([50, 50, 210, 210])
  })
})
