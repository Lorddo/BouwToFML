import { ref, type Ref } from 'vue'
import type { FloorItem, Point2D } from '@/core/fml/types'
import { fixturePlaceSizeCm } from '@/core/fml/fixture-place-defaults'
import type { FixturePlaceOption } from '@/core/fml/fixture-refid-catalog'
import {
  snapFixtureCenterToWallFaces,
  WALL_FACE_SNAP_CM,
} from '@/ui/components/fml-preview-fixture-face-snap'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

export function useFmlPreviewAddFixture(options: {
  editor: EditorApi
  pendingFixture: Ref<FixturePlaceOption | null>
  beforePlace: () => void
  syncPlanToParent: () => void
}) {
  const lastPlacedGuid = ref<string | null>(null)

  function placeFixture(cm: Point2D, opts?: { snapDisabled?: boolean }): string | null {
    const option = options.pendingFixture.value
    if (!option) return null
    const size = fixturePlaceSizeCm(option.kind)
    const snapped = snapFixtureCenterToWallFaces(
      options.editor.walls.value,
      cm,
      { width: size.width, height: size.height, rotationDeg: 0 },
      WALL_FACE_SNAP_CM,
      { disabled: opts?.snapDisabled === true },
    )
    const item: Omit<FloorItem, 'guid'> = {
      refid: option.refid,
      x: snapped.x,
      y: snapped.y,
      width: size.width,
      height: size.height,
      z_height: 0,
      rotation: 0,
      mirrored: [0, 0],
      name: option.label,
    }
    options.beforePlace()
    options.editor.pushUndo()
    const guid = options.editor.addItem(item)
    lastPlacedGuid.value = guid
    options.pendingFixture.value = null
    options.syncPlanToParent()
    return guid
  }

  return { placeFixture, lastPlacedGuid }
}
