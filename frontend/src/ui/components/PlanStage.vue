<script setup lang="ts">
import type Konva from 'konva'
import { onBeforeUnmount, watch } from 'vue'
import type {
  RenderJunction,
  RenderModel,
  RenderWallPolygon,
} from '@/ui/composables/plan-canvas/usePlanCanvasRenderModel'
import PlanStageWalls from './PlanStageWalls.vue'
import PlanStageOpenings from './PlanStageOpenings.vue'
import PlanStageFixtures from './PlanStageFixtures.vue'
import PlanStageJunctions from './PlanStageJunctions.vue'
import PlanStageAreas from './PlanStageAreas.vue'
import PlanStageSurfaces from './PlanStageSurfaces.vue'
import PlanStageLabels from './PlanStageLabels.vue'
import PlanStageLines from './PlanStageLines.vue'
import PlanStageAreaDims from './PlanStageAreaDims.vue'
import PlanStageCornerMarkers from './PlanStageCornerMarkers.vue'
import PlanStageClearHeight from './PlanStageClearHeight.vue'
import PlanStageRoofPlanes from './PlanStageRoofPlanes.vue'
import type { Point2D } from '@/core/plan/types'
import type { RenderCornerMarker } from '@/ui/composables/plan-canvas/plan-canvas-corner-markers'
import type { CornerMarkerMode } from '@/ui/composables/settings/corner-marker-mode'
import {
  FACTORY_OPENING_COLORS,
  type OpeningDisplayColors,
} from '@/ui/composables/settings/opening-display-colors'
import { DEFAULT_CLEAR_HEIGHT_FILL_COLOR } from '@/ui/composables/settings/user-settings'
import {
  ARCHITECT_AREA_FILL,
  ARCHITECT_STROKE,
  DEFAULT_PLAN_DISPLAY_STYLE,
  isArchitectPlanStyle,
  type PlanDisplayStyleChoice,
} from '@/ui/composables/settings/plan-display-style'
import CanvasGuideGrid from './canvas/CanvasGuideGrid.vue'

