import type { Ref } from 'vue'
import type { FloorPlan, Point2D } from '@/core/plan/types'
import type {
  ElevationBovenlichtDefaults,
  ElevationRect,
  ElevationWallRect,
  FacadeElevation,
} from '@/core/plan/facade-elevation'
import type { ElevationSnapGuide } from '@/core/plan/elevation-opening-edit'
import type { DoorAddSubtype, WindowAddSubtype } from '@/core/plan/opening-add-presets'
import type { ContentLayout } from '@/ui/composables/canvas-kernel/usePlanCanvasViewport'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { EditorSessionUndoApi } from '@/ui/composables/editor/editor-session-undo'

import type { ElevTool } from './elevation-tool'

export type { ElevTool }

export type ElevSettings =
  | { kind: 'opening'; id: string; mode: 'quick' | 'edit'; part?: 'transom' }
  | { kind: 'wall'; wallId: string; floorIndex: number }
  | { kind: 'slab'; floorIndex: number }
  | { kind: 'junction'; id: string }
  | { kind: 'ridge'; wallId: string; floorIndex: number; end?: 'a' | 'b' }
  | { kind: 'roof'; id: string; vertexIndex: number | null }
  | { kind: 'placeholderRoof'; floorIndex: number }
  | { kind: 'skylight'; id: string; mode: 'edit' }

export interface ElevationInteractionProps {
  plan: FloorPlan
  groupId: string
  defaultDoorHeightCm?: number
  defaultWindowHeightCm?: number
  defaultWindowSillZCm?: number
  bovenlichtDefault?: boolean
  windowBovenlichtDefault?: boolean
  bovenlichtHeightCm?: number
  bovenlichtGapCm?: number
  bovenlichtPacked?: boolean
  resolveBovenlichtDefaults?: (floorIndex: number) => ElevationBovenlichtDefaults
  rescaleMode?: boolean
  unit?: ScaleInputUnit
}

export interface ElevationInteractionDeps {
  props: ElevationInteractionProps
  emit: {
    planUpdate: (plan: FloorPlan) => void
    cancelRescale: () => void
  }
  elevation: Ref<FacadeElevation | null>
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  pointerCm: (event: {
    evt?: MouseEvent
    target?: {
      getStage?: () => { getPointerPosition?: () => { x: number; y: number } | null } | null
    }
  }) => Point2D | null
  viewScale: Ref<number>
  contentLayout: Ref<ContentLayout | null>
  canvasLocked: Ref<boolean>
  underlayMoveMode: Ref<boolean>
  useTouchNav: Ref<boolean>
  floorBovenlichtDefaults: (floorIndex: number) => ElevationBovenlichtDefaults
  sessionUndo: EditorSessionUndoApi
}

export interface ElevationSelectEditOptions {
  props: ElevationInteractionProps
  elevation: Ref<FacadeElevation | null>
  clientToCm: ElevationInteractionDeps['clientToCm']
  pointerCm: ElevationInteractionDeps['pointerCm']
  canvasLocked: Ref<boolean>
  activeTool: Ref<ElevTool>
  elevSettingsMod: Ref<boolean>
  snapGuide: Ref<ElevationSnapGuide | null>
  floorBovenlichtDefaults: (floorIndex: number) => ElevationBovenlichtDefaults
  pushUndo: () => void
  commitPlan: (next: FloorPlan) => void
  addDoorSubtype: Ref<DoorAddSubtype>
  addDoorWidthCm: Ref<number>
  addDoorHeightCm: Ref<number>
  addDoorSillZCm: Ref<number>
  addWindowSubtype: Ref<WindowAddSubtype>
  addWindowWidthCm: Ref<number>
  addWindowSillZCm: Ref<number>
  addWindowHeightCm: Ref<number>
  pendingPlaceFrame: Ref<import('@/core/plan/opening-display-geom').OpeningFrameCm | null>
  preciseIntent: (event: { shiftKey?: boolean }) => boolean
  beginPreciseOpening: (
    openingId: string,
    cm: Point2D,
    rect: ElevationRect,
    wallId: string,
    floorIndex: number,
  ) => void
  beginPreciseRidge: (wall: ElevationWallRect, cm: Point2D) => void
  beginPreciseJunction: (
    junction: { id: string; heightCm: number; floorIndex: number; ridge?: boolean },
    refs: Array<{ wallId: string; end: 'a' | 'b' }>,
    cm: Point2D,
  ) => void
  hasPreciseDraft: () => boolean
  commitPreciseDraft: () => boolean
}
