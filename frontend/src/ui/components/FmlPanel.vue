<script setup lang="ts">
import type { FmlThicknessPickTier } from '@/core/fml/apply-fml-thickness-pick'
import type { ImportWarning } from '@/core/fml/types'
import type { OpeningHeightOverflowSummary } from '@/core/fml/opening-height-overflow'
import type { HScaleState } from '@/platform/calibration'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import { useI18n } from 'vue-i18n'
import FmlPanelActions from './FmlPanelActions.vue'
import FmlPanelHeights from './FmlPanelHeights.vue'
import FmlOpeningOverflowNotice from './FmlOpeningOverflowNotice.vue'
import FmlPanelOpacity from './FmlPanelOpacity.vue'
import FmlPanelThickness from './FmlPanelThickness.vue'
import FmlRescalePanel from './FmlRescalePanel.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-panel-fields.css'

const { t } = useI18n()

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
    generatedStats: { walls: number; doors: number; windows: number }
    openingHeightOverflow?: OpeningHeightOverflowSummary | null
    importedFmlText?: string
    importedStats: { walls: number; doors: number; windows: number }
    importedWarnings?: ImportWarning[]
    underlayOpacity?: number
    /** FML-geometrie opacity 0–100. */
    fmlOpacity?: number
    underlayAvailable?: boolean
    /** Actieve verdiepingsnaam (bewerkbaar na toevoegen via floor-rail). */
    floorName?: string
    fmlWallHeightCm?: number
    fmlDoorHeightCm?: number
    fmlWindowHeightCm?: number
    fmlWindowSillZCm?: number
    fmlBovenlichtDefault?: boolean
    fmlWindowBovenlichtDefault?: boolean
    fmlThicknessMinCm?: number
    fmlThicknessMidCm?: number
    fmlThicknessMaxCm?: number
    fmlBandMidBoundaryCm?: number
    fmlBandMaxBoundaryCm?: number
    fmlLimitsDirty?: boolean
    fmlThicknessPickTier?: FmlThicknessPickTier | null
    fmlThicknessPickMessage?: string | null
    fmlThicknessPickBusy?: boolean
    fmlOrientFlipX?: boolean
    hasAnyFloorFml?: boolean
    projectOrientFlipX?: boolean
    underlayMoveMode?: boolean
    underlayFlipX?: boolean
    hidePlanText?: boolean
    fmlRescaleActive?: boolean
    fmlRescaleState?: HScaleState | null
    fmlRescaleDistanceMmX?: number
    fmlRescaleDistanceMmY?: number
    scaleInputUnit?: ScaleInputUnit
    /** Herschalen beschikbaar (plan met muren). Default false. */
    canStartRescale?: boolean
  }>(),
  {
    importedFmlText: '',
    importedWarnings: () => [],
    openingHeightOverflow: null,
    underlayOpacity: 25,
    fmlOpacity: 80,
    underlayAvailable: false,
    hidePlanText: false,
    floorName: '',
    fmlWallHeightCm: 280,
    fmlDoorHeightCm: 220,
    fmlWindowHeightCm: 150,
    fmlWindowSillZCm: 70,
    fmlBovenlichtDefault: false,
    fmlWindowBovenlichtDefault: false,
    fmlThicknessMinCm: 10,
    fmlThicknessMidCm: 20,
    fmlThicknessMaxCm: 30,
    fmlBandMidBoundaryCm: 12,
    fmlBandMaxBoundaryCm: 23,
    fmlLimitsDirty: false,
    fmlThicknessPickTier: null,
    fmlThicknessPickMessage: null,
    fmlThicknessPickBusy: false,
    fmlOrientFlipX: false,
    hasAnyFloorFml: false,
    projectOrientFlipX: false,
    underlayMoveMode: false,
    underlayFlipX: false,
    fmlRescaleActive: false,
    fmlRescaleState: null,
    fmlRescaleDistanceMmX: 0,
    fmlRescaleDistanceMmY: 0,
    scaleInputUnit: 'mm',
    canStartRescale: false,
  },
)

const emit = defineEmits<{
  regenerate: []
  mirrorVertical: []
  mirrorProject: []
  rotate90Cw: []
  rotate90Ccw: []
  underlayRotate90Cw: []
  underlayRotate90Ccw: []
  underlayMirrorVertical: []
  'update:floorName': [value: string]
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
  'update:underlayOpacity': [value: number]
  'update:fmlOpacity': [value: number]
  'update:hidePlanText': [value: boolean]
  'update:underlayMoveMode': [value: boolean]
  startThicknessPick: [tier: FmlThicknessPickTier]
  cancelThicknessPick: []
  beginRescale: []
  cancelRescale: []
  confirmRescale: []
  sanitize: []
  'update:fmlRescaleDistanceMmX': [value: number]
  'update:fmlRescaleDistanceMmY': [value: number]
}>()

function onFloorNameInput(event: Event): void {
  emit('update:floorName', (event.target as HTMLInputElement).value)
}

function onFloorNameBlur(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  const trimmed = raw.trim()
  if (trimmed !== raw) emit('update:floorName', trimmed || raw)
}