withDefaults(
  defineProps<{
    stageSize: { width: number; height: number }
    viewPosition: { x: number; y: number }
    viewScale: number
    /** Content-layout scale (cm → stage) voor wereldmaat-labels. */
    layoutScale?: number
    /** false = kamer-/FML-labels niet mounten. */
    labelsVisible?: boolean
    /** Overlay: maten op area-zijden (≥ 5 cm; kort bij inzoomen). */
    areaSideDimsVisible?: boolean
    cornerMarkerMode?: CornerMarkerMode
    cornerMarkers?: RenderCornerMarker[]
    renderModel: RenderModel
    underlayConfig: {
      flip: { x: number; y: number; scaleX: number; listening: boolean }
      rotate: { x: number; y: number; rotation: number; listening: boolean }
      image: {
        image: HTMLImageElement
        x: number
        y: number
        width: number
        height: number
        opacity: number
        listening: boolean
      }
    } | null
    /** 0–1; FML-geometrie opacity. */
    contentOpacity: number
    /** Viewport-vast hulpraster (settings). */
    showGuideGrid?: boolean
    /** Clear-height overlay toggles (settings). */
    showClearHeight150?: boolean
    showClearHeight200?: boolean
    showClearHeightPlanFill?: boolean
    clearHeightFillColor?: string
    showRoofPlanes?: boolean
    showRidgeDisplay?: boolean
    moveWallPolygon: RenderWallPolygon | null
    settingsWallPolygons: RenderWallPolygon[]
    facadeWallPolygons?: RenderWallPolygon[]
    inspectWallPolygons: Array<RenderWallPolygon & { fill: string }>
    settingsWallIds: string[]
    moveWallId: string | null
    settingsOpeningIds: string[]
    moveOpeningId: string | null
    settingsItemId?: string | null
    moveItemId?: string | null
    itemDragPreview?: { id: string; x: number; y: number } | null
    /** Vloerdefault bovenlicht deuren (preview-badge). */
    doorBovenlichtDefault?: boolean
    /** Vloerdefault bovenlicht ramen (preview-badge). */
    windowBovenlichtDefault?: boolean
    openingColors?: OpeningDisplayColors
    planDisplayStyle?: PlanDisplayStyleChoice
    settingsAreaId: string | null
    settingsSurfaceId: string | null
    settingsLabelId: string | null
    settingsLineId: string | null
    hoveredAreaId: string | null
    hoveredSurfaceId: string | null
    hoveredLabelId: string | null
    hoveredLineId: string | null
    selectedDimensionId?: string | null
    hoveredDimensionId?: string | null
    dimensionHandles?: {
      a: { x: number; y: number }
      b: { x: number; y: number }
      selected: boolean
      activeEnd: 'a' | 'b' | null
    } | null
    inspectColors: Record<string, string>
    dakMode?: boolean
    surfaceEditId: string | null
    surfaceEditVertices: Point2D[] | null
    selectedVertexIndex?: number | null
    groupDraggable: boolean
    visibleJunctions: RenderJunction[]
    junctionOverlayGroup: { x: number; y: number; scaleX: number; scaleY: number }
    junctionHitRadius: number
    junctionMarkerRadius: number
    junctionMarkerStroke: number
    activeJunctionId: string | null
    /** Slicer-constructies (stage coords); selected = handles sleepbaar. */
    sliceGuidesStage?: Array<{
      index: number
      selected: boolean
      measure: number[]
      place: number[]
      link: number[]
      m: { x: number; y: number }
      p: { x: number; y: number }
    }>
    /** Live preview tijdens slicer-sleep (P→M). */
    slicePreviewStage?: {
      measure: number[]
      place: number[]
      link: number[]
      m: { x: number; y: number }
      p: { x: number; y: number }
    } | null
  }>(),
  {
    layoutScale: 1,
    labelsVisible: true,
    areaSideDimsVisible: false,
    cornerMarkerMode: 'off',
    cornerMarkers: () => [],
    doorBovenlichtDefault: false,
    windowBovenlichtDefault: false,
    openingColors: () => ({ ...FACTORY_OPENING_COLORS }),
    planDisplayStyle: DEFAULT_PLAN_DISPLAY_STYLE,
    showGuideGrid: true,
    showClearHeight150: true,
    showClearHeight200: false,
    showClearHeightPlanFill: false,
    clearHeightFillColor: DEFAULT_CLEAR_HEIGHT_FILL_COLOR,
    showRoofPlanes: false,
    showRidgeDisplay: true,
    settingsItemId: null,
    moveItemId: null,
    itemDragPreview: null,
    sliceGuidesStage: () => [],
    slicePreviewStage: null,
    dakMode: false,
    dimensionHandles: null,
  },
)

const emit = defineEmits<{
  groupDragStart: []
  groupDragMove: [event: { target: Konva.Node }]
  groupDragEnd: [event: { target: Konva.Node }]
  junctionHover: [junctionId: string]
  junctionHoverEnd: []
}>()

const stageRef = defineModel<{ getNode: () => Konva.Stage } | null>('stageRef', { default: null })
const contentGroupRef = defineModel<{ getNode: () => Konva.Group } | null>('contentGroupRef', {
  default: null,
})

// Bind drag on the Konva node — v-group is a fragment root, so Vue @drag* spam warnings.
let boundGroup: Konva.Group | null = null
const onGroupDragStart = () => emit('groupDragStart')
const onGroupDragMove = (event: Konva.KonvaEventObject<DragEvent>) => emit('groupDragMove', event)
const onGroupDragEnd = (event: Konva.KonvaEventObject<DragEvent>) => emit('groupDragEnd', event)

function unbindGroupDrag() {
  if (!boundGroup) return
  boundGroup.off('dragstart', onGroupDragStart)
  boundGroup.off('dragmove', onGroupDragMove)
  boundGroup.off('dragend', onGroupDragEnd)
  boundGroup = null
}

watch(
  contentGroupRef,
  (ref) => {
    unbindGroupDrag()
    const node = ref?.getNode?.() ?? null
    if (!node) return
    boundGroup = node
    node.on('dragstart', onGroupDragStart)
    node.on('dragmove', onGroupDragMove)
    node.on('dragend', onGroupDragEnd)
  },
  { flush: 'post', immediate: true },
)

