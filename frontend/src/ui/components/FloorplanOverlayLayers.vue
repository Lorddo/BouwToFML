<script setup lang="ts">

import type {

  DetectionOverlay,

  GapOverlay,

  JunctionOverlay,

  OcrTextOverlay,

  SegmentOverlay,

  WallMatchOverlay,

} from '@/platform/canvas'

import { ROOM_WALL_JUNCTION_COLORS } from '@/cv/walls/rooms/room-wall-skeleton-render'

import type { ElementClass } from '@/core/extraction/types'



const props = withDefaults(

  defineProps<{

    segmentOverlays?: SegmentOverlay[]

    junctionOverlays?: JunctionOverlay[]

    gapOverlays?: GapOverlay[]

    ocrTextOverlays?: OcrTextOverlay[]

    wallMatchOverlays?: WallMatchOverlay[]

    detectionOverlays?: DetectionOverlay[]

    typeColors?: Partial<Record<ElementClass, string>>

  }>(),

  {

    segmentOverlays: () => [],

    junctionOverlays: () => [],

    gapOverlays: () => [],

    ocrTextOverlays: () => [],

    wallMatchOverlays: () => [],

    detectionOverlays: () => [],

    typeColors: () => ({}),

  },

)



function colorFor(type: ElementClass): string {

  return props.typeColors[type] ?? '#64748b'

}

</script>



<template>

  <v-layer>

    <v-line

      v-for="(seg, i) in segmentOverlays"

      :key="'seg-' + i"

      :config="{

        points: [seg.a.x, seg.a.y, seg.b.x, seg.b.y],

        stroke: seg.color ?? '#0ea5e9',

        strokeWidth: 2,

        strokeScaleEnabled: false,

        listening: false,

        dash: seg.dashed ? [6, 4] : undefined,

      }"

    />



    <v-circle

      v-for="(junction, i) in junctionOverlays"

      :key="'junc-' + i"

      :config="{

        x: junction.x,

        y: junction.y,

        radius: 4,

        fill: ROOM_WALL_JUNCTION_COLORS[junction.kind] ?? '#94a3b8',

        stroke: '#0f172a',

        strokeWidth: 0.75,

        strokeScaleEnabled: false,

        listening: false,

      }"

    />



    <v-rect

      v-for="(gap, i) in gapOverlays"

      :key="'gap-' + i"

      :config="{

        x: gap.x,

        y: gap.y,

        width: gap.width,

        height: gap.height,

        stroke: gap.color ?? '#f59e0b',

        strokeWidth: 2,

        strokeScaleEnabled: false,

        listening: false,

        dash: [4, 4],

        fill: (gap.color ?? '#f59e0b') + '22',

      }"

    />



    <v-group v-for="(ocr, i) in ocrTextOverlays" :key="'ocr-' + i">

      <v-rect

        :config="{

          x: ocr.x,

          y: ocr.y,

          width: ocr.width,

          height: ocr.height,

          stroke: '#ef4444',

          strokeWidth: 1.5,

          strokeScaleEnabled: false,

          listening: false,

          dash: [2, 2],

          fill: '#ef444422',

        }"

      />

      <v-text

        v-if="ocr.text"

        :config="{

          x: ocr.x,

          y: Math.max(0, ocr.y - 12),

          text: ocr.text,

          fontSize: 11,

          fill: '#b91c1c',

          strokeScaleEnabled: false,

          listening: false,

        }"

      />

    </v-group>



    <v-rect

      v-for="(match, i) in wallMatchOverlays"

      :key="'wall-match-' + i"

      :config="{

        x: match.x,

        y: match.y,

        width: match.width,

        height: match.height,

        stroke: match.color,

        strokeWidth: 2,

        listening: false,

        dash: match.dashed ? [6, 4] : undefined,

        fill: match.color + '44',

      }"

    />



    <v-rect

      v-for="(hit, i) in detectionOverlays"

      :key="'hit-' + hit.kind + '-' + i"

      :config="{

        x: hit.x,

        y: hit.y,

        width: hit.width,

        height: hit.height,

        stroke: colorFor(hit.kind),

        strokeWidth: 2,

        listening: false,

        dash: [5, 5],

        fill: colorFor(hit.kind) + '22',

      }"

    />

  </v-layer>

</template>

