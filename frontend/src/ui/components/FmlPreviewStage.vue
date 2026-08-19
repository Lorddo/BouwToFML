<script setup lang="ts">
import type Konva from 'konva'
import { onBeforeUnmount, watch } from 'vue'
import type {
  RenderJunction,
  RenderModel,
  RenderWallPolygon,
} from '@/ui/composables/fml-preview/useFmlPreviewRenderModel'
import FmlPreviewStageWalls from './FmlPreviewStageWalls.vue'
import FmlPreviewStageOpenings from './FmlPreviewStageOpenings.vue'
import FmlPreviewStageFixtures from './FmlPreviewStageFixtures.vue'
import FmlPreviewStageJunctions from './FmlPreviewStageJunctions.vue'
import FmlPreviewStageAreas from './FmlPreviewStageAreas.vue'
import FmlPreviewStageSurfaces from './FmlPreviewStageSurfaces.vue'
import FmlPreviewStageLabels from './FmlPreviewStageLabels.vue'
import FmlPreviewStageLines from './FmlPreviewStageLines.vue'
import FmlPreviewStageAreaDims from './FmlPreviewStageAreaDims.vue'
import FmlPreviewStageCornerMarkers from './FmlPreviewStageCornerMarkers.vue'
import type { Point2D } from '@/core/fml/types'
import type { RenderCornerMarker } from '@/ui/composables/fml-preview/fml-preview-corner-markers'
import type { CornerMarkerMode } from '@/ui/composables/settings/corner-marker-mode'
import {
  FACTORY_OPENING_COLORS,
  type OpeningDisplayColors,
} from '@/ui/composables/settings/opening-display-colors'

