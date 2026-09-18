import { computed, type Ref } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import {
  applyFloorDefaultBool,
  applyFloorDefaultNumber,
  applyOpeningFrameDefault,
  applyStoryHeight,
  createFactoryFloorDefaults,
  readFloorDefaults,
  type FloorDefaultBoolField,
  type FloorDefaultNumberField,
  type FloorDefaults,
} from '@/core/plan/floor-defaults'
import {
  countPlanBovenlichtOpenings,
  countPlanOpenings,
  countPlanWalls,
} from '@/core/plan/wall-endpoint-height'
import { countPlanFramedOpenings } from '@/core/plan/opening-frame-defaults'
import type { OpeningFrameCm } from '@/core/plan/opening-kind-catalog'
import { promptDefaultsApplyScope } from '@/ui/composables/plan-chrome-dialog'
import { formatScaleInputLabel } from '@/ui/composables/settings/scale-input-unit'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'

/**
 * Floor-defaults uit `plan.floors[i].defaults` (geen parallelle sessie-map).
 */
export function useEditorSessionDefaults(deps: {
  plan: Ref<FloorPlan | null>
  activeFloorIndex: Ref<number>
  t: (key: string, ...args: unknown[]) => string
  beforeApply?: () => void
}) {
  function defaultsForFloor(index: number): FloorDefaults {
    return deps.plan.value
      ? readFloorDefaults(deps.plan.value, index)
      : createFactoryFloorDefaults()
  }

  const activeFloorDefaults = computed(() => defaultsForFloor(deps.activeFloorIndex.value))

  function overwriteKey(field: FloorDefaultNumberField | FloorDefaultBoolField | 'wallHeightCm'): string {
    switch (field) {
      case 'wallHeightCm':
        return 'viewer.defaultsOverwriteWallFloor'
      case 'doorHeightCm':
        return 'viewer.defaultsOverwriteDoorFloor'
      case 'windowHeightCm':
        return 'viewer.defaultsOverwriteWindowFloor'
      case 'windowSillZCm':
        return 'viewer.defaultsOverwriteSillFloor'
      case 'bovenlichtDefault':
        return 'viewer.defaultsOverwriteBovenlichtDoorsFloor'
      case 'windowBovenlichtDefault':
        return 'viewer.defaultsOverwriteBovenlichtWindowsFloor'
      case 'bovenlichtHeightCm':
        return 'viewer.defaultsOverwriteBovenlichtHeightFloor'
      case 'bovenlichtGapCm':
        return 'viewer.defaultsOverwriteBovenlichtGapFloor'
    }
  }

  function countForField(
    field: FloorDefaultNumberField | FloorDefaultBoolField | 'wallHeightCm',
    floorIndex: number,
  ): number {
    const plan = deps.plan.value
    if (!plan) return 0
    if (field === 'wallHeightCm') return countPlanWalls(plan, floorIndex)
    if (field === 'doorHeightCm' || field === 'bovenlichtDefault') {
      return countPlanOpenings(plan, 'door', floorIndex)
    }
    if (
      field === 'windowHeightCm' ||
      field === 'windowSillZCm' ||
      field === 'windowBovenlichtDefault'
    ) {
      return countPlanOpenings(plan, 'window', floorIndex)
    }
    return countPlanBovenlichtOpenings(plan, floorIndex)
  }

  async function promptScope(
    field: FloorDefaultNumberField | FloorDefaultBoolField | 'wallHeightCm' | 'frame',
    count: number,
    nextLabel: string,
    extra?: { state?: string; frameLabel?: string },
  ): Promise<import('@/core/plan/floor-defaults').DefaultsApplyScope | null> {
    const plan = deps.plan.value
    if (!plan) return null
    const allowDefaultsOnly = field !== 'wallHeightCm'
    const message =
      field === 'frame'
        ? deps.t('viewer.defaultsOverwriteFrame', {
            label: extra?.frameLabel,
            length: nextLabel,
            count,
          })
        : deps.t(overwriteKey(field), {
            count,
            length: nextLabel,
            cm: nextLabel,
            state: extra?.state,
          })
    return promptDefaultsApplyScope({
      title: deps.t('viewer.defaultsOverwriteTitle'),
      message,
      floorCount: plan.floors.length,
      existingCount: count,
      allowDefaultsOnly,
    })
  }

  async function onFloorDefaultCm(
    field: FloorDefaultNumberField | 'wallHeightCm',
    cm: number,
  ): Promise<void> {
    if (!deps.plan.value || !Number.isFinite(cm)) return
    const floorIndex = deps.activeFloorIndex.value
    const current =
      field === 'wallHeightCm'
        ? deps.plan.value.floors[floorIndex]?.height
        : activeFloorDefaults.value[field]
    const next =
      field === 'windowSillZCm' || field === 'bovenlichtGapCm'
        ? Math.max(0, Math.round(cm))
        : Math.max(1, Math.round(cm))
    if (next === current) return

    const count = countForField(field, floorIndex)
    const length = formatScaleInputLabel(next, loadUserSettings().scaleInputUnit)
    const scope = await promptScope(field, count, length)
    if (!scope || !deps.plan.value) return
    deps.beforeApply?.()
    if (field === 'wallHeightCm') {
      if (scope === 'defaultsOnly') return
      deps.plan.value = applyStoryHeight(deps.plan.value, floorIndex, next, scope)
      return
    }
    deps.plan.value = applyFloorDefaultNumber(deps.plan.value, floorIndex, field, next, scope)
  }

  async function onFloorDefaultBool(field: FloorDefaultBoolField, event: Event): Promise<void> {
    if (!deps.plan.value) return
    const input = event.target as HTMLInputElement
    const before = activeFloorDefaults.value[field]
    const next = input.checked
    if (next === before) return
    const floorIndex = deps.activeFloorIndex.value
    const count = countForField(field, floorIndex)
    const scope = await promptScope(field, count, String(next), {
      state: next ? deps.t('viewer.defaultsOn') : deps.t('viewer.defaultsOff'),
    })
    if (!scope || !deps.plan.value) {
      input.checked = before
      return
    }
    deps.beforeApply?.()
    deps.plan.value = applyFloorDefaultBool(deps.plan.value, floorIndex, field, next, scope)
    if (readFloorDefaults(deps.plan.value, floorIndex)[field] === before) {
      input.checked = before
    }
  }

  async function onOpeningFrameCm(
    kind: 'door' | 'window',
    side: keyof OpeningFrameCm,
    cm: number,
    label: string,
  ): Promise<void> {
    if (!deps.plan.value) return
    const floorIndex = deps.activeFloorIndex.value
    const current = activeFloorDefaults.value.openingFrameDefaults[kind][side]
    const next = Math.max(0, Math.round(cm))
    if (next === current) return
    const count = countPlanFramedOpenings(deps.plan.value, kind, floorIndex)
    const scope = await promptScope('frame', count, formatScaleInputLabel(next, loadUserSettings().scaleInputUnit), {
      frameLabel: label,
    })
    if (!scope || !deps.plan.value) return
    deps.beforeApply?.()
    deps.plan.value = applyOpeningFrameDefault(deps.plan.value, floorIndex, kind, side, next, scope)
  }

  return {
    activeFloorDefaults,
    defaultsForFloor,
    onFloorDefaultCm,
    onFloorDefaultBool,
    onOpeningFrameCm,
  }
}
