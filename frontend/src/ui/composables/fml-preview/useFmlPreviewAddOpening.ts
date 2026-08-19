import type { Ref } from 'vue'
import { DEFAULT_FML_DOOR_HEIGHT_CM } from '@/core/fml/extraction-to-plan-types'
import type { Opening, Point2D } from '@/core/fml/types'
import {
  resolveDoorAddPreset,
  resolveWindowAddPreset,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/fml/opening-add-presets'
import {
  clampDoorOpeningT,
  clampOpeningSillZ,
  clampOpeningWidth,
  clampWindowOpeningHeight,
  DEFAULT_WINDOW_HEIGHT_CM,
  DEFAULT_WINDOW_SILL_Z_CM,
  projectPointToWallT,
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
  beforePlace: () => void
  syncPlanToParent: () => void
}) {
  function placeOpening(mode: 'door' | 'window', wallId: string, cm: Point2D): string | null {
    const wall = options.editor.walls.value.find((item) => item.id === wallId)
    if (!wall) return null

    const preset =
      mode === 'door'
        ? resolveDoorAddPreset(options.addDoorSubtype.value)
        : resolveWindowAddPreset(options.addWindowSubtype.value)
    const widthCm = clampOpeningWidth(
      mode === 'door' ? options.addDoorWidthCm.value : options.addWindowWidthCm.value,
    )
    if (mode === 'door') options.addDoorWidthCm.value = widthCm
    else options.addWindowWidthCm.value = widthCm

    const sillZCm =
      mode === 'window' ? clampOpeningSillZ(options.addWindowSillZCm.value) : undefined
    const heightCm =
      mode === 'window'
        ? clampWindowOpeningHeight(options.addWindowHeightCm.value)
        : Math.max(1, Math.round(options.addDoorHeightCm.value || DEFAULT_FML_DOOR_HEIGHT_CM))
    if (mode === 'window') {
      options.addWindowSillZCm.value = sillZCm ?? DEFAULT_WINDOW_SILL_Z_CM
      options.addWindowHeightCm.value = heightCm ?? DEFAULT_WINDOW_HEIGHT_CM
    } else {
      options.addDoorHeightCm.value = heightCm
    }

    const projectedT = projectPointToWallT(wall, cm)
    const openingT = clampDoorOpeningT(wall, widthCm, projectedT)
    const opening: Opening = {
      type: preset.type,
      refid: preset.refid,
      t: openingT,
      width: widthCm,
      z: sillZCm,
      z_height: heightCm,
      mirrored: mode === 'door' ? [0, 0] : undefined,
      guid: crypto.randomUUID(),
    }

    options.beforePlace()
    options.editor.pushUndo()
    const openingId = options.editor.applyOpeningAdd(wallId, opening)
    if (!openingId) {
      options.editor.undo()
      return null
    }
    options.syncPlanToParent()
    return openingId
  }

  return {
    placeDoor: (wallId: string, cm: Point2D) => placeOpening('door', wallId, cm),
    placeWindow: (wallId: string, cm: Point2D) => placeOpening('window', wallId, cm),
  }
}
