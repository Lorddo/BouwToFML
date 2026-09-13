<script setup lang="ts">
import { computed } from 'vue'
import { resolveDoorBovenlicht, resolveWindowBovenlicht } from '@/core/fml/bovenlicht'
import {
  BOVENLICHT_MARKER_STROKE_PX,
  openingFillColor,
} from '@/ui/composables/plan-canvas/plan-canvas-opening-render'
import {
  FACTORY_OPENING_COLORS,
  openingStrokeFromFill,
  type OpeningDisplayColors,
} from '@/ui/composables/settings/opening-display-colors'
import {
  BOUW_GAP_FILL,
  DEFAULT_PLAN_DISPLAY_STYLE,
  isArchitectPlanStyle,
  isLinePlanStyle,
  planLineStroke,
  type PlanDisplayStyleChoice,
} from '@/ui/composables/settings/plan-display-style'
import { inspectColorFor } from '@/ui/composables/plan-canvas/plan-inspect'
import {
  OPENING_ARC_DASH_CM,
  OPENING_HIT_STROKE_PX,
  OPENING_STROKE_CM,
  OPENING_STROKE_MID_CM,
  detailSymbolsVisibleOnScreen,
  worldDashStage,
  worldStrokeStage,
} from '@/ui/composables/plan-canvas/plan-canvas-world-stroke'
import type {
  RenderPlanGlyph,
  RenderModel,
} from '@/ui/composables/plan-canvas/usePlanCanvasRenderModel'

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
    planDisplayStyle?: PlanDisplayStyleChoice
  }>(),
  {
    layoutScale: 1,
    viewScale: 1,
    doorBovenlichtDefault: false,
    windowBovenlichtDefault: false,
    openingColors: () => ({ ...FACTORY_OPENING_COLORS }),
    planDisplayStyle: DEFAULT_PLAN_DISPLAY_STYLE,
  },
)

const lineStyle = computed(() => isLinePlanStyle(props.planDisplayStyle))
const architect = computed(() => isArchitectPlanStyle(props.planDisplayStyle))

const detailVisible = computed(() =>
  detailSymbolsVisibleOnScreen(props.layoutScale, props.viewScale),
)
const doorGroups = computed(() => (detailVisible.value ? props.renderModel.doorGroups : []))
const windows = computed(() => (detailVisible.value ? props.renderModel.windows : []))

const stroke = computed(() => worldStrokeStage(OPENING_STROKE_CM, props.layoutScale))
const strokeMid = computed(() => worldStrokeStage(OPENING_STROKE_MID_CM, props.layoutScale))
const strokeLeaf = computed(() => worldStrokeStage(OPENING_STROKE_CM * 0.75, props.layoutScale))
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
    props.renderModel.windows.find((window) => window.id === openingId)?.opening.id ?? openingId
  )
}

function openingGapFill(openingId: string, type: 'door' | 'window'): string {
  if (isOpeningSettings(openingId)) return '#f97316'
  if (isOpeningMove(openingId)) return '#3b82f6'
  const inspect = inspectColorFor(openingInspectGuid(openingId, type), props.inspectColors)
  if (inspect) return inspect
  if (lineStyle.value) return BOUW_GAP_FILL
  return openingFillColor(type, false, props.openingColors)
}

function openingStrokeColor(openingId: string, type: 'door' | 'window'): string {
  if (isOpeningSettings(openingId)) return '#ea580c'
  if (isOpeningMove(openingId)) return '#2563eb'
  if (lineStyle.value) return planLineStroke(props.planDisplayStyle)
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
  lineStyle.value
    ? []
    : doorGroups.value.flatMap((door) =>
        doorHasBovenlicht(door) && door.hitPoints.length >= 4
          ? [{ id: door.id, points: door.hitPoints }]
          : [],
      ),
)

const windowBovenlichtMarkers = computed(() =>
  lineStyle.value
    ? []
    : windows.value.flatMap((window) =>
        windowHasBovenlicht(window) && window.hitPoints.length >= 4
          ? [{ id: window.id, points: window.hitPoints }]
          : [],
      ),
)

function glyphStrokeWidth(glyph: RenderPlanGlyph): number {
  if (glyph.kind === 'arc') return stroke.value
  switch (glyph.role) {
    case 'sill':
      return stroke.value
    case 'glass':
    case 'mullion':
    case 'ornament':
    case 'panel':
      return strokeMid.value
    case 'leaf':
      return strokeLeaf.value
    default:
      return stroke.value
  }
}

function glyphClosed(glyph: RenderPlanGlyph): boolean {
  return glyph.kind === 'polyline' && !!glyph.closed
}

function glyphIsJamb(glyph: RenderPlanGlyph): boolean {
  return glyph.kind === 'polyline' && glyph.role === 'jamb'
}

function glyphIsFilledLeaf(glyph: RenderPlanGlyph): boolean {
  return glyph.kind === 'polyline' && glyph.role === 'leaf' && !!glyph.closed
}

/** Blind paneel: dicht glasvlak, altijd zwart. */
function glyphIsFilledGlass(glyph: RenderPlanGlyph): boolean {
  return glyph.kind === 'polyline' && glyph.role === 'glass' && !!glyph.closed
}

