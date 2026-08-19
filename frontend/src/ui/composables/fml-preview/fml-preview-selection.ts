import { ref, type Ref } from 'vue'
import {
  resolveDoorAddPreset,
  resolveWindowAddPreset,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/fml/opening-add-presets'
import { DEFAULT_FML_DOOR_HEIGHT_CM } from '@/core/fml/extraction-to-plan-types'
import {
  DEFAULT_WINDOW_HEIGHT_CM,
  DEFAULT_WINDOW_SILL_Z_CM,
} from '@/ui/components/fml-preview-openings'
import type { FmlToolId } from '@/ui/components/canvas/fmlToolbeltItems'
import type { Point2D } from '@/core/fml/types'

export interface FmlPreviewSelectionRefs {
  settingsWallIds: Ref<string[]>
  settingsJunctionId: Ref<string | null>
  moveWallId: Ref<string | null>
  settingsOpeningIds: Ref<string[]>
  moveOpeningId: Ref<string | null>
  settingsAreaId: Ref<string | null>
  settingsSurfaceId: Ref<string | null>
  settingsLabelId: Ref<string | null>
  settingsLineId: Ref<string | null>
  settingsItemId: Ref<string | null>
  moveItemId: Ref<string | null>
  surfaceEditId: Ref<string | null>
  drawSurfacePoints: Ref<Point2D[] | null>
  drawLinePoints: Ref<Point2D[] | null>
  pinnedJunctionId: Ref<string | null>
  hoveredWallId: Ref<string | null>
  hoveredOpeningId: Ref<string | null>
  hoveredAreaId: Ref<string | null>
  hoveredSurfaceId: Ref<string | null>
  hoveredLabelId: Ref<string | null>
  hoveredLineId: Ref<string | null>
  hoveredJunctionId: Ref<string | null>
  hoveredItemId: Ref<string | null>
  draggingJunctionId: Ref<string | null>
  addDoorSubtype: Ref<DoorAddSubtype>
  addDoorWidthCm: Ref<number>
  addDoorHeightCm: Ref<number>
  addWindowSubtype: Ref<WindowAddSubtype>
  addWindowWidthCm: Ref<number>
  addWindowSillZCm: Ref<number>
  addWindowHeightCm: Ref<number>
  activeFmlTool: Ref<FmlToolId | null>
}

export function createFmlPreviewSelection(): FmlPreviewSelectionRefs {
  return {
    settingsWallIds: ref<string[]>([]),
    settingsJunctionId: ref<string | null>(null),
    moveWallId: ref<string | null>(null),
    settingsOpeningIds: ref<string[]>([]),
    moveOpeningId: ref<string | null>(null),
    settingsAreaId: ref<string | null>(null),
    settingsSurfaceId: ref<string | null>(null),
    settingsLabelId: ref<string | null>(null),
    settingsLineId: ref<string | null>(null),
    settingsItemId: ref<string | null>(null),
    moveItemId: ref<string | null>(null),
    surfaceEditId: ref<string | null>(null),
    drawSurfacePoints: ref<Point2D[] | null>(null),
    drawLinePoints: ref<Point2D[] | null>(null),
    pinnedJunctionId: ref<string | null>(null),
    hoveredWallId: ref<string | null>(null),
    hoveredOpeningId: ref<string | null>(null),
    hoveredAreaId: ref<string | null>(null),
    hoveredSurfaceId: ref<string | null>(null),
    hoveredLabelId: ref<string | null>(null),
    hoveredLineId: ref<string | null>(null),
    hoveredJunctionId: ref<string | null>(null),
    hoveredItemId: ref<string | null>(null),
    draggingJunctionId: ref<string | null>(null),
    addDoorSubtype: ref<DoorAddSubtype>('standard'),
    addDoorWidthCm: ref(resolveDoorAddPreset('standard').defaultWidthCm),
    addDoorHeightCm: ref(DEFAULT_FML_DOOR_HEIGHT_CM),
    addWindowSubtype: ref<WindowAddSubtype>('single'),
    addWindowWidthCm: ref(resolveWindowAddPreset('single').defaultWidthCm),
    addWindowSillZCm: ref(DEFAULT_WINDOW_SILL_Z_CM),
    addWindowHeightCm: ref(DEFAULT_WINDOW_HEIGHT_CM),
    activeFmlTool: ref<FmlToolId | null>(null),
  }
}
