import { ref } from 'vue'
import {
  resolveDoorAddPreset,
  resolveWindowAddPreset,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/plan/opening-add-presets'
import { DEFAULT_DOOR_HEIGHT_CM } from '@/core/plan/extraction-to-plan-types'
import {
  DEFAULT_WINDOW_HEIGHT_CM,
  DEFAULT_WINDOW_SILL_Z_CM,
} from '@/core/plan/opening-plan-ops'
import type { PlanToolId } from '@/ui/components/canvas/planToolbeltItems'
import type { Point2D } from '@/core/plan/types'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection-types'

export function createPlanCanvasSelection(): PlanCanvasSelectionRefs {
  return {
    settingsWallIds: ref<string[]>([]),
    settingsFacadeGroupId: ref<string | null>(null),
    settingsJunctionId: ref<string | null>(null),
    moveWallId: ref<string | null>(null),
    moveDimensionId: ref<string | null>(null),
    hoveredDimensionId: ref<string | null>(null),
    hoveredDimensionEnd: ref<'a' | 'b' | null>(null),
    settingsOpeningIds: ref<string[]>([]),
    moveOpeningId: ref<string | null>(null),
    settingsAreaId: ref<string | null>(null),
    settingsSurfaceId: ref<string | null>(null),
    settingsLabelId: ref<string | null>(null),
    settingsLineId: ref<string | null>(null),
    settingsItemId: ref<string | null>(null),
    moveItemId: ref<string | null>(null),
    surfaceEditId: ref<string | null>(null),
    roofPolyMutate: ref(false),
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
    addDoorHeightCm: ref(DEFAULT_DOOR_HEIGHT_CM),
    addDoorSillZCm: ref(0),
    addWindowSubtype: ref<WindowAddSubtype>('single'),
    addWindowWidthCm: ref(resolveWindowAddPreset('single').defaultWidthCm),
    addWindowSillZCm: ref(DEFAULT_WINDOW_SILL_Z_CM),
    addWindowHeightCm: ref(DEFAULT_WINDOW_HEIGHT_CM),
    activePlanTool: ref<PlanToolId | null>(null),
    drawWallKind: ref<'wall' | 'ridge'>('wall'),
    drawRoomKind: ref<'room' | 'dormer'>('room'),
  }
}
