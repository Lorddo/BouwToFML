import { describe, expect, it } from 'vitest'
import { mergeFloorPlans, stampFloorMeta } from '@/ui/composables/project/merge-floor-plans'
import {
  createDefaultFloorFmlDefaults,
  createEmptyProjectState,
} from '@/ui/composables/project/defaults'
import { projectStepCanProceed } from '@/ui/composables/workspace/constants'
import { floorStatusFromFlowStep } from '@/ui/composables/project/types'
import type { Floor } from '@/core/fml/types'

function wallFloor(name: string, level: number, wallId: string): Floor {
  return {
    name,
    level,
    height: 280,
    walls: [
      {
        id: wallId,
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 10,
        openings: [],
      },
    ],
  }
}

describe('mergeFloorPlans', () => {
  it('merged floors sorted by level with prefixed wall ids', () => {
    const plan = mergeFloorPlans('Testproject', [
      wallFloor('1e', 1, 'wall-a'),
      wallFloor('BG', 0, 'wall-a'),
    ])
    expect(plan.name).toBe('Testproject')
    expect(plan.floors.map((f) => f.name)).toEqual(['BG', '1e'])
    expect(plan.floors[0].walls[0].id).toBe('f0-wall-a')
    expect(plan.floors[1].walls[0].id).toBe('f1-wall-a')
  })

  it('houdt live floor.walls aan als designs[0] een stale snapshot is', () => {
    const stale: Floor = {
      name: 'BG',
      level: 0,
      height: 280,
      walls: [
        {
          id: 'split-host-live',
          a: { x: 0, y: 0 },
          b: { x: 100, y: 0 },
          thickness: 7,
          openings: [],
        },
      ],
      designs: [
        {
          name: 'BG',
          walls: [
            {
              id: 'e0',
              a: { x: 0, y: 0 },
              b: { x: 140, y: 0 },
              thickness: 19.121682691137714,
              openings: [],
            },
          ],
        },
      ],
      activeDesignIndex: 0,
    }
    const plan = mergeFloorPlans('Export', [stale])
    expect(plan.floors[0].walls).toHaveLength(1)
    expect(plan.floors[0].walls[0].id).toBe('f0-split-host-live')
    expect(plan.floors[0].walls[0].thickness).toBe(7)
    expect(plan.floors[0].designs?.[0].walls[0].id).toBe('f0-split-host-live')
    expect(plan.floors[0].designs?.[0].walls[0].thickness).toBe(7)
  })

  it('stampFloorMeta sets name/level/height', () => {
    const stamped = stampFloorMeta(wallFloor('x', 0, 'w1'), {
      name: 'Begane grond',
      level: 2,
      height: 300,
    })
    expect(stamped.name).toBe('Begane grond')
    expect(stamped.level).toBe(2)
    expect(stamped.height).toBe(300)
  })
})

describe('project defaults + gates', () => {
  it('createEmptyProjectState has one floor and empty meta', () => {
    const state = createEmptyProjectState()
    expect(state.floors).toHaveLength(1)
    expect(state.meta.name).toBe('')
    expect(state.activeFloorId).toBe(state.floors[0].id)
    expect(state.blobs[state.activeFloorId]?.session).toBeNull()
    expect(state.floors[0].defaults).toEqual(createDefaultFloorFmlDefaults())
  })

  it('each floor carries full FML defaults (no project-level layer)', () => {
    const state = createEmptyProjectState()
    const floor = state.floors[0]
    expect(floor.defaults.wallHeightCm).toBe(createDefaultFloorFmlDefaults().wallHeightCm)
    expect(floor.defaults.doorHeightCm).toBe(createDefaultFloorFmlDefaults().doorHeightCm)
  })

  it('projectStepCanProceed requires name and floors (adres optioneel)', () => {
    expect(
      projectStepCanProceed({
        name: '',
        address: 'x',
        floorCount: 1,
        activeFloorId: 'a',
      }),
    ).toBe(false)
    expect(
      projectStepCanProceed({
        name: 'P',
        address: '',
        floorCount: 1,
        activeFloorId: 'a',
      }),
    ).toBe(true)
    expect(
      projectStepCanProceed({
        name: 'P',
        address: 'A',
        floorCount: 1,
        activeFloorId: 'a',
      }),
    ).toBe(true)
  })

  it('floorStatusFromFlowStep maps project to empty', () => {
    expect(floorStatusFromFlowStep('project')).toBe('empty')
    expect(floorStatusFromFlowStep('templates')).toBe('templates')
  })
})
