<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OpeningHeightOverflowSummary } from '@/core/plan/opening-height-overflow'
import {
  formatScaleInputLabel,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'

const props = withDefaults(
  defineProps<{
    summary: OpeningHeightOverflowSummary
    unit?: ScaleInputUnit
  }>(),
  { unit: 'mm' },
)

const { t } = useI18n()

const hasAbove = computed(
  () => props.summary.doors + props.summary.windows + props.summary.bovenlichten > 0,
)

const kinds = computed(() => {
  const parts: string[] = []
  if (props.summary.doors > 0) {
    parts.push(t('result.openingOverflowDoors', { n: props.summary.doors }))
  }
  if (props.summary.windows > 0) {
    parts.push(t('result.openingOverflowWindows', { n: props.summary.windows }))
  }
  if (props.summary.bovenlichten > 0) {
    parts.push(t('result.openingOverflowBovenlicht', { n: props.summary.bovenlichten }))
  }
  return parts.join(', ')
})

function len(cm: number): string {
  return formatScaleInputLabel(cm, props.unit)
}
</script>

<template>
  <div class="plan-overflow-hint" role="status">
    <p v-if="hasAbove">
      {{
        t('result.openingOverflow', {
          kinds,
          top: len(summary.maxTopCm),
          floor: len(summary.floorHeightCm),
        })
      }}
    </p>
    <p v-if="summary.below > 0">
      {{
        t('result.openingOverflowBelow', {
          n: summary.below,
          sill: len(summary.minSillCm),
          floor: len(summary.wallBottomCm),
        })
      }}
    </p>
  </div>
</template>

<style scoped>
.plan-overflow-hint {
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.4;
  color: #b45309;
}

.plan-overflow-hint p {
  margin: 0;
}

.plan-overflow-hint p + p {
  margin-top: 4px;
}
</style>
