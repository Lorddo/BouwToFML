<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { OpeningFrameCm } from '@/core/plan/opening-kind-catalog'
import type {
  FloorDefaultBoolField,
  FloorDefaultNumberField,
  FloorDefaults,
} from '@/core/plan/floor-defaults'
import type { OpeningFrameDefaults } from '@/core/plan/opening-frame-defaults'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import { SCALE_LENGTH_COMMIT_DEBOUNCE_MS } from '@/ui/composables/settings/scale-length-field'
import ScaleLengthInput from './ScaleLengthInput.vue'

defineProps<{
  defaults: FloorDefaults
  unit: ScaleInputUnit
  /** Project-flag: flags+export-expand (true) vs losse ramen (false). Default true. */
  bovenlichtPacked?: boolean
  openingFrameDefaults: OpeningFrameDefaults
  showOpeningFrameEdit?: boolean
  hint?: string
}>()

const emit = defineEmits<{
  cm: [field: FloorDefaultNumberField, cm: number]
  bool: [field: FloorDefaultBoolField, event: Event]
  packed: [packed: boolean]
  frame: [kind: 'door' | 'window', side: keyof OpeningFrameCm, cm: number]
  showFrameEdit: [show: boolean]
}>()

const { t } = useI18n()

const heightFields = [
  { field: 'doorHeightCm' as const, labelKey: 'settings.doorHeightCm', minCm: 1, allowZero: false },
  {
    field: 'windowHeightCm' as const,
    labelKey: 'settings.windowHeightCm',
    minCm: 1,
    allowZero: false,
  },
  { field: 'windowSillZCm' as const, labelKey: 'settings.sillZCm', minCm: 0, allowZero: true },
]

const bovenlichtMeasureFields = [
  {
    field: 'bovenlichtGapCm' as const,
    labelKey: 'settings.bovenlichtGapCm',
    titleKey: 'settings.bovenlichtGapTitle',
    minCm: 0,
    allowZero: true,
  },
  {
    field: 'bovenlichtHeightCm' as const,
    labelKey: 'settings.bovenlichtHeightCm',
    titleKey: 'settings.bovenlichtHeightTitle',
    minCm: 1,
    allowZero: false,
  },
]

const frameFields: {
  kind: 'door' | 'window'
  side: keyof OpeningFrameCm
  labelKey: string
}[] = [
  { kind: 'door', side: 'leftCm', labelKey: 'settings.openingFrameDoorLeft' },
  { kind: 'door', side: 'rightCm', labelKey: 'settings.openingFrameDoorRight' },
  { kind: 'door', side: 'topCm', labelKey: 'settings.openingFrameDoorTop' },
  { kind: 'door', side: 'bottomCm', labelKey: 'settings.openingFrameDoorBottom' },
  { kind: 'window', side: 'leftCm', labelKey: 'settings.openingFrameWindowLeft' },
  { kind: 'window', side: 'rightCm', labelKey: 'settings.openingFrameWindowRight' },
  { kind: 'window', side: 'topCm', labelKey: 'settings.openingFrameWindowTop' },
  { kind: 'window', side: 'bottomCm', labelKey: 'settings.openingFrameWindowBottom' },
]
</script>

<template>
  <div class="viewer-kozijnen">
    <details class="plan-fold kozijnen-subfold">
      <summary>{{ t('viewer.kozijnenHeightsFold') }}</summary>
      <p v-if="hint" class="defaults-hint">{{ hint }}</p>
      <div class="defaults-grid">
        <label v-for="row in heightFields" :key="row.field" class="defaults-field">
          <span>{{ t(row.labelKey) }}</span>
          <ScaleLengthInput
            block
            :cm="defaults[row.field]"
            :unit="unit"
            :min-cm="row.minCm"
            :allow-zero="row.allowZero"
            :debounce-ms="SCALE_LENGTH_COMMIT_DEBOUNCE_MS"
            @update:cm="emit('cm', row.field, $event)"
          />
        </label>
      </div>
    </details>

    <details class="plan-fold kozijnen-subfold">
      <summary>{{ t('viewer.kozijnenBovenlichtFold') }}</summary>
      <p v-if="hint" class="defaults-hint">{{ hint }}</p>
      <div class="defaults-grid">
        <label
          v-for="row in bovenlichtMeasureFields"
          :key="row.field"
          class="defaults-field"
          :title="t(row.titleKey)"
        >
          <span>{{ t(row.labelKey) }}</span>
          <ScaleLengthInput
            block
            :cm="defaults[row.field]"
            :unit="unit"
            :min-cm="row.minCm"
            :allow-zero="row.allowZero"
            :debounce-ms="SCALE_LENGTH_COMMIT_DEBOUNCE_MS"
            @update:cm="emit('cm', row.field, $event)"
          />
        </label>
      </div>
      <label class="defaults-check" :title="t('settings.bovenlichtPackedHint')">
        <input
          type="checkbox"
          :checked="bovenlichtPacked !== false"
          @change="emit('packed', ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t('settings.bovenlichtPacked') }}</span>
      </label>
      <p class="defaults-packed-hint">{{ t('settings.bovenlichtPackedHint') }}</p>
      <label class="defaults-check">
        <input
          type="checkbox"
          :checked="defaults.bovenlichtDefault"
          @change="emit('bool', 'bovenlichtDefault', $event)"
        />
        <span>{{ t('settings.bovenlichtDoors') }}</span>
      </label>
      <label class="defaults-check">
        <input
          type="checkbox"
          :checked="defaults.windowBovenlichtDefault"
          @change="emit('bool', 'windowBovenlichtDefault', $event)"
        />
        <span>{{ t('settings.bovenlichtWindows') }}</span>
      </label>
    </details>

    <details class="plan-fold kozijnen-subfold">
      <summary>{{ t('viewer.kozijnenFrameFold') }}</summary>
      <p class="defaults-hint kozijnen-frame-hint">{{ t('viewer.kozijnenFrameHint') }}</p>
      <label class="defaults-check">
        <input
          type="checkbox"
          :checked="showOpeningFrameEdit !== false"
          @change="emit('showFrameEdit', ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t('settings.showOpeningFrameEdit') }}</span>
      </label>
      <div class="defaults-grid">
        <label v-for="row in frameFields" :key="`${row.kind}-${row.side}`" class="defaults-field">
          <span>{{ t(row.labelKey) }}</span>
          <ScaleLengthInput
            block
            :cm="openingFrameDefaults[row.kind][row.side]"
            :unit="unit"
            :min-cm="0"
            allow-zero
            @update:cm="emit('frame', row.kind, row.side, $event)"
          />
        </label>
      </div>
    </details>
  </div>
</template>

<style scoped>
.viewer-kozijnen {
  display: flex;
  flex-direction: column;
}

.defaults-hint {
  margin: 8px 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.kozijnen-frame-hint {
  margin-top: 8px;
}

.defaults-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.defaults-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #334155;
}

.defaults-check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: #334155;
}

.defaults-packed-hint {
  margin: 2px 0 0 22px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.35;
}

.kozijnen-subfold {
  margin: 8px 0 0;
  background: #f8fafc;
}

.kozijnen-subfold:first-of-type {
  margin-top: 0;
}
</style>
