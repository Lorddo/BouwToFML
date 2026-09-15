<script setup lang="ts">
import type { ThicknessPickTier } from '@/core/plan/apply-thickness-pick'
import type { ImportWarning } from '@/core/plan/types'
import type { OpeningHeightOverflowSummary } from '@/core/plan/opening-height-overflow'
import type { HScaleState } from '@/platform/calibration'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import { useI18n } from 'vue-i18n'
import PlanPanelActions from './PlanPanelActions.vue'
import PlanPanelHeights from './PlanPanelHeights.vue'
import PlanOpeningOverflowNotice from './PlanOpeningOverflowNotice.vue'
import PlanPanelOpacity from './PlanPanelOpacity.vue'
import PlanPanelThickness from './PlanPanelThickness.vue'
import PlanRescalePanel from './PlanRescalePanel.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './plan-panel-fields.css'

const { t } = useI18n()

/**
 * Public contract for WorkspaceView — keep props/emits stable.
 *
 * F (half-steen): `importedFmlText` / `importedStats` / `importedWarnings` remain
 * on the contract for possible import-stats UI; upload lives only on EditorView.
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
    contentOpacityPct?: number
    underlayAvailable?: boolean
    /** Actieve verdiepingsnaam (bewerkbaar na toevoegen via floor-rail). */
    floorName?: string
    planWallHeightCm?: number
    planDoorHeightCm?: number
    planWindowHeightCm?: number
    planWindowSillZCm?: number
    planBovenlichtDefault?: boolean
    planWindowBovenlichtDefault?: boolean
    planThicknessCms?: number[]
    planBandMidBoundaryCm?: number
    planBandMaxBoundaryCm?: number
    planLimitsDirty?: boolean
    thicknessPickTier?: ThicknessPickTier | null
    thicknessPickMessage?: string | null
    thicknessPickBusy?: boolean
    planOrientFlipX?: boolean
    hasAnyFloorPlan?: boolean
    projectOrientFlipX?: boolean
    underlayMoveMode?: boolean
    underlayFlipX?: boolean
    hidePlanText?: boolean
    rescaleActive?: boolean
    rescaleState?: HScaleState | null
    rescaleDistanceMmX?: number
    rescaleDistanceMmY?: number
    scaleInputUnit?: ScaleInputUnit
    /** Herschalen beschikbaar (plan met muren). Default false. */
    canStartRescale?: boolean
  }>(),
  {
    importedFmlText: '',
    importedWarnings: () => [],
    openingHeightOverflow: null,
    underlayOpacity: 25,
    contentOpacityPct: 80,
    underlayAvailable: false,
    hidePlanText: false,
    floorName: '',
    planWallHeightCm: 280,
    planDoorHeightCm: 220,
    planWindowHeightCm: 150,
    planWindowSillZCm: 70,
    planBovenlichtDefault: false,
    planWindowBovenlichtDefault: false,
    planThicknessCms: () => [10, 20, 30],
    planBandMidBoundaryCm: 12,
    planBandMaxBoundaryCm: 27,
    planLimitsDirty: false,
    thicknessPickTier: null,
    thicknessPickMessage: null,
    thicknessPickBusy: false,
    planOrientFlipX: false,
    hasAnyFloorPlan: false,
    projectOrientFlipX: false,
    underlayMoveMode: false,
    underlayFlipX: false,
    rescaleActive: false,
    rescaleState: null,
    rescaleDistanceMmX: 0,
    rescaleDistanceMmY: 0,
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
  'update:planWallHeightCm': [value: number]
  'update:planDoorHeightCm': [value: number]
  'update:planWindowHeightCm': [value: number]
  'update:planWindowSillZCm': [value: number]
  'update:planBovenlichtDefault': [value: boolean]
  'update:planWindowBovenlichtDefault': [value: boolean]
  'update:planThicknessCms': [value: number[]]
  'update:planBandMidBoundaryCm': [value: number]
  'update:planBandMaxBoundaryCm': [value: number]
  'update:underlayOpacity': [value: number]
  'update:contentOpacityPct': [value: number]
  'update:hidePlanText': [value: boolean]
  'update:underlayMoveMode': [value: boolean]
  startThicknessPick: [tier: ThicknessPickTier]
  cancelThicknessPick: []
  beginRescale: []
  cancelRescale: []
  confirmRescale: []
  sanitize: []
  'update:rescaleDistanceMmX': [value: number]
  'update:rescaleDistanceMmY': [value: number]
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
  emit('update:planBovenlichtDefault', (event.target as HTMLInputElement).checked)
}

