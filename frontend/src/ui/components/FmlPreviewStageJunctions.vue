<script setup lang="ts">
import type { RenderJunction } from '@/ui/composables/fml-preview/useFmlPreviewRenderModel'

defineProps<{
  visibleJunctions: RenderJunction[]
  junctionOverlayGroup: { x: number; y: number; scaleX: number; scaleY: number }
  junctionHitRadius: number
  junctionMarkerRadius: number
  junctionMarkerStroke: number
  activeJunctionId: string | null
}>()

const emit = defineEmits<{
  junctionHover: [junctionId: string]
  junctionHoverEnd: []
}>()
</script>

<template>
  <v-group :config="junctionOverlayGroup">
    <v-group
      v-for="junction in visibleJunctions"
      :key="`junction-${junction.id}`"
      :config="{
        x: junction.x,
        y: junction.y,
      }"
    >
      <v-circle
        :config="{
          radius: junctionHitRadius,
          fill: 'rgba(0,0,0,0.01)',
          listening: true,
        }"
        @mouseenter="emit('junctionHover', junction.id)"
        @mouseleave="emit('junctionHoverEnd')"
      />
      <v-circle
        :config="{
          radius: junctionMarkerRadius,
          fill:
            activeJunctionId === junction.id
              ? '#fbbf24'
              : junction.wallCount > 1
                ? '#38bdf8'
                : '#f97316',
          stroke: '#ffffff',
          strokeWidth: junctionMarkerStroke,
          listening: false,
        }"
      />
    </v-group>
  </v-group>
</template>
