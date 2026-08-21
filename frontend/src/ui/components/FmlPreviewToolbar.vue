<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DoorAddSubtype, WindowAddSubtype } from '@/core/fml/opening-add-presets'
import type { FloorLineType } from '@/core/fml/types'
import type { OpeningSubtypeDraft } from '@/ui/composables/fml-preview/fml-preview-opening-draft'
import { useChromeFitScale } from '@/ui/composables/useChromeFitScale'
import CanvasToolbelt from './canvas/CanvasToolbelt.vue'
import FmlPreviewToolbarSettings from './FmlPreviewToolbarSettings.vue'
import {
  FML_AREA_SIDE_DIMS_TOOL_ID,
  getFmlDrawTools,
  getFmlLibraryTools,
  getFmlSelectTools,
  isFmlToolbarSettingsOpen,
  type FmlToolId,
} from './canvas/fmlToolbeltItems'
import './canvas/canvas-toolbelt.css'

const { t, locale } = useI18n()
const dockRef = ref<HTMLElement | null>(null)
useChromeFitScale(dockRef)

const activeTool = defineModel<FmlToolId | null>('activeTool', { default: null })
const measureDrawMode = defineModel<'tape' | 'manual' | 'slicer'>('measureDrawMode', {
  default: 'tape',
})
const slicerEditMode = defineModel<boolean>('slicerEditMode', { default: false })
const addDoorSubtype = defineModel<DoorAddSubtype>('addDoorSubtype', { default: 'standard' })
const addDoorWidthCm = defineModel<number>('addDoorWidthCm', { default: 90 })
const addWindowSubtype = defineModel<WindowAddSubtype>('addWindowSubtype', { default: 'single' })
const addWindowWidthCm = defineModel<number>('addWindowWidthCm', { default: 100 })
const addWindowSillZCm = defineModel<number>('addWindowSillZCm', { default: 70 })
const addWindowHeightCm = defineModel<number>('addWindowHeightCm', { default: 150 })
const areaSideDimsVisible = defineModel<boolean>('areaSideDimsVisible', { default: false })
const drawSurfaceRole = defineModel<number | null>('drawSurfaceRole', { default: null })
const drawLineThickness = defineModel<number>('drawLineThickness', { default: 2 })
const drawLineType = defineModel<FloorLineType>('drawLineType', { default: 'solid_line' })
const drawLineColor = defineModel<string>('drawLineColor', { default: '#000000' })
const drawLabelText = defineModel<string>('drawLabelText', { default: 'Tekst' })
const drawLabelFontSize = defineModel<number>('drawLabelFontSize', { default: 16 })
const drawLabelFontColor = defineModel<string>('drawLabelFontColor', { default: '#000000' })
const drawLabelOutline = defineModel<boolean>('drawLabelOutline', { default: false })
const drawLabelBold = defineModel<boolean>('drawLabelBold', { default: false })
const drawLabelItalic = defineModel<boolean>('drawLabelItalic', { default: false })

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
      showAreaLabel: boolean
      canEditPolygon: boolean
    } | null
    roomTypes: ReadonlyArray<{ role: number; name: string; color: string }>
    surfaceEditActive?: boolean
    /** draw_surface in toolbelt; default true (viewer). */
    includeSurfaceTool?: boolean
    /** draw_label + draw_line; default false. */
    includeAnnotationTools?: boolean
    includeFixtureTool?: boolean
    selectedLabelPanel?: {
      id: string
      text: string
      fontSize: number
      fontColor: string
      outline: boolean
      bold: boolean
      italic: boolean
    } | null
    selectedLinePanel?: {
      id: string
      type: FloorLineType
      color: string
      thickness: number
    } | null
    selectedItemPanel?: {
      id: string
      label: string
      widthCm: number
      heightCm: number
      rotationDeg: number
      mirroredX: boolean
      mirroredY: boolean
    } | null
    /** Topbar aanwezig: hint zit in de info-modal, niet als balk. */
    hideInlineHint?: boolean
    /** `/FML-editor` touch: floating balk + settings-kaart (niet workspace). */
    floatingDock?: boolean
    /** Mobiel: select-groep zit in de linker rail. */
    hideSelectTools?: boolean
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
    measurePersistEnabled?: boolean
    drawWallDrafting?: boolean
    drawWallMeasureLengthCm?: number
    drawRoomDrafting?: boolean
    drawRoomMeasureHCm?: number
    drawRoomMeasureVCm?: number
    drawLineDrafting?: boolean
    drawSurfaceDrafting?: boolean
    facadeGroupsEnabled?: boolean
    facadeGroupOptions?: Array<{ id: string; code: string; name: string }>
    facadeGroupDraft?: string | null
    facadeGroupMixed?: boolean
    canSelectFacadeMembers?: boolean
    /** Workspace: alleen Stempel-preset (geen nieuwe groep / rename). */
    facadeGroupsStampPreset?: boolean
    /** Editor: Stempel-select naast gevel. */
    stampGroupEnabled?: boolean
    stampGroupDraft?: boolean | null
    stampGroupMixed?: boolean
    canSelectStampMembers?: boolean
  }>(),
  {
    thicknessMinCm: 10,
    thicknessMidCm: 20,
    thicknessMaxCm: 30,
    measureLineCount: 0,
    measurePersistEnabled: false,
    drawWallDrafting: false,
    drawWallMeasureLengthCm: 0,
    drawRoomDrafting: false,
    drawRoomMeasureHCm: 0,
    drawRoomMeasureVCm: 0,
    drawLineDrafting: false,
    drawSurfaceDrafting: false,
    facadeGroupsEnabled: false,
    facadeGroupOptions: () => [],
    facadeGroupDraft: '',
    facadeGroupMixed: false,
    canSelectFacadeMembers: false,
    facadeGroupsStampPreset: false,
    stampGroupEnabled: false,
    stampGroupDraft: false,
    stampGroupMixed: false,
    canSelectStampMembers: false,
    selectedAreaPanel: null,
    selectedJunctionPanel: null,
    roomTypes: () => [],
    surfaceEditActive: false,
    includeSurfaceTool: false,
    includeAnnotationTools: false,
    includeFixtureTool: false,
    selectedLabelPanel: null,
    selectedLinePanel: null,
    selectedItemPanel: null,
    hideInlineHint: false,
    floatingDock: false,
    hideSelectTools: false,
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
  facadeGroupChange: [value: string]
  facadeGroupRename: [name: string]
  selectFacadeMembers: []
  stampGroupChange: [enabled: boolean]
  selectStampMembers: []
  clearMeasures: []
  applyRoomType: [role: number]
  areaCustomNameInput: [customName: string]
  applyAreaCustomName: [customName: string]
  applyAreaColor: [color: string]
  applyShowAreaLabel: [show: boolean]
  deleteTagged: []
  labelTextInput: [value: string]
  updateLabelText: [value: string]
  updateLabelFontSize: [value: number]
  updateLabelFontColor: [value: string]
  updateLabelOutline: [value: boolean]
  updateLabelBold: [value: boolean]
  updateLabelItalic: [value: boolean]
  deleteAnnotation: []
  updateLineType: [type: FloorLineType]
  updateLineColor: [color: string]
  updateLineThickness: [thickness: number]
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
  acceptDrawDraft: []
  deactivateDrawTool: []
}>()

