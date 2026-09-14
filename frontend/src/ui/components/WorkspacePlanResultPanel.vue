<script setup lang="ts">
import type { FmlThicknessPickTier } from '@/core/fml/apply-fml-thickness-pick'
import type { ImportWarning } from '@/core/fml/types'
import type { OpeningHeightOverflowSummary } from '@/core/fml/opening-height-overflow'
import type { HScaleState } from '@/platform/calibration'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import PlanPanel from './PlanPanel.vue'

/**
 * Presentational FML sidebar block for WorkspaceView — props/emits mirror PlanPanel.
 * No workspace state lives here; parent keeps useWorkspace wiring.
 */
withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    generatedStats: { walls: number; doors: number; windows: number }
    openingHeightOverflow?: OpeningHeightOverflowSummary | null
    floorName: string
    planWallHeightCm: number
    planDoorHeightCm: number
    planWindowHeightCm: number
    planWindowSillZCm: number
    planBovenlichtDefault: boolean
    planWindowBovenlichtDefault: boolean
    planThicknessCms: number[]
    fmlBandMidBoundaryCm: number
    fmlBandMaxBoundaryCm: number
    planLimitsDirty: boolean
    thicknessPickTier: FmlThicknessPickTier | null
    thicknessPickMessage: string | null
    thicknessPickBusy: boolean
    importedFmlText: string
    importedStats: { walls: number; doors: number; windows: number }
    importedWarnings: ImportWarning[]
    underlayOpacity: number
    contentOpacityPct: number
    underlayAvailable: boolean
    planOrientFlipX?: boolean
    hasAnyFloorFml?: boolean
    projectOrientFlipX?: boolean
    underlayMoveMode?: boolean
    underlayFlipX?: boolean
    hidePlanText?: boolean
    rescaleActive?: boolean
    rescaleState?: HScaleState | null
    rescaleDistanceMmX?: number
    rescaleDistanceMmY?: number
    scaleInputUnit?: ScaleInputUnit
    canStartRescale?: boolean
  }>(),
  {
    planOrientFlipX: false,
    hasAnyFloorFml: false,
    projectOrientFlipX: false,
    underlayMoveMode: false,
    underlayFlipX: false,
    hidePlanText: false,
    openingHeightOverflow: null,
    rescaleActive: false,
    rescaleState: null,
    rescaleDistanceMmX: 0,
    rescaleDistanceMmY: 0,
    scaleInputUnit: 'mm',
    canStartRescale: false,
  },
)

const emit = defineEmits<{
  'update:floorName': [value: string]
  'update:underlayOpacity': [value: number]
  'update:contentOpacityPct': [value: number]
  'update:hidePlanText': [value: boolean]
  'update:underlayMoveMode': [value: boolean]
  'update:planWallHeightCm': [value: number]
  'update:planDoorHeightCm': [value: number]
  'update:planWindowHeightCm': [value: number]
  'update:planWindowSillZCm': [value: number]
  'update:planBovenlichtDefault': [value: boolean]
  'update:planWindowBovenlichtDefault': [value: boolean]
  'update:planThicknessCms': [value: number[]]
  'update:fmlBandMidBoundaryCm': [value: number]
  'update:fmlBandMaxBoundaryCm': [value: number]
  'update:rescaleDistanceMmX': [value: number]
  'update:rescaleDistanceMmY': [value: number]
  startThicknessPick: [tier: FmlThicknessPickTier]
  cancelThicknessPick: []
  regenerate: []
  mirrorVertical: []
  mirrorProject: []
  rotate90Cw: []
  rotate90Ccw: []
  underlayRotate90Cw: []
  underlayRotate90Ccw: []
  underlayMirrorVertical: []
  beginRescale: []
  cancelRescale: []
  confirmRescale: []
  sanitize: []
}>()
</script>