function glyphDash(glyph: RenderPlanGlyph): number[] | undefined {
  // Draaiboog = solid; stippellijn alleen bij expliciet dashed (passage/arch).
  if (glyph.kind === 'polyline' && glyph.dashed) return arcDash.value
  return undefined
}

function glyphOpacity(glyph: RenderPlanGlyph): number {
  // Architect/Bouw: volle dekking (opacity <1 → grijs i.p.v. zwart).
  if (lineStyle.value) return 1
  if (glyph.kind === 'arc') return 0.85
  if (glyph.role === 'arrow') return 0.95
  return 0.9
}

function jambFill(openingId: string, type: 'door' | 'window'): string | undefined {
  if (lineStyle.value) return undefined
  return openingStrokeColor(openingId, type)
}

function jambFillOpacity(): number {
  return lineStyle.value ? 0 : 0.35
}

function leafFill(openingId: string, type: 'door' | 'window'): string | undefined {
  // Blad = outline; lichte fill alleen in editor voor leesbaarheid.
  if (lineStyle.value) return undefined
  return openingStrokeColor(openingId, type)
}

function leafFillOpacity(): number {
  return lineStyle.value ? 0 : 0.12
}

/** Gap-vlak: editor kleur / bouw wit punch / architect uit (geen muurfill). */
function showOpeningGap(openingId: string): boolean {
  if (isOpeningSettings(openingId) || isOpeningMove(openingId)) return true
  if (architect.value) return false
  return true
}
</script>

<template>
  <v-group :config="{ listening: false }">
    <template v-for="door in doorGroups" :key="`${door.id}-gap`">
      <v-line
        v-if="showOpeningGap(door.id)"
        :config="{
          points: door.gapPoints,
          closed: true,
          fill: openingGapFill(door.id, 'door'),
          strokeEnabled: false,
          opacity: isOpeningSettings(door.id)
            ? 0.96
            : isOpeningMove(door.id)
              ? 0.94
              : lineStyle
                ? 1
                : 0.92,
          listening: false,
        }"
      />
    </template>
    <template v-for="window in windows" :key="`${window.id}-gap`">
      <v-line
        v-if="showOpeningGap(window.id)"
        :config="{
          points: window.gapPoints,
          closed: true,
          fill: openingGapFill(window.id, 'window'),
          strokeEnabled: false,
          opacity: isOpeningSettings(window.id)
            ? 0.96
            : isOpeningMove(window.id)
              ? 0.94
              : lineStyle
                ? 1
                : 0.92,
          listening: false,
        }"
      />
    </template>

    <template v-for="door in doorGroups" :key="door.id">
      <template v-for="(glyph, glyphIdx) in door.glyphs" :key="`${door.id}-g-${glyphIdx}`">
        <v-line
          v-if="glyphIsJamb(glyph)"
          :config="{
            points: glyph.points,
            closed: true,
            fill: jambFill(door.id, 'door'),
            opacity: jambFillOpacity() || 1,
            stroke: openingStrokeColor(door.id, 'door'),
            strokeWidth: stroke,
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
        <v-line
          v-else-if="glyphIsFilledLeaf(glyph)"
          :config="{
            points: glyph.points,
            closed: true,
            fill: leafFill(door.id, 'door'),
            fillEnabled: !lineStyle,
            opacity: leafFillOpacity() || glyphOpacity(glyph),
            stroke: openingStrokeColor(door.id, 'door'),
            strokeWidth: glyphStrokeWidth(glyph),
            lineJoin: 'round',
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
        <v-line
          v-else
          :config="{
            points: glyph.points,
            closed: glyphClosed(glyph),
            stroke: openingStrokeColor(door.id, 'door'),
            strokeWidth: glyphStrokeWidth(glyph),
            dash: glyphDash(glyph),
            lineCap: 'round',
            lineJoin: 'round',
            opacity: glyphOpacity(glyph),
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
      </template>
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
      <template v-for="(glyph, glyphIdx) in window.glyphs" :key="`${window.id}-g-${glyphIdx}`">
        <v-line
          v-if="glyphIsJamb(glyph)"
          :config="{
            points: glyph.points,
            closed: true,
            fill: jambFill(window.id, 'window'),
            opacity: jambFillOpacity() || 1,
            stroke: openingStrokeColor(window.id, 'window'),
            strokeWidth: stroke,
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
        <v-line
          v-else-if="glyphIsFilledGlass(glyph)"
          :config="{
            points: glyph.points,
            closed: true,
            fill: '#000000',
            fillEnabled: true,
            opacity: 1,
            stroke: '#000000',
            strokeWidth: glyphStrokeWidth(glyph),
            lineJoin: 'miter',
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
        <v-line
          v-else
          :config="{
            points: glyph.points,
            closed: glyphClosed(glyph),
            stroke: openingStrokeColor(window.id, 'window'),
            strokeWidth: glyphStrokeWidth(glyph),
            lineCap: 'round',
            lineJoin: 'round',
            opacity: glyphOpacity(glyph),
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
      </template>
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

    <!-- Bovenlicht: 3 px hartlijn door de opening (schermvast); alleen Editor. -->
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
