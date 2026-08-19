<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DoorAddSubtype, WindowAddSubtype } from '@/core/fml/opening-add-presets'
import type { OpeningSubtypeDraft } from '@/ui/composables/fml-preview/fml-preview-opening-draft'
import { isFmlToolbarSettingsOpen, type FmlToolId } from './canvas/fmlToolbeltItems'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './canvas/canvas-toolbelt.css'
import './fml-toolbelt-settings-fields.css'
import FmlPreviewToolbarSettingsWall from './FmlPreviewToolbarSettingsWall.vue'
import FmlPreviewToolbarSettingsOpening from './FmlPreviewToolbarSettingsOpening.vue'
import FmlPreviewToolbarSettingsArea from './FmlPreviewToolbarSettingsArea.vue'
import FmlPreviewToolbarSettingsLabel from './FmlPreviewToolbarSettingsLabel.vue'
import FmlPreviewToolbarSettingsItem from './FmlPreviewToolbarSettingsItem.vue'

const { t } = useI18n()

const activeTool = defineModel<FmlToolId | null>('activeTool', { default: null })
const addDoorSubtype = defineModel<DoorAddSubtype>('addDoorSubtype', { default: 'standard' })
const addDoorWidthCm = defineModel<number>('addDoorWidthCm', { default: 90 })
const addWindowSubtype = defineModel<WindowAddSubtype>('addWindowSubtype', { default: 'single' })
const addWindowWidthCm = defineModel<number>('addWindowWidthCm', { default: 100 })
const addWindowSillZCm = defineModel<number>('addWindowSillZCm', { default: 70 })
const addWindowHeightCm = defineModel<number>('addWindowHeightCm', { default: 150 })

const props = withDefaults(
  defineProps<{
    selectedWallPanel: {
      wallIds: string[]
      count: number
      thicknessMixed: boolean
      balanceMixed: boolean
      heightMixed?: boolean
      canSplit: boolean
    } | null
    selectedJunctionPanel: {
      junctionId: string
      wallCount: number
      heightCm: number | null
      heightMixed: boolean
    } | null
    selectedOpeningPanel: {
      openingIds: string[]
      count: number
      openingType: 'door' | 'window' | 'mixed'
      subtype: OpeningSubtypeDraft | null
      subtypeMixed: boolean
      widthCm: number | null
      widthMixed: boolean
      heightCm: number | null
      heightMixed: boolean
      sillZCm: number | null
      sillZMixed: boolean
      hingeAtStart: boolean | null
      hingeMixed: boolean
      swingRight: boolean | null
      swingMixed: boolean
    } | null
    selectedAreaPanel: {
      kind: 'area' | 'surface'
      id: string
      role: number | null
      name: string | null
      customName: string
      color: string
      canEditPolygon: boolean
    } | null
    selectedLabelPanel?: { id: string; text: string } | null
    selectedItemPanel?: {
      id: string
      label: string
      widthCm: number
      heightCm: number
      rotationDeg: number
      mirroredX: boolean
      mirroredY: boolean
    } | null
    roomTypes: ReadonlyArray<{ role: number; name: string; color: string }>
    surfaceEditActive?: boolean
    wallThicknessDraft: number
    wallThicknessMixed: boolean
    wallBalanceDraft: number
    wallBalanceMixed: boolean
    wallHeightDraft: number
    wallHeightMixed: boolean
    junctionHeightDraft: number
    junctionHeightMixed: boolean
    openingSubtypeDraft: OpeningSubtypeDraft
    openingSubtypeMixed: boolean
    openingWidthDraft: number
    openingWidthMixed: boolean
    openingHeightDraft: number
    openingHeightMixed: boolean
    openingSillZDraft: number
    openingSillZMixed: boolean
    openingHingeAtStartDraft: boolean
    openingHingeMixed: boolean
    openingSwingRightDraft: boolean
    openingSwingMixed: boolean
    openingBovenlichtDraft: boolean
    openingBovenlichtMixed: boolean
    openingBovenlichtHeightDraft: number
    openingBovenlichtHeightMixed: boolean
    openingBovenlichtGapDraft: number
    openingBovenlichtGapMixed: boolean
    thicknessMinCm?: number
    thicknessMidCm?: number
    thicknessMaxCm?: number
    measureLineCount?: number
    drawWallDrafting?: boolean
    drawWallMeasureLengthCm?: number
    drawRoomDrafting?: boolean
    drawRoomMeasureHCm?: number
    drawRoomMeasureVCm?: number
  }>(),
  {
    thicknessMinCm: 10,
    thicknessMidCm: 20,
    thicknessMaxCm: 30,
    measureLineCount: 0,
    drawWallDrafting: false,
    drawWallMeasureLengthCm: 0,
    drawRoomDrafting: false,
    drawRoomMeasureHCm: 0,
    drawRoomMeasureVCm: 0,
    selectedAreaPanel: null,
    selectedJunctionPanel: null,
    selectedLabelPanel: null,
    selectedItemPanel: null,
    roomTypes: () => [],
    surfaceEditActive: false,
  },
)

