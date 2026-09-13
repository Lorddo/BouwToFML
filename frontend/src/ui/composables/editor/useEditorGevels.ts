import { computed, ref, watch, type Ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import { hasElevationFacadeGroups, listElevationFacadeGroups } from '@/core/fml/facade-groups'
import { elevationViewForGroup, readElevationProjection } from '@/core/fml/elevation-views'
import { elevationDakThicknessCm, elevationFloorGroups } from '@/core/fml/floor-stack'
import { imageDimensions, loadImage } from '@/platform/image'
import { previewUnderlayLayoutFromDrawing } from '@/core/fml/drawing-to-underlay-layout'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'

/**
 * Gevels-tab: groep, projectie, hoogte-stack, elevation-onderlegger + actieve underlay.
 */
export function useEditorGevels(options: {
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

  const elevationDakThickness = computed(() =>
    options.plan.value ? elevationDakThicknessCm(options.plan.value) : 0,
  )
  const elevationFloorGroupsList = computed(() => {
    if (!options.plan.value || !gevelsMode.value) return []
    return elevationFloorGroups(options.plan.value)
  })
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
    elevationDakThicknessCm: elevationDakThickness,
    elevationFloorGroups: elevationFloorGroupsList,
    elevationProjection,
    activeUnderlayLayout,
    activeUnderlayWidthPx,
    activeUnderlayHeightPx,
    leaveGevelsMode,
    enterGevelsMode,
    syncElevationUnderlayFromPlan,
  }
}
