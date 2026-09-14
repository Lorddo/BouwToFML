import { computed, ref, watch, type Ref } from 'vue'
import { bindFloorWallsToRoofs, listFloorsWithRoofPlanes } from '@/core/fml/bind-walls-to-roofs'
import type { FloorPlan } from '@/core/fml/types'
import { splitWallAtT } from '@/ui/components/plan-canvas-wall-edit'
import { promptPlanChromeChoice } from '@/ui/composables/plan-chrome-dialog'

/** De drie canvas-methodes die het binden nodig heeft. */
export interface BindRoofCanvas {
  flushPendingFieldCommits?: () => void
  pushUndo?: () => void
  bindWallsToRoof?: (floorIndex: number) => {
    boundJunctions: number
    skippedBlocked: number
    skippedUncovered: number
    splits: number
  } | null
}

/**
 * Muren aan dakvlakken binden. Op de Dak-tab doet het canvas het (die kent de
 * actieve chip); elders draait de plan-variant, met een popup als meer dan één
 * verdieping dakvlakken heeft.
 */
export function useEditorBindRoof(deps: {
  plan: Ref<FloorPlan | null>
  activeFloorIndex: Ref<number>
  dakMode: Ref<boolean>
  gevelsMode: Ref<boolean>
  canvas: Ref<BindRoofCanvas | null>
  // vue-i18n ComposerTranslation — keep loose to avoid coupling the composable to i18n types.
  t: (key: string, ...args: unknown[]) => string
}) {
  const bindRoofHint = ref<string | null>(null)
  const bindRoofFloorIndex = ref<number | null>(null)

  const floorsWithRoofPlanes = computed(() => listFloorsWithRoofPlanes(deps.plan.value))

  const canBindWallsToRoof = computed(() => {
    if (!deps.plan.value) return false
    if (deps.dakMode.value) return resolveBindRoofFloorIndex() != null
    return floorsWithRoofPlanes.value.length > 0
  })

  function resolveBindRoofFloorIndex(): number | null {
    const floorList = floorsWithRoofPlanes.value
    if (floorList.length === 0) return null
    if (deps.dakMode.value) {
      return floorList.some((f) => f.floorIndex === deps.activeFloorIndex.value)
        ? deps.activeFloorIndex.value
        : null
    }
    if (
      bindRoofFloorIndex.value != null &&
      floorList.some((f) => f.floorIndex === bindRoofFloorIndex.value)
    ) {
      return bindRoofFloorIndex.value
    }
    if (floorList.some((f) => f.floorIndex === deps.activeFloorIndex.value)) {
      return deps.activeFloorIndex.value
    }
    return floorList[0]?.floorIndex ?? null
  }

  /**
   * Welke verdiepingen dakvlakken hebben, als vergelijkbare waarde. `floorsWithRoofPlanes`
   * geeft bij elke plan-mutatie een nieuwe array, dus daarop watchen liet een geslaagde
   * bind zijn eigen resultaat-melding wissen.
   */
  const roofFloorKey = computed(() =>
    floorsWithRoofPlanes.value.map((floor) => floor.floorIndex).join(','),
  )

  watch([roofFloorKey, deps.activeFloorIndex, deps.dakMode, deps.gevelsMode], () => {
    bindRoofFloorIndex.value = resolveBindRoofFloorIndex()
    bindRoofHint.value = null
  })

  async function bindWallsToRoof(): Promise<void> {
    if (!deps.plan.value) return
    const floorList = floorsWithRoofPlanes.value
    if (floorList.length === 0) return

    let floorIndex: number | null
    if (deps.dakMode.value) {
      floorIndex = resolveBindRoofFloorIndex()
    } else if (floorList.length === 1) {
      floorIndex = floorList[0]?.floorIndex ?? null
    } else {
      const picked = await promptPlanChromeChoice({
        title: deps.t('viewer.bindWallsToRoof'),
        message: deps.t('viewer.bindWallsToRoofPickHint'),
        confirmLabel: deps.t('viewer.bindWallsToRoof'),
        defaultValue: String(resolveBindRoofFloorIndex() ?? floorList[0]?.floorIndex ?? 0),
        listItems: floorList.map((floor) => ({
          id: String(floor.floorIndex),
          name: floor.name,
        })),
      })
      if (picked == null) return
      floorIndex = Number(picked)
      if (!floorList.some((floor) => floor.floorIndex === floorIndex)) return
      bindRoofFloorIndex.value = floorIndex
    }
    if (floorIndex == null) return
    applyBindWallsToRoof(floorIndex)
  }

  function setBindRoofHint(result: {
    boundJunctions: number
    skippedBlocked: number
    skippedUncovered: number
    splits: number
  }): void {
    bindRoofHint.value = deps.t('viewer.bindWallsToRoofResult', {
      bound: result.boundJunctions,
      skipped: result.skippedBlocked + result.skippedUncovered,
      splits: result.splits,
    })
  }

  function applyBindWallsToRoof(floorIndex: number): void {
    if (!deps.plan.value) return

    if (deps.dakMode.value && deps.canvas.value?.bindWallsToRoof) {
      const result = deps.canvas.value.bindWallsToRoof(floorIndex)
      if (!result) return
      setBindRoofHint(result)
      return
    }

    deps.canvas.value?.flushPendingFieldCommits?.()
    const result = bindFloorWallsToRoofs(deps.plan.value, floorIndex, {
      splitCreases: true,
      splitWalls: splitWallAtT,
    })
    setBindRoofHint(result)
    if (result.boundJunctions === 0 && result.splits === 0 && result.flushedEdges === 0) return
    deps.canvas.value?.pushUndo?.()
    deps.plan.value = result.plan
  }

  return {
    bindRoofHint,
    canBindWallsToRoof,
    bindWallsToRoof,
  }
}