const emit = defineEmits<{
  wallThicknessInput: [event: Event]
  commitWallThickness: []
  applyWallThickness: [thicknessCm: number]
  wallBalanceInput: [event: Event]
  commitWallBalance: []
  wallHeightInput: [event: Event]
  commitWallHeight: []
  junctionHeightInput: [event: Event]
  commitJunctionHeight: []
  commitOpeningSubtype: [subtype: OpeningSubtypeDraft]
  openingWidthInput: [event: Event]
  commitOpeningWidth: []
  openingHeightInput: [event: Event]
  commitOpeningHeight: []
  openingSillZInput: [event: Event]
  commitOpeningSillZ: []
  toggleOpeningHinge: []
  toggleOpeningSwing: []
  openingBovenlichtChange: [event: Event]
  openingBovenlichtHeightInput: [event: Event]
  commitOpeningBovenlichtHeight: []
  openingBovenlichtGapInput: [event: Event]
  commitOpeningBovenlichtGap: []
  copyOpening: []
  deleteOpenings: []
  splitWall: []
  deleteWalls: []
  clearSelection: []
  clearMeasures: []
  applyRoomType: [role: number]
  areaCustomNameInput: [customName: string]
  applyAreaCustomName: [customName: string]
  applyAreaColor: [color: string]
  deleteTagged: []
  labelTextInput: [value: string]
  updateLabelText: [value: string]
  deleteAnnotation: []
  beginSurfacePolygonEdit: []
  endSurfacePolygonEdit: []
  itemWidthInput: [event: Event]
  itemHeightInput: [event: Event]
  itemRotationInput: [event: Event]
  toggleItemMirrorX: []
  toggleItemMirrorY: []
  copyItem: []
  deleteItem: []
  drawWallLengthInput: [cm: number | null]
  commitDrawWallMeasure: []
  cancelDrawWallDraft: []
  drawRoomHInput: [cm: number | null]
  drawRoomVInput: [cm: number | null]
  commitDrawRoomMeasure: []
  cancelDrawRoomDraft: []
}>()

const isDrawWallOrRoom = computed(
  () => activeTool.value === 'draw_wall' || activeTool.value === 'draw_room',
)

const showWallSettings = computed(
  () =>
    props.selectedWallPanel != null ||
    props.selectedJunctionPanel != null ||
    isDrawWallOrRoom.value,
)

const showOpeningSettings = computed(
  () =>
    props.selectedOpeningPanel != null ||
    activeTool.value === 'add_door' ||
    activeTool.value === 'add_window',
)

const showSettings = computed(() =>
  isFmlToolbarSettingsOpen({
    hasWallSelection: props.selectedWallPanel != null,
    hasJunctionSelection: props.selectedJunctionPanel != null,
    hasOpeningSelection: props.selectedOpeningPanel != null,
    hasAreaSelection: props.selectedAreaPanel != null,
    hasLabelSelection: props.selectedLabelPanel != null,
    hasItemSelection: props.selectedItemPanel != null,
    activeTool: activeTool.value,
  }),
)

const measureCountLabel = computed(() => {
  const count = props.measureLineCount ?? 0
  return count === 1
    ? t('result.toolbar.measureCountOne', { count })
    : t('result.toolbar.measureCountMany', { count })
})

const showMeasureStrip = computed(
  () => activeTool.value === 'measure' && (props.measureLineCount ?? 0) > 0,
)

