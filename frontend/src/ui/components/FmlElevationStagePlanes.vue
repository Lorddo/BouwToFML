<script setup lang="ts">
import type { ElevationRenderModel } from '@/ui/composables/fml-preview/useFmlElevationRenderModel'
import type { ElevationInteraction } from '@/ui/composables/fml-preview/useFmlElevationInteraction'
import type { FacadeElevation } from '@/core/fml/facade-elevation'
import { FACTORY_OPENING_COLORS } from '@/ui/composables/settings/opening-display-colors'
import { ARCHITECT_AREA_FILL } from '@/ui/composables/settings/plan-display-style'

const props = defineProps<{
  elevation: FacadeElevation | null
  render: ElevationRenderModel
  interaction: ElevationInteraction
  contentOpacity: number
}>()

const r = props.render
const stageRect = r.stageRect
const stageWallPoly = r.stageWallPoly
const stagePoly = r.stagePoly
const stagePoints = r.stagePoints
const elevStroke = r.elevStroke
const elevStrokeHeavy = r.elevStrokeHeavy
const elevHighlightStroke = r.elevHighlightStroke
const elevDash = r.elevDash
const architectStyle = r.architectStyle
const elevLineColor = r.elevLineColor
const wallBodyFill = r.wallBodyFill
const ridgeEndFill = r.ridgeEndFill
const bandBodyFill = r.bandBodyFill
const roofBodyFill = r.roofBodyFill
const wallOuterStroke = r.wallOuterStroke
const wallInnerStroke = r.wallInnerStroke
const roofOuterStroke = r.roofOuterStroke
const roofRingPoints = r.roofRingPoints
const openingGhostFill = r.openingGhostFill
const openingGhostOpacity = r.openingGhostOpacity
const glyphStrokeColor = r.glyphStrokeColor
const glyphPolyFill = r.glyphPolyFill
const glyphOpacity = r.glyphOpacity
const wallOrRidgeSelected = r.wallOrRidgeSelected
const slabSelected = r.slabSelected
const roofSelected = r.roofSelected
const junctionSelected = r.junctionSelected
const elevationPlanes = r.elevationPlanes

const ix = props.interaction
const selectedOpeningId = ix.selectedOpeningId
const onRidgeWallDown = ix.onRidgeWallDown
const onOpeningDown = ix.onOpeningDown
const onJunctionDown = ix.onJunctionDown
const stopKonvaBubble = ix.stopKonvaBubble
</script>