const selectTools = computed(() => {
  void locale.value
  return getFmlSelectTools()
})

const selectPressedIds = computed(() =>
  areaSideDimsVisible.value ? [FML_AREA_SIDE_DIMS_TOOL_ID] : [],
)

function onSelectTogglePressed(id: string): void {
  if (id === FML_AREA_SIDE_DIMS_TOOL_ID) {
    areaSideDimsVisible.value = !areaSideDimsVisible.value
  }
}

const drawTools = computed(() => {
  void locale.value
  return getFmlDrawTools({
    includeSurface: props.includeSurfaceTool === true,
    includeAnnotations: props.includeAnnotationTools === true,
  })
})

const libraryTools = computed(() => {
  void locale.value
  return getFmlLibraryTools({
    includeFixture: props.includeFixtureTool === true,
  })
})

const settingsOpen = computed(() =>
  isFmlToolbarSettingsOpen({
    hasWallSelection: props.selectedWallPanel != null,
    hasJunctionSelection: props.selectedJunctionPanel != null,
    hasOpeningSelection: props.selectedOpeningPanel != null,
    hasAreaSelection: props.selectedAreaPanel != null,
    hasLabelSelection: props.selectedLabelPanel != null,
    hasLineSelection: props.selectedLinePanel != null,
    hasItemSelection: props.selectedItemPanel != null,
    hasMeasureLines: (props.measureLineCount ?? 0) > 0,
    activeTool: activeTool.value,
  }),
)

const showDrawingTools = computed(() => !settingsOpen.value)

