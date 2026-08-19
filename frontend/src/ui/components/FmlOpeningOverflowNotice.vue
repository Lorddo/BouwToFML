<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OpeningHeightOverflowSummary } from '@/core/fml/opening-height-overflow'

const props = defineProps<{
  summary: OpeningHeightOverflowSummary
}>()

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
</script>

<template>
  <div class="fml-overflow-hint" role="status">
    <p v-if="hasAbove">
      {{
        t('result.openingOverflow', {
          kinds,
          top: summary.maxTopCm,
          floor: summary.floorHeightCm,
        })
      }}
    </p>
    <p v-if="summary.below > 0">
      {{
        t('result.openingOverflowBelow', {
          n: summary.below,
          sill: summary.minSillCm,
          floor: summary.wallBottomCm,
        })
      }}
    </p>
  </div>
</template>

<style scoped>
.fml-overflow-hint {
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.4;
  color: #b45309;
}

.fml-overflow-hint p {
  margin: 0;
}

.fml-overflow-hint p + p {
  margin-top: 4px;
}
</style>
