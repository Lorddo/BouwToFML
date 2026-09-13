<script setup lang="ts">
import { computed } from 'vue'

import type Konva from 'konva'

import type { SelectionRect } from '@/platform/selection'
import { resolveWallThicknessCm } from '@/platform/selection/wall-thickness-ref'
import { catalogMaxCm } from '@/core/fml/fml-wall-thickness-catalog'
import type { ElementClass } from '@/core/extraction/types'
import { formatScaleInputLabel } from '@/ui/composables/settings/scale-input-unit'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import type { ItemResizeSide } from '@/ui/composables/plan-canvas/item-resize-handles'
import type { ItemRotateCorner } from '@/ui/composables/plan-canvas/item-rotate-handles'
import { EDGE_RESIZE_HANDLES, ROTATE_CORNERS } from '../composables/useFloorplanRectInteraction'
import { rectRotationDeg } from '@/platform/selection/oriented-rect'

const props = defineProps<{
  lbeRects: SelectionRect[]
  previewRect?: SelectionRect | null
  selectedRectId?: string | null
  selectedRect: SelectionRect | null
  isSelectionMode: boolean
  typeColors: Partial<Record<ElementClass, string>>
  /** Project export-cm for wall LBE labels. */
  wallThicknessLimits?: {
    minCm: number
    midCm: number
    maxCm: number
    thicknessCms?: number[]
  } | null
  iconSize: number
  handleSize: number
  iconPositions: (rect: SelectionRect) => {
    delete: { x: number; y: number }
  }
  onRectMouseDown: (e: Konva.KonvaEventObject<MouseEvent>, rectId: string) => void
  onResizeHandleDown: (
    e: Konva.KonvaEventObject<MouseEvent>,
    handle: ItemResizeSide,
    rect: SelectionRect,
  ) => void
  onRotateHandleDown: (
    e: Konva.KonvaEventObject<MouseEvent>,
    corner: ItemRotateCorner,
    rect: SelectionRect,
  ) => void
  onDeleteIconClick: (e: Konva.KonvaEventObject<MouseEvent>, rectId: string) => void
}>()

function colorFor(type: ElementClass): string {
  return props.typeColors[type] ?? '#64748b'
}

function wallBandLabel(rect: SelectionRect): string | null {
  if (rect.type !== 'wall') return null
  const own = resolveWallThicknessCm(rect)
  const limits = props.wallThicknessLimits
  const cm =
    own ??
    (limits
      ? catalogMaxCm(limits.thicknessCms ?? [limits.minCm, limits.midCm, limits.maxCm])
      : null)
  if (cm == null) return null
  return formatScaleInputLabel(cm, loadUserSettings().scaleInputUnit)
}

function groupConfig(rect: SelectionRect, listening: boolean) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    rotation: rectRotationDeg(rect),
    listening,
  }
}

function innerRectConfig(rect: SelectionRect, extra?: { dash?: number[]; fillAlpha: string }) {
  const stroke = colorFor(rect.type)
  return {
    x: -rect.width / 2,
    y: -rect.height / 2,
    width: rect.width,
    height: rect.height,
    stroke,
    strokeWidth: extra?.dash ? 2 : rect.id === props.selectedRectId ? 3 : 2,
    ...(extra?.dash ? { dash: extra.dash } : {}),
    fill: stroke + extra!.fillAlpha,
    listening: extra?.dash ? false : props.isSelectionMode,
    onMouseDown: extra?.dash
      ? undefined
      : (e: Konva.KonvaEventObject<MouseEvent>) => props.onRectMouseDown(e, rect.id),
  }
}

const wallLabelConfigs = computed(() =>
  props.lbeRects
    .map((rect) => {
      const text = wallBandLabel(rect)
      if (!text) return null
      return {
        id: rect.id,
        group: groupConfig(rect, false),
        text: {
          x: -rect.width / 2 + 4,
          y: -rect.height / 2 + 4,
          text,
          fontSize: Math.max(11, Math.min(16, Math.min(rect.width, rect.height) * 0.35)),
          fontStyle: 'bold',
          fill: '#1e3a8a',
          listening: false,
        },
      }
    })
    .filter((row): row is NonNullable<typeof row> => row != null),
)

const previewConfig = computed(() => {
  const rect = props.previewRect
  if (!rect) return null
  const stroke = colorFor(rect.type)
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    stroke,
    strokeWidth: 2,
    dash: [6, 4],
    fill: stroke + '33',
    listening: false,
  }
})