const hint = computed(() => {
  if (activeTool.value === 'measure') {
    if (measureDrawMode.value === 'manual') return t('result.toolbar.hintMeasureManual')
    if (measureDrawMode.value === 'slicer') {
      return slicerEditMode.value
        ? t('result.toolbar.hintMeasureSlicerEdit')
        : t('result.toolbar.hintMeasureSlicer')
    }
    return t('result.toolbar.hintMeasureTape')
  }
  if (activeTool.value === 'nulpunt') return t('result.toolbar.hintNulpunt')
  if (activeTool.value === 'draw_wall') return t('result.toolbar.hintDrawWall')
  if (activeTool.value === 'draw_room') return t('result.toolbar.hintDrawRoom')
  if (activeTool.value === 'draw_surface' && props.includeSurfaceTool === true) {
    return t('result.toolbar.hintDrawSurface')
  }
  if (activeTool.value === 'draw_label' && props.includeAnnotationTools === true) {
    return t('result.toolbar.hintDrawLabel')
  }
  if (activeTool.value === 'draw_line' && props.includeAnnotationTools === true) {
    return t('result.toolbar.hintDrawLine')
  }
  if (activeTool.value === 'add_door') return t('result.toolbar.hintAddDoor')
  if (activeTool.value === 'add_window') return t('result.toolbar.hintAddWindow')
  if (activeTool.value === 'add_fixture') return t('result.toolbar.hintAddFixture')
  if (activeTool.value === 'box_select') return t('result.toolbar.hintBoxSelect')
  if (props.selectedLabelPanel && props.includeAnnotationTools === true) {
    return t('result.toolbar.hintLabelSelected')
  }
  if (props.selectedLinePanel && props.includeAnnotationTools === true) {
    return t('result.toolbar.hintLineSelected')
  }
  if (props.selectedAreaPanel && props.includeSurfaceTool === true) {
    return props.selectedAreaPanel.kind === 'surface'
      ? t('result.toolbar.hintSurfaceSelected')
      : t('result.toolbar.hintAreaSelected')
  }
  if (props.selectedWallPanel) {
    const count = props.selectedWallPanel.count
    if (count === 1) return t('result.toolbar.hintWallOne')
    return t('result.toolbar.hintWallMany', { count })
  }
  if (props.selectedJunctionPanel) {
    return t('result.toolbar.hintJunction')
  }
  if (props.selectedOpeningPanel) {
    const count = props.selectedOpeningPanel.count
    if (props.selectedOpeningPanel.openingType === 'window') {
      if (count === 1) return t('result.toolbar.hintWindowOne')
      return t('result.toolbar.hintWindowMany', { count })
    }
    if (count === 1) return t('result.toolbar.hintDoorOne')
    return t('result.toolbar.hintDoorMany', { count })
  }
  if (areaSideDimsVisible.value) return t('result.toolbar.hintAreaSideDims')
  return t('result.toolbar.hintDefault')
})

defineExpose({ hint })
</script>

