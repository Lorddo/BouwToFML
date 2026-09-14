import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { usePlanEditor } from '@/ui/composables/usePlanEditor'
import {
  assignWallsToGroup,
  createFacadeGroup,
  STAMP_FACADE_GROUP_ID,
} from '@/core/plan/facade-groups'
import type { FloorPlan } from '@/core/plan/types'

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
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thickness: 10,
            openings: [],
          },
        ],
      },
    ],
  }
}

function samplePlanWithDoor(): FloorPlan {
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
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thickness: 10,
            openings: [
              {
                id: 'd1',
                kind: 'door.single',
                t: 0.5,
                width: 20,
                z_height: 220,
                mirrored: [0, 0],
                type: 'door',
              },
            ],
          },
        ],
      },
    ],
  }
}

function samplePlanWithSlideCrossing(): FloorPlan {
  return {
    name: 'SlideCrossing',
    floors: [
      {
        name: 'BG',
        level: 0,
        height: 280,
        walls: [
          {
            id: 'wDrag',
            a: { x: 10, y: 0 },
            b: { x: 10, y: 30 },
            thickness: 10,
            openings: [],
          },
          {
            id: 'wMoveTop',
            a: { x: 0, y: 0 },
            b: { x: 10, y: 0 },
            thickness: 10,
            openings: [],
          },
          {
            id: 'wStayTop',
            a: { x: 10, y: 0 },
            b: { x: 10, y: -20 },
            thickness: 10,
            openings: [],
          },
          {
            id: 'wCross',
            a: { x: 20, y: -10 },
            b: { x: 20, y: 10 },
            thickness: 10,
            openings: [
              {
                id: 'cross-door',
                kind: 'door.single',
                t: 0.5,
                width: 40,
                z_height: 220,
                mirrored: [0, 0],
                type: 'door',
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('usePlanEditor', () => {
  it('initializes with stamp preset without TDZ on facadeStamp', () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>(samplePlan())
    const floorIndex = ref(0)

    const editor = scope.run(() =>
      usePlanEditor(plan, floorIndex, { ensureStampPreset: ref(true) }),
    )!

    expect(editor.facadeGroups().some((group) => group.id === STAMP_FACADE_GROUP_ID)).toBe(true)

    scope.stop()
  })

  it('keeps undo stack after internal parent sync', async () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>(samplePlan())
    const floorIndex = ref(0)

    const editor = scope.run(() => usePlanEditor(plan, floorIndex))!
    editor.pushUndo()
    editor.applyJunctionMove(editor.junctions.value[0], { x: 5, y: 0 })

    editor.prepareParentSync()
    plan.value = editor.localPlan.value
    await nextTick()

    expect(editor.canUndo()).toBe(true)
    expect(editor.undo()).toBe(true)
    expect(editor.walls.value[0]?.a).toEqual({ x: 0, y: 0 })

    scope.stop()
  })

  it('neemt parent-rescale over ook als parent-sync-skip open staat', async () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>(samplePlan())
    const floorIndex = ref(0)

    const editor = scope.run(() => usePlanEditor(plan, floorIndex))!
    editor.pushUndo()
    editor.prepareParentSync()
    plan.value = {
      name: 'Test',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'w1',
              a: { x: 0, y: 0 },
              b: { x: 200, y: 0 },
              thickness: 10,
              openings: [],
            },
          ],
        },
      ],
    }
    await nextTick()

    expect(editor.walls.value[0]?.b.x).toBe(200)
    expect(editor.canUndo()).toBe(false)

    scope.stop()
  })

  it('clears undo stack when plan changes externally', async () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>(samplePlan())
    const floorIndex = ref(0)

    const editor = scope.run(() => usePlanEditor(plan, floorIndex))!
    editor.pushUndo()

    plan.value = {
      ...samplePlan(),
      name: 'Imported',
    }
    await nextTick()

    expect(editor.canUndo()).toBe(false)

    scope.stop()
  })

  it('clears undo stack when floor index changes', async () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>({
      name: 'Multi',
      floors: [
        samplePlan().floors[0],
        {
          name: '1e',
          level: 1,
          height: 280,
          walls: [
            {
              id: 'w2',
              a: { x: 0, y: 0 },
              b: { x: 50, y: 0 },
              thickness: 10,
              openings: [],
            },
          ],
        },
      ],
    })
    const floorIndex = ref(0)

    const editor = scope.run(() => usePlanEditor(plan, floorIndex))!
    editor.pushUndo()
    expect(editor.canUndo()).toBe(true)

    floorIndex.value = 1
    await nextTick()

    expect(editor.canUndo()).toBe(false)
    expect(editor.walls.value[0]?.id).toBe('w2')

    scope.stop()
  })

  it('applyWallSlideAlongAxis updates wall geometry', () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>(samplePlan())
    const floorIndex = ref(0)
    const editor = scope.run(() => usePlanEditor(plan, floorIndex))!

    editor.applyWallSlideAlongAxis('w1', -10, { x: 1, y: 0 })
    expect(editor.walls.value[0]?.a).toEqual({ x: -10, y: 0 })
    expect(editor.walls.value[0]?.b).toEqual({ x: 90, y: 0 })

    editor.applyWallBalance('w1', 0.7)
    expect(editor.walls.value[0]?.balance).toBe(0.7)

    scope.stop()
  })

  it('updates and removes door openings by id', () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>(samplePlanWithDoor())
    const floorIndex = ref(0)
    const editor = scope.run(() => usePlanEditor(plan, floorIndex))!

    const openingId = 'w1-door-d1'
    expect(editor.resolveDoorOpening(openingId)?.opening.width).toBe(20)

    editor.updateDoorOpening(openingId, { t: 0.8 })
    expect(editor.resolveDoorOpening(openingId)?.opening.t).toBeCloseTo(0.8, 6)

    editor.updateDoorOpening(openingId, { width: 120, z_height: 250, mirrored: [1, 1] })
    const updated = editor.resolveDoorOpening(openingId)?.opening
    expect(updated?.width).toBe(120)
    expect(updated?.z_height).toBe(250)
    expect(updated?.mirrored).toEqual([1, 1])

    editor.removeDoorOpenings([openingId])
    expect(editor.resolveDoorOpening(openingId)).toBeNull()

    scope.stop()
  })

  it('preview wall slide resets volledig wanneer delta terug naar 0 gaat', () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>(samplePlanWithSlideCrossing())
    const floorIndex = ref(0)
    const editor = scope.run(() => usePlanEditor(plan, floorIndex))!

    const baseline = JSON.parse(JSON.stringify(editor.walls.value))
    editor.previewWallSlideAlongAxis(baseline, 'wDrag', 20, { x: 1, y: 0 })
    expect(editor.walls.value).not.toEqual(baseline)

    // Simuleert: over junction heen slepen en daarna terug naar start, nog zonder release.
    editor.previewWallSlideAlongAxis(baseline, 'wDrag', 0, { x: 1, y: 0 })
    expect(editor.walls.value).toEqual(baseline)
    expect(editor.walls.value.some((wall) => wall.id.startsWith('split-host-'))).toBe(false)

    scope.stop()
  })

  it('preview wall slide regenereert area-gaten (geen scheve vertex-warp)', () => {
    const scope = effectScope()
    const closed: FloorPlan = {
      name: 'LiveAreas',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            { id: 'west', a: { x: 0, y: 0 }, b: { x: 0, y: 300 }, thickness: 10, openings: [] },
            { id: 'east', a: { x: 400, y: 0 }, b: { x: 400, y: 300 }, thickness: 10, openings: [] },
            { id: 'north', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, thickness: 10, openings: [] },
            {
              id: 'south',
              a: { x: 0, y: 300 },
              b: { x: 400, y: 300 },
              thickness: 10,
              openings: [],
            },
          ],
        },
      ],
    }
    const plan = ref<FloorPlan | null>(closed)
    const floorIndex = ref(0)
    const editor = scope.run(() => usePlanEditor(plan, floorIndex))!
    editor.flushAreaRegen()
    const baseline = JSON.parse(JSON.stringify(editor.walls.value))
    const startMaxX = Math.max(...(editor.areas.value[0]?.poly ?? []).map((p) => p.x))
    expect(startMaxX).toBeGreaterThan(300)

    editor.previewWallSlideAlongAxis(baseline, 'east', 40, { x: 1, y: 0 })
    const movedMaxX = Math.max(...(editor.areas.value[0]?.poly ?? []).map((p) => p.x))
    expect(movedMaxX - startMaxX).toBeCloseTo(40, 0)

    editor.previewWallSlideAlongAxis(baseline, 'east', 0, { x: 1, y: 0 })
    const resetMaxX = Math.max(...(editor.areas.value[0]?.poly ?? []).map((p) => p.x))
    expect(resetMaxX).toBeCloseTo(startMaxX, 0)

    scope.stop()
  })

  it('redo restores the snapshot after undo', () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>(samplePlan())
    const floorIndex = ref(0)
    const editor = scope.run(() => usePlanEditor(plan, floorIndex))!

    editor.pushUndo()
    editor.applyWallsThickness(['w1'], 20)
    expect(editor.walls.value[0]?.thickness).toBe(20)
    expect(editor.canRedoEdit.value).toBe(false)

    expect(editor.undo()).toBe(true)
    expect(editor.walls.value[0]?.thickness).toBe(10)
    expect(editor.canRedoEdit.value).toBe(true)

    expect(editor.redo()).toBe(true)
    expect(editor.walls.value[0]?.thickness).toBe(20)
    expect(editor.canRedoEdit.value).toBe(false)

    scope.stop()
  })

  it('applyFacadeGroupThickness zet alle floors en laat balance staan', () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>({
      name: 'Gevel',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'bg',
              a: { x: 0, y: 0 },
              b: { x: 400, y: 0 },
              thickness: 20,
              balance: 0,
              openings: [],
            },
          ],
        },
        {
          name: '1e',
          level: 1,
          height: 260,
          walls: [
            {
              id: 'e1',
              a: { x: 0, y: 0 },
              b: { x: 400, y: 0 },
              thickness: 24,
              balance: 1,
              openings: [],
            },
          ],
        },
      ],
    })
    const floorIndex = ref(0)
    const editor = scope.run(() => usePlanEditor(plan, floorIndex))!
    const group = createFacadeGroup(editor.localPlan.value!, { name: 'Voor' })
    assignWallsToGroup(editor.localPlan.value!, group.id, ['bg', 'e1'])

    expect(editor.applyFacadeGroupThickness(group.id, 30)).toBe(true)
    expect(editor.localPlan.value?.floors[0]?.walls[0]?.thickness).toBe(30)
    expect(editor.localPlan.value?.floors[0]?.walls[0]?.balance).toBe(0)
    expect(editor.localPlan.value?.floors[1]?.walls[0]?.thickness).toBe(30)
    expect(editor.localPlan.value?.floors[1]?.walls[0]?.balance).toBe(1)

    expect(editor.applyFacadeGroupThickness(group.id, 30)).toBe(false)

    scope.stop()
  })
})
