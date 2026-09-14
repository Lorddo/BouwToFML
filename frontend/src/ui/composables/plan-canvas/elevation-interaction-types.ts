import type { Ref } from 'vue'
import type { FloorPlan, Point2D } from '@/core/plan/types'
import type { ElevationBovenlichtDefaults, FacadeElevation } from '@/core/plan/facade-elevation'
import type { ContentLayout } from './usePlanCanvasViewport'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'

export type { ElevTool } from './elevation-tool'

export type ElevSettings =
  | { kind: 'opening'; id: string; mode: 'quick' | 'edit' }
  | { kind: 'wall'; wallId: string; floorIndex: number }
  | { kind: 'slab'; floorIndex: number }
  | { kind: 'junction'; id: string }
  | { kind: 'ridge'; wallId: string; floorIndex: number; end?: 'a' | 'b' }
  | { kind: 'roof'; id: string; vertexIndex: number | null }

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
}
