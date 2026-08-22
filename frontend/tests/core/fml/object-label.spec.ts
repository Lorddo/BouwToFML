import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { mirrorFloorPlanVertical, rotateFloorPlan90 } from '@/core/fml/floor-plan-orient'
import { mirrorObjectLabelX, rotateObjectLabel90, scaleObjectLabel } from '@/core/fml/object-label'
import { resolveOpeningCatalog } from '@/core/fml/opening-refid-catalog'
import { scaleFloorPlan } from '@/core/fml/scale-floor-plan'
import type { FloorPlan, Opening } from '@/core/fml/types'
import { ARCHWAY_DOOR_REFID, CONCEPT_DOOR_REFID, PASSAGE_DOOR_REFID } from '@/core/fml/types'

function labeledOpening(): Opening {
  return {
    refid: CONCEPT_DOOR_REFID,
    t: 0.4,
    width: 90,
    type: 'door',
    name: 'Standaard deur',
    showLabel: true,
    name_x: 4,
    name_y: -29,
  }
}

function planWithOpening(opening: Opening): FloorPlan {
  return {
    name: 'Labels',
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
            thickness: 15,
            openings: [opening],
          },
        ],
        items: [
          {
            refid: 'item',
            x: 50,
            y: 60,
            width: 40,
            height: 40,
            name: 'Kolom',
            showLabel: true,
            name_x: 4,
            name_y: 0,
          },
        ],
      },
    ],
  }
}

describe('FML invoer catalogus', () => {
  it('vult entry-way / voordeur / archway / driehoek / blind', () => {
    expect(resolveOpeningCatalog('181e49d1e848e8668befb4ee93bb5a2ec86b017c', 'door')).toMatchObject(
      {
        label: 'Doorgang',
        kind: 'passage',
      },
    )
    expect(resolveOpeningCatalog(PASSAGE_DOOR_REFID, 'door')).toMatchObject({
      label: 'Doorgang',
      kind: 'passage',
    })
    expect(resolveOpeningCatalog(ARCHWAY_DOOR_REFID, 'door')).toMatchObject({
      label: 'Doorgang (boog)',
      kind: 'archway',
    })
    expect(resolveOpeningCatalog('eec7e3d89097fc1a9b5ec153b0148cf6f52222dc', 'door')).toMatchObject(
      {
        label: 'Voordeur (met raam)',
        kind: 'single',
        leaf: 'glass',
      },
    )
    expect(
      resolveOpeningCatalog('db1a3a6fceaae4487bda6b761df83ea75d9996c5', 'window'),
    ).toMatchObject({
      label: 'Raam driehoek',
      kind: 'triangle',
    })
    expect(
      resolveOpeningCatalog('327e76e3a132e358fef8757471f4989e93323b03', 'window'),
    ).toMatchObject({
      label: 'Blind paneel',
      kind: 'single',
      leaf: 'solid',
    })
  })

  it('houdt huidige dubbel/schuif-presets; aliases mappen wel', () => {
    expect(resolveOpeningCatalog('9c1479d9dfc482859aea10b9dd67f5e7773fff6d', 'door').kind).toBe(
      'double_wide',
    )
    expect(resolveOpeningCatalog('568f1c990a44f774c52d16d599b29f0e61767616', 'door')).toMatchObject(
      {
        kind: 'double_wide',
        leaf: 'solid',
      },
    )
    expect(resolveOpeningCatalog('1cdb4e6092e998630e7881667f2ddedafa3b0eb9', 'door').kind).toBe(
      'sliding',
    )
    expect(resolveOpeningCatalog('f54db5adfdca7fad8fa792c1d5872c9567ff8d5d', 'door').kind).toBe(
      'sliding',
    )
  })
})

describe('objectlabel offset', () => {
  it('schaalt, spiegelt X, roteert 90°', () => {
    const label = { name_x: 4, name_y: -29 }
    expect(scaleObjectLabel(label, { x: 2, y: 0.5 })).toEqual({ name_x: 8, name_y: -14.5 })
    expect(mirrorObjectLabelX(label)).toEqual({ name_x: -4, name_y: -29 })
    expect(rotateObjectLabel90(label, 'cw')).toEqual({ name_x: 29, name_y: 4 })
    expect(rotateObjectLabel90(label, 'ccw')).toEqual({ name_x: -29, name_y: -4 })
  })
})

describe('objectlabel roundtrip', () => {
  it('import/export bewaart opening + item labels', () => {
    const parsed = importFmlV3(buildFmlV3(planWithOpening(labeledOpening())))
    const opening = parsed.plan.floors[0]?.walls[0]?.openings[0]
    const item = parsed.plan.floors[0]?.items?.[0]
    expect(opening).toMatchObject({
      name: 'Standaard deur',
      showLabel: true,
      name_x: 4,
      name_y: -29,
    })
    expect(opening?.extras?.name).toBeUndefined()
    expect(item).toMatchObject({
      name: 'Kolom',
      showLabel: true,
      name_x: 4,
      name_y: 0,
    })
  })

  it('scale/spiegel/rotatie past offsets aan', () => {
    const plan = planWithOpening(labeledOpening())
    const scaled = scaleFloorPlan(plan, { x: 2, y: 2 })
    expect(scaled.floors[0]?.walls[0]?.openings[0]).toMatchObject({ name_x: 8, name_y: -58 })
    expect(scaled.floors[0]?.items?.[0]).toMatchObject({ name_x: 8, name_y: 0 })

    const mirrored = mirrorFloorPlanVertical(plan)
    expect(mirrored.floors[0]?.walls[0]?.openings[0]?.name_x).toBe(-4)
    expect(mirrored.floors[0]?.items?.[0]?.name_x).toBe(-4)

    const rotated = rotateFloorPlan90(plan, { x: 0, y: 0 }, 'cw')
    expect(rotated.floors[0]?.walls[0]?.openings[0]).toMatchObject({ name_x: 29, name_y: 4 })
  })
})
