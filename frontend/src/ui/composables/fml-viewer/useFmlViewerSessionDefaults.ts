import { computed, ref, type Ref } from 'vue'
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
  seedViewerDefaultsFromPlan,
  type ViewerSessionDefaults,
} from '@/core/fml/viewer-session-defaults'
import { confirmFmlChrome } from '@/ui/composables/fml-chrome-dialog'

/**
 * Viewer-defaults alleen per verdieping (zoals detectie).
 * Confirm vóór overwrite; geometrie via wall-endpoint-height helpers.
 */
export function useFmlViewerSessionDefaults(deps: {
  plan: Ref<FloorPlan | null>
  activeFloorIndex: Ref<number>
  // vue-i18n ComposerTranslation — keep loose to avoid coupling the composable to i18n types.
  t: (key: string, ...args: unknown[]) => string
  confirmOverwrite?: (message: string) => boolean | Promise<boolean>
}) {
  const sessionDefaults = ref<ViewerSessionDefaults>(createFactoryViewerSessionDefaults())
  const floorDefaultsByIndex = ref<Record<number, ViewerSessionDefaults>>({})

  function defaultsForFloor(index: number): ViewerSessionDefaults {
    return floorDefaultsByIndex.value[index] ?? sessionDefaults.value
  }

  const activeFloorDefaults = computed(() => defaultsForFloor(deps.activeFloorIndex.value))

  async function confirmOverwrite(message: string): Promise<boolean> {
    if (deps.confirmOverwrite) return deps.confirmOverwrite(message)
    return confirmFmlChrome({
      title: deps.t('viewer.defaultsOverwriteTitle'),
      message,
      confirmLabel: deps.t('common.apply'),
      cancelLabel: deps.t('common.cancel'),
    })
  }

  function overwriteKey(field: keyof ViewerSessionDefaults): string {
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

  function applyFieldToDefaults(
    target: ViewerSessionDefaults,
    field: keyof ViewerSessionDefaults,
    raw: number | boolean,
  ): ViewerSessionDefaults {
    const next = { ...target }
    if (field === 'bovenlichtDefault' || field === 'windowBovenlichtDefault') {
      next[field] = Boolean(raw)
    } else if (field === 'windowSillZCm' || field === 'bovenlichtGapCm') {
      next[field] = Math.max(0, Math.round(Number(raw)))
    } else {
      next[field] = Math.max(1, Math.round(Number(raw)))
    }
    return next
  }

  function applyOverwrite(
    field: keyof ViewerSessionDefaults,
    next: ViewerSessionDefaults,
    floorIndex: number,
  ): void {
    if (!deps.plan.value) return
    if (field === 'wallHeightCm') {
      deps.plan.value = overwritePlanWallHeights(deps.plan.value, next.wallHeightCm, floorIndex)
    } else if (field === 'doorHeightCm') {
      deps.plan.value = overwritePlanDoorHeights(deps.plan.value, next.doorHeightCm, floorIndex)
    } else if (field === 'windowHeightCm') {
      deps.plan.value = overwritePlanWindowHeights(deps.plan.value, next.windowHeightCm, floorIndex)
    } else if (field === 'windowSillZCm') {
      deps.plan.value = overwritePlanWindowSills(deps.plan.value, next.windowSillZCm, floorIndex)
    } else if (field === 'bovenlichtDefault') {
      deps.plan.value = overwritePlanDoorBovenlicht(
        deps.plan.value,
        next.bovenlichtDefault,
        floorIndex,
      )
    } else if (field === 'windowBovenlichtDefault') {
      deps.plan.value = overwritePlanWindowBovenlicht(
        deps.plan.value,
        next.windowBovenlichtDefault,
        floorIndex,
      )
    } else if (field === 'bovenlichtHeightCm') {
      deps.plan.value = overwritePlanBovenlichtHeight(
        deps.plan.value,
        next.bovenlichtHeightCm,
        floorIndex,
      )
    } else {
      deps.plan.value = overwritePlanBovenlichtGap(
        deps.plan.value,
        next.bovenlichtGapCm,
        floorIndex,
      )
    }
  }

  function countForField(field: keyof ViewerSessionDefaults, floorIndex: number): number {
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

  async function applyFloorDefault(
    field: keyof ViewerSessionDefaults,
    raw: number | boolean,
  ): Promise<void> {
    if (!deps.plan.value) return
    const floorIndex = deps.activeFloorIndex.value
    const current = activeFloorDefaults.value
    const next = applyFieldToDefaults(current, field, raw)
    if (next[field] === current[field]) return

    const count = countForField(field, floorIndex)
    const enabled = Boolean(next[field])
    const message = deps.t(overwriteKey(field), {
      count,
      cm: next[field],
      state: enabled ? deps.t('viewer.defaultsOn') : deps.t('viewer.defaultsOff'),
    })
    if (!(await confirmOverwrite(message))) return

    applyOverwrite(field, next, floorIndex)
    floorDefaultsByIndex.value = {
      ...floorDefaultsByIndex.value,
      [floorIndex]: next,
    }
  }

  async function onFloorDefaultNumber(
    field: keyof ViewerSessionDefaults,
    event: Event,
  ): Promise<void> {
    const input = event.target as HTMLInputElement
    const value = Number(input.value)
    const before = activeFloorDefaults.value[field]
    if (!Number.isFinite(value)) {
      input.value = String(before)
      return
    }
    await applyFloorDefault(field, value)
    if (activeFloorDefaults.value[field] === before) {
      input.value = String(before)
    }
  }

  async function onFloorDefaultBool(
    field: 'bovenlichtDefault' | 'windowBovenlichtDefault',
    event: Event,
  ): Promise<void> {
    const input = event.target as HTMLInputElement
    const before = activeFloorDefaults.value[field]
    await applyFloorDefault(field, input.checked)
    if (activeFloorDefaults.value[field] === before) {
      input.checked = before
    }
  }

  function hydrateFloorDefaultsFromPlan(plan: FloorPlan | null): void {
    if (!plan) {
      floorDefaultsByIndex.value = {}
      return
    }
    const next: Record<number, ViewerSessionDefaults> = {}
    for (let i = 0; i < plan.floors.length; i++) {
      next[i] = seedViewerDefaultsFromPlan(plan, i, {
        floorOnly: true,
        fallback: sessionDefaults.value,
      })
    }
    floorDefaultsByIndex.value = next
  }

  function addFloorDefaultsSlot(index: number, source?: ViewerSessionDefaults): void {
    floorDefaultsByIndex.value = {
      ...floorDefaultsByIndex.value,
      [index]: { ...(source ?? sessionDefaults.value) },
    }
  }

  function removeFloorDefaultsSlot(index: number): void {
    const next: Record<number, ViewerSessionDefaults> = {}
    for (const [key, value] of Object.entries(floorDefaultsByIndex.value)) {
      const from = Number(key)
      if (!Number.isFinite(from) || from === index) continue
      const to = from > index ? from - 1 : from
      next[to] = value
    }
    floorDefaultsByIndex.value = next
  }

  return {
    sessionDefaults,
    activeFloorDefaults,
    defaultsForFloor,
    onFloorDefaultNumber,
    onFloorDefaultBool,
    hydrateFloorDefaultsFromPlan,
    addFloorDefaultsSlot,
    removeFloorDefaultsSlot,
  }
}
