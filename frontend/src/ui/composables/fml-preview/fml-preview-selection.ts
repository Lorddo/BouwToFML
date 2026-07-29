import { ref, type Ref } from 'vue'
import {
  resolveDoorAddPreset,
  resolveWindowAddPreset,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/fml/opening-add-presets'
import {
  DEFAULT_WINDOW_HEIGHT_CM,
  DEFAULT_WINDOW_SILL_Z_CM,
} from '@/ui/components/fml-preview-openings'
import type { FmlToolId } from '@/ui/components/canvas/fmlToolbeltItems'

export interface FmlPreviewSelectionRefs {
  settingsWallIds: Ref<string[]>
  moveWallId: Ref<string | null>
  settingsOpeningIds: Ref<string[]>
  moveOpeningId: Ref<string | null>
  pinnedJunctionId: Ref<string | null>
  hoveredWallId: Ref<string | null>
  hoveredOpeningId: Ref<string | null>
  hoveredJunctionId: Ref<string | null>
  draggingJunctionId: Ref<string | null>
  addDoorSubtype: Ref<DoorAddSubtype>
  addDoorWidthCm: Ref<number>
  addWindowSubtype: Ref<WindowAddSubtype>
  addWindowWidthCm: Ref<number>
  addWindowSillZCm: Ref<number>
  addWindowHeightCm: Ref<number>
  activeFmlTool: Ref<FmlToolId | null>
}

export function createFmlPreviewSelection(): FmlPreviewSelectionRefs {
  return {
    settingsWallIds: ref<string[]>([]),
    moveWallId: ref<string | null>(null),
    settingsOpeningIds: ref<string[]>([]),
    moveOpeningId: ref<string | null>(null),
    pinnedJunctionId: ref<string | null>(null),
    hoveredWallId: ref<string | null>(null),
    hoveredOpeningId: ref<string | null>(null),
    hoveredJunctionId: ref<string | null>(null),
    draggingJunctionId: ref<string | null>(null),
    addDoorSubtype: ref<DoorAddSubtype>('standard'),
    addDoorWidthCm: ref(resolveDoorAddPreset('standard').defaultWidthCm),
    addWindowSubtype: ref<WindowAddSubtype>('single'),
    addWindowWidthCm: ref(resolveWindowAddPreset('single').defaultWidthCm),
    addWindowSillZCm: ref(DEFAULT_WINDOW_SILL_Z_CM),
    addWindowHeightCm: ref(DEFAULT_WINDOW_HEIGHT_CM),
    activeFmlTool: ref<FmlToolId | null>(null),
  }
}
