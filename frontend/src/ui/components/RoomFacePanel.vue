<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RoomPhase } from '@/ui/composables/workspace/useWorkspaceRoomFaces'

const props = defineProps<{
  roomPhase: RoomPhase
  stats?: {
    wallCount: number
    surfaceCount: number
    unknownCount: number
    doorCount?: number
    windowCount?: number
    doorframeCount?: number
    overrideCount: number
  } | null
}>()

const { t } = useI18n()

const phaseLabel = computed(() => {
  switch (props.roomPhase) {
    case 'awaiting_reference':
      return t('templates.roomFace.awaitingReference')
    case 'classifying':
      return t('templates.roomFace.classifying')
    case 'recalculating':
      return t('templates.roomFace.recalculating')
    case 'review':
      return t('templates.roomFace.review')
    case 'finalizing':
      return t('templates.roomFace.finalizing')
    case 'done':
      return t('templates.roomFace.done')
    default:
      return t('templates.roomFace.idle')
  }
})
</script>

<template>
  <div class="panel">
    <p class="phase">{{ phaseLabel }}</p>
    <p v-if="stats" class="stats">
      {{
        t('templates.roomFace.stats', {
          walls: stats.wallCount,
          surfaces: stats.surfaceCount,
          unknown: stats.unknownCount,
        })
      }}
      <span v-if="(stats.doorCount ?? 0) > 0">{{
        t('templates.roomFace.statDoor', { n: stats.doorCount })
      }}</span>
      <span v-if="(stats.windowCount ?? 0) > 0">{{
        t('templates.roomFace.statWindow', { n: stats.windowCount })
      }}</span>
      <span v-if="(stats.doorframeCount ?? 0) > 0">{{
        t('templates.roomFace.statDoorframe', { n: stats.doorframeCount })
      }}</span>
      <span v-if="stats.overrideCount > 0">{{
        t('templates.roomFace.statManual', { n: stats.overrideCount })
      }}</span>
    </p>
  </div>
</template>

<style scoped>
.phase {
  margin: 0 0 4px;
  font-size: 11px;
  color: #64748b;
}

.stats {
  font-size: 11px;
  color: #475569;
  margin: 0;
}
</style>
