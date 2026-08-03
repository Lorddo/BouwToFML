<script setup lang="ts">
import type { FmlThicknessPickTier } from '@/core/fml/apply-fml-thickness-pick'
import type { ImportWarning } from '@/core/fml/types'
import FmlPanelActions from './FmlPanelActions.vue'
import FmlPanelHeights from './FmlPanelHeights.vue'
import FmlPanelOpacity from './FmlPanelOpacity.vue'
import FmlPanelThickness from './FmlPanelThickness.vue'
import './fml-panel-fields.css'

/**
 * Public contract for WorkspaceView — keep props/emits stable.
 *
 * F (half-steen): `importedFmlText` / `importedStats` / `importedWarnings` remain
 * on the contract for possible import-stats UI; upload lives only on FmlViewerView.
 *
 * F: height/thickness defaults (280/220/150/70, 10/20/30) stay local — no cross-package
 * const sync with thickness-ui (magic-sync risk).
 */
withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    generatedFmlText?: string
    generatedStats: { walls: number; doors: number; windows: number }
    importedFmlText?: string
    importedStats: { walls: number; doors: number; windows: number }
    importedWarnings?: ImportWarning[]
    underlayOpacity?: number
    /** FML-geometrie opacity 0–100. */
    fmlOpacity?: number
    underlayAvailable?: boolean
    fmlWallHeightCm?: number
    fmlDoorHeightCm?: number
    fmlWindowHeightCm?: number
    fmlWindowSillZCm?: number
    fmlBovenlichtDefault?: boolean
    fmlThicknessMinCm?: number
    fmlThicknessMidCm?: number
    fmlThicknessMaxCm?: number
    fmlBandMidBoundaryCm?: number
    fmlBandMaxBoundaryCm?: number
    fmlLimitsDirty?: boolean
    fmlThicknessPickTier?: FmlThicknessPickTier | null
    fmlThicknessPickMessage?: string | null
    fmlThicknessPickBusy?: boolean
  }>(),
  {
    generatedFmlText: '',
    importedFmlText: '',
    importedWarnings: () => [],
    underlayOpacity: 25,
    fmlOpacity: 80,
    underlayAvailable: false,
    fmlWallHeightCm: 280,
    fmlDoorHeightCm: 220,
    fmlWindowHeightCm: 150,
    fmlWindowSillZCm: 70,
    fmlBovenlichtDefault: false,
    fmlThicknessMinCm: 10,
    fmlThicknessMidCm: 20,
    fmlThicknessMaxCm: 30,
    fmlBandMidBoundaryCm: 12,
    fmlBandMaxBoundaryCm: 23,
    fmlLimitsDirty: false,
    fmlThicknessPickTier: null,
    fmlThicknessPickMessage: null,
    fmlThicknessPickBusy: false,
  },
)

const emit = defineEmits<{
  downloadGenerated: []
  downloadProject: []
  regenerate: []
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
  'update:underlayOpacity': [value: number]
  'update:fmlOpacity': [value: number]
  startThicknessPick: [tier: FmlThicknessPickTier]
  cancelThicknessPick: []
}>()

function onBovenlichtChange(event: Event): void {
  emit('update:fmlBovenlichtDefault', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <div class="panel fml-panel">
    <p v-if="generatedStats.walls > 0" class="fml-stats">
      Preview: <strong>{{ generatedStats.walls }}</strong> muren
      <template v-if="generatedStats.doors > 0"> · {{ generatedStats.doors }} deuren</template>
      <template v-if="generatedStats.windows > 0"> · {{ generatedStats.windows }} ramen</template>
    </p>
    <p v-else-if="!scaleConfirmed" class="fml-hint">
      Bevestig eerst de schaal om de FML-preview te zien.
    </p>
    <p v-else-if="!hasCombinedOutput" class="fml-hint">Rond muurdetectie af voor de FML-preview.</p>

    <FmlPanelOpacity
      :underlay-opacity="underlayOpacity"
      :fml-opacity="fmlOpacity"
      :underlay-available="underlayAvailable"
      @update:underlay-opacity="emit('update:underlayOpacity', $event)"
      @update:fml-opacity="emit('update:fmlOpacity', $event)"
    />

    <label
      class="fml-limit-field fml-bovenlicht"
      title="40 cm hoog, 10 cm boven de deur,zelfde breedte. Alleen in FML-export (niet in preview). Per deur overschrijfbaar via Ctrl+klik."
    >
      <input
        type="checkbox"
        :checked="fmlBovenlichtDefault"
        :disabled="!scaleConfirmed || !hasCombinedOutput"
        @change="onBovenlichtChange"
      />
      <span>Bovenlicht op alle deuren</span>
    </label>

    <FmlPanelThickness
      :scale-confirmed="scaleConfirmed"
      :has-combined-output="hasCombinedOutput"
      :underlay-available="underlayAvailable"
      :fml-thickness-min-cm="fmlThicknessMinCm"
      :fml-thickness-mid-cm="fmlThicknessMidCm"
      :fml-thickness-max-cm="fmlThicknessMaxCm"
      :fml-band-mid-boundary-cm="fmlBandMidBoundaryCm"
      :fml-band-max-boundary-cm="fmlBandMaxBoundaryCm"
      :fml-thickness-pick-tier="fmlThicknessPickTier"
      :fml-thickness-pick-message="fmlThicknessPickMessage"
      :fml-thickness-pick-busy="fmlThicknessPickBusy"
      @update:fml-thickness-min-cm="emit('update:fmlThicknessMinCm', $event)"
      @update:fml-thickness-mid-cm="emit('update:fmlThicknessMidCm', $event)"
      @update:fml-thickness-max-cm="emit('update:fmlThicknessMaxCm', $event)"
      @update:fml-band-mid-boundary-cm="emit('update:fmlBandMidBoundaryCm', $event)"
      @update:fml-band-max-boundary-cm="emit('update:fmlBandMaxBoundaryCm', $event)"
      @start-thickness-pick="emit('startThicknessPick', $event)"
      @cancel-thickness-pick="emit('cancelThicknessPick')"
    />

    <FmlPanelHeights
      :scale-confirmed="scaleConfirmed"
      :has-combined-output="hasCombinedOutput"
      :fml-wall-height-cm="fmlWallHeightCm"
      :fml-door-height-cm="fmlDoorHeightCm"
      :fml-window-height-cm="fmlWindowHeightCm"
      :fml-window-sill-z-cm="fmlWindowSillZCm"
      @update:fml-wall-height-cm="emit('update:fmlWallHeightCm', $event)"
      @update:fml-door-height-cm="emit('update:fmlDoorHeightCm', $event)"
      @update:fml-window-height-cm="emit('update:fmlWindowHeightCm', $event)"
      @update:fml-window-sill-z-cm="emit('update:fmlWindowSillZCm', $event)"
    />

    <FmlPanelActions
      :scale-confirmed="scaleConfirmed"
      :has-combined-output="hasCombinedOutput"
      :generated-fml-text="generatedFmlText"
      :fml-limits-dirty="fmlLimitsDirty"
      @download-generated="emit('downloadGenerated')"
      @download-project="emit('downloadProject')"
      @regenerate="emit('regenerate')"
    />
  </div>
</template>

<style scoped>
.fml-panel {
  padding-top: 8px;
  padding-bottom: 8px;
}

.fml-stats,
.fml-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #475569;
  line-height: 1.4;
}

.fml-bovenlicht {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-direction: row;
  margin: 0 0 8px;
  justify-content: flex-start;
}

.fml-bovenlicht input[type='checkbox'] {
  width: auto;
  margin: 0;
  flex-shrink: 0;
}
</style>