<template>
  <p v-if="!hideInlineHint" class="fml-preview-hint">{{ hint }}</p>
  <div
    ref="dockRef"
    class="canvas-toolbelt-dock fml-preview-toolbelt-dock"
    :class="{ 'fml-preview-toolbelt-dock--float': props.floatingDock }"
    @pointerdown.stop
    @mousedown.stop
    @mousemove.stop
    @click.stop
  >
    <div class="canvas-toolbelt-dock__row">
      <div v-show="showDrawingTools" class="fml-preview-toolbelt-tools">
        <div
          v-if="!props.hideSelectTools"
          class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--face"
        >
          <CanvasToolbelt
            embedded
            :tools="selectTools"
            :active-tool="activeTool"
            :pressed-ids="selectPressedIds"
            :show-undo="false"
            @update:active-tool="activeTool = $event as FmlToolId | null"
            @toggle-pressed="onSelectTogglePressed"
          />
        </div>
        <div v-if="!props.hideSelectTools" class="canvas-toolbelt-dock__sep" aria-hidden="true" />
        <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--fml">
          <CanvasToolbelt
            embedded
            :tools="drawTools"
            :active-tool="activeTool"
            :show-undo="false"
            @update:active-tool="activeTool = $event as FmlToolId | null"
          />
        </div>
        <div class="canvas-toolbelt-dock__sep" aria-hidden="true" />
        <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--face">
          <CanvasToolbelt
            embedded
            :tools="libraryTools"
            :active-tool="activeTool"
            :show-undo="false"
            @update:active-tool="activeTool = $event as FmlToolId | null"
          />
        </div>
      </div>

      <div class="fml-preview-toolbelt-settings" :class="{ 'is-open': settingsOpen }">
        <FmlPreviewToolbarSettings
          v-model:active-tool="activeTool"
          v-model:add-door-subtype="addDoorSubtype"
          v-model:add-door-width-cm="addDoorWidthCm"
          v-model:add-window-subtype="addWindowSubtype"
          v-model:add-window-width-cm="addWindowWidthCm"
          v-model:add-window-sill-z-cm="addWindowSillZCm"
          v-model:add-window-height-cm="addWindowHeightCm"
          :selected-wall-panel="selectedWallPanel"
          :selected-junction-panel="selectedJunctionPanel"
          :selected-opening-panel="selectedOpeningPanel"
          :selected-area-panel="selectedAreaPanel"
          :selected-label-panel="selectedLabelPanel"
          :selected-line-panel="selectedLinePanel"
          :selected-item-panel="selectedItemPanel"
          :room-types="roomTypes"
          :surface-edit-active="surfaceEditActive"
          :wall-thickness-draft="wallThicknessDraft"
          :wall-thickness-mixed="wallThicknessMixed"
          :wall-balance-draft="wallBalanceDraft"
          :wall-balance-mixed="wallBalanceMixed"
          :wall-height-draft="wallHeightDraft"
          :wall-height-mixed="wallHeightMixed"
          :junction-height-draft="junctionHeightDraft"
          :junction-height-mixed="junctionHeightMixed"
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
          v-model:measure-draw-mode="measureDrawMode"
          :opening-bovenlicht-mixed="openingBovenlichtMixed"
          v-model:slicer-edit-mode="slicerEditMode"
          :opening-bovenlicht-height-draft="openingBovenlichtHeightDraft"
          v-model:draw-surface-role="drawSurfaceRole"
          :opening-bovenlicht-height-mixed="openingBovenlichtHeightMixed"
          v-model:draw-line-thickness="drawLineThickness"
          :opening-bovenlicht-gap-draft="openingBovenlichtGapDraft"
          v-model:draw-line-type="drawLineType"
          :opening-bovenlicht-gap-mixed="openingBovenlichtGapMixed"
          v-model:draw-line-color="drawLineColor"
          :thickness-min-cm="thicknessMinCm"
          v-model:draw-label-text="drawLabelText"
          :thickness-mid-cm="thicknessMidCm"
          v-model:draw-label-font-size="drawLabelFontSize"
          :thickness-max-cm="thicknessMaxCm"
          v-model:draw-label-font-color="drawLabelFontColor"
          :measure-line-count="measureLineCount"
          v-model:draw-label-outline="drawLabelOutline"
          :measure-persist-enabled="measurePersistEnabled"
          v-model:draw-label-bold="drawLabelBold"
          :draw-wall-drafting="drawWallDrafting"
          v-model:draw-label-italic="drawLabelItalic"
          :draw-wall-measure-length-cm="drawWallMeasureLengthCm"
          :draw-room-drafting="drawRoomDrafting"
          :draw-room-measure-h-cm="drawRoomMeasureHCm"
          :draw-room-measure-v-cm="drawRoomMeasureVCm"
          :draw-line-drafting="drawLineDrafting"
          :draw-surface-drafting="drawSurfaceDrafting"
          :facade-groups-enabled="facadeGroupsEnabled"
          :facade-group-options="facadeGroupOptions"
          :facade-group-draft="facadeGroupDraft"
          :facade-group-mixed="facadeGroupMixed"
          :can-select-facade-members="canSelectFacadeMembers"
          :facade-groups-stamp-preset="facadeGroupsStampPreset"
          :stamp-group-enabled="stampGroupEnabled"
          :stamp-group-draft="stampGroupDraft"
          :stamp-group-mixed="stampGroupMixed"
          :can-select-stamp-members="canSelectStampMembers"
          @wall-thickness-input="emit('wallThicknessInput', $event)"
          @commit-wall-thickness="emit('commitWallThickness')"
          @apply-wall-thickness="emit('applyWallThickness', $event)"
          @wall-balance-input="emit('wallBalanceInput', $event)"
          @commit-wall-balance="emit('commitWallBalance')"
          @wall-height-input="emit('wallHeightInput', $event)"
          @commit-wall-height="emit('commitWallHeight')"
          @junction-height-input="emit('junctionHeightInput', $event)"
          @commit-junction-height="emit('commitJunctionHeight')"
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
          @split-wall="emit('splitWall')"
          @delete-walls="emit('deleteWalls')"
          @facade-group-change="emit('facadeGroupChange', $event)"
          @facade-group-rename="emit('facadeGroupRename', $event)"
          @select-facade-members="emit('selectFacadeMembers')"
          @stamp-group-change="emit('stampGroupChange', $event)"
          @select-stamp-members="emit('selectStampMembers')"
          @clear-selection="emit('clearSelection')"
          @clear-measures="emit('clearMeasures')"
          @apply-room-type="emit('applyRoomType', $event)"
          @area-custom-name-input="emit('areaCustomNameInput', $event)"
          @apply-area-custom-name="emit('applyAreaCustomName', $event)"
          @apply-area-color="emit('applyAreaColor', $event)"
          @apply-show-area-label="emit('applyShowAreaLabel', $event)"
          @delete-tagged="emit('deleteTagged')"
          @label-text-input="emit('labelTextInput', $event)"
          @update-label-text="emit('updateLabelText', $event)"
          @update-label-font-size="emit('updateLabelFontSize', $event)"
          @update-label-font-color="emit('updateLabelFontColor', $event)"
          @update-label-outline="emit('updateLabelOutline', $event)"
          @update-label-bold="emit('updateLabelBold', $event)"
          @update-label-italic="emit('updateLabelItalic', $event)"
          @delete-annotation="emit('deleteAnnotation')"
          @update-line-type="emit('updateLineType', $event)"
          @update-line-color="emit('updateLineColor', $event)"
          @update-line-thickness="emit('updateLineThickness', $event)"
          @begin-surface-polygon-edit="emit('beginSurfacePolygonEdit')"
          @end-surface-polygon-edit="emit('endSurfacePolygonEdit')"
          @item-width-input="emit('itemWidthInput', $event)"
          @item-height-input="emit('itemHeightInput', $event)"
          @item-rotation-input="emit('itemRotationInput', $event)"
          @toggle-item-mirror-x="emit('toggleItemMirrorX')"
          @toggle-item-mirror-y="emit('toggleItemMirrorY')"
          @copy-item="emit('copyItem')"
          @delete-item="emit('deleteItem')"
          @draw-wall-length-input="emit('drawWallLengthInput', $event)"
          @commit-draw-wall-measure="emit('commitDrawWallMeasure')"
          @cancel-draw-wall-draft="emit('cancelDrawWallDraft')"
          @draw-room-h-input="emit('drawRoomHInput', $event)"
          @draw-room-v-input="emit('drawRoomVInput', $event)"
          @commit-draw-room-measure="emit('commitDrawRoomMeasure')"
          @cancel-draw-room-draft="emit('cancelDrawRoomDraft')"
          @accept-draw-draft="emit('acceptDrawDraft')"
          @deactivate-draw-tool="emit('deactivateDrawTool')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.fml-preview-hint {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  z-index: 10;
  margin: 0;
  padding: 6px 10px;
  font-size: 11px;
  color: #64748b;
  background: rgb(255 255 255 / 0.9);
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  pointer-events: none;
}