withDefaults(
  defineProps<{
    stageSize: { width: number; height: number }
    viewPosition: { x: number; y: number }
    viewScale: number
    /** Content-layout scale (cm → stage) voor wereldmaat-labels. */
    layoutScale?: number
    /** false = kamer-/FML-labels niet mounten. */
    labelsVisible?: boolean
    /** Overlay: maten op area-zijden ≥ 50 cm. */
    areaSideDimsVisible?: boolean
    cornerMarkerMode?: CornerMarkerMode
    cornerMarkers?: RenderCornerMarker[]
    renderModel: RenderModel
    underlayConfig: {
      image: HTMLImageElement
      x: number
      y: number
      width: number
      height: number
      opacity: number
      listening: boolean
      offsetX?: number
      offsetY?: number
      rotation?: number
    } | null
    /** 0–1; FML-geometrie opacity. */
    contentOpacity: number
    moveWallPolygon: RenderWallPolygon | null
    settingsWallPolygons: RenderWallPolygon[]
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
    settingsAreaId: string | null
    settingsSurfaceId: string | null
    settingsLabelId: string | null
    settingsLineId: string | null
    hoveredAreaId: string | null
    hoveredSurfaceId: string | null
    hoveredLabelId: string | null
    hoveredLineId: string | null
    inspectColors: Record<string, string>
    surfaceEditId: string | null
    surfaceEditVertices: Point2D[] | null
    groupDraggable: boolean
    visibleJunctions: RenderJunction[]
    junctionOverlayGroup: { x: number; y: number; scaleX: number; scaleY: number }
    junctionHitRadius: number
    junctionMarkerRadius: number
    junctionMarkerStroke: number
    activeJunctionId: string | null
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
    settingsItemId: null,
    moveItemId: null,
    itemDragPreview: null,
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
    class="fml-stage"
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
        <v-image v-if="underlayConfig" :config="underlayConfig" />
        <v-group :config="{ opacity: contentOpacity, listening: true }">
          <!-- Z-order: area → surface → object → tekst. Meubels blijven onder muurfill. -->
          <FmlPreviewStageAreas
            :areas="renderModel.areas"
            :settings-area-id="settingsAreaId"
            :hovered-area-id="hoveredAreaId"
            :inspect-colors="inspectColors"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :labels-visible="labelsVisible"
            layer="fill"
          />
          <FmlPreviewStageSurfaces
            :surfaces="renderModel.surfaces"
            :settings-surface-id="settingsSurfaceId"
            :hovered-surface-id="hoveredSurfaceId"
            :inspect-colors="inspectColors"
            :surface-edit-id="surfaceEditId"
            :edit-vertices="surfaceEditVertices"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :labels-visible="labelsVisible"
            layer="fill"
          />
          <FmlPreviewStageFixtures
            :render-model="renderModel"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :inspect-colors="inspectColors"
            :settings-item-id="settingsItemId"
            :move-item-id="moveItemId"
            :item-drag-preview="itemDragPreview"
            layer="under"
          />
          <FmlPreviewStageLines
            :lines="renderModel.lines"
            :dimensions="renderModel.dimensions"
            :settings-line-id="settingsLineId"
            :hovered-line-id="hoveredLineId"
            :view-scale="viewScale"
          />
          <FmlPreviewStageWalls
            :render-model="renderModel"
            :move-wall-polygon="moveWallPolygon"
            :settings-wall-polygons="settingsWallPolygons"
            :inspect-wall-polygons="inspectWallPolygons"
            :settings-wall-ids="settingsWallIds"
            :move-wall-id="moveWallId"
          />
          <FmlPreviewStageOpenings
            :render-model="renderModel"
            :settings-opening-ids="settingsOpeningIds"
            :move-opening-id="moveOpeningId"
            :door-bovenlicht-default="doorBovenlichtDefault"
            :window-bovenlicht-default="windowBovenlichtDefault"
            :opening-colors="openingColors"
            :inspect-colors="inspectColors"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
          />
          <FmlPreviewStageFixtures
            :render-model="renderModel"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :inspect-colors="inspectColors"
            :settings-item-id="settingsItemId"
            :move-item-id="moveItemId"
            :item-drag-preview="itemDragPreview"
            layer="over"
          />
          <FmlPreviewStageAreas
            :areas="renderModel.areas"
            :settings-area-id="settingsAreaId"
            :hovered-area-id="hoveredAreaId"
            :inspect-colors="inspectColors"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :labels-visible="labelsVisible"
            layer="labels"
          />
          <FmlPreviewStageSurfaces
            :surfaces="renderModel.surfaces"
            :settings-surface-id="settingsSurfaceId"
            :hovered-surface-id="hoveredSurfaceId"
            :inspect-colors="inspectColors"
            :surface-edit-id="surfaceEditId"
            :edit-vertices="surfaceEditVertices"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :labels-visible="labelsVisible"
            layer="labels"
          />
          <FmlPreviewStageLabels
            :labels="renderModel.labels"
            :settings-label-id="settingsLabelId"
            :hovered-label-id="hoveredLabelId"
            :layout-scale="layoutScale"
            :view-scale="viewScale"
            :labels-visible="labelsVisible"
          />
          <FmlPreviewStageAreaDims
            v-if="areaSideDimsVisible"
            :dims="renderModel.areaSideDims"
            :view-scale="viewScale"
          />
        </v-group>
      </v-group>
    </v-layer>
    <v-layer>
      <FmlPreviewStageJunctions
        :visible-junctions="visibleJunctions"
        :junction-overlay-group="junctionOverlayGroup"
        :junction-hit-radius="junctionHitRadius"
        :junction-marker-radius="junctionMarkerRadius"
        :junction-marker-stroke="junctionMarkerStroke"
        :active-junction-id="activeJunctionId"
        @junction-hover="emit('junctionHover', $event)"
        @junction-hover-end="emit('junctionHoverEnd')"
      />
      <FmlPreviewStageCornerMarkers
        :markers="cornerMarkers"
        :mode="cornerMarkerMode"
        :overlay-group="junctionOverlayGroup"
      />
    </v-layer>
  </v-stage>
</template>

<style scoped>
.fml-stage {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
  pointer-events: none;
}

.fml-stage :deep(canvas) {
  pointer-events: none;
}
</style>
