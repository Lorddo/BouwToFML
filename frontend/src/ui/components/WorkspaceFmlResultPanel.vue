<script setup lang="ts">
import type { FmlThicknessPickTier } from '@/core/fml/apply-fml-thickness-pick'
import type { ImportWarning } from '@/core/fml/types'
import FmlPanel from './FmlPanel.vue'

/**
 * Presentational FML sidebar block for WorkspaceView — props/emits mirror FmlPanel.
 * No workspace state lives here; parent keeps useWorkspace wiring.
 */
defineProps<{
  scaleConfirmed: boolean
  hasCombinedOutput: boolean
  generatedFmlText: string
  generatedStats: { walls: number; doors: number; windows: number }
  fmlWallHeightCm: number
  fmlDoorHeightCm: number
  fmlWindowHeightCm: number
  fmlWindowSillZCm: number
  fmlBovenlichtDefault: boolean
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
}>()

const emit = defineEmits<{
  'update:underlayOpacity': [value: number]
  'update:fmlOpacity': [value: number]
  'update:fmlWallHeightCm': [value: number]
  'update:fmlDoorHeightCm': [value: number]
  'update:fmlWindowHeightCm': [value: number]
  'update:fmlWindowSillZCm': [value: number]
  'update:fmlBovenlichtDefault': [value: boolean]
  'update:fmlThicknessMinCm': [value: number]
  'update:fmlThicknessMidCm': [value: number]
  'update:fmlThicknessMaxCm': [value: number]
  'update:fmlBandMidBoundaryCm': [value: number]
  'update:fmlBandMaxBoundaryCm': [value: number]
  startThicknessPick: [tier: FmlThicknessPickTier]
  cancelThicknessPick: []
  regenerate: []
  downloadGenerated: []
  copyGenerated: []
  importFile: [file: File]
  clearImport: []
}>()
</script>

<template>
  <FmlPanel
    :scale-confirmed="scaleConfirmed"
    :has-combined-output="hasCombinedOutput"
    :generated-fml-text="generatedFmlText"
    :generated-stats="generatedStats"
    :fml-wall-height-cm="fmlWallHeightCm"
    :fml-door-height-cm="fmlDoorHeightCm"
    :fml-window-height-cm="fmlWindowHeightCm"
    :fml-window-sill-z-cm="fmlWindowSillZCm"
    :fml-bovenlicht-default="fmlBovenlichtDefault"
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
    @update:underlay-opacity="emit('update:underlayOpacity', $event)"
    @update:fml-opacity="emit('update:fmlOpacity', $event)"
    @update:fml-wall-height-cm="emit('update:fmlWallHeightCm', $event)"
    @update:fml-door-height-cm="emit('update:fmlDoorHeightCm', $event)"
    @update:fml-window-height-cm="emit('update:fmlWindowHeightCm', $event)"
    @update:fml-window-sill-z-cm="emit('update:fmlWindowSillZCm', $event)"
    @update:fml-bovenlicht-default="emit('update:fmlBovenlichtDefault', $event)"
    @update:fml-thickness-min-cm="emit('update:fmlThicknessMinCm', $event)"
    @update:fml-thickness-mid-cm="emit('update:fmlThicknessMidCm', $event)"
    @update:fml-thickness-max-cm="emit('update:fmlThicknessMaxCm', $event)"
    @update:fml-band-mid-boundary-cm="emit('update:fmlBandMidBoundaryCm', $event)"
    @update:fml-band-max-boundary-cm="emit('update:fmlBandMaxBoundaryCm', $event)"
    @start-thickness-pick="emit('startThicknessPick', $event)"
    @cancel-thickness-pick="emit('cancelThicknessPick')"
    @regenerate="emit('regenerate')"
    @download-generated="emit('downloadGenerated')"
    @copy-generated="emit('copyGenerated')"
    @import-file="emit('importFile', $event)"
    @clear-import="emit('clearImport')"
  />
</template>
