import { computed, ref, type Ref } from 'vue'
import {
  applyFloorOrientOp,
  composeFloorOrient,
  defaultFloorOrient,
  type FloorOrientOp,
  type FloorOrientState,
} from '@/core/plan/floor-plan-orient'
import type { FloorPlan } from '@/core/plan/types'

/**
 * Plattegrond-oriëntatie per verdieping (spiegelen/roteren). De editor heeft geen
 * regenerate-from-detectie, dus de gecomponeerde staat wordt hier bijgehouden.
 * Elke op zet de onderlegger-move uit: die grepen wijzen na een draai verkeerd.
 */
export function useEditorOrient(deps: {
  plan: Ref<FloorPlan | null>
  activeFloorIndex: Ref<number>
  floors: Ref<ReadonlyArray<unknown>>
  underlayMoveMode: Ref<boolean>
}) {
  const orientByFloor = ref<Record<number, FloorOrientState>>({})

  const activeFloorOrient = computed(
    () => orientByFloor.value[deps.activeFloorIndex.value] ?? defaultFloorOrient(),
  )

  const projectOrientFlipX = computed(() => {
    const list = deps.floors.value
    if (list.length === 0) return false
    return list.every((_, i) => (orientByFloor.value[i] ?? defaultFloorOrient()).flipX)
  })

  function applyFloorOrient(op: FloorOrientOp): void {
    if (!deps.plan.value) return
    const idx = deps.activeFloorIndex.value
    const prev = orientByFloor.value[idx] ?? defaultFloorOrient()
    orientByFloor.value = {
      ...orientByFloor.value,
      [idx]: composeFloorOrient(prev, op),
    }
    deps.plan.value = applyFloorOrientOp(deps.plan.value, op, idx)
    deps.underlayMoveMode.value = false
  }

  function applyProjectOrient(op: 'flipX'): void {
    if (!deps.plan.value || deps.plan.value.floors.length === 0) return
    const nextOrient: Record<number, FloorOrientState> = { ...orientByFloor.value }
    for (let i = 0; i < deps.plan.value.floors.length; i++) {
      const prev = nextOrient[i] ?? defaultFloorOrient()
      nextOrient[i] = composeFloorOrient(prev, op)
    }
    orientByFloor.value = nextOrient
    deps.plan.value = applyFloorOrientOp(deps.plan.value, op, null)
    deps.underlayMoveMode.value = false
  }

  return {
    orientByFloor,
    activeFloorOrient,
    projectOrientFlipX,
    applyFloorOrient,
    applyProjectOrient,
  }
}
