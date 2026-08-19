import { ref, watch, type Ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import {
  countPlanBovenlichtOpenings,
  countPlanOpenings,
  countPlanWalls,
  overwritePlanBovenlichtGap,
  overwritePlanBovenlichtHeight,
  overwritePlanDoorBovenlicht,
  overwritePlanDoorHeights,
  overwritePlanWallHeights,
  overwritePlanWindowBovenlicht,
  overwritePlanWindowHeights,
  overwritePlanWindowSills,
} from '@/core/fml/wall-endpoint-height'
import {
  createFactoryViewerSessionDefaults,
  type ViewerSessionDefaults,
} from '@/core/fml/viewer-session-defaults'

/**
 * Viewer-only sessie-defaults: confirm vóór overwrite van alle floors.
 * Geometrie-mutaties via wall-endpoint-height helpers; UX blijft window.confirm.
 */
export function useFmlViewerSessionDefaults(deps: {
  plan: Ref<FloorPlan | null>
  activeFloorIndex: Ref<number>
  // vue-i18n ComposerTranslation — keep loose to avoid coupling the composable to i18n types.
  t: (key: string, ...args: unknown[]) => string
}) {
  const sessionDefaults = ref<ViewerSessionDefaults>(createFactoryViewerSessionDefaults())

  function confirmOverwrite(message: string): boolean {
    return window.confirm(message)
  }

  function applySessionDefault(field: keyof ViewerSessionDefaults, raw: number | boolean): void {
    if (!deps.plan.value) return
    const nextDefaults = { ...sessionDefaults.value }

    if (field === 'wallHeightCm') {
      const height = Math.max(1, Math.round(Number(raw)))
      if (height === sessionDefaults.value.wallHeightCm) return
      const count = countPlanWalls(deps.plan.value)
      if (!confirmOverwrite(deps.t('viewer.defaultsOverwriteWall', { count, cm: height }))) {
        return
      }
      deps.plan.value = overwritePlanWallHeights(deps.plan.value, height)
      nextDefaults.wallHeightCm = height
    } else if (field === 'doorHeightCm') {
      const height = Math.max(1, Math.round(Number(raw)))
      if (height === sessionDefaults.value.doorHeightCm) return
      const count = countPlanOpenings(deps.plan.value, 'door')
      if (!confirmOverwrite(deps.t('viewer.defaultsOverwriteDoor', { count, cm: height }))) {
        return
      }
      deps.plan.value = overwritePlanDoorHeights(deps.plan.value, height)
      nextDefaults.doorHeightCm = height
    } else if (field === 'windowHeightCm') {
      const height = Math.max(1, Math.round(Number(raw)))
      if (height === sessionDefaults.value.windowHeightCm) return
      const count = countPlanOpenings(deps.plan.value, 'window')
      if (!confirmOverwrite(deps.t('viewer.defaultsOverwriteWindow', { count, cm: height }))) {
        return
      }
      deps.plan.value = overwritePlanWindowHeights(deps.plan.value, height)
      nextDefaults.windowHeightCm = height
    } else if (field === 'windowSillZCm') {
      const sill = Math.max(0, Math.round(Number(raw)))
      if (sill === sessionDefaults.value.windowSillZCm) return
      const count = countPlanOpenings(deps.plan.value, 'window')
      if (!confirmOverwrite(deps.t('viewer.defaultsOverwriteSill', { count, cm: sill }))) {
        return
      }
      deps.plan.value = overwritePlanWindowSills(deps.plan.value, sill)
      nextDefaults.windowSillZCm = sill
    } else if (field === 'bovenlichtDefault') {
      const enabled = Boolean(raw)
      if (enabled === sessionDefaults.value.bovenlichtDefault) return
      const count = countPlanOpenings(deps.plan.value, 'door')
      if (
        !confirmOverwrite(
          deps.t('viewer.defaultsOverwriteBovenlichtDoors', {
            count,
            state: enabled ? deps.t('viewer.defaultsOn') : deps.t('viewer.defaultsOff'),
          }),
        )
      ) {
        return
      }
      deps.plan.value = overwritePlanDoorBovenlicht(deps.plan.value, enabled)
      nextDefaults.bovenlichtDefault = enabled
    } else if (field === 'windowBovenlichtDefault') {
      const enabled = Boolean(raw)
      if (enabled === sessionDefaults.value.windowBovenlichtDefault) return
      const count = countPlanOpenings(deps.plan.value, 'window')
      if (
        !confirmOverwrite(
          deps.t('viewer.defaultsOverwriteBovenlichtWindows', {
            count,
            state: enabled ? deps.t('viewer.defaultsOn') : deps.t('viewer.defaultsOff'),
          }),
        )
      ) {
        return
      }
      deps.plan.value = overwritePlanWindowBovenlicht(deps.plan.value, enabled)
      nextDefaults.windowBovenlichtDefault = enabled
    } else if (field === 'bovenlichtHeightCm') {
      const height = Math.max(1, Math.round(Number(raw)))
      if (height === sessionDefaults.value.bovenlichtHeightCm) return
      const count = countPlanBovenlichtOpenings(deps.plan.value)
      if (
        !confirmOverwrite(deps.t('viewer.defaultsOverwriteBovenlichtHeight', { count, cm: height }))
      ) {
        return
      }
      deps.plan.value = overwritePlanBovenlichtHeight(deps.plan.value, height)
      nextDefaults.bovenlichtHeightCm = height
    } else if (field === 'bovenlichtGapCm') {
      const gap = Math.max(0, Math.round(Number(raw)))
      if (gap === sessionDefaults.value.bovenlichtGapCm) return
      const count = countPlanBovenlichtOpenings(deps.plan.value)
      if (!confirmOverwrite(deps.t('viewer.defaultsOverwriteBovenlichtGap', { count, cm: gap }))) {
        return
      }
      deps.plan.value = overwritePlanBovenlichtGap(deps.plan.value, gap)
      nextDefaults.bovenlichtGapCm = gap
    }

    sessionDefaults.value = nextDefaults
  }

  function onSessionDefaultNumber(field: keyof ViewerSessionDefaults, event: Event): void {
    const input = event.target as HTMLInputElement
    const value = Number(input.value)
    const before = sessionDefaults.value[field]
    if (!Number.isFinite(value)) {
      input.value = String(before)
      return
    }
    applySessionDefault(field, value)
    if (sessionDefaults.value[field] === before) {
      input.value = String(before)
    }
  }

  function onSessionDefaultBool(
    field: 'bovenlichtDefault' | 'windowBovenlichtDefault',
    event: Event,
  ): void {
    const input = event.target as HTMLInputElement
    const before = sessionDefaults.value[field]
    applySessionDefault(field, input.checked)
    if (sessionDefaults.value[field] === before) {
      input.checked = before
    }
  }

  /** Floor-switch: muurhoogte-default volgt floor.height (zonder overwrite-confirm). */
  watch(deps.activeFloorIndex, (idx) => {
    const floor = deps.plan.value?.floors[idx]
    if (!floor || !(floor.height > 0)) return
    const height = Math.round(floor.height)
    if (height === sessionDefaults.value.wallHeightCm) return
    sessionDefaults.value = { ...sessionDefaults.value, wallHeightCm: height }
  })

  return {
    sessionDefaults,
    applySessionDefault,
    onSessionDefaultNumber,
    onSessionDefaultBool,
  }
}
