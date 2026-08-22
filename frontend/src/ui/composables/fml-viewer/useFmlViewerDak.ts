import { computed, ref, watch, type Ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import {
  ensureRidgeDesignsOnPlan,
  findRidgeDesignIndex,
  listDakDesignFloors,
} from '@/core/fml/ridge-walls'

/**
 * Dak-tab: design-floors + enter/leave. Nokhoogte-rijen blijven bij gevels (stack).
 */
export function useFmlViewerDak(options: {
  plan: Ref<FloorPlan | null>
  activeFloorIndex: Ref<number>
  inspectMode: Ref<boolean>
  selectFloor: (index: number) => void | Promise<void>
  leaveGevelsMode: () => void
}) {
  const dakMode = ref(false)
  const showDakChip = computed(
    () => !options.inspectMode.value && (options.plan.value?.floors.length ?? 0) > 0,
  )
  const dakDesignTabs = computed(() => listDakDesignFloors(options.plan.value))

  function leaveDakMode(): void {
    dakMode.value = false
  }

  function enterDakMode(): void {
    if (options.inspectMode.value || !options.plan.value) return
    if (options.plan.value.floors.some((floor) => findRidgeDesignIndex(floor) < 0)) {
      options.plan.value = ensureRidgeDesignsOnPlan(options.plan.value)
    }
    options.leaveGevelsMode()
    let top = -1
    options.plan.value.floors.forEach((floor, index) => {
      if ((floor.walls.length ?? 0) > 0) top = index
    })
    if (top >= 0 && top !== options.activeFloorIndex.value) void options.selectFloor(top)
    dakMode.value = true
  }

  watch(showDakChip, (show) => {
    if (!show) leaveDakMode()
  })
  watch(options.inspectMode, (on) => {
    if (on) leaveDakMode()
  })

  return {
    dakMode,
    showDakChip,
    dakDesignTabs,
    leaveDakMode,
    enterDakMode,
  }
}
