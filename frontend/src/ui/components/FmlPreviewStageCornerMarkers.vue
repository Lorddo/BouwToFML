<script setup lang="ts">
import { computed } from 'vue'
import type { RenderCornerMarker } from '@/ui/composables/fml-preview/fml-preview-corner-markers'
import type { CornerMarkerMode } from '@/ui/composables/settings/corner-marker-mode'

const props = withDefaults(
  defineProps<{
    markers: RenderCornerMarker[]
    mode: CornerMarkerMode
    overlayGroup: { x: number; y: number; scaleX: number; scaleY: number }
  }>(),
  { mode: 'off' },
)

const visibleMarkers = computed(() => {
  if (props.mode === 'off') return []
  return props.markers.filter((marker) => marker.kind === props.mode)
})

const SQUARE_STROKE = '#64748b'
const WARN_FILL = '#facc15'
const WARN_STROKE = '#111827'
const WARN_RADIUS = 8
const WARN_BANG_SIZE = 10
</script>

<template>
  <v-group :config="{ ...overlayGroup, listening: false }">
    <template v-for="marker in visibleMarkers" :key="marker.id">
      <template v-if="marker.kind === 'square'">
        <v-line
          :config="{
            points: marker.armA,
            stroke: SQUARE_STROKE,
            strokeWidth: 1.5,
            lineCap: 'square',
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
        <v-line
          :config="{
            points: marker.armB,
            stroke: SQUARE_STROKE,
            strokeWidth: 1.5,
            lineCap: 'square',
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
      </template>
      <v-group
        v-else
        :config="{
          x: marker.x,
          y: marker.y,
          listening: false,
        }"
      >
        <v-regular-polygon
          :config="{
            sides: 3,
            radius: WARN_RADIUS,
            fill: WARN_FILL,
            stroke: WARN_STROKE,
            strokeWidth: 1.25,
            lineJoin: 'round',
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
        <v-text
          :config="{
            text: '!',
            fontSize: WARN_BANG_SIZE,
            fontStyle: 'bold',
            fill: WARN_STROKE,
            align: 'center',
            width: WARN_RADIUS * 2,
            offsetX: WARN_RADIUS,
            offsetY: WARN_BANG_SIZE * 0.62,
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
      </v-group>
    </template>
  </v-group>
</template>
