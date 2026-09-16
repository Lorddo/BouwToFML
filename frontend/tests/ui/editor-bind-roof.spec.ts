import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import {
  useEditorBindRoof,
  type BindRoofCanvas,
} from '@/ui/composables/editor/useEditorBindRoof'

function roofDesign() {
  return {
    name: 'Dak',
    role: 'ridge' as const,
    walls: [],
    surfaces: [
      {
        id: 's1',
        poly: [
          { x: 0, y: 0, z: 300 },
          { x: 400, y: 0, z: 300 },
          { x: 400, y: 400, z: 300 },
          { x: 0, y: 400, z: 300 },
        ],
        isRoof: true,
        color: '#cccccc',
        showAreaLabel: false,
      },
    ],
  }
}

/** Verdieping 1 heeft dakvlakken, verdieping 0 niet. */
function planWithRoofOnFloor1(): FloorPlan {
  return {
    name: 't',
    floors: [
      { name: 'bg', level: 0, height: 260, walls: [] },
      {
        name: '1e',
        level: 1,
        height: 260,
        walls: [
          {
            id: 'w1',
            a: { x: 0, y: 0 },
            b: { x: 400, y: 0 },
            thickness: 20,
            openings: [],
          },
        ],
        designs: [roofDesign()],
      },
    ],
  }
}

function setup(options: { plan: FloorPlan | null; dak?: boolean; activeFloor?: number }) {
  const plan = ref<FloorPlan | null>(options.plan)
  const canvas: BindRoofCanvas = {
    flushPendingFieldCommits: vi.fn(),
    pushUndo: vi.fn(),
    bindWallsToRoof: vi.fn(() => ({
      boundJunctions: 3,
      skippedBlocked: 1,
      skippedUncovered: 2,
      splits: 4,
      boundSkylights: 0,
      skippedSkylights: 0,
    })),
  }
  const api = useEditorBindRoof({
    plan,
    activeFloorIndex: ref(options.activeFloor ?? 0),
    dakMode: ref(options.dak === true),
    gevelsMode: ref(false),
    canvas: ref(canvas),
    t: (key, args) => `${key}:${JSON.stringify(args ?? {})}`,
  })
  return { plan, canvas, ...api }
}

describe('useEditorBindRoof', () => {
  it('kan niet binden zonder dakvlakken', () => {
    const { canBindWallsToRoof } = setup({
      plan: { name: 't', floors: [{ name: 'bg', level: 0, height: 260, walls: [] }] },
    })

    expect(canBindWallsToRoof.value).toBe(false)
  })

  it('kan niet binden zonder plan', () => {
    const { canBindWallsToRoof } = setup({ plan: null })

    expect(canBindWallsToRoof.value).toBe(false)
  })

  it('op de Dak-tab telt alleen de actieve verdieping', () => {
    const onRoofFloor = setup({ plan: planWithRoofOnFloor1(), dak: true, activeFloor: 1 })
    const onPlainFloor = setup({ plan: planWithRoofOnFloor1(), dak: true, activeFloor: 0 })

    expect(onRoofFloor.canBindWallsToRoof.value).toBe(true)
    expect(onPlainFloor.canBindWallsToRoof.value).toBe(false)
  })

  it('op de plattegrond mag elke verdieping mét dakvlakken', () => {
    const { canBindWallsToRoof } = setup({ plan: planWithRoofOnFloor1(), activeFloor: 0 })

    expect(canBindWallsToRoof.value).toBe(true)
  })

  it('Dak-tab laat het canvas binden en meldt zijn uitkomst', async () => {
    const { canvas, plan, bindWallsToRoof, bindRoofHint } = setup({
      plan: planWithRoofOnFloor1(),
      dak: true,
      activeFloor: 1,
    })
    const before = plan.value

    await bindWallsToRoof()

    expect(canvas.bindWallsToRoof).toHaveBeenCalledWith(1)
    expect(plan.value).toBe(before)
    // skipped = blocked + uncovered
    expect(bindRoofHint.value).toContain('"bound":3')
    expect(bindRoofHint.value).toContain('"skipped":3')
    expect(bindRoofHint.value).toContain('"splits":4')
  })

  it('één dakvlak-verdieping: geen popup, plan-variant flusht eerst en bindt zelf', async () => {
    const { canvas, plan, bindWallsToRoof } = setup({ plan: planWithRoofOnFloor1() })
    const before = plan.value

    await bindWallsToRoof()

    expect(canvas.flushPendingFieldCommits).toHaveBeenCalled()
    expect(canvas.bindWallsToRoof).not.toHaveBeenCalled()
    expect(plan.value).not.toBe(before)
    expect(canvas.pushUndo).toHaveBeenCalled()
  })

  it('de resultaat-melding overleeft de eigen plan-mutatie', async () => {
    // De opruim-watch kijkt naar wélke verdiepingen dakvlakken hebben, niet naar de
    // array-identiteit — anders wist een geslaagde bind zijn eigen melding.
    const { plan, bindWallsToRoof, bindRoofHint } = setup({ plan: planWithRoofOnFloor1() })
    const before = plan.value

    await bindWallsToRoof()

    expect(plan.value).not.toBe(before)
    expect(bindRoofHint.value).toContain('"bound"')
  })

  it('wist de melding als de verdieping wisselt', async () => {
    const plan = ref<FloorPlan | null>(planWithRoofOnFloor1())
    const activeFloorIndex = ref(0)
    const { bindWallsToRoof, bindRoofHint } = useEditorBindRoof({
      plan,
      activeFloorIndex,
      dakMode: ref(false),
      gevelsMode: ref(false),
      canvas: ref({}),
      t: (key, args) => `${key}:${JSON.stringify(args ?? {})}`,
    })

    await bindWallsToRoof()
    expect(bindRoofHint.value).not.toBeNull()

    activeFloorIndex.value = 1
    await nextTick()

    expect(bindRoofHint.value).toBeNull()
  })

  it('laat plan en undo met rust als er niets te binden was', async () => {
    const noOverlap = planWithRoofOnFloor1()
    // Muur ver buiten het dakvlak (0..400): niets te binden.
    const wall = noOverlap.floors[1]?.walls[0]
    if (wall) {
      wall.a = { x: 5000, y: 5000 }
      wall.b = { x: 5400, y: 5000 }
    }
    const { canvas, plan, bindWallsToRoof, bindRoofHint } = setup({ plan: noOverlap })
    const before = plan.value

    await bindWallsToRoof()

    expect(plan.value).toBe(before)
    expect(canvas.pushUndo).not.toHaveBeenCalled()
    expect(bindRoofHint.value).toContain('"bound":0')
  })

})
