<script setup lang="ts">
import { openingFillColor } from '@/ui/composables/fml-preview/fml-preview-opening-render'
import type { RenderModel } from '@/ui/composables/fml-preview/useFmlPreviewRenderModel'

const props = defineProps<{
  renderModel: RenderModel
  settingsOpeningIds: string[]
  moveOpeningId: string | null
}>()

function isOpeningSettings(openingId: string): boolean {
  return props.settingsOpeningIds.includes(openingId)
}

function isOpeningMove(openingId: string): boolean {
  return props.moveOpeningId === openingId && !isOpeningSettings(openingId)
}

function openingGapFill(openingId: string, type: 'door' | 'window'): string {
  if (isOpeningSettings(openingId)) return '#f97316'
  if (isOpeningMove(openingId)) return '#3b82f6'
  return openingFillColor(type, false)
}

function openingStrokeColor(openingId: string, type: 'door' | 'window'): string {
  if (isOpeningSettings(openingId)) return '#ea580c'
  if (isOpeningMove(openingId)) return '#2563eb'
  // Donkere variant van detectie-amber (deur) / -cyaan (raam).
  return type === 'door' ? '#b45309' : '#0e7490'
}
</script>

<template>
  <v-group :config="{ listening: false }">
    <template v-for="door in renderModel.doorGroups" :key="`${door.id}-gap`">
      <v-line
        :config="{
          points: door.gapPoints,
          closed: true,
          fill: openingGapFill(door.id, 'door'),
          strokeEnabled: false,
          opacity: isOpeningSettings(door.id) ? 0.96 : isOpeningMove(door.id) ? 0.94 : 0.92,
          listening: false,
        }"
      />
    </template>
    <template v-for="window in renderModel.windows" :key="`${window.id}-gap`">
      <v-line
        :config="{
          points: window.gapPoints,
          closed: true,
          fill: openingGapFill(window.id, 'window'),
          strokeEnabled: false,
          opacity: isOpeningSettings(window.id) ? 0.96 : isOpeningMove(window.id) ? 0.94 : 0.92,
          listening: false,
        }"
      />
    </template>

    <template v-for="door in renderModel.doorGroups" :key="door.id">
      <v-line
        v-for="(leaf, leafIdx) in door.leafLines"
        :key="`${door.id}-leaf-${leafIdx}`"
        :config="{
          points: leaf,
          stroke: openingStrokeColor(door.id, 'door'),
          strokeWidth: 1,
          lineCap: 'round',
          listening: false,
        }"
      />
      <v-line
        v-for="(arc, arcIdx) in door.arcPoints"
        :key="`${door.id}-arc-${arcIdx}`"
        :config="{
          points: arc,
          stroke: openingStrokeColor(door.id, 'door'),
          strokeWidth: 1,
          dash: [5, 4],
          lineCap: 'round',
          opacity: 0.85,
          listening: false,
        }"
      />
      <v-line
        v-for="(arrow, arrowIdx) in door.arrowPoints"
        :key="`${door.id}-arrow-${arrowIdx}`"
        :config="{
          points: arrow,
          stroke: openingStrokeColor(door.id, 'door'),
          strokeWidth: 1,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.95,
          listening: false,
        }"
      />
      <v-line
        :config="{
          points: door.hitPoints,
          stroke: '#000000',
          strokeWidth: 12,
          opacity: 0.001,
          lineCap: 'round',
          listening: false,
        }"
      />
    </template>

    <template v-for="window in renderModel.windows" :key="window.id">
      <v-line
        v-if="window.basePoints"
        :config="{
          points: window.basePoints,
          stroke: openingStrokeColor(window.id, 'window'),
          strokeWidth: 2,
          lineCap: 'round',
          opacity: 0.9,
          listening: false,
        }"
      />
      <v-line
        v-for="(mullion, idx) in window.mullions ?? []"
        :key="`${window.id}-m-${idx}`"
        :config="{
          points: mullion,
          stroke: openingStrokeColor(window.id, 'window'),
          strokeWidth: 1.6,
          lineCap: 'round',
          opacity: 0.9,
          listening: false,
        }"
      />
      <v-line
        v-if="window.ornament"
        :config="{
          points: window.ornament.points,
          stroke: openingStrokeColor(window.id, 'window'),
          strokeWidth: 1.4,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.9,
          listening: false,
        }"
      />
      <v-line
        :config="{
          points: window.hitPoints,
          stroke: '#000000',
          strokeWidth: 12,
          opacity: 0.001,
          lineCap: 'round',
          listening: false,
        }"
      />
    </template>
  </v-group>
</template>