function onBovenlichtChange(event: Event): void {
  emit('update:fmlBovenlichtDefault', (event.target as HTMLInputElement).checked)
}

function onWindowBovenlichtChange(event: Event): void {
  emit('update:fmlWindowBovenlichtDefault', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <div class="panel fml-panel">
    <label class="fml-floor-name">
      <span>{{ t('result.floorName') }}</span>
      <input
        type="text"
        :value="floorName"
        :placeholder="t('project.floorNamePlaceholder')"
        @input="onFloorNameInput"
        @blur="onFloorNameBlur"
        @keydown.stop
        @keyup.stop
      />
    </label>

    <p v-if="generatedStats.walls > 0" class="fml-stats">
      {{ t('result.previewStats', { walls: generatedStats.walls })
      }}<template v-if="generatedStats.doors > 0">{{
        t('result.previewDoors', { n: generatedStats.doors })
      }}</template
      ><template v-if="generatedStats.windows > 0">{{
        t('result.previewWindows', { n: generatedStats.windows })
      }}</template>
    </p>
    <p v-else-if="!scaleConfirmed" class="fml-hint">
      {{ t('result.needScale') }}
    </p>
    <p v-else-if="!hasCombinedOutput" class="fml-hint">{{ t('result.needFinalize') }}</p>
    <FmlOpeningOverflowNotice v-if="openingHeightOverflow" :summary="openingHeightOverflow" />

    <FmlPanelOpacity
      :underlay-opacity="underlayOpacity"
      :fml-opacity="fmlOpacity"
      :underlay-available="underlayAvailable"
      :underlay-move-mode="underlayMoveMode"
      :underlay-flip-x="underlayFlipX"
      :hide-plan-text="hidePlanText"
      @update:underlay-opacity="emit('update:underlayOpacity', $event)"
      @update:fml-opacity="emit('update:fmlOpacity', $event)"
      @update:hide-plan-text="emit('update:hidePlanText', $event)"
      @update:underlay-move-mode="emit('update:underlayMoveMode', $event)"
      @underlay-rotate90-cw="emit('underlayRotate90Cw')"
      @underlay-rotate90-ccw="emit('underlayRotate90Ccw')"
      @underlay-mirror-vertical="emit('underlayMirrorVertical')"
    />

    <label class="fml-limit-field fml-bovenlicht" :title="t('result.bovenlichtTitle')">
      <input
        type="checkbox"
        :checked="fmlBovenlichtDefault"
        :disabled="!canStartRescale"
        @change="onBovenlichtChange"
      />
      <span>{{ t('result.bovenlichtAllDoors') }}</span>
    </label>

    <label class="fml-limit-field fml-bovenlicht" :title="t('result.bovenlichtWindowsTitle')">
      <input
        type="checkbox"
        :checked="fmlWindowBovenlichtDefault"
        :disabled="!canStartRescale"
        @change="onWindowBovenlichtChange"
      />
      <span>{{ t('result.bovenlichtAllWindows') }}</span>
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

    <FmlRescalePanel
      :active="fmlRescaleActive"
      :can-start="canStartRescale"
      :state="fmlRescaleState"
      :mm-x="fmlRescaleDistanceMmX"
      :mm-y="fmlRescaleDistanceMmY"
      :unit="scaleInputUnit"
      @begin="emit('beginRescale')"
      @cancel="emit('cancelRescale')"
      @confirm="emit('confirmRescale')"
      @update-mm-x="emit('update:fmlRescaleDistanceMmX', $event)"
      @update-mm-y="emit('update:fmlRescaleDistanceMmY', $event)"
    />

    <button
      type="button"
      class="sidebar-icon-btn"
      :disabled="!canStartRescale"
      :title="t('result.sanitizeHint')"
      @click="emit('sanitize')"
    >
      <ToolbeltIcon name="sanitize" />
      <span>{{ t('result.sanitize') }}</span>
    </button>

    <FmlPanelActions
      :scale-confirmed="scaleConfirmed"
      :has-combined-output="hasCombinedOutput"
      :fml-limits-dirty="fmlLimitsDirty"
      :fml-orient-flip-x="fmlOrientFlipX"
      :has-any-floor-fml="hasAnyFloorFml"
      :project-orient-flip-x="projectOrientFlipX"
      @regenerate="emit('regenerate')"
      @mirror-vertical="emit('mirrorVertical')"
      @mirror-project="emit('mirrorProject')"
      @rotate90-cw="emit('rotate90Cw')"
      @rotate90-ccw="emit('rotate90Ccw')"
    />
  </div>
</template>

<style scoped>
.fml-panel {
  padding-top: 8px;
  padding-bottom: 8px;
}

.fml-floor-name {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 10px;
  font-size: 11px;
  color: #334155;
}

.fml-floor-name input {
  width: 100%;
  height: 28px;
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
}

.fml-floor-name input:focus {
  border-color: #3b82f6;
  outline: none;
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

.sidebar-icon-btn {
  margin: 0 0 10px;
}
</style>
