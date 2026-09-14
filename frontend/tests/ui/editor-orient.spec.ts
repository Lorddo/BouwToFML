import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import { useEditorOrient } from '@/ui/composables/editor/useEditorOrient'

function planWithFloors(count: number): FloorPlan {
  return {
    name: 't',
    floors: Array.from({ length: count }, (_, i) => ({
      name: `f${i}`,
      level: i,
      height: 260,
      walls: [
        {
          id: `w${i}`,
          a: { x: 0, y: 0 },
          b: { x: 100, y: 0 },
          thickness: 20,
          openings: [],
        },
      ],
    })),
  }
}

function setup(floorCount: number) {
  const plan = ref<FloorPlan | null>(planWithFloors(floorCount))
  const activeFloorIndex = ref(0)
  const underlayMoveMode = ref(true)
  const orient = useEditorOrient({
    plan,
    activeFloorIndex,
    floors: computed(() => plan.value?.floors ?? []),
    underlayMoveMode,
  })
  return { plan, activeFloorIndex, underlayMoveMode, ...orient }
}

describe('useEditorOrient', () => {
  it('houdt de oriëntatie per verdieping bij', () => {
    const { activeFloorIndex, orientByFloor, activeFloorOrient, applyFloorOrient } = setup(2)

    applyFloorOrient('flipX')
    expect(activeFloorOrient.value.flipX).toBe(true)

    activeFloorIndex.value = 1
    expect(activeFloorOrient.value.flipX).toBe(false)
    expect(orientByFloor.value[1]).toBeUndefined()
  })

  it('projectOrientFlipX pas waar als élke verdieping gespiegeld is', () => {
    const { activeFloorIndex, projectOrientFlipX, applyFloorOrient } = setup(2)

    applyFloorOrient('flipX')
    expect(projectOrientFlipX.value).toBe(false)

    activeFloorIndex.value = 1
    applyFloorOrient('flipX')
    expect(projectOrientFlipX.value).toBe(true)
  })

  it('project-flip pakt alle verdiepingen in één keer', () => {
    const { projectOrientFlipX, applyProjectOrient } = setup(3)

    applyProjectOrient('flipX')

    expect(projectOrientFlipX.value).toBe(true)
  })

  it('zet onderlegger-verplaatsen uit bij elke draai', () => {
    const { underlayMoveMode, applyFloorOrient } = setup(1)

    applyFloorOrient('rotCw')

    expect(underlayMoveMode.value).toBe(false)
  })

  it('doet niets zonder plan', () => {
    const plan = ref<FloorPlan | null>(null)
    const { orientByFloor, applyFloorOrient, applyProjectOrient } = useEditorOrient({
      plan,
      activeFloorIndex: ref(0),
      floors: computed(() => []),
      underlayMoveMode: ref(true),
    })

    applyFloorOrient('flipX')
    applyProjectOrient('flipX')

    expect(orientByFloor.value).toEqual({})
  })
})