onBeforeUnmount(unbindGroupDrag)
</script>

<template>
  <v-stage
    ref="stageRef"
    :config="{ width: stageSize.width, height: stageSize.height }"
    class="plan-stage"
    @contextmenu.prevent
  >
    <v-layer>
      <v-rect
        :config="{
          x: 0,
          y: 0,
          width: stageSize.width,
          height: stageSize.height,
          fill: '#ffffff',
          listening: false,
        }"
      />
      <v-group
        ref="contentGroupRef"
        :config="{
          x: viewPosition.x,
          y: viewPosition.y,
          scaleX: viewScale,
          scaleY: viewScale,
          draggable: groupDraggable,
        }"
      >
        <v-rect
          :config="{
            x: renderModel.panRect.x,
            y: renderModel.panRect.y,
            width: renderModel.panRect.width,
            height: renderModel.panRect.height,
            fill: 'transparent',
            listening: false,
          }"
        />
        <v-group v-if="underlayConfig" :config="underlayConfig.flip">
          <v-group :config="underlayConfig.rotate">
            <v-image :config="underlayConfig.image" />
          </v-group>
        </v-group>
        <CanvasGuideGrid
          :visible="showGuideGrid"
          :parent-transform="{ x: viewPosition.x, y: viewPosition.y, scale: viewScale }"
          :viewport-width="stageSize.width"
          :viewport-height="stageSize.height"
        />
        <v-group :config="{ opacity: contentOpacity, listening: true }">
          <!-- Z-order: area → surface → object → tekst. Meubels blijven onder muurfill. -->
          <v-line
            v-for="polygon in renderModel.blockedRoofPolygons ?? []"
            :key="polygon.id"
            :config="{
              points: polygon.points,
              closed: true,
              fill: isArchitectPlanStyle(planDisplayStyle) ? ARCHITECT_AREA_FILL : '#94a3b8',
              opacity: isArchitectPlanStyle(planDisplayStyle) ? 1 : 0.38,
              stroke: isArchitectPlanStyle(planDisplayStyle) ? ARCHITECT_STROKE : undefined,
              strokeWidth: isArchitectPlanStyle(planDisplayStyle) ? 1 : 0,
              strokeEnabled: isArchitectPlanStyle(planDisplayStyle),
              listening: false,
              perfectDrawEnabled: false,
            }"
          />
          <PlanStageAreas
            :areas="renderModel.areas"
            :settings-area-id="settingsAreaId"
            :hovered-area-id="hoveredAreaId"
            :inspect-colors="inspectColors"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :labels-visible="labelsVisible"
            :plan-display-style="planDisplayStyle"
            layer="fill"
          />
          <PlanStageSurfaces
            :surfaces="renderModel.surfaces"
            :settings-surface-id="settingsSurfaceId"
            :hovered-surface-id="hoveredSurfaceId"
            :inspect-colors="inspectColors"
            :surface-edit-id="surfaceEditId"
            :edit-vertices="surfaceEditVertices"
            :selected-vertex-index="selectedVertexIndex"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :labels-visible="labelsVisible"
            :plan-display-style="planDisplayStyle"
            layer="fill"
          />
          <PlanStageClearHeight
            :clear-height="renderModel.clearHeight"
            :layout-scale="layoutScale"
            :dak-mode="dakMode"
            :show150="showClearHeight150"
            :show200="showClearHeight200"
            :show-plan-fill="showClearHeightPlanFill"
            :fill-color="clearHeightFillColor"
          />
          <PlanStageRoofPlanes
            :outlines="renderModel.roofPlaneOutlines"
            :layout-scale="layoutScale"
            :visible="showRoofPlanes === true && dakMode !== true"
          />
          <PlanStageFixtures
            :render-model="renderModel"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :inspect-colors="inspectColors"
            :settings-item-id="settingsItemId"
            :move-item-id="moveItemId"
            :item-drag-preview="itemDragPreview"
            :plan-display-style="planDisplayStyle"
            layer="under"
          />
          <PlanStageLines
            :lines="renderModel.lines"
            :dimensions="renderModel.dimensions"
            :settings-line-id="settingsLineId"
            :hovered-line-id="hoveredLineId"
            :selected-dimension-id="selectedDimensionId"
            :hovered-dimension-id="hoveredDimensionId"
            :view-scale="viewScale"
            :plan-display-style="planDisplayStyle"
          />
          <PlanStageLines
            :lines="[]"
            :dimensions="renderModel.autoDimensions"
            :settings-line-id="null"
            :hovered-line-id="null"
            :view-scale="viewScale"
            :plan-display-style="planDisplayStyle"
          />
          <PlanStageLines
            :lines="[]"
            :dimensions="renderModel.sliceDimensions"
            :settings-line-id="null"
            :hovered-line-id="null"
            :view-scale="viewScale"
            :plan-display-style="planDisplayStyle"
          />
          <v-group
            v-for="guide in sliceGuidesStage"
            :key="`slice-guide-${guide.index}`"
            :listening="guide.selected"
          >
            <v-line
              :config="{
                points: guide.measure,
                stroke: '#2563eb',
                strokeWidth: guide.selected ? 1.5 : 1,
                dash: [8, 6],
                opacity: guide.selected ? 1 : 0.55,
                strokeScaleEnabled: false,
                listening: false,
              }"
            />
            <v-line
              :config="{
                points: guide.place,
                stroke: '#ea580c',
                strokeWidth: guide.selected ? 1.5 : 1,
                dash: [8, 6],
                opacity: guide.selected ? 1 : 0.55,
                strokeScaleEnabled: false,
                listening: false,
              }"
            />
            <v-line
              :config="{
                points: guide.link,
                stroke: '#64748b',
                strokeWidth: 1,
                opacity: guide.selected ? 1 : 0.45,
                strokeScaleEnabled: false,
                listening: false,
              }"
            />
            <v-circle
              :config="{
                x: guide.m.x,
                y: guide.m.y,
                radius: guide.selected ? 7 : 5,
                fill: '#2563eb',
                stroke: '#fff',
                strokeWidth: 2,
                opacity: guide.selected ? 1 : 0.7,
                strokeScaleEnabled: false,
                name: guide.selected ? 'slice-handle-m' : undefined,
                listening: guide.selected,
              }"
            />
            <v-circle
              :config="{
                x: guide.p.x,
                y: guide.p.y,
                radius: guide.selected ? 7 : 5,
                fill: '#ea580c',
                stroke: '#fff',
                strokeWidth: 2,
                opacity: guide.selected ? 1 : 0.7,
                strokeScaleEnabled: false,
                name: guide.selected ? 'slice-handle-p' : undefined,
                listening: guide.selected,
              }"
            />
          </v-group>
          <v-group v-if="slicePreviewStage" listening="false">
            <v-line
              :config="{
                points: slicePreviewStage.measure,
                stroke: '#2563eb',
                strokeWidth: 1.5,
                dash: [6, 4],
                strokeScaleEnabled: false,
                listening: false,
              }"
            />
            <v-line
              :config="{
                points: slicePreviewStage.place,
                stroke: '#ea580c',
                strokeWidth: 1.5,
                dash: [6, 4],
                strokeScaleEnabled: false,
                listening: false,
              }"
            />
            <v-line
              :config="{
                points: slicePreviewStage.link,
                stroke: '#64748b',
                strokeWidth: 1.5,
                strokeScaleEnabled: false,
                listening: false,
              }"
            />
            <v-circle
              :config="{
                x: slicePreviewStage.m.x,
                y: slicePreviewStage.m.y,
                radius: 6,
                fill: '#2563eb',
                stroke: '#fff',
                strokeWidth: 2,
                strokeScaleEnabled: false,
                listening: false,
              }"
            />
            <v-circle
              :config="{
                x: slicePreviewStage.p.x,
                y: slicePreviewStage.p.y,
                radius: 6,
                fill: '#ea580c',
                stroke: '#fff',
                strokeWidth: 2,
                strokeScaleEnabled: false,
                listening: false,
              }"
            />
          </v-group>
          <PlanStageWalls
            :render-model="renderModel"
            :move-wall-polygon="moveWallPolygon"
            :settings-wall-polygons="settingsWallPolygons"
            :facade-wall-polygons="facadeWallPolygons"
            :inspect-wall-polygons="inspectWallPolygons"
            :settings-wall-ids="settingsWallIds"
            :move-wall-id="moveWallId"
            :dak-mode="dakMode"
            :show-ridge-display="showRidgeDisplay !== false"
            :view-scale="viewScale"
            :layout-scale="layoutScale"
            :plan-display-style="planDisplayStyle"
          />
          <PlanStageOpenings
            :render-model="renderModel"
            :settings-opening-ids="settingsOpeningIds"
            :move-opening-id="moveOpeningId"
            :door-bovenlicht-default="doorBovenlichtDefault"
            :window-bovenlicht-default="windowBovenlichtDefault"
            :opening-colors="openingColors"
            :plan-display-style="planDisplayStyle"
            :inspect-colors="inspectColors"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
          />
          <PlanStageFixtures
            :render-model="renderModel"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :inspect-colors="inspectColors"
            :settings-item-id="settingsItemId"
            :move-item-id="moveItemId"
            :item-drag-preview="itemDragPreview"
            :plan-display-style="planDisplayStyle"
            layer="over"
          />
          <PlanStageAreas
            :areas="renderModel.areas"
            :settings-area-id="settingsAreaId"
            :hovered-area-id="hoveredAreaId"
            :inspect-colors="inspectColors"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :labels-visible="labelsVisible"
            :plan-display-style="planDisplayStyle"
            layer="labels"
          />
          <PlanStageSurfaces
            :surfaces="renderModel.surfaces"
            :settings-surface-id="settingsSurfaceId"
            :hovered-surface-id="hoveredSurfaceId"
            :inspect-colors="inspectColors"
            :surface-edit-id="surfaceEditId"
            :edit-vertices="surfaceEditVertices"
            :selected-vertex-index="selectedVertexIndex"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :labels-visible="labelsVisible"
            :plan-display-style="planDisplayStyle"
            layer="labels"
          />
          <PlanStageLabels
            :labels="renderModel.labels"
            :settings-label-id="settingsLabelId"
            :hovered-label-id="hoveredLabelId"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :labels-visible="labelsVisible"
          />
          <PlanStageAreaDims
            v-if="areaSideDimsVisible"
            :dims="renderModel.areaSideDims"
            :view-scale="viewScale"
          />
        </v-group>
      </v-group>
    </v-layer>
    <v-layer>
      <PlanStageJunctions
        :visible-junctions="visibleJunctions"
        :junction-overlay-group="junctionOverlayGroup"
        :junction-hit-radius="junctionHitRadius"
        :junction-marker-radius="junctionMarkerRadius"
        :junction-marker-stroke="junctionMarkerStroke"
        :active-junction-id="activeJunctionId"
        @junction-hover="emit('junctionHover', $event)"
        @junction-hover-end="emit('junctionHoverEnd')"
      />
      <v-group v-if="dimensionHandles" :config="junctionOverlayGroup" listening="false">
        <v-circle
          :config="{
            x: dimensionHandles.a.x,
            y: dimensionHandles.a.y,
            radius: dimensionHandles.activeEnd === 'a' ? junctionMarkerRadius + 1 : junctionMarkerRadius,
            fill: dimensionHandles.activeEnd === 'a' ? '#fbbf24' : '#f97316',
            stroke: '#ffffff',
            strokeWidth: junctionMarkerStroke,
            listening: false,
          }"
        />
        <v-circle
          :config="{
            x: dimensionHandles.b.x,
            y: dimensionHandles.b.y,
            radius: dimensionHandles.activeEnd === 'b' ? junctionMarkerRadius + 1 : junctionMarkerRadius,
            fill: dimensionHandles.activeEnd === 'b' ? '#fbbf24' : '#f97316',
            stroke: '#ffffff',
            strokeWidth: junctionMarkerStroke,
            listening: false,
          }"
        />
      </v-group>
      <PlanStageCornerMarkers
        :markers="cornerMarkers"
        :mode="cornerMarkerMode"
        :overlay-group="junctionOverlayGroup"
      />
    </v-layer>
  </v-stage>
</template>

<style scoped>
.plan-stage {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
  pointer-events: none;
}

.plan-stage :deep(canvas) {
  pointer-events: none;
}
</style>
