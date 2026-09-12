import { computed, ref, watch, type Ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import {
  readDimensionSettings,
  writeDimensionSettings,
  type DimensionMode,
} from '@/core/fml/fml-dimension-settings'
import { defaultDimensionVis, type DimensionVis } from '@/core/fml/fml-dimension-vis'
import {
  dimensionLiesOnAnySlice,
  filterManualDimensions,
  readPlanSlices,
  writePlanSlices,
} from '@/core/fml/plan-slices'
import { collectOverlayDimensionLines } from '@/core/fml/convert-overlay-dimensions'

export function useFmlViewerDimensions(options: {
  plan: Ref<FloorPlan | null>
  activeFloorIndex: Ref<number>
}) {
  const dimensionVis = ref<DimensionVis>('none')
  const dimensionSettings = computed(() =>
    readDimensionSettings(options.plan.value, options.activeFloorIndex.value),
  )

  watch(
    () => options.activeFloorIndex.value,
    () => {
      dimensionVis.value = defaultDimensionVis(options.plan.value, options.activeFloorIndex.value)
    },
  )

  watch(
    () => options.plan.value,
    (next, prev) => {
      if (prev != null && next != null) return
      dimensionVis.value = defaultDimensionVis(next, options.activeFloorIndex.value)
    },
    { immediate: true },
  )

  const canConvertActiveDimensions = computed(() => {
    const vis = dimensionVis.value
    const plan = options.plan.value
    const floor = plan?.floors[options.activeFloorIndex.value]
    if (!plan || !floor) return false
    if (vis === 'autogen') {
      return (
        dimensionSettings.value.engineAutoDims &&
        collectOverlayDimensionLines(plan, options.activeFloorIndex.value, 'autogen').length > 0
      )
    }
    if (vis === 'slicer') return readPlanSlices(floor).length > 0
    return false
  })

  const canClearActiveDimensions = computed(() => {
    const vis = dimensionVis.value
    if (vis === 'none') return false
    if (vis === 'autogen') return dimensionSettings.value.engineAutoDims
    const floor = options.plan.value?.floors[options.activeFloorIndex.value]
    if (vis === 'slicer') return readPlanSlices(floor).length > 0
    if (vis === 'manual') {
      return filterManualDimensions(floor?.dimensions, readPlanSlices(floor)).length > 0
    }
    return false
  })

  function patchDimensionSettings(patch: {
    engineAutoDims?: boolean
    dimensionMode?: DimensionMode
    generateOuterDimension?: boolean
  }): void {
    if (!options.plan.value) return
    options.plan.value = writeDimensionSettings(
      options.plan.value,
      patch,
      options.activeFloorIndex.value,
    )
  }

  function clearActiveDimensionType(): void {
    if (!options.plan.value) return
    const vis = dimensionVis.value
    if (vis === 'autogen') {
      options.plan.value = writeDimensionSettings(
        options.plan.value,
        { engineAutoDims: false },
        options.activeFloorIndex.value,
      )
      return
    }
    if (vis === 'slicer') {
      options.plan.value = writePlanSlices(options.plan.value, [], options.activeFloorIndex.value)
      return
    }
    if (vis === 'manual') {
      const floor = options.plan.value.floors[options.activeFloorIndex.value]
      if (!floor) return
      const slices = readPlanSlices(floor)
      const nextDims = (floor.dimensions ?? []).filter((d) => dimensionLiesOnAnySlice(d, slices))
      options.plan.value = {
        ...options.plan.value,
        floors: options.plan.value.floors.map((f, i) =>
          i === options.activeFloorIndex.value
            ? { ...f, dimensions: nextDims.length > 0 ? nextDims : undefined }
            : f,
        ),
      }
    }
  }

  return {
    dimensionVis,
    dimensionSettings,
    canClearActiveDimensions,
    canConvertActiveDimensions,
    patchDimensionSettings,
    clearActiveDimensionType,
  }
}
