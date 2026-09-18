<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DoorAddSubtype, WindowAddSubtype } from '@/core/plan/opening-add-presets'
import type { FloorLineType } from '@/core/plan/types'
import type { OpeningSubtypeDraft } from '@/ui/composables/plan-canvas/plan-canvas-opening-draft'
import { useChromeFitScale } from '@/ui/composables/useChromeFitScale'
import CanvasToolbelt from './canvas/CanvasToolbelt.vue'
import PlanToolbarSettings from './PlanToolbarSettings.vue'
import {
  PLAN_AREA_SIDE_DIMS_TOOL_ID,
  getPlanDrawTools,
  getPlanLibraryTools,
  getPlanSelectTools,
  isPlanToolbarSettingsOpen,
  type PlanToolId,
} from './canvas/planToolbeltItems'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { BoxSelectKind } from '@/ui/composables/plan-canvas/plan-canvas-wall-select'
import './canvas/canvas-toolbelt.css'

const { t, locale } = useI18n()
const dockRef = ref<HTMLElement | null>(null)
useChromeFitScale(dockRef)

const activeTool = defineModel<PlanToolId | null>('activeTool', { default: null })
const measureDrawMode = defineModel<'tape' | 'manual' | 'slicer'>('measureDrawMode', {
  default: 'tape',
})
const boxSelectKind = defineModel<BoxSelectKind>('boxSelectKind', { default: 'wall' })
const slicerEditMode = defineModel<boolean>('slicerEditMode', { default: false })
const addDoorSubtype = defineModel<DoorAddSubtype>('addDoorSubtype', { default: 'standard' })
const addDoorWidthCm = defineModel<number>('addDoorWidthCm', { default: 90 })
const addDoorSillZCm = defineModel<number>('addDoorSillZCm', { default: 0 })
const addWindowSubtype = defineModel<WindowAddSubtype>('addWindowSubtype', { default: 'single' })
const addWindowWidthCm = defineModel<number>('addWindowWidthCm', { default: 100 })
const addWindowSillZCm = defineModel<number>('addWindowSillZCm', { default: 70 })
const addWindowHeightCm = defineModel<number>('addWindowHeightCm', { default: 150 })
const areaSideDimsVisible = defineModel<boolean>('areaSideDimsVisible', { default: false })
const drawSurfaceRole = defineModel<number | null>('drawSurfaceRole', { default: null })
const drawSurfaceCutout = defineModel<boolean>('drawSurfaceCutout', { default: false })
const drawRoofKind = defineModel<'plane' | 'dormer'>('drawRoofKind')
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
      ridgeCount?: number
      mode?: 'quick' | 'full'
    } | null
    selectedFacadeGroupPanel?: {
      groupId: string
      name: string
      wallCount: number
      floorCount: number
    } | null
    selectedJunctionPanel: {
      junctionId: string
      wallCount: number
      heightCm: number | null
      heightMixed: boolean
      ridgeCount?: number
    } | null
    selectedOpeningPanel: {
      openingIds: string[]
      count: number
      mode?: 'quick' | 'full'
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
      isCutout?: boolean
      liningCm?: number | null
    } | null
    roomTypes: ReadonlyArray<{ role: number; name: string; color: string }>
    surfaceEditActive?: boolean
    roofVertexZCm?: number | null
    roofVertexIndex?: number | null
    roofKind?: 'plane' | 'dormer'
    roofParentId?: string | null
    parentRoofOptions?: ReadonlyArray<{ id: string; label: string }>
    dakThicknessCm?: number
    slabThicknessCm?: number
    /** draw_surface in toolbelt; default true (viewer). */
    includeSurfaceTool?: boolean
    /** draw_roof in toolbelt (plattegrond); default false. */
    includeRoofTool?: boolean
    dakMode?: boolean
    roofPolyMutate?: boolean
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
    selectedDimensionPanel?: {
      id: string
      lengthCm: number
    } | null
    selectedItemPanel?: {
      id: string
      label: string
      widthCm: number
      heightCm: number
      rotationDeg: number
      mirroredX: boolean
      mirroredY: boolean
      showFrame?: boolean
      showRoofPose?: boolean
      zCm?: number
      pitchDeg?: number
      frameLeftCm?: number
      frameRightCm?: number
      frameTopCm?: number
      frameBottomCm?: number
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
    wallBottomZDraft?: number
    wallBottomZMixed?: boolean
    junctionHeightDraft: number
    junctionHeightMixed: boolean
    junctionBottomZDraft?: number
    junctionBottomZMixed?: boolean
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
    openingFrameLeftDraft?: number
    openingFrameLeftMixed?: boolean
    openingFrameRightDraft?: number
    openingFrameRightMixed?: boolean
    openingFrameTopDraft?: number
    openingFrameTopMixed?: boolean
    openingFrameBottomDraft?: number
    openingFrameBottomMixed?: boolean
    bovenlichtPacked?: boolean
    showOpeningFrameEdit?: boolean
    thicknessPresetCms?: number[]
    measureLineCount?: number
    measurePersistEnabled?: boolean
    drawWallDrafting?: boolean
    drawWallMeasureLengthCm?: number
    wallMoveDrafting?: boolean
    drawRoomDrafting?: boolean
    drawRoomMeasureHCm?: number
    drawRoomMeasureVCm?: number
    /** Schaalliniaal-eenheid voor typ-hints (m/cm/mm/ft-in). */
    drawInputUnit?: ScaleInputUnit
    drawLineDrafting?: boolean
    drawSurfaceDrafting?: boolean
    facadeGroupsEnabled?: boolean
    facadeGroupOptions?: Array<{ id: string; code: string; name: string }>
    facadeGroupChecks?: Record<string, boolean | null>
    /** Workspace: alleen Stempel-preset (geen nieuwe groep / rename). */
    facadeGroupsStampPreset?: boolean
    /** Editor: Stempel-select naast gevel. */
    stampGroupEnabled?: boolean
    stampGroupDraft?: boolean | null
    stampGroupMixed?: boolean
    canSelectStampMembers?: boolean
    drawWallKind?: 'wall' | 'ridge'
    drawRoomKind?: 'room' | 'dormer'
    ridgeZCm?: number | null
    ridgeFloorDraft?: number | null
    ridgeFloorMixed?: boolean
    ridgeFloorOptions?: ReadonlyArray<{ index: number; name: string }>
  }>(),
  {
    thicknessPresetCms: () => [10, 20, 30],
    measureLineCount: 0,
    measurePersistEnabled: false,
    drawWallDrafting: false,
    drawWallMeasureLengthCm: 0,
    wallMoveDrafting: false,
    drawRoomDrafting: false,
    drawRoomMeasureHCm: 0,
    drawRoomMeasureVCm: 0,
    drawInputUnit: 'm',
    drawLineDrafting: false,
    drawSurfaceDrafting: false,
    facadeGroupsEnabled: false,
    facadeGroupOptions: () => [],
    facadeGroupChecks: () => ({}),
    facadeGroupsStampPreset: false,
    stampGroupEnabled: false,
    stampGroupDraft: false,
    stampGroupMixed: false,
    canSelectStampMembers: false,
    drawWallKind: 'wall',
    drawRoomKind: 'room',
    bovenlichtPacked: true,
    showOpeningFrameEdit: true,
    ridgeZCm: null,
    ridgeFloorDraft: null,
    ridgeFloorMixed: false,
    ridgeFloorOptions: () => [],
    selectedAreaPanel: null,
    selectedFacadeGroupPanel: null,
    selectedJunctionPanel: null,
    roomTypes: () => [],
    surfaceEditActive: false,
    roofVertexZCm: null,
    roofVertexIndex: null,
    roofKind: 'plane',
    roofParentId: null,
    parentRoofOptions: () => [],
    dakThicknessCm: 20,
    slabThicknessCm: 20,
    includeSurfaceTool: false,
    includeRoofTool: false,
    dakMode: false,
    roofPolyMutate: false,
    includeAnnotationTools: false,
    includeFixtureTool: false,
    selectedLabelPanel: null,
    selectedLinePanel: null,
    selectedDimensionPanel: null,
    selectedItemPanel: null,
    hideInlineHint: false,
    floatingDock: false,
    hideSelectTools: false,
  },
)