const edgeHandleConfigs = computed(() => {
  const rect = props.selectedRect
  if (!rect || !props.isSelectionMode) return []
  const stroke = colorFor(rect.type)
  const r = props.handleSize / 2
  const hx = rect.width / 2
  const hy = rect.height / 2
  const pos: Record<ItemResizeSide, { x: number; y: number }> = {
    n: { x: 0, y: -hy },
    e: { x: hx, y: 0 },
    s: { x: 0, y: hy },
    w: { x: -hx, y: 0 },
  }
  return EDGE_RESIZE_HANDLES.map((handle) => ({
    key: handle,
    config: {
      x: pos[handle].x,
      y: pos[handle].y,
      radius: r,
      fill: '#ffffff',
      stroke,
      strokeWidth: 1.5,
      strokeScaleEnabled: false,
      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) =>
        props.onResizeHandleDown(e, handle, rect),
    },
  }))
})

const rotateHandleConfigs = computed(() => {
  const rect = props.selectedRect
  if (!rect || !props.isSelectionMode) return []
  const stroke = colorFor(rect.type)
  const r = props.handleSize / 2
  const hx = rect.width / 2
  const hy = rect.height / 2
  const pos: Record<ItemRotateCorner, { x: number; y: number }> = {
    ne: { x: hx, y: -hy },
    se: { x: hx, y: hy },
    sw: { x: -hx, y: hy },
    nw: { x: -hx, y: -hy },
  }
  const scale = r / 3.5
  return ROTATE_CORNERS.map((corner) => {
    const local = pos[corner]
    const localAngle = (Math.atan2(local.y, local.x) * 180) / Math.PI
    return {
      key: corner,
      group: {
        x: local.x,
        y: local.y,
        rotation: localAngle + 90,
        onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) =>
          props.onRotateHandleDown(e, corner, rect),
      },
      hit: {
        radius: r,
        fill: '#ffffff',
        stroke,
        strokeWidth: 1.5,
        strokeScaleEnabled: false,
      },
      arc: {
        data: 'M 1.4 -2.5 A 2.8 2.8 0 1 1 -1.4 -2.5',
        scaleX: scale,
        scaleY: scale,
        stroke,
        strokeWidth: 1.2 / scale,
        fillEnabled: false,
        listening: false,
        strokeScaleEnabled: false,
      },
      head: {
        data: 'M 1.4 -2.5 L 0.2 -4.1 L 2.7 -3.9 Z',
        scaleX: scale,
        scaleY: scale,
        fill: stroke,
        strokeEnabled: false,
        listening: false,
      },
    }
  })
})

const deleteIconGroupConfig = computed(() => {
  const rect = props.selectedRect
  if (!rect || !props.isSelectionMode) return null
  const pos = props.iconPositions(rect).delete
  const sz = props.iconSize
  return {
    group: {
      x: pos.x,
      y: pos.y,
      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => props.onDeleteIconClick(e, rect.id),
    },
    box: {
      width: sz,
      height: sz,
      fill: '#fee2e2',
      stroke: '#dc2626',
      strokeWidth: 1.5,
      cornerRadius: 3,
      strokeScaleEnabled: false,
    },
    label: {
      x: sz * 0.28,
      y: sz * 0.08,
      text: '✕',
      fontSize: sz * 0.72,
      fill: '#dc2626',
      listening: false,
    },
  }
})

const selectedGroup = computed(() => {
  const rect = props.selectedRect
  if (!rect || !props.isSelectionMode) return null
  return groupConfig(rect, true)
})
</script>

<template>
  <v-group>
    <v-group v-for="rect in lbeRects" :key="rect.id" :config="groupConfig(rect, isSelectionMode)">
      <v-rect
        :config="innerRectConfig(rect, { fillAlpha: rect.id === selectedRectId ? '66' : '44' })"
      />
    </v-group>
    <v-group v-for="row in wallLabelConfigs" :key="'lbl-' + row.id" :config="row.group">
      <v-text :config="row.text" />
    </v-group>
    <v-rect v-if="previewConfig" :config="previewConfig" />

    <v-group v-if="selectedGroup" :config="selectedGroup">
      <v-circle
        v-for="handle in edgeHandleConfigs"
        :key="'edge-' + handle.key"
        :config="handle.config"
      />
      <v-group
        v-for="handle in rotateHandleConfigs"
        :key="'rot-' + handle.key"
        :config="handle.group"
      >
        <v-circle :config="handle.hit" />
        <v-path :config="handle.arc" />
        <v-path :config="handle.head" />
      </v-group>
      <v-group v-if="deleteIconGroupConfig" :config="deleteIconGroupConfig.group">
        <v-rect :config="deleteIconGroupConfig.box" />
        <v-text :config="deleteIconGroupConfig.label" />
      </v-group>
    </v-group>
  </v-group>
</template>
