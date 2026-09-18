import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { FloorPlan, Point2D } from '@/core/plan/types'
import {
  SESSION_UNDO_MAX,
  createEditorSessionUndo,
} from '@/ui/composables/editor/editor-session-undo'

function floorPlan(name: string, wallId: string): FloorPlan {
  return {
    name,
    floors: [
      {
        name: 'bg',
        level: 0,
        height: 260,
        walls: [
          { id: wallId, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, openings: [] },
        ],
      },
      {
        name: '1e',
        level: 1,
        height: 260,
        walls: [],
      },
    ],
  }
}

describe('createEditorSessionUndo', () => {
  function harness() {
    const plan = ref<FloorPlan | null>(floorPlan('a', 'w0'))
    const floorIndex = ref(0)
    const layoutOrigin = ref<Point2D | null | undefined>(undefined)
    const session = createEditorSessionUndo({
      getPlan: () => plan.value,
      getFloorIndex: () => floorIndex.value,
      apply: (snapshot) => {
        plan.value = snapshot.plan
        floorIndex.value = snapshot.floorIndex
        if ('layoutOrigin' in snapshot) {
          layoutOrigin.value = snapshot.layoutOrigin
        }
      },
    })
    return { plan, floorIndex, layoutOrigin, session }
  }

  it('push + undo + redo zet plan én floorIndex terug', () => {
    const { plan, floorIndex, session } = harness()
    session.pushUndo()
    plan.value = floorPlan('b', 'w1')
    floorIndex.value = 1

    expect(session.undo()).toBe(true)
    expect(plan.value?.name).toBe('a')
    expect(plan.value?.floors[0]?.walls[0]?.id).toBe('w0')
    expect(floorIndex.value).toBe(0)

    expect(session.redo()).toBe(true)
    expect(plan.value?.name).toBe('b')
    expect(floorIndex.value).toBe(1)
  })

  it('floor-wissel zonder push laat de keten staan; undo springt naar de floor van de edit', () => {
    const { plan, floorIndex, session } = harness()
    session.pushUndo()
    plan.value = floorPlan('edited', 'w1')
    floorIndex.value = 0

    floorIndex.value = 1
    expect(session.canUndo()).toBe(true)

    expect(session.undo()).toBe(true)
    expect(plan.value?.name).toBe('a')
    expect(floorIndex.value).toBe(0)
  })

  it('twee pushes (plattegrond dan Gevels): undo in omgekeerde volgorde', () => {
    const { plan, floorIndex, session } = harness()
    session.pushUndo()
    plan.value = floorPlan('after-dormer', 'w1')

    floorIndex.value = 1
    session.pushUndo()
    plan.value = floorPlan('after-elevation', 'w2')

    expect(session.undo()).toBe(true)
    expect(plan.value?.name).toBe('after-dormer')
    expect(floorIndex.value).toBe(1)

    expect(session.undo()).toBe(true)
    expect(plan.value?.name).toBe('a')
    expect(floorIndex.value).toBe(0)
  })

  it(`cap ${SESSION_UNDO_MAX}: 51e schuift de oudste eraf`, () => {
    const { plan, session } = harness()
    for (let i = 0; i < SESSION_UNDO_MAX + 1; i++) {
      session.pushUndo()
      plan.value = floorPlan(`step-${i}`, `w${i}`)
    }
    expect(session.undoStack.value.length).toBe(SESSION_UNDO_MAX)

    for (let i = 0; i < SESSION_UNDO_MAX; i++) {
      expect(session.undo()).toBe(true)
    }
    expect(session.canUndo()).toBe(false)
    // Oudste (vóór step-0) is weg; na 50 undos zitten we op step-0, niet op 'a'.
    expect(plan.value?.name).toBe('step-0')
  })

  it('clearStacks wist de keten (Nieuw / open)', () => {
    const { plan, session } = harness()
    session.pushUndo()
    plan.value = floorPlan('b', 'w1')
    session.clearStacks()
    expect(session.canUndo()).toBe(false)
    expect(session.canRedo()).toBe(false)
    expect(session.undo()).toBe(false)
  })

  it('popLastUndo verwijdert zonder apply', () => {
    const { plan, session } = harness()
    session.pushUndo()
    plan.value = floorPlan('b', 'w1')
    session.popLastUndo()
    expect(session.canUndo()).toBe(false)
    expect(plan.value?.name).toBe('b')
  })

  it('layoutOrigin roundtript alleen als hij in de push zat', () => {
    const { plan, layoutOrigin, session } = harness()
    session.pushUndo({ layoutOrigin: { x: 10, y: 20 } })
    plan.value = floorPlan('b', 'w1')
    layoutOrigin.value = undefined

    expect(session.undo()).toBe(true)
    expect(layoutOrigin.value).toEqual({ x: 10, y: 20 })

    session.pushUndo()
    plan.value = floorPlan('c', 'w2')
    layoutOrigin.value = { x: 99, y: 99 }
    expect(session.undo()).toBe(true)
    // Geen layoutOrigin in die push → apply raakt layoutOrigin niet.
    expect(layoutOrigin.value).toEqual({ x: 99, y: 99 })
  })

  it('floorId wordt meegenomen (workspace stap-4)', () => {
    const plan = ref<FloorPlan | null>(floorPlan('a', 'w0'))
    const floorIndex = ref(0)
    const floorId = ref('floor-a')
    const appliedFloorId = ref<string | null | undefined>(undefined)
    const session = createEditorSessionUndo({
      getPlan: () => plan.value,
      getFloorIndex: () => floorIndex.value,
      getFloorId: () => floorId.value,
      apply: (snapshot) => {
        plan.value = snapshot.plan
        floorIndex.value = snapshot.floorIndex
        appliedFloorId.value = snapshot.floorId
      },
    })

    session.pushUndo()
    plan.value = floorPlan('b', 'w1')
    floorId.value = 'floor-b'

    expect(session.undo()).toBe(true)
    expect(plan.value?.name).toBe('a')
    expect(appliedFloorId.value).toBe('floor-a')
  })
})