const emit = defineEmits<{
  wallThicknessCm: [cm: number]
  commitWallThickness: []
  applyWallThickness: [thicknessCm: number]
  wallBalanceInput: [event: Event]
  commitWallBalance: []
  wallHeightCm: [cm: number]
  commitWallHeight: []
  wallBottomZCm: [cm: number]
  commitWallBottomZ: []
  junctionHeightCm: [cm: number]
  commitJunctionHeight: []
  junctionBottomZCm: [cm: number]
  commitJunctionBottomZ: []
  commitOpeningSubtype: [subtype: OpeningSubtypeDraft]
  openingWidthCm: [cm: number]
  commitOpeningWidth: []
  openingHeightCm: [cm: number]
  commitOpeningHeight: []
  openingSillZCm: [cm: number]
  commitOpeningSillZ: []
  toggleOpeningHinge: []
  toggleOpeningSwing: []
  openingBovenlichtChange: [event: Event]
  openingBovenlichtHeightCm: [cm: number]
  commitOpeningBovenlichtHeight: []
  openingBovenlichtGapCm: [cm: number]
  commitOpeningBovenlichtGap: []
  openingFrameLeftCm: [cm: number]
  commitOpeningFrameLeft: []
  openingFrameRightCm: [cm: number]
  commitOpeningFrameRight: []
  openingFrameTopCm: [cm: number]
  commitOpeningFrameTop: []
  openingFrameBottomCm: [cm: number]
  commitOpeningFrameBottom: []
  copyOpening: []
  deleteOpenings: []
  splitWall: []
  deleteWalls: []
  clearSelection: []
  facadeGroupChange: [value: string]
  facadeGroupRemove: [groupId: string]
  selectFacadeMembers: [groupId: string]
  stampGroupChange: [enabled: boolean]
  selectStampMembers: []
  wallKindChange: [kind: 'wall' | 'ridge']
  roomKindChange: [kind: 'room' | 'dormer']
  ridgeZInput: [cm: number | null]
  ridgeFloorChange: [floorIndex: number]
  clearMeasures: []
  applyRoomType: [role: number]
  areaCustomNameInput: [customName: string]
  applyAreaCustomName: [customName: string]
  applyAreaColor: [color: string]
  applyShowAreaLabel: [show: boolean]
  applySurfaceCutout: [isCutout: boolean]
  applyAreaLiningCm: [cm: number]
  applyRoofKind: [kind: 'plane' | 'dormer']
  applyRoofParentId: [parentId: string | null]
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
  roofVertexZInput: [cm: number]
  itemWidthCm: [cm: number]
  itemHeightCm: [cm: number]
  itemZCm: [cm: number]
  itemPitchInput: [event: Event]
  itemRotationInput: [event: Event]
  toggleItemMirrorX: []
  toggleItemMirrorY: []
  itemFrameLeft: [cm: number]
  itemFrameRight: [cm: number]
  itemFrameTop: [cm: number]
  itemFrameBottom: [cm: number]
  copyItem: []
  deleteItem: []
  dimensionLengthCm: [cm: number]
  deleteDimension: []
  drawWallLengthInput: [cm: number | null]
  commitDrawWallMeasure: []
  cancelDrawWallDraft: []
  drawRoomHInput: [cm: number | null]
  drawRoomVInput: [cm: number | null]
  commitDrawRoomMeasure: []
  cancelDrawRoomDraft: []
  acceptDrawDraft: []
  deactivateDrawTool: []
  boxSelectAll: []
}>()

