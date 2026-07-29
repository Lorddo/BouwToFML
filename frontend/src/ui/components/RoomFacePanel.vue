<script setup lang="ts">
import { computed } from 'vue'
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

const phaseLabel = computed(() => {
  switch (props.roomPhase) {
    case 'awaiting_reference':
      return 'Wacht op referentie'
    case 'classifying':
      return 'Classificeren…'
    case 'recalculating':
      return 'Inkt verwerken…'
    case 'review':
      return 'Controle'
    case 'finalizing':
      return 'Afronden…'
    case 'done':
      return 'Afgerond'
    default:
      return 'Wachten…'
  }
})
</script>

<template>
  <div class="panel">
    <p class="phase">{{ phaseLabel }}</p>
    <p v-if="stats" class="stats">
      {{ stats.wallCount }} muur · {{ stats.surfaceCount }} vloer ·
      {{ stats.unknownCount }} onbekend
      <span v-if="(stats.doorCount ?? 0) > 0"> · {{ stats.doorCount }} deur</span>
      <span v-if="(stats.windowCount ?? 0) > 0"> · {{ stats.windowCount }} raam</span>
      <span v-if="(stats.doorframeCount ?? 0) > 0"> · {{ stats.doorframeCount }} kozijn</span>
      <span v-if="stats.overrideCount > 0"> · {{ stats.overrideCount }} handmatig</span>
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
