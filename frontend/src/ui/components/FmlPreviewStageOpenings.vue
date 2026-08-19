<script setup lang="ts">
import { computed } from 'vue'
import { resolveDoorBovenlicht, resolveWindowBovenlicht } from '@/core/fml/bovenlicht'
import {
  BOVENLICHT_MARKER_STROKE_PX,
  openingFillColor,
} from '@/ui/composables/fml-preview/fml-preview-opening-render'
import {
  FACTORY_OPENING_COLORS,
  openingStrokeFromFill,
  type OpeningDisplayColors,
} from '@/ui/composables/settings/opening-display-colors'
import { inspectColorFor } from '@/ui/composables/fml-preview/fml-inspect'
import {
  OPENING_ARC_DASH_CM,
  OPENING_HIT_STROKE_PX,
  OPENING_STROKE_CM,
  OPENING_STROKE_HEAVY_CM,
  OPENING_STROKE_MID_CM,
  detailSymbolsVisibleOnScreen,
  worldDashStage,
  worldStrokeStage,
} from '@/ui/composables/fml-preview/fml-preview-world-stroke'
import type { RenderModel } from '@/ui/composables/fml-preview/useFmlPreviewRenderModel'

const props = withDefaults(
  defineProps<{
    renderModel: RenderModel
    settingsOpeningIds: string[]
    moveOpeningId: string | null
    inspectColors: Record<string, string>
    /** Content-layout scale (cm → stage). */
    layoutScale?: number
    viewScale?: number
    /** Vloerdefault: bovenlicht op deuren zonder per-deur override. */
    doorBovenlichtDefault?: boolean
    /** Vloerdefault: bovenlicht op ramen zonder per-raam override. */
    windowBovenlichtDefault?: boolean
    openingColors?: OpeningDisplayColors
  }>(),
  {
    layoutScale: 1,
    viewScale: 1,
    doorBovenlichtDefault: false,
    windowBovenlichtDefault: false,
    openingColors: () => ({ ...FACTORY_OPENING_COLORS }),
  },
)

const detailVisible = computed(() =>
  detailSymbolsVisibleOnScreen(props.layoutScale, props.viewScale),
)
const doorGroups = computed(() => (detailVisible.value ? props.renderModel.doorGroups : []))
const windows = computed(() => (detailVisible.value ? props.renderModel.windows : []))

const stroke = computed(() => worldStrokeStage(OPENING_STROKE_CM, props.layoutScale))
const strokeHeavy = computed(() => worldStrokeStage(OPENING_STROKE_HEAVY_CM, props.layoutScale))
const strokeMid = computed(() => worldStrokeStage(OPENING_STROKE_MID_CM, props.layoutScale))
const arcDash = computed(() => worldDashStage(OPENING_ARC_DASH_CM, props.layoutScale))

function isOpeningSettings(openingId: string): boolean {
  return props.settingsOpeningIds.includes(openingId)
}

function isOpeningMove(openingId: string): boolean {
  return props.moveOpeningId === openingId && !isOpeningSettings(openingId)
}

function openingInspectGuid(openingId: string, type: 'door' | 'window'): string {
  if (type === 'door') {
    return (
      props.renderModel.doorGroups.find((door) => door.id === openingId)?.openingGuid ?? openingId
    )
  }
  return (
    props.renderModel.windows.find((window) => window.id === openingId)?.opening.guid ?? openingId
  )
}

function openingGapFill(openingId: string, type: 'door' | 'window'): string {
  if (isOpeningSettings(openingId)) return '#f97316'
  if (isOpeningMove(openingId)) return '#3b82f6'
  return (
    inspectColorFor(openingInspectGuid(openingId, type), props.inspectColors) ??
    openingFillColor(type, false, props.openingColors)
  )
}

function openingStrokeColor(openingId: string, type: 'door' | 'window'): string {
  if (isOpeningSettings(openingId)) return '#ea580c'
  if (isOpeningMove(openingId)) return '#2563eb'
  return openingStrokeFromFill(
    type === 'door' ? props.openingColors.door : props.openingColors.window,
  )
}

function doorHasBovenlicht(door: (typeof props.renderModel.doorGroups)[number]): boolean {
  return door.openings.some((opening) =>
    resolveDoorBovenlicht(opening, props.doorBovenlichtDefault),
  )
}