.fml-preview-toolbelt-dock {
  bottom: 12px;
  top: auto;
}

.fml-preview-toolbelt-tools,
.fml-preview-toolbelt-settings {
  display: contents;
}

.fml-preview-toolbelt-dock--float {
  bottom: max(8px, env(safe-area-inset-bottom, 0px));
}

.fml-preview-toolbelt-dock--float .canvas-toolbelt-dock__row {
  flex-direction: column-reverse;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  box-shadow: none;
  overflow: visible;
}

.fml-preview-toolbelt-dock--float .fml-preview-toolbelt-tools {
  display: flex;
  align-items: stretch;
  max-width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.96);
  box-shadow: 0 4px 16px rgb(15 23 42 / 0.12);
  overflow: hidden;
  pointer-events: auto;
}

.fml-preview-toolbelt-dock--float .fml-preview-toolbelt-settings {
  display: none;
  max-width: 100%;
  pointer-events: auto;
}

.fml-preview-toolbelt-dock--float .fml-preview-toolbelt-settings.is-open {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  max-height: min(42vh, 300px);
  overflow: auto;
  padding: 4px 6px;
  background: rgb(255 255 255 / 0.96);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgb(15 23 42 / 0.12);
}

.fml-preview-toolbelt-dock--float .fml-preview-toolbelt-settings :deep(.canvas-toolbelt-dock__sep) {
  display: none;
}

.fml-preview-toolbelt-dock--float
  .fml-preview-toolbelt-settings
  :deep(.canvas-toolbelt-dock__section) {
  background: transparent;
}
</style>