const selectTools = computed(() => {
  void locale.value
  return getPlanSelectTools()
})

const selectPressedIds = computed(() =>
  areaSideDimsVisible.value ? [PLAN_AREA_SIDE_DIMS_TOOL_ID] : [],
)

function onSelectTogglePressed(id: string): void {
  if (id === PLAN_AREA_SIDE_DIMS_TOOL_ID) {
    areaSideDimsVisible.value = !areaSideDimsVisible.value
  }
}

const drawTools = computed(() => {
  void locale.value
  return getPlanDrawTools({
    includeSurface: props.includeSurfaceTool === true,
    includeRoof: props.includeRoofTool === true,
    includeAnnotations: props.includeAnnotationTools === true,
    dakMode: props.dakMode === true,
  })
})

const libraryTools = computed(() => {
  void locale.value
  return getPlanLibraryTools({
    includeFixture: props.includeFixtureTool === true,
  })
})

const settingsOpen = computed(() =>
  isPlanToolbarSettingsOpen({
    hasWallSelection: props.selectedWallPanel != null,
    hasJunctionSelection: props.selectedJunctionPanel != null,
    hasOpeningSelection: props.selectedOpeningPanel != null,
    hasAreaSelection: props.selectedAreaPanel != null,
    hasLabelSelection: props.selectedLabelPanel != null,
    hasLineSelection: props.selectedLinePanel != null,
    hasItemSelection: props.selectedItemPanel != null,
    hasDimensionSelection: props.selectedDimensionPanel != null,
    hasFacadeGroupSelection: props.selectedFacadeGroupPanel != null,
    hasMeasureLines: (props.measureLineCount ?? 0) > 0,
    activeTool: activeTool.value,
    dakMode: props.dakMode === true,
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
  const unit = props.drawInputUnit
  if (activeTool.value === 'draw_wall') return t('result.toolbar.hintDrawWall', { unit })
  if (activeTool.value === 'draw_room') {
    return props.drawRoomKind === 'dormer'
      ? t('result.toolbar.hintDrawDormer', { unit })
      : t('result.toolbar.hintDrawRoom', { unit })
  }
  if (activeTool.value === 'draw_surface' && (props.dakMode || props.includeSurfaceTool === true)) {
    return props.dakMode ? t('result.toolbar.hintDrawRoof') : t('result.toolbar.hintDrawSurface')
  }
  if (activeTool.value === 'draw_roof' && props.includeRoofTool === true) {
    return t('result.toolbar.hintDrawRoof')
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
  if (activeTool.value === 'box_select') {
    if (boxSelectKind.value === 'door') return t('result.toolbar.hintBoxSelectDoor')
    if (boxSelectKind.value === 'window') return t('result.toolbar.hintBoxSelectWindow')
    if (boxSelectKind.value === 'all') return t('result.toolbar.hintBoxSelectMixed')
    return t('result.toolbar.hintBoxSelect')
  }
  if (props.selectedLabelPanel && props.includeAnnotationTools === true) {
    return t('result.toolbar.hintLabelSelected')
  }
  if (props.selectedLinePanel && props.includeAnnotationTools === true) {
    return t('result.toolbar.hintLineSelected')
  }
  if (props.selectedDimensionPanel) {
    return t('result.toolbar.hintDimensionSelected')
  }
  if (props.dakMode && props.selectedAreaPanel?.kind === 'surface') {
    return props.roofPolyMutate
      ? t('result.toolbar.hintRoofMutate')
      : t('result.toolbar.hintRoofSelected')
  }
  if (props.selectedAreaPanel && props.includeSurfaceTool === true) {
    return props.selectedAreaPanel.kind === 'surface'
      ? t('result.toolbar.hintSurfaceSelected')
      : t('result.toolbar.hintAreaSelected')
  }
  if (props.wallMoveDrafting) return t('result.toolbar.hintWallMove', { unit: props.drawInputUnit })
  if (props.selectedWallPanel) {
    const count = props.selectedWallPanel.count
    if (count === 1) return t('result.toolbar.hintWallOne', { unit: props.drawInputUnit })
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
  <p v-if="!hideInlineHint" class="plan-canvas-hint">{{ hint }}</p>
  <div
    ref="dockRef"
    class="canvas-toolbelt-dock plan-canvas-toolbelt-dock"
    :class="{ 'plan-canvas-toolbelt-dock--float': props.floatingDock }"
    :data-fit-chrome="props.floatingDock ? undefined : 'bottom'"
    @pointerdown.stop
    @mousedown.stop
    @mousemove.stop
    @click.stop
  >
    <div class="canvas-toolbelt-dock__row">
      <div
        v-show="showDrawingTools"
        class="plan-canvas-toolbelt-tools"
        :data-fit-chrome="props.floatingDock ? 'bottom' : undefined"
      >
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
            @update:active-tool="activeTool = $event as PlanToolId | null"
            @toggle-pressed="onSelectTogglePressed"
          />
        </div>
        <div
          v-if="!props.hideSelectTools && !props.dakMode"
          class="canvas-toolbelt-dock__sep"
          aria-hidden="true"
        />
        <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--plan">
          <CanvasToolbelt
            embedded
            :tools="drawTools"
            :active-tool="activeTool"
            :show-undo="false"
            @update:active-tool="activeTool = $event as PlanToolId | null"
          />
        </div>
        <div v-if="!props.dakMode" class="canvas-toolbelt-dock__sep" aria-hidden="true" />
        <div
          v-if="!props.dakMode"
          class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--face"
        >
          <CanvasToolbelt
            embedded
            :tools="libraryTools"
            :active-tool="activeTool"
            :show-undo="false"
            @update:active-tool="activeTool = $event as PlanToolId | null"
          />
        </div>
      </div>

      <div class="plan-canvas-toolbelt-settings" :class="{ 'is-open': settingsOpen }">
        <PlanToolbarSettings
          v-model:active-tool="activeTool"
          v-model:add-door-subtype="addDoorSubtype"
          v-model:add-door-width-cm="addDoorWidthCm"
          v-model:add-door-sill-z-cm="addDoorSillZCm"
          v-model:add-window-subtype="addWindowSubtype"
          v-model:add-window-width-cm="addWindowWidthCm"
          v-model:add-window-sill-z-cm="addWindowSillZCm"
          v-model:add-window-height-cm="addWindowHeightCm"
          v-model:measure-draw-mode="measureDrawMode"
          v-model:box-select-kind="boxSelectKind"
          v-model:slicer-edit-mode="slicerEditMode"
          v-model:draw-surface-role="drawSurfaceRole"
          v-model:draw-surface-cutout="drawSurfaceCutout"
          v-model:draw-roof-kind="drawRoofKind"
          v-model:draw-line-thickness="drawLineThickness"
          v-model:draw-line-type="drawLineType"
          v-model:draw-line-color="drawLineColor"
          v-model:draw-label-text="drawLabelText"
          v-model:draw-label-font-size="drawLabelFontSize"
          v-model:draw-label-font-color="drawLabelFontColor"
          v-model:draw-label-outline="drawLabelOutline"
          v-model:draw-label-bold="drawLabelBold"
          v-model:draw-label-italic="drawLabelItalic"
          :selected-wall-panel="selectedWallPanel"
          :selected-facade-group-panel="selectedFacadeGroupPanel"
          :selected-junction-panel="selectedJunctionPanel"
          :selected-opening-panel="selectedOpeningPanel"
          :selected-area-panel="selectedAreaPanel"
          :selected-label-panel="selectedLabelPanel"
          :selected-line-panel="selectedLinePanel"
          :selected-dimension-panel="selectedDimensionPanel"
          :selected-item-panel="selectedItemPanel"
          :unit="drawInputUnit"
          :room-types="roomTypes"
          :surface-edit-active="surfaceEditActive"
          :roof-vertex-z-cm="roofVertexZCm"
          :roof-vertex-index="roofVertexIndex"
          :roof-poly-mutate="roofPolyMutate"
          :roof-kind="roofKind"
          :roof-parent-id="roofParentId"
          :parent-roof-options="parentRoofOptions"
          :dak-thickness-cm="dakThicknessCm"
          :slab-thickness-cm="slabThicknessCm"
          :wall-thickness-draft="wallThicknessDraft"
          :wall-thickness-mixed="wallThicknessMixed"
          :wall-balance-draft="wallBalanceDraft"
          :wall-balance-mixed="wallBalanceMixed"
          :wall-height-draft="wallHeightDraft"
          :wall-height-mixed="wallHeightMixed"
          :wall-bottom-z-draft="wallBottomZDraft"
          :wall-bottom-z-mixed="wallBottomZMixed"
          :junction-height-draft="junctionHeightDraft"
          :junction-height-mixed="junctionHeightMixed"
          :junction-bottom-z-draft="junctionBottomZDraft"
          :junction-bottom-z-mixed="junctionBottomZMixed"
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
          :opening-frame-left-draft="openingFrameLeftDraft"
          :opening-frame-left-mixed="openingFrameLeftMixed"
          :opening-frame-right-draft="openingFrameRightDraft"
          :opening-frame-right-mixed="openingFrameRightMixed"
          :opening-frame-top-draft="openingFrameTopDraft"
          :opening-frame-top-mixed="openingFrameTopMixed"
          :opening-frame-bottom-draft="openingFrameBottomDraft"
          :opening-frame-bottom-mixed="openingFrameBottomMixed"
          :bovenlicht-packed="bovenlichtPacked"
          :show-opening-frame-edit="showOpeningFrameEdit"
          :thickness-preset-cms="thicknessPresetCms"
          :measure-line-count="measureLineCount"
          :measure-persist-enabled="measurePersistEnabled"
          :draw-wall-drafting="drawWallDrafting"
          :wall-move-drafting="wallMoveDrafting"
          :draw-wall-measure-length-cm="drawWallMeasureLengthCm"
          :draw-room-drafting="drawRoomDrafting"
          :draw-room-measure-h-cm="drawRoomMeasureHCm"
          :draw-room-measure-v-cm="drawRoomMeasureVCm"
          :draw-line-drafting="drawLineDrafting"
          :draw-surface-drafting="drawSurfaceDrafting"
          :facade-groups-enabled="facadeGroupsEnabled"
          :facade-group-options="facadeGroupOptions"
          :facade-group-checks="facadeGroupChecks"
          :facade-groups-stamp-preset="facadeGroupsStampPreset"
          :stamp-group-enabled="stampGroupEnabled"
          :stamp-group-draft="stampGroupDraft"
          :stamp-group-mixed="stampGroupMixed"
          :can-select-stamp-members="canSelectStampMembers"
          :draw-wall-kind="drawWallKind"
          :draw-room-kind="drawRoomKind"
          :dak-mode="dakMode"
          :ridge-floor-draft="ridgeFloorDraft"
          :ridge-floor-mixed="ridgeFloorMixed"
          :ridge-floor-options="ridgeFloorOptions"
          :ridge-z-cm="ridgeZCm"
          @wall-thickness-cm="emit('wallThicknessCm', $event)"
          @commit-wall-thickness="emit('commitWallThickness')"
          @apply-wall-thickness="emit('applyWallThickness', $event)"
          @wall-balance-input="emit('wallBalanceInput', $event)"
          @commit-wall-balance="emit('commitWallBalance')"
          @wall-height-cm="emit('wallHeightCm', $event)"
          @commit-wall-height="emit('commitWallHeight')"
          @wall-bottom-z-cm="emit('wallBottomZCm', $event)"
          @commit-wall-bottom-z="emit('commitWallBottomZ')"
          @junction-height-cm="emit('junctionHeightCm', $event)"
          @commit-junction-height="emit('commitJunctionHeight')"
          @junction-bottom-z-cm="emit('junctionBottomZCm', $event)"
          @commit-junction-bottom-z="emit('commitJunctionBottomZ')"
          @commit-opening-subtype="emit('commitOpeningSubtype', $event)"
          @opening-width-cm="emit('openingWidthCm', $event)"
          @commit-opening-width="emit('commitOpeningWidth')"
          @opening-height-cm="emit('openingHeightCm', $event)"
          @commit-opening-height="emit('commitOpeningHeight')"
          @opening-sill-z-cm="emit('openingSillZCm', $event)"
          @commit-opening-sill-z="emit('commitOpeningSillZ')"
          @toggle-opening-hinge="emit('toggleOpeningHinge')"
          @toggle-opening-swing="emit('toggleOpeningSwing')"
          @opening-bovenlicht-change="emit('openingBovenlichtChange', $event)"
          @opening-bovenlicht-height-cm="emit('openingBovenlichtHeightCm', $event)"
          @commit-opening-bovenlicht-height="emit('commitOpeningBovenlichtHeight')"
          @opening-bovenlicht-gap-cm="emit('openingBovenlichtGapCm', $event)"
          @commit-opening-bovenlicht-gap="emit('commitOpeningBovenlichtGap')"
          @opening-frame-left-cm="emit('openingFrameLeftCm', $event)"
          @commit-opening-frame-left="emit('commitOpeningFrameLeft')"
          @opening-frame-right-cm="emit('openingFrameRightCm', $event)"
          @commit-opening-frame-right="emit('commitOpeningFrameRight')"
          @opening-frame-top-cm="emit('openingFrameTopCm', $event)"
          @commit-opening-frame-top="emit('commitOpeningFrameTop')"
          @opening-frame-bottom-cm="emit('openingFrameBottomCm', $event)"
          @commit-opening-frame-bottom="emit('commitOpeningFrameBottom')"
          @copy-opening="emit('copyOpening')"
          @delete-openings="emit('deleteOpenings')"
          @split-wall="emit('splitWall')"
          @delete-walls="emit('deleteWalls')"
          @facade-group-change="emit('facadeGroupChange', $event)"
          @facade-group-remove="emit('facadeGroupRemove', $event)"
          @select-facade-members="emit('selectFacadeMembers', $event)"
          @stamp-group-change="emit('stampGroupChange', $event)"
          @select-stamp-members="emit('selectStampMembers')"
          @wall-kind-change="emit('wallKindChange', $event)"
          @room-kind-change="emit('roomKindChange', $event)"
          @ridge-z-input="emit('ridgeZInput', $event)"
          @ridge-floor-change="emit('ridgeFloorChange', $event)"
          @clear-selection="emit('clearSelection')"
          @clear-measures="emit('clearMeasures')"
          @apply-room-type="emit('applyRoomType', $event)"
          @area-custom-name-input="emit('areaCustomNameInput', $event)"
          @apply-area-custom-name="emit('applyAreaCustomName', $event)"
          @apply-area-color="emit('applyAreaColor', $event)"
          @apply-show-area-label="emit('applyShowAreaLabel', $event)"
          @apply-surface-cutout="emit('applySurfaceCutout', $event)"
          @apply-area-lining-cm="emit('applyAreaLiningCm', $event)"
          @apply-roof-kind="emit('applyRoofKind', $event)"
          @apply-roof-parent-id="emit('applyRoofParentId', $event)"
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
          @roof-vertex-z-input="emit('roofVertexZInput', $event)"
          @item-width-cm="emit('itemWidthCm', $event)"
          @item-height-cm="emit('itemHeightCm', $event)"
          @item-z-cm="emit('itemZCm', $event)"
          @item-pitch-input="emit('itemPitchInput', $event)"
          @item-rotation-input="emit('itemRotationInput', $event)"
          @toggle-item-mirror-x="emit('toggleItemMirrorX')"
          @toggle-item-mirror-y="emit('toggleItemMirrorY')"
          @item-frame-left="emit('itemFrameLeft', $event)"
          @item-frame-right="emit('itemFrameRight', $event)"
          @item-frame-top="emit('itemFrameTop', $event)"
          @item-frame-bottom="emit('itemFrameBottom', $event)"
          @copy-item="emit('copyItem')"
          @delete-item="emit('deleteItem')"
          @dimension-length-cm="emit('dimensionLengthCm', $event)"
          @delete-dimension="emit('deleteDimension')"
          @draw-wall-length-input="emit('drawWallLengthInput', $event)"
          @commit-draw-wall-measure="emit('commitDrawWallMeasure')"
          @cancel-draw-wall-draft="emit('cancelDrawWallDraft')"
          @draw-room-h-input="emit('drawRoomHInput', $event)"
          @draw-room-v-input="emit('drawRoomVInput', $event)"
          @commit-draw-room-measure="emit('commitDrawRoomMeasure')"
          @cancel-draw-room-draft="emit('cancelDrawRoomDraft')"
          @accept-draw-draft="emit('acceptDrawDraft')"
          @deactivate-draw-tool="emit('deactivateDrawTool')"
          @box-select-all="emit('boxSelectAll')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan-canvas-hint {
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

.plan-canvas-toolbelt-dock {
  bottom: 12px;
  top: auto;
}

.plan-canvas-toolbelt-tools,
.plan-canvas-toolbelt-settings {
  display: contents;
}

.plan-canvas-toolbelt-dock--float {
  bottom: max(8px, env(safe-area-inset-bottom, 0px));
}

.plan-canvas-toolbelt-dock--float .canvas-toolbelt-dock__row {
  flex-direction: column-reverse;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  box-shadow: none;
  overflow: visible;
}

.plan-canvas-toolbelt-dock--float .plan-canvas-toolbelt-tools {
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

.plan-canvas-toolbelt-dock--float .plan-canvas-toolbelt-settings {
  display: none;
  max-width: 100%;
  pointer-events: auto;
}

.plan-canvas-toolbelt-dock--float .plan-canvas-toolbelt-settings.is-open {
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

.plan-canvas-toolbelt-dock--float .plan-canvas-toolbelt-settings :deep(.canvas-toolbelt-dock__sep) {
  display: none;
}

.plan-canvas-toolbelt-dock--float
  .plan-canvas-toolbelt-settings
  :deep(.canvas-toolbelt-dock__section) {
  background: transparent;
}
</style>
