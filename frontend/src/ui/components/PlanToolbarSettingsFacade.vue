<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  formatScaleInputLabel,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'
import ToolbeltActionButton from './canvas/ToolbeltActionButton.vue'
import { TOOLBELT_HOTKEY_PRIORITY } from '@/ui/composables/canvas/useToolbeltHotkey'
import './plan-toolbelt-settings-fields.css'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    unit: ScaleInputUnit
    panel: {
      groupId: string
      name: string
      wallCount: number
      floorCount: number
    }
    wallThicknessDraft: number
    wallThicknessMixed: boolean
    thicknessPresetCms?: number[]
  }>(),
  {
    thicknessPresetCms: () => [10, 20, 30],
  },
)

const emit = defineEmits<{
  wallThicknessCm: [cm: number]
  commitWallThickness: []
  applyWallThickness: [thicknessCm: number]
  clearSelection: []
}>()

const thicknessPresets = computed(() =>
  (props.thicknessPresetCms ?? [10, 20, 30]).map((cm) => ({
    id: String(Math.round(cm * 10) / 10),
    label: formatScaleInputLabel(cm, props.unit),
    cm,
  })),
)

const wallCountLabel = computed(() =>
  props.panel.wallCount === 1
    ? t('result.toolbar.facadeGroupWallsOne')
    : t('result.toolbar.facadeGroupWallsMany', { count: props.panel.wallCount }),
)

const floorCountLabel = computed(() =>
  props.panel.floorCount === 1
    ? t('result.toolbar.facadeGroupFloorsOne')
    : t('result.toolbar.facadeGroupFloorsMany', { count: props.panel.floorCount }),
)

function presetSizeLabel(cm: number): string {
  return formatScaleInputLabel(cm, props.unit)
}

function releaseControlFocus(event: Event): void {
  const el = event.target
  if (el instanceof HTMLElement) el.blur()
}
</script>

<template>
  <div class="plan-toolbelt-stack">
    <div class="plan-toolbelt__row plan-toolbelt__row--primary">
      <span class="plan-toolbelt__meta">{{ panel.name }}</span>
      <span class="plan-toolbelt__meta">{{ wallCountLabel }} · {{ floorCountLabel }}</span>
      <div class="plan-toolbelt__field" :title="t('result.toolbar.facadeGroupThicknessHint')">
        <span class="plan-toolbelt__field-label">{{
          t('result.toolbar.facadeGroupThickness')
        }}</span>
        <div class="plan-toolbelt__field-controls">
          <ScaleLengthInput
            :cm="wallThicknessDraft"
            :unit="unit"
            :min-cm="1"
            :max-cm="200"
            :mixed="wallThicknessMixed"
            :aria-label="
              t('result.toolbar.facadeGroupThicknessAria', { unit: t(`common.${unit}`) })
            "
            input-class="plan-toolbelt__thickness-input"
            @update:cm="emit('wallThicknessCm', $event)"
            @commit="emit('commitWallThickness')"
          />
          <div
            class="plan-toolbelt__presets"
            role="group"
            :aria-label="t('result.toolbar.thicknessPresetsAria')"
          >
            <button
              v-for="preset in thicknessPresets"
              :key="preset.id"
              type="button"
              class="plan-toolbelt__preset-btn"
              :title="
                t('result.toolbar.applyPresetTitle', {
                  label: preset.label,
                  cm: presetSizeLabel(preset.cm),
                })
              "
              :aria-label="
                t('result.toolbar.applyPresetAria', {
                  label: preset.label,
                  cm: presetSizeLabel(preset.cm),
                })
              "
              @click="emit('applyWallThickness', preset.cm)"
              @pointerup="releaseControlFocus"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>
      </div>
      <ToolbeltActionButton
        icon="clear"
        :title="t('result.toolbar.deselectTitle')"
        :aria-label="t('result.toolbar.deselect')"
        hotkey="Escape"
        :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.chrome"
        @click="emit('clearSelection')"
      />
    </div>
  </div>
</template>
