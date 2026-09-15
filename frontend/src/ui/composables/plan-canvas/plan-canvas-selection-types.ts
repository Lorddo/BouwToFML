import type { Ref } from 'vue'
import type { DoorAddSubtype, WindowAddSubtype } from '@/core/plan/opening-add-presets'
import type { PlanToolId } from '@/ui/components/canvas/planToolbeltItems'
import type { Point2D } from '@/core/plan/types'

export interface PlanCanvasSelectionRefs {
  settingsWallIds: Ref<string[]>
  /** Gevelgroep-settings (dikte alle floors); sluit muur-settings. */
  settingsFacadeGroupId: Ref<string | null>
  settingsJunctionId: Ref<string | null>
  moveWallId: Ref<string | null>
  moveDimensionId: Ref<string | null>
  hoveredDimensionId: Ref<string | null>
  hoveredDimensionEnd: Ref<'a' | 'b' | null>
  settingsOpeningIds: Ref<string[]>
  moveOpeningId: Ref<string | null>
  settingsAreaId: Ref<string | null>
  settingsSurfaceId: Ref<string | null>
  settingsLabelId: Ref<string | null>
  settingsLineId: Ref<string | null>
  settingsItemId: Ref<string | null>
  moveItemId: Ref<string | null>
  surfaceEditId: Ref<string | null>
  /** Ctrl-modus: punten toevoegen/weghalen op het dakvlak. */
  roofPolyMutate: Ref<boolean>
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
  addDoorSillZCm: Ref<number>
  addWindowSubtype: Ref<WindowAddSubtype>
  addWindowWidthCm: Ref<number>
  addWindowSillZCm: Ref<number>
  addWindowHeightCm: Ref<number>
  activePlanTool: Ref<PlanToolId | null>
  drawWallKind: Ref<'wall' | 'ridge'>
}