const showDeselect = computed(
  () =>
    props.selectedWallPanel != null ||
    props.selectedJunctionPanel != null ||
    props.selectedOpeningPanel != null ||
    props.selectedAreaPanel != null ||
    props.selectedLabelPanel != null ||
    props.selectedItemPanel != null,
)
</script>

<template>
  <template v-if="showSettings">
    <div class="canvas-toolbelt-dock__sep" aria-hidden="true" />
    <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--fml">
      <!-- Order matches prior flat template metas: wall → opening → area → label -->
      <FmlPreviewToolbarSettingsWall
        v-if="showWallSettings"
        :selected-wall-panel="selectedWallPanel"
        :selected-junction-panel="selectedJunctionPanel"
        :active-tool="activeTool"
        :wall-thickness-draft="wallThicknessDraft"
        :wall-thickness-mixed="wallThicknessMixed"
        :wall-balance-draft="wallBalanceDraft"
        :wall-balance-mixed="wallBalanceMixed"
        :wall-height-draft="wallHeightDraft"
        :wall-height-mixed="wallHeightMixed"
        :junction-height-draft="junctionHeightDraft"
        :junction-height-mixed="junctionHeightMixed"
        :thickness-min-cm="thicknessMinCm"
        :thickness-mid-cm="thicknessMidCm"
        :thickness-max-cm="thicknessMaxCm"
        :draw-wall-drafting="drawWallDrafting"
        :draw-wall-measure-length-cm="drawWallMeasureLengthCm"
        :draw-room-drafting="drawRoomDrafting"
        :draw-room-measure-h-cm="drawRoomMeasureHCm"
        :draw-room-measure-v-cm="drawRoomMeasureVCm"
        @wall-thickness-input="emit('wallThicknessInput', $event)"
        @commit-wall-thickness="emit('commitWallThickness')"
        @apply-wall-thickness="emit('applyWallThickness', $event)"
        @wall-balance-input="emit('wallBalanceInput', $event)"
        @commit-wall-balance="emit('commitWallBalance')"
        @wall-height-input="emit('wallHeightInput', $event)"
        @commit-wall-height="emit('commitWallHeight')"
        @junction-height-input="emit('junctionHeightInput', $event)"
        @commit-junction-height="emit('commitJunctionHeight')"
        @split-wall="emit('splitWall')"
        @delete-walls="emit('deleteWalls')"
        @draw-wall-length-input="emit('drawWallLengthInput', $event)"
        @commit-draw-wall-measure="emit('commitDrawWallMeasure')"
        @cancel-draw-wall-draft="emit('cancelDrawWallDraft')"
        @draw-room-h-input="emit('drawRoomHInput', $event)"
        @draw-room-v-input="emit('drawRoomVInput', $event)"
        @commit-draw-room-measure="emit('commitDrawRoomMeasure')"
        @cancel-draw-room-draft="emit('cancelDrawRoomDraft')"
      />
      <FmlPreviewToolbarSettingsOpening
        v-if="showOpeningSettings"
        v-model:add-door-subtype="addDoorSubtype"
        v-model:add-door-width-cm="addDoorWidthCm"
        v-model:add-window-subtype="addWindowSubtype"
        v-model:add-window-width-cm="addWindowWidthCm"
        v-model:add-window-sill-z-cm="addWindowSillZCm"
        v-model:add-window-height-cm="addWindowHeightCm"
        :selected-opening-panel="selectedOpeningPanel"
        :active-tool="activeTool"
        :opening-subtype-draft="openingSubtypeDraft"
        :opening-subtype-mixed="openingSubtypeMixed"
        :opening-width-draft="openingWidthDraft"
        :opening-width-mixed="openingWidthMixed"
        :opening-height-draft="openingHeightDraft"
        :opening-height-mixed="openingHeightMixed"
        :opening-sill-z-draft="openingSillZDraft"
        :opening-sill-z-mixed="openingSillZMixed"
        :opening-hinge-at-start-draft="openingHingeAtStartDraft"
        :opening-hinge-mixed="openingHingeMixed"
        :opening-swing-right-draft="openingSwingRightDraft"
        :opening-swing-mixed="openingSwingMixed"
        :opening-bovenlicht-draft="openingBovenlichtDraft"
        :opening-bovenlicht-mixed="openingBovenlichtMixed"
        :opening-bovenlicht-height-draft="openingBovenlichtHeightDraft"
        :opening-bovenlicht-height-mixed="openingBovenlichtHeightMixed"
        :opening-bovenlicht-gap-draft="openingBovenlichtGapDraft"
        :opening-bovenlicht-gap-mixed="openingBovenlichtGapMixed"
        @commit-opening-subtype="emit('commitOpeningSubtype', $event)"
        @opening-width-input="emit('openingWidthInput', $event)"
        @commit-opening-width="emit('commitOpeningWidth')"
        @opening-height-input="emit('openingHeightInput', $event)"
        @commit-opening-height="emit('commitOpeningHeight')"
        @opening-sill-z-input="emit('openingSillZInput', $event)"
        @commit-opening-sill-z="emit('commitOpeningSillZ')"
        @toggle-opening-hinge="emit('toggleOpeningHinge')"
        @toggle-opening-swing="emit('toggleOpeningSwing')"
        @opening-bovenlicht-change="emit('openingBovenlichtChange', $event)"
        @opening-bovenlicht-height-input="emit('openingBovenlichtHeightInput', $event)"
        @commit-opening-bovenlicht-height="emit('commitOpeningBovenlichtHeight')"
        @opening-bovenlicht-gap-input="emit('openingBovenlichtGapInput', $event)"
        @commit-opening-bovenlicht-gap="emit('commitOpeningBovenlichtGap')"
        @copy-opening="emit('copyOpening')"
        @delete-openings="emit('deleteOpenings')"
      />
      <FmlPreviewToolbarSettingsArea
        v-if="selectedAreaPanel"
        :selected-area-panel="selectedAreaPanel"
        :room-types="roomTypes"
        :surface-edit-active="surfaceEditActive"
        @apply-room-type="emit('applyRoomType', $event)"
        @area-custom-name-input="emit('areaCustomNameInput', $event)"
        @apply-area-custom-name="emit('applyAreaCustomName', $event)"
        @apply-area-color="emit('applyAreaColor', $event)"
        @delete-tagged="emit('deleteTagged')"
        @begin-surface-polygon-edit="emit('beginSurfacePolygonEdit')"
        @end-surface-polygon-edit="emit('endSurfacePolygonEdit')"
      />
      <FmlPreviewToolbarSettingsLabel
        v-if="selectedLabelPanel"
        :selected-label-panel="selectedLabelPanel"
        @label-text-input="emit('labelTextInput', $event)"
        @update-label-text="emit('updateLabelText', $event)"
        @delete-annotation="emit('deleteAnnotation')"
      />
      <FmlPreviewToolbarSettingsItem
        v-if="selectedItemPanel"
        :selected-item-panel="selectedItemPanel"
        @item-width-input="emit('itemWidthInput', $event)"
        @item-height-input="emit('itemHeightInput', $event)"
        @item-rotation-input="emit('itemRotationInput', $event)"
        @toggle-item-mirror-x="emit('toggleItemMirrorX')"
        @toggle-item-mirror-y="emit('toggleItemMirrorY')"
        @copy-item="emit('copyItem')"
        @delete-item="emit('deleteItem')"
      />
      <button
        v-if="showDeselect"
        type="button"
        class="canvas-toolbelt__btn"
        :title="t('result.toolbar.deselectTitle')"
        :aria-label="t('result.toolbar.deselect')"
        @click="emit('clearSelection')"
      >
        <ToolbeltIcon name="clear" />
      </button>
    </div>
  </template>

  <template v-if="showMeasureStrip">
    <div class="canvas-toolbelt-dock__sep" aria-hidden="true" />
    <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--fml">
      <span class="fml-toolbelt__meta">{{ measureCountLabel }}</span>
      <button
        type="button"
        class="canvas-toolbelt__btn"
        :title="t('result.toolbar.clearMeasures')"
        :aria-label="t('result.toolbar.clearMeasures')"
        @click="emit('clearMeasures')"
      >
        <ToolbeltIcon name="clear" />
      </button>
    </div>
  </template>
</template>