<template>
  <v-group :config="{ opacity: contentOpacity, listening: true }">
    <template v-if="elevation">
      <!-- Bands -->
      <v-group v-for="(band, index) in elevation.bands" :key="`band-${band.kind}-${index}`">
        <v-rect
          :config="{
            ...stageRect(band),
            fill: bandBodyFill(band.kind),
            stroke: architectStyle ? elevLineColor : undefined,
            strokeWidth: architectStyle ? elevStroke : 0,
            listening: false,
          }"
        />
        <v-rect
          v-if="band.kind === 'slab' && band.floorIndex != null && slabSelected(band.floorIndex)"
          :config="{
            ...stageRect(band),
            fillEnabled: false,
            stroke: '#f97316',
            strokeWidth: elevHighlightStroke,
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
      </v-group>

      <!-- Roof fills -->
      <v-group v-for="plane in elevation.roofPlanes" :key="`roof-fill-${plane.id}`">
        <v-line
          :config="{
            points: stagePoly(roofRingPoints(plane)),
            closed: true,
            fill: roofBodyFill(plane.color),
            strokeEnabled: false,
            perfectDrawEnabled: false,
            opacity: roofSelected(plane.id) ? 1 : architectStyle ? 1 : 0.92,
            listening: false,
          }"
        />
      </v-group>

      <!-- Paint planes (walls/openings/transoms/glyphs/endOnRidges) -->
      <v-group v-for="plane in elevationPlanes" :key="plane.key" :config="{ listening: true }">
        <!-- Wall layers -->
        <v-group
          v-for="layer in plane.layers"
          :key="`layer-${layer.wall.floorIndex}-${layer.wall.wallId}`"
          :config="{ listening: true }"
        >
          <v-path
            :config="{
              data: layer.fillPath,
              fill: wallBodyFill(),
              fillRule: 'evenodd',
              strokeEnabled: false,
              perfectDrawEnabled: false,
              listening: true,
            }"
            @mousedown="onRidgeWallDown(layer.wall, $event)"
          />
          <v-line
            :config="{
              points: stageWallPoly(layer.wall),
              closed: true,
              fillEnabled: false,
              stroke: wallOuterStroke(),
              strokeWidth: elevStroke,
              perfectDrawEnabled: false,
              listening: false,
            }"
          />
          <v-line
            v-if="wallOrRidgeSelected(layer.wall)"
            :config="{
              points: stageWallPoly(layer.wall),
              closed: true,
              fillEnabled: false,
              stroke: '#f97316',
              strokeWidth: elevHighlightStroke,
              listening: false,
              perfectDrawEnabled: false,
            }"
          />
          <v-line
            v-for="stroke in layer.innerStrokes"
            :key="stroke.key"
            :config="{
              points: stagePoints(stroke.a, stroke.b),
              stroke: wallInnerStroke(),
              dash: elevDash,
              strokeWidth: elevStroke,
              perfectDrawEnabled: false,
              listening: false,
            }"
          />
        </v-group>

        <!-- Openings -->
        <v-group
          v-for="opening in plane.openings"
          :key="opening.openingId"
          :config="{ listening: true }"
        >
          <v-line
            v-if="opening.ghost.shaped"
            :config="{
              points: opening.ghost.points,
              closed: true,
              fill: openingGhostFill(opening.openingId, opening.type) ?? 'rgba(0,0,0,0)',
              opacity: openingGhostOpacity(opening.openingId) || 1,
              stroke:
                selectedOpeningId === opening.openingId
                  ? '#ea580c'
                  : architectStyle
                    ? 'transparent'
                    : '#0c4a6e',
              strokeWidth: elevStroke,
              perfectDrawEnabled: false,
              listening: true,
            }"
            @mousedown="onOpeningDown(opening.openingId, $event)"
            @click="stopKonvaBubble"
          />
          <v-rect
            v-else
            :config="{
              ...stageRect(opening),
              fill: openingGhostFill(opening.openingId, opening.type) ?? 'rgba(0,0,0,0)',
              opacity: openingGhostOpacity(opening.openingId) || 1,
              stroke:
                selectedOpeningId === opening.openingId
                  ? '#ea580c'
                  : architectStyle
                    ? 'transparent'
                    : '#0c4a6e',
              strokeWidth: elevStroke,
              perfectDrawEnabled: false,
              listening: true,
            }"
            @mousedown="onOpeningDown(opening.openingId, $event)"
            @click="stopKonvaBubble"
          />
          <v-line
            v-if="selectedOpeningId === opening.openingId && opening.ghost.shaped"
            :config="{
              points: opening.ghost.points,
              closed: true,
              fillEnabled: false,
              stroke: '#f97316',
              strokeWidth: elevHighlightStroke,
              listening: false,
              perfectDrawEnabled: false,
            }"
          />
          <v-rect
            v-else-if="selectedOpeningId === opening.openingId"
            :config="{
              ...stageRect(opening),
              fillEnabled: false,
              stroke: '#f97316',
              strokeWidth: elevHighlightStroke,
              listening: false,
              perfectDrawEnabled: false,
            }"
          />
        </v-group>

        <!-- Transoms -->
        <v-group
          v-for="(transom, index) in plane.transoms"
          :key="`transom-${transom.openingId}-${index}`"
        >
          <v-rect
            v-if="architectStyle"
            :config="{
              ...stageRect(transom),
              fill: ARCHITECT_AREA_FILL,
              strokeEnabled: false,
              listening: true,
              perfectDrawEnabled: false,
            }"
            @mousedown="onOpeningDown(transom.openingId, $event)"
          />
          <v-rect
            v-else
            :config="{
              ...stageRect(transom),
              fill: FACTORY_OPENING_COLORS.bovenlicht,
              stroke: '#14532d',
              strokeWidth: elevStroke,
              opacity: 0.22,
              perfectDrawEnabled: false,
              listening: false,
            }"
          />
          <v-rect
            v-if="selectedOpeningId === transom.openingId"
            :config="{
              ...stageRect(transom),
              fillEnabled: false,
              stroke: '#f97316',
              strokeWidth: elevHighlightStroke,
              listening: false,
              perfectDrawEnabled: false,
            }"
          />
        </v-group>

        <!-- Glyphs -->
        <v-group v-for="glyph in plane.glyphs" :key="glyph.id" :config="{ listening: false }">
          <v-line
            v-for="poly in glyph.polys"
            :key="`${glyph.id}-${poly.key}`"
            :config="{
              points: poly.points,
              closed: poly.closed,
              fill: glyphPolyFill(poly.role, glyph.transom, glyph.type, poly.fill),
              stroke: glyphStrokeColor(glyph.transom),
              strokeWidth: poly.role === 'handle' ? elevStrokeHeavy : elevStroke,
              opacity: architectStyle ? 1 : glyphOpacity(poly.role, glyph.transom),
              perfectDrawEnabled: false,
              listening: false,
            }"
          />
          <v-circle
            v-for="circle in glyph.circles"
            :key="`${glyph.id}-${circle.key}`"
            :config="{
              x: circle.x,
              y: circle.y,
              radius: circle.radius,
              fill: glyphPolyFill(circle.role, glyph.transom, glyph.type, circle.fill),
              stroke: glyphStrokeColor(glyph.transom),
              strokeWidth: circle.role === 'handle' ? elevStrokeHeavy : elevStroke,
              opacity: architectStyle ? 1 : glyphOpacity(circle.role, glyph.transom),
              perfectDrawEnabled: false,
              listening: false,
            }"
          />
        </v-group>

        <!-- EndOn ridges -->
        <v-group
          v-for="layer in plane.endOnRidges"
          :key="`ridge-end-${layer.wall.floorIndex}-${layer.wall.wallId}`"
          :config="{ listening: true }"
        >
          <v-path
            :config="{
              data: layer.fillPath,
              fill: ridgeEndFill(),
              fillRule: 'evenodd',
              strokeEnabled: false,
              perfectDrawEnabled: false,
              listening: true,
            }"
            @mousedown="onRidgeWallDown(layer.wall, $event)"
          />
          <v-line
            :config="{
              points: stageWallPoly(layer.wall),
              closed: true,
              fillEnabled: false,
              stroke: wallOuterStroke(),
              strokeWidth: elevStroke,
              perfectDrawEnabled: false,
              listening: false,
            }"
          />
          <v-line
            v-if="wallOrRidgeSelected(layer.wall)"
            :config="{
              points: stageWallPoly(layer.wall),
              closed: true,
              fillEnabled: false,
              stroke: '#f97316',
              strokeWidth: elevHighlightStroke,
              listening: false,
              perfectDrawEnabled: false,
            }"
          />
        </v-group>
      </v-group>

      <!-- Roof edges -->
      <v-group v-for="plane in elevation.roofPlanes" :key="`roof-edge-${plane.id}`">
        <v-line
          :config="{
            points: stagePoly(roofRingPoints(plane)),
            closed: true,
            fillEnabled: false,
            stroke: roofOuterStroke(),
            strokeWidth: elevStroke,
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
        <v-line
          v-if="roofSelected(plane.id)"
          :config="{
            points: stagePoly(roofRingPoints(plane)),
            closed: true,
            fillEnabled: false,
            stroke: '#f97316',
            strokeWidth: elevHighlightStroke,
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
      </v-group>

      <!-- Junctions -->
      <v-group v-for="junction in elevation.junctions" :key="junction.id">
        <v-line
          v-if="junctionSelected(junction.id)"
          :config="{
            points: stagePoints(
              { x: junction.x, y: junction.yBot },
              { x: junction.x, y: junction.yTop },
            ),
            stroke: '#f97316',
            strokeWidth: elevHighlightStroke,
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
        <v-line
          :config="{
            points: stagePoints(
              { x: junction.x, y: junction.yBot },
              { x: junction.x, y: junction.yTop },
            ),
            stroke: junctionSelected(junction.id) ? '#f97316' : '#334155',
            dash: elevDash,
            strokeWidth: elevStroke,
            perfectDrawEnabled: false,
            listening: true,
          }"
          @mousedown="onJunctionDown(junction.id, $event)"
        />
      </v-group>
    </template>
  </v-group>
</template>
