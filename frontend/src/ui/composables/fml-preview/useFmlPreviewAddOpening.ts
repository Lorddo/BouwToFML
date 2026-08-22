import type { Ref } from 'vue'
import {
  maybeAddSiblingBovenlicht,
  type ExpandBovenlichtFloorDefaults,
} from '@/core/fml/bovenlicht'
import { DEFAULT_FML_DOOR_HEIGHT_CM } from '@/core/fml/extraction-to-plan-types'
import type { Opening, Point2D } from '@/core/fml/types'
import { buildOpeningFromPreset } from '@/core/fml/opening-from-preset'
import type { DoorAddSubtype, WindowAddSubtype } from '@/core/fml/opening-add-presets'
import {
  clampDoorOpeningT,
  clampOpeningSillZ,
  clampOpeningWidth,
  clampWindowOpeningHeight,
  DEFAULT_WINDOW_SILL_Z_CM,
  projectPointToWallT,
  wallCollinearEnds,
} from '@/ui/components/fml-preview-openings'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

export function useFmlPreviewAddOpening(options: {
  editor: EditorApi
  addDoorSubtype: Ref<DoorAddSubtype>
  addDoorWidthCm: Ref<number>
  addDoorHeightCm: Ref<number>
  addWindowSubtype: Ref<WindowAddSubtype>
  addWindowWidthCm: Ref<number>
  addWindowSillZCm: Ref<number>
  addWindowHeightCm: Ref<number>
  /** Unpacked: place sibling-raam als floor-default aan. */
  bovenlichtPacked?: Ref<boolean>
  bovenlichtDefaults?: Ref<ExpandBovenlichtFloorDefaults>
  beforePlace: () => void
  syncPlanToParent: () => void
}) {
  function placeOpening(mode: 'door' | 'window', wallId: string, cm: Point2D): string | null {
    const wall = options.editor.walls.value.find((item) => item.id === wallId)
    if (!wall) return null

    const widthCm = clampOpeningWidth(
      mode === 'door' ? options.addDoorWidthCm.value : options.addWindowWidthCm.value,
    )
    if (mode === 'door') options.addDoorWidthCm.value = widthCm
    else options.addWindowWidthCm.value = widthCm

    const sillZCm =
      mode === 'window'
        ? clampOpeningSillZ(options.addWindowSillZCm.value)
        : DEFAULT_WINDOW_SILL_Z_CM
    const heightCm =
      mode === 'window'
        ? clampWindowOpeningHeight(options.addWindowHeightCm.value)
        : Math.max(1, Math.round(options.addDoorHeightCm.value || DEFAULT_FML_DOOR_HEIGHT_CM))
    if (mode === 'window') {
      options.addWindowSillZCm.value = sillZCm
      options.addWindowHeightCm.value = heightCm
    } else {
      options.addDoorHeightCm.value = heightCm
    }

    const projectedT = projectPointToWallT(wall, cm)
    const openingT = clampDoorOpeningT(
      wall,
      widthCm,
      projectedT,
      wallCollinearEnds(options.editor.walls.value, wallId),
    )
    const opening: Opening = buildOpeningFromPreset({
      type: mode,
      doorSubtype: options.addDoorSubtype.value,
      windowSubtype: options.addWindowSubtype.value,
      widthCm,
      heightCm,
      sillZCm,
      t: openingT,
    })

    options.beforePlace()
    options.editor.pushUndo()
    const openingId = options.editor.applyOpeningAdd(wallId, opening)
    if (!openingId) {
      options.editor.undo()
      return null
    }

    if (options.bovenlichtPacked?.value === false && options.bovenlichtDefaults) {
      const host = options.editor.walls.value.find((item) => item.id === wallId) ?? wall
      const sibling = maybeAddSiblingBovenlicht(
        host,
        opening,
        options.editor.floorHeightCm.value,
        options.bovenlichtDefaults.value,
      )
      if (sibling) options.editor.applyOpeningAdd(wallId, sibling)
    }

    options.syncPlanToParent()
    return openingId
  }

  return {
    placeDoor: (wallId: string, cm: Point2D) => placeOpening('door', wallId, cm),
    placeWindow: (wallId: string, cm: Point2D) => placeOpening('window', wallId, cm),
  }
}
