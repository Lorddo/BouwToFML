import { computed, ref, watch, type Ref } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import { hasElevationFacadeGroups, listElevationFacadeGroups } from '@/core/plan/facade-groups'
import {
  elevationViewForGroup,
  readElevationProjection,
  setElevationProjection,
} from '@/core/plan/elevation-views'
import {
  elevationDakThicknessCm,
  elevationFloorGroups,
  setNokThicknessCm,
  setSlabThicknessCm,
} from '@/core/plan/floor-stack'
import { overwriteRidgeDakThickness } from '@/core/plan/ridge-walls'
import { countPlanWalls, overwritePlanWallHeights } from '@/core/plan/wall-endpoint-height'
import { imageDimensions, loadImage } from '@/platform/image'
import { previewUnderlayLayoutFromDrawing } from '@/core/plan/drawing-to-underlay-layout'
import { confirmPlanChrome } from '@/ui/composables/plan-chrome-dialog'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'
import {
  formatScaleInputLabel,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'

/**
 * Gevels-tab: groep, projectie, hoogte-stack, elevation-onderlegger + actieve underlay.
 */
export function useEditorGevels(options: {
  plan: Ref<FloorPlan | null>
  inspectMode: Ref<boolean>
  planUnderlayLayout: Ref<PreviewUnderlayLayout | null>
  planUnderlayWidthPx: Ref<number>
  planUnderlayHeightPx: Ref<number>
  scaleInputUnit: Ref<ScaleInputUnit>
  leaveDakMode: () => void
  onLeaveGevels: (wasOn: boolean) => void
  onEnterGevels: () => void
  // vue-i18n ComposerTranslation — keep loose to avoid coupling the composable to i18n types.
  t: (key: string, ...args: unknown[]) => string
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

  // --- Hoogte-stack schrijven (tegenhangers van de computeds hierboven) ---

  /** Verdiepingshoogte overschrijft plattegrondmuren op die floor (nokbalken via dakdikte). */
  async function onElevationStoryHeight(floorIndex: number, cm: number): Promise<void> {
    if (!options.plan.value) return
    const count = countPlanWalls(options.plan.value, floorIndex)
    const ok = await confirmPlanChrome({
      title: options.t('viewer.defaultsOverwriteTitle'),
      message: options.t('viewer.defaultsOverwriteWallFloor', {
        length: formatScaleInputLabel(cm, options.scaleInputUnit.value),
        cm: formatScaleInputLabel(cm, options.scaleInputUnit.value),
        count,
      }),
      confirmLabel: options.t('common.apply'),
      cancelLabel: options.t('common.cancel'),
    })
    if (!ok || !options.plan.value) return
    options.plan.value = overwritePlanWallHeights(options.plan.value, cm, floorIndex)
  }

  /** Dakdikte is globaal: stack én de nokbalken zelf. */
  function onElevationNok(cm: number): void {
    if (!options.plan.value) return
    options.plan.value = overwriteRidgeDakThickness(
      setNokThicknessCm(options.plan.value, cm),
      cm,
    )
  }

  function onElevationProjection(mode: 'architect' | 'projective'): void {
    if (!options.plan.value) return
    options.plan.value = setElevationProjection(options.plan.value, mode)
  }

  function onElevationSlab(floorIndex: number, cm: number): void {
    const floor = options.plan.value?.floors[floorIndex]
    if (!options.plan.value || !floor) return
    options.plan.value = setSlabThicknessCm(options.plan.value, floor.level, cm)
  }

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
    onElevationStoryHeight,
    onElevationNok,
    onElevationProjection,
    onElevationSlab,
  }
}