function onWindowBovenlichtChange(event: Event): void {
  emit('update:planWindowBovenlichtDefault', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <div class="panel plan-panel">
    <label class="plan-floor-name">
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

    <p v-if="generatedStats.walls > 0" class="plan-stats">
      {{ t('result.previewStats', { walls: generatedStats.walls })
      }}<template v-if="generatedStats.doors > 0">{{
        t('result.previewDoors', { n: generatedStats.doors })
      }}</template
      ><template v-if="generatedStats.windows > 0">{{
        t('result.previewWindows', { n: generatedStats.windows })
      }}</template>
    </p>
    <p v-else-if="!scaleConfirmed" class="plan-hint">
      {{ t('result.needScale') }}
    </p>
    <p v-else-if="!hasCombinedOutput" class="plan-hint">{{ t('result.needFinalize') }}</p>
    <PlanOpeningOverflowNotice
      v-if="openingHeightOverflow"
      :summary="openingHeightOverflow"
      :unit="scaleInputUnit"
    />

    <PlanPanelOpacity
      :underlay-opacity="underlayOpacity"
      :content-opacity-pct="contentOpacityPct"
      :underlay-available="underlayAvailable"
      :underlay-move-mode="underlayMoveMode"
      :underlay-flip-x="underlayFlipX"
      :hide-plan-text="hidePlanText"
      @update:underlay-opacity="emit('update:underlayOpacity', $event)"
      @update:content-opacity-pct="emit('update:contentOpacityPct', $event)"
      @update:hide-plan-text="emit('update:hidePlanText', $event)"
      @update:underlay-move-mode="emit('update:underlayMoveMode', $event)"
      @underlay-rotate90-cw="emit('underlayRotate90Cw')"
      @underlay-rotate90-ccw="emit('underlayRotate90Ccw')"
      @underlay-mirror-vertical="emit('underlayMirrorVertical')"
    />

    <label class="plan-limit-field plan-bovenlicht" :title="t('result.bovenlichtTitle')">
      <input
        type="checkbox"
        :checked="planBovenlichtDefault"
        :disabled="!canStartRescale"
        @change="onBovenlichtChange"
      />
      <span>{{ t('result.bovenlichtAllDoors') }}</span>
    </label>

    <label class="plan-limit-field plan-bovenlicht" :title="t('result.bovenlichtWindowsTitle')">
      <input
        type="checkbox"
        :checked="planWindowBovenlichtDefault"
        :disabled="!canStartRescale"
        @change="onWindowBovenlichtChange"
      />
      <span>{{ t('result.bovenlichtAllWindows') }}</span>
    </label>

    <PlanPanelThickness
      :scale-confirmed="scaleConfirmed"
      :has-combined-output="hasCombinedOutput"
      :unit="scaleInputUnit"
      :underlay-available="underlayAvailable"
      :plan-thickness-cms="planThicknessCms"
      :plan-band-mid-boundary-cm="planBandMidBoundaryCm"
      :plan-band-max-boundary-cm="planBandMaxBoundaryCm"
      :thickness-pick-tier="thicknessPickTier"
      :thickness-pick-message="thicknessPickMessage"
      :thickness-pick-busy="thicknessPickBusy"
      @update:plan-thickness-cms="emit('update:planThicknessCms', $event)"
      @update:plan-band-mid-boundary-cm="emit('update:planBandMidBoundaryCm', $event)"
      @update:plan-band-max-boundary-cm="emit('update:planBandMaxBoundaryCm', $event)"
      @start-thickness-pick="emit('startThicknessPick', $event)"
      @cancel-thickness-pick="emit('cancelThicknessPick')"
    />

    <PlanPanelHeights
      :scale-confirmed="scaleConfirmed"
      :has-combined-output="hasCombinedOutput"
      :unit="scaleInputUnit"
      :plan-wall-height-cm="planWallHeightCm"
      :plan-door-height-cm="planDoorHeightCm"
      :plan-window-height-cm="planWindowHeightCm"
      :plan-window-sill-z-cm="planWindowSillZCm"
      @update:plan-wall-height-cm="emit('update:planWallHeightCm', $event)"
      @update:plan-door-height-cm="emit('update:planDoorHeightCm', $event)"
      @update:plan-window-height-cm="emit('update:planWindowHeightCm', $event)"
      @update:plan-window-sill-z-cm="emit('update:planWindowSillZCm', $event)"
    />

    <PlanRescalePanel
      :active="rescaleActive"
      :can-start="canStartRescale"
      :state="rescaleState"
      :mm-x="rescaleDistanceMmX"
      :mm-y="rescaleDistanceMmY"
      :unit="scaleInputUnit"
      @begin="emit('beginRescale')"
      @cancel="emit('cancelRescale')"
      @confirm="emit('confirmRescale')"
      @update-mm-x="emit('update:rescaleDistanceMmX', $event)"
      @update-mm-y="emit('update:rescaleDistanceMmY', $event)"
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

    <PlanPanelActions
      :scale-confirmed="scaleConfirmed"
      :has-combined-output="hasCombinedOutput"
      :plan-limits-dirty="planLimitsDirty"
      :plan-orient-flip-x="planOrientFlipX"
      :has-any-floor-plan="hasAnyFloorPlan"
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
.plan-panel {
  padding-top: 8px;
  padding-bottom: 8px;
}

.plan-floor-name {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 10px;
  font-size: 11px;
  color: #334155;
}

.plan-floor-name input {
  width: 100%;
  height: 28px;
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
}

.plan-floor-name input:focus {
  border-color: #3b82f6;
  outline: none;
}

.plan-stats,
.plan-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #475569;
  line-height: 1.4;
}

.plan-bovenlicht {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-direction: row;
  margin: 0 0 8px;
  justify-content: flex-start;
}

.plan-bovenlicht input[type='checkbox'] {
  width: auto;
  margin: 0;
  flex-shrink: 0;
}

.sidebar-icon-btn {
  margin: 0 0 10px;
}
</style>
