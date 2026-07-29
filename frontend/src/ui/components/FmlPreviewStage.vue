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

defineProps<{
  stageSize: { width: number; height: number }
  viewPosition: { x: number; y: number }
  viewScale: number
  renderModel: RenderModel
  underlayConfig: {
    image: HTMLImageElement
    x: number
    y: number
    width: number
    height: number
    opacity: number
    listening: boolean
  } | null
  /** 0–1; FML-geometrie opacity. */
  contentOpacity: number
  moveWallPolygon: RenderWallPolygon | null
  settingsWallPolygons: RenderWallPolygon[]
  settingsWallIds: string[]
  moveWallId: string | null
  settingsOpeningIds: string[]
  moveOpeningId: string | null
  groupDraggable: boolean
  visibleJunctions: RenderJunction[]
  junctionOverlayGroup: { x: number; y: number; scaleX: number; scaleY: number }
  junctionHitRadius: number
  junctionMarkerRadius: number
  junctionMarkerStroke: number
  activeJunctionId: string | null
}>()

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
          <FmlPreviewStageWalls
            :render-model="renderModel"
            :move-wall-polygon="moveWallPolygon"
            :settings-wall-polygons="settingsWallPolygons"
            :settings-wall-ids="settingsWallIds"
            :move-wall-id="moveWallId"
          />
          <FmlPreviewStageOpenings
            :render-model="renderModel"
            :settings-opening-ids="settingsOpeningIds"
            :move-opening-id="moveOpeningId"
          />
          <FmlPreviewStageFixtures :render-model="renderModel" />
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
