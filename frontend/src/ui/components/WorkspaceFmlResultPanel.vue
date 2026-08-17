<script setup lang="ts">
import type { FmlThicknessPickTier } from '@/core/fml/apply-fml-thickness-pick'
import type { ImportWarning } from '@/core/fml/types'
import FmlPanel from './FmlPanel.vue'

/**
 * Presentational FML sidebar block for WorkspaceView — props/emits mirror FmlPanel.
 * No workspace state lives here; parent keeps useWorkspace wiring.
 */
withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    generatedStats: { walls: number; doors: number; windows: number }
    floorName: string
    fmlWallHeightCm: number
    fmlDoorHeightCm: number
    fmlWindowHeightCm: number
    fmlWindowSillZCm: number
    fmlBovenlichtDefault: boolean
    fmlWindowBovenlichtDefault: boolean
    fmlThicknessMinCm: number
    fmlThicknessMidCm: number
    fmlThicknessMaxCm: number
    fmlBandMidBoundaryCm: number
    fmlBandMaxBoundaryCm: number
    fmlLimitsDirty: boolean
    fmlThicknessPickTier: FmlThicknessPickTier | null
    fmlThicknessPickMessage: string | null
    fmlThicknessPickBusy: boolean
    importedFmlText: string
    importedStats: { walls: number; doors: number; windows: number }
    importedWarnings: ImportWarning[]
    underlayOpacity: number
    fmlOpacity: number
    underlayAvailable: boolean
    fmlOrientFlipX?: boolean
    hasAnyFloorFml?: boolean
    projectOrientFlipX?: boolean
    underlayMoveMode?: boolean
    underlayFlipX?: boolean
  }>(),
  {
    fmlOrientFlipX: false,
    hasAnyFloorFml: false,
    projectOrientFlipX: false,
    underlayMoveMode: false,
    underlayFlipX: false,
  },
)

const emit = defineEmits<{
  'update:floorName': [value: string]
  'update:underlayOpacity': [value: number]
  'update:fmlOpacity': [value: number]
  'update:underlayMoveMode': [value: boolean]
  'update:fmlWallHeightCm': [value: number]
  'update:fmlDoorHeightCm': [value: number]
  'update:fmlWindowHeightCm': [value: number]
  'update:fmlWindowSillZCm': [value: number]
  'update:fmlBovenlichtDefault': [value: boolean]
  'update:fmlWindowBovenlichtDefault': [value: boolean]
  'update:fmlThicknessMinCm': [value: number]
  'update:fmlThicknessMidCm': [value: number]
  'update:fmlThicknessMaxCm': [value: number]
  'update:fmlBandMidBoundaryCm': [value: number]
  'update:fmlBandMaxBoundaryCm': [value: number]
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
}>()
</script>

<template>
  <FmlPanel
    :scale-confirmed="scaleConfirmed"
    :has-combined-output="hasCombinedOutput"
    :generated-stats="generatedStats"
    :floor-name="floorName"
    :fml-wall-height-cm="fmlWallHeightCm"
    :fml-door-height-cm="fmlDoorHeightCm"
    :fml-window-height-cm="fmlWindowHeightCm"
    :fml-window-sill-z-cm="fmlWindowSillZCm"
    :fml-bovenlicht-default="fmlBovenlichtDefault"
    :fml-window-bovenlicht-default="fmlWindowBovenlichtDefault"
    :fml-thickness-min-cm="fmlThicknessMinCm"
    :fml-thickness-mid-cm="fmlThicknessMidCm"
    :fml-thickness-max-cm="fmlThicknessMaxCm"
    :fml-band-mid-boundary-cm="fmlBandMidBoundaryCm"
    :fml-band-max-boundary-cm="fmlBandMaxBoundaryCm"
    :fml-limits-dirty="fmlLimitsDirty"
    :fml-thickness-pick-tier="fmlThicknessPickTier"
    :fml-thickness-pick-message="fmlThicknessPickMessage"
    :fml-thickness-pick-busy="fmlThicknessPickBusy"
    :imported-fml-text="importedFmlText"
    :imported-stats="importedStats"
    :imported-warnings="importedWarnings"
    :underlay-opacity="underlayOpacity"
    :fml-opacity="fmlOpacity"
    :underlay-available="underlayAvailable"
    :fml-orient-flip-x="fmlOrientFlipX"
    :has-any-floor-fml="hasAnyFloorFml"
    :project-orient-flip-x="projectOrientFlipX"
    :underlay-move-mode="underlayMoveMode"
    :underlay-flip-x="underlayFlipX"
    @update:floor-name="emit('update:floorName', $event)"
    @update:underlay-opacity="emit('update:underlayOpacity', $event)"
    @update:fml-opacity="emit('update:fmlOpacity', $event)"
    @update:underlay-move-mode="emit('update:underlayMoveMode', $event)"
    @update:fml-wall-height-cm="emit('update:fmlWallHeightCm', $event)"
    @update:fml-door-height-cm="emit('update:fmlDoorHeightCm', $event)"
    @update:fml-window-height-cm="emit('update:fmlWindowHeightCm', $event)"
    @update:fml-window-sill-z-cm="emit('update:fmlWindowSillZCm', $event)"
    @update:fml-bovenlicht-default="emit('update:fmlBovenlichtDefault', $event)"
    @update:fml-window-bovenlicht-default="emit('update:fmlWindowBovenlichtDefault', $event)"
    @update:fml-thickness-min-cm="emit('update:fmlThicknessMinCm', $event)"
    @update:fml-thickness-mid-cm="emit('update:fmlThicknessMidCm', $event)"
    @update:fml-thickness-max-cm="emit('update:fmlThicknessMaxCm', $event)"
    @update:fml-band-mid-boundary-cm="emit('update:fmlBandMidBoundaryCm', $event)"
    @update:fml-band-max-boundary-cm="emit('update:fmlBandMaxBoundaryCm', $event)"
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
  />
</template>