<template>
  <PlanPanel
    :scale-confirmed="scaleConfirmed"
    :has-combined-output="hasCombinedOutput"
    :generated-stats="generatedStats"
    :opening-height-overflow="openingHeightOverflow"
    :floor-name="floorName"
    :plan-wall-height-cm="planWallHeightCm"
    :plan-door-height-cm="planDoorHeightCm"
    :plan-window-height-cm="planWindowHeightCm"
    :plan-window-sill-z-cm="planWindowSillZCm"
    :plan-bovenlicht-default="planBovenlichtDefault"
    :plan-window-bovenlicht-default="planWindowBovenlichtDefault"
    :plan-thickness-cms="planThicknessCms"
    :fml-band-mid-boundary-cm="fmlBandMidBoundaryCm"
    :fml-band-max-boundary-cm="fmlBandMaxBoundaryCm"
    :plan-limits-dirty="planLimitsDirty"
    :thickness-pick-tier="thicknessPickTier"
    :thickness-pick-message="thicknessPickMessage"
    :thickness-pick-busy="thicknessPickBusy"
    :imported-fml-text="importedFmlText"
    :imported-stats="importedStats"
    :imported-warnings="importedWarnings"
    :underlay-opacity="underlayOpacity"
    :content-opacity-pct="contentOpacityPct"
    :hide-plan-text="hidePlanText"
    :underlay-available="underlayAvailable"
    :plan-orient-flip-x="planOrientFlipX"
    :has-any-floor-fml="hasAnyFloorFml"
    :project-orient-flip-x="projectOrientFlipX"
    :underlay-move-mode="underlayMoveMode"
    :underlay-flip-x="underlayFlipX"
    :rescale-active="rescaleActive"
    :rescale-state="rescaleState"
    :rescale-distance-mm-x="rescaleDistanceMmX"
    :rescale-distance-mm-y="rescaleDistanceMmY"
    :scale-input-unit="scaleInputUnit"
    :can-start-rescale="canStartRescale"
    @update:floor-name="emit('update:floorName', $event)"
    @update:underlay-opacity="emit('update:underlayOpacity', $event)"
    @update:content-opacity-pct="emit('update:contentOpacityPct', $event)"
    @update:hide-plan-text="emit('update:hidePlanText', $event)"
    @update:underlay-move-mode="emit('update:underlayMoveMode', $event)"
    @update:plan-wall-height-cm="emit('update:planWallHeightCm', $event)"
    @update:plan-door-height-cm="emit('update:planDoorHeightCm', $event)"
    @update:plan-window-height-cm="emit('update:planWindowHeightCm', $event)"
    @update:plan-window-sill-z-cm="emit('update:planWindowSillZCm', $event)"
    @update:plan-bovenlicht-default="emit('update:planBovenlichtDefault', $event)"
    @update:plan-window-bovenlicht-default="emit('update:planWindowBovenlichtDefault', $event)"
    @update:plan-thickness-cms="emit('update:planThicknessCms', $event)"
    @update:fml-band-mid-boundary-cm="emit('update:fmlBandMidBoundaryCm', $event)"
    @update:fml-band-max-boundary-cm="emit('update:fmlBandMaxBoundaryCm', $event)"
    @update:rescale-distance-mm-x="emit('update:rescaleDistanceMmX', $event)"
    @update:rescale-distance-mm-y="emit('update:rescaleDistanceMmY', $event)"
    @start-thickness-pick="emit('startThicknessPick', $event)"
    @cancel-thickness-pick="emit('cancelThicknessPick')"
    @regenerate="emit('regenerate')"
    @mirror-vertical="emit('mirrorVertical')"
    @mirror-project="emit('mirrorProject')"
    @rotate90-cw="emit('rotate90Cw')"
    @rotate90-ccw="emit('rotate90Ccw')"
    @underlay-rotate90-cw="emit('underlayRotate90Cw')"
    @underlay-rotate90-ccw="emit('underlayRotate90Ccw')"
    @underlay-mirror-vertical="emit('underlayMirrorVertical')"
    @begin-rescale="emit('beginRescale')"
    @cancel-rescale="emit('cancelRescale')"
    @confirm-rescale="emit('confirmRescale')"
    @sanitize="emit('sanitize')"
  />
</template>
