import { computed, ref, watch, type Ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import { hasElevationFacadeGroups, listElevationFacadeGroups } from '@/core/fml/facade-groups'
import { elevationViewForGroup, readElevationProjection } from '@/core/fml/elevation-views'
import { elevationStackRows } from '@/core/fml/floor-stack'
import {
  listRidgeWallsOnFloor,
  ridgeDisplayWidthCm,
  ridgeEndpointZCm,
} from '@/core/fml/ridge-walls'
import { imageDimensions, loadImage } from '@/platform/image'
import { previewUnderlayLayoutFromDrawing } from '@/core/fml/drawing-to-underlay-layout'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'

/**
 * Gevels-tab: groep, projectie, hoogte-stack, elevation-onderlegger + actieve underlay.
 */
export function useFmlViewerGevels(options: {
  plan: Ref<FloorPlan | null>
  inspectMode: Ref<boolean>
  planUnderlayLayout: Ref<PreviewUnderlayLayout | null>
  planUnderlayWidthPx: Ref<number>
  planUnderlayHeightPx: Ref<number>
  leaveDakMode: () => void
  onLeaveGevels: (wasOn: boolean) => void
  onEnterGevels: () => void
}) {
  const gevelsMode = ref(false)
  const elevationGroupId = ref('')
  const elevationUnderlaySrc = ref<string | null>(null)
  const elevationUnderlayWidthPx = ref(0)
  const elevationUnderlayHeightPx = ref(0)
  const elevationUnderlayLayout = ref<PreviewUnderlayLayout | null>(null)

  const elevationFacadeGroups = computed(() => listElevationFacadeGroups(options.plan.value))
  const showGevelsChip = computed(
    () => !options.inspectMode.value && hasElevationFacadeGroups(options.plan.value),
  )

  function ridgeRowZCm(floorIndex: number, fallback: number): number {
    const current = options.plan.value
    const floor = current?.floors[floorIndex]
    if (!current || !floor) return fallback
    const zs = listRidgeWallsOnFloor(floor).flatMap((wall) => [
      Math.round(ridgeEndpointZCm(wall, 'a', floor.height)),
      Math.round(ridgeEndpointZCm(wall, 'b', floor.height)),
    ])
    if (zs.length > 0 && zs.every((value) => value === zs[0])) return zs[0] ?? fallback
    return fallback
  }

  const elevationHeightRows = computed(() => {
    if (!options.plan.value || !gevelsMode.value) return []
    return elevationStackRows(options.plan.value).map((row) =>
      row.kind === 'ridge' ? { ...row, zCm: ridgeRowZCm(row.floorIndex, row.zCm) } : row,
    )
  })
  const elevationRidgeDisplayWidthCm = computed(() =>
    options.plan.value ? ridgeDisplayWidthCm(options.plan.value) : 10,
  )
  const elevationProjection = computed(() => readElevationProjection(options.plan.value))

  const activeUnderlayLayout = computed(() =>
    gevelsMode.value ? elevationUnderlayLayout.value : options.planUnderlayLayout.value,
  )
  const activeUnderlayWidthPx = computed(() =>
    gevelsMode.value ? elevationUnderlayWidthPx.value : options.planUnderlayWidthPx.value,
  )
  const activeUnderlayHeightPx = computed(() =>
    gevelsMode.value ? elevationUnderlayHeightPx.value : options.planUnderlayHeightPx.value,
  )

  let elevationUnderlayLoadGen = 0

  async function syncElevationUnderlayFromPlan(): Promise<void> {
    elevationUnderlayLoadGen += 1
    const gen = elevationUnderlayLoadGen
    if (!options.plan.value || !elevationGroupId.value) {
      elevationUnderlaySrc.value = null
      elevationUnderlayWidthPx.value = 0
      elevationUnderlayHeightPx.value = 0
      elevationUnderlayLayout.value = null
      return
    }
    const drawing = elevationViewForGroup(options.plan.value, elevationGroupId.value)?.drawing
    if (!drawing?.url) {
      elevationUnderlaySrc.value = null
      elevationUnderlayWidthPx.value = 0
      elevationUnderlayHeightPx.value = 0
      elevationUnderlayLayout.value = null
      return
    }
    elevationUnderlaySrc.value = drawing.url
    try {
      const img = await loadImage(drawing.url)
      if (gen !== elevationUnderlayLoadGen) return
      const { width, height } = imageDimensions(img)
      elevationUnderlayWidthPx.value = width
      elevationUnderlayHeightPx.value = height
      elevationUnderlayLayout.value = previewUnderlayLayoutFromDrawing(drawing, { width, height })
    } catch {
      if (gen !== elevationUnderlayLoadGen) return
      elevationUnderlayLayout.value = null
    }
  }

  function leaveGevelsMode(): void {
    options.onLeaveGevels(gevelsMode.value)
    gevelsMode.value = false
  }

  function enterGevelsMode(): void {
    if (options.inspectMode.value || !hasElevationFacadeGroups(options.plan.value)) return
    if (gevelsMode.value) return
    const groups = elevationFacadeGroups.value
    if (!groups.some((group) => group.id === elevationGroupId.value)) {
      elevationGroupId.value = groups[0]?.id ?? ''
    }
    options.leaveDakMode()
    options.onEnterGevels()
    gevelsMode.value = true
    void syncElevationUnderlayFromPlan()
  }

  watch(showGevelsChip, (show) => {
    if (!show) leaveGevelsMode()
  })
  watch(options.inspectMode, (on) => {
    if (on) leaveGevelsMode()
  })

  return {
    gevelsMode,
    elevationGroupId,
    elevationUnderlaySrc,
    elevationUnderlayWidthPx,
    elevationUnderlayHeightPx,
    elevationUnderlayLayout,
    elevationFacadeGroups,
    showGevelsChip,
    elevationHeightRows,
    elevationRidgeDisplayWidthCm,
    elevationProjection,
    activeUnderlayLayout,
    activeUnderlayWidthPx,
    activeUnderlayHeightPx,
    leaveGevelsMode,
    enterGevelsMode,
    syncElevationUnderlayFromPlan,
  }
}