function windowHasBovenlicht(window: (typeof props.renderModel.windows)[number]): boolean {
  return resolveWindowBovenlicht(window.opening, props.windowBovenlichtDefault)
}

/** Hartlijn door de muurgap — zelfde points als hit, zichtbaar blauw. */
const doorBovenlichtMarkers = computed(() =>
  doorGroups.value.flatMap((door) =>
    doorHasBovenlicht(door) && door.hitPoints.length >= 4
      ? [{ id: door.id, points: door.hitPoints }]
      : [],
  ),
)

const windowBovenlichtMarkers = computed(() =>
  windows.value.flatMap((window) =>
    windowHasBovenlicht(window) && window.hitPoints.length >= 4
      ? [{ id: window.id, points: window.hitPoints }]
      : [],
  ),
)
</script>

<template>
  <v-group :config="{ listening: false }">
    <template v-for="door in doorGroups" :key="`${door.id}-gap`">
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
    <template v-for="window in windows" :key="`${window.id}-gap`">
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

    <template v-for="door in doorGroups" :key="door.id">
      <v-line
        v-for="(leaf, leafIdx) in door.leafLines"
        :key="`${door.id}-leaf-${leafIdx}`"
        :config="{
          points: leaf,
          stroke: openingStrokeColor(door.id, 'door'),
          strokeWidth: stroke,
          lineCap: 'round',
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
      <v-line
        v-for="(arc, arcIdx) in door.arcPoints"
        :key="`${door.id}-arc-${arcIdx}`"
        :config="{
          points: arc,
          stroke: openingStrokeColor(door.id, 'door'),
          strokeWidth: stroke,
          dash: arcDash,
          lineCap: 'round',
          opacity: 0.85,
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
      <v-line
        v-for="(arrow, arrowIdx) in door.arrowPoints"
        :key="`${door.id}-arrow-${arrowIdx}`"
        :config="{
          points: arrow,
          stroke: openingStrokeColor(door.id, 'door'),
          strokeWidth: stroke,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.95,
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
      <v-line
        :config="{
          points: door.hitPoints,
          stroke: '#000000',
          strokeWidth: OPENING_HIT_STROKE_PX,
          strokeScaleEnabled: false,
          opacity: 0.001,
          lineCap: 'round',
          listening: false,
        }"
      />
    </template>

    <template v-for="window in windows" :key="window.id">
      <v-line
        v-if="window.basePoints"
        :config="{
          points: window.basePoints,
          stroke: openingStrokeColor(window.id, 'window'),
          strokeWidth: strokeHeavy,
          lineCap: 'round',
          opacity: 0.9,
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
      <v-line
        v-for="(mullion, idx) in window.mullions ?? []"
        :key="`${window.id}-m-${idx}`"
        :config="{
          points: mullion,
          stroke: openingStrokeColor(window.id, 'window'),
          strokeWidth: strokeMid,
          lineCap: 'round',
          opacity: 0.9,
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
      <v-line
        v-if="window.ornament"
        :config="{
          points: window.ornament.points,
          stroke: openingStrokeColor(window.id, 'window'),
          strokeWidth: strokeMid,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.9,
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
      <v-line
        :config="{
          points: window.hitPoints,
          stroke: '#000000',
          strokeWidth: OPENING_HIT_STROKE_PX,
          strokeScaleEnabled: false,
          opacity: 0.001,
          lineCap: 'round',
          listening: false,
        }"
      />
    </template>

    <!-- Bovenlicht: 3 px hartlijn door de opening (schermvast). -->
    <v-line
      v-for="marker in doorBovenlichtMarkers"
      :key="`${marker.id}-bovenlicht`"
      :config="{
        points: marker.points,
        stroke: openingColors.bovenlicht,
        strokeWidth: BOVENLICHT_MARKER_STROKE_PX,
        strokeScaleEnabled: false,
        lineCap: 'butt',
        opacity: 0.95,
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
    <v-line
      v-for="marker in windowBovenlichtMarkers"
      :key="`${marker.id}-bovenlicht`"
      :config="{
        points: marker.points,
        stroke: openingColors.bovenlicht,
        strokeWidth: BOVENLICHT_MARKER_STROKE_PX,
        strokeScaleEnabled: false,
        lineCap: 'butt',
        opacity: 0.95,
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
  </v-group>
</template>
