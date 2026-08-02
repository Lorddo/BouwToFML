<script setup lang="ts">
import { computed } from 'vue'
import type { DoorAddSubtype, WindowAddSubtype } from '@/core/fml/opening-add-presets'
import CanvasToolbelt from './canvas/CanvasToolbelt.vue'
import FmlPreviewToolbarSettings from './FmlPreviewToolbarSettings.vue'
import { FML_EDIT_TOOLS, FML_SELECT_TOOLS, type FmlToolId } from './canvas/fmlToolbeltItems'
import './canvas/canvas-toolbelt.css'

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
      canSplit: boolean
    } | null
    selectedOpeningPanel: {
      openingIds: string[]
      count: number
      openingType: 'door' | 'window' | 'mixed'
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
    wallThicknessDraft: number
    wallThicknessMixed: boolean
    wallBalanceDraft: number
    wallBalanceMixed: boolean
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
    thicknessMinCm?: number
    thicknessMidCm?: number
    thicknessMaxCm?: number
    measureLineCount?: number
  }>(),
  {
    thicknessMinCm: 10,
    thicknessMidCm: 20,
    thicknessMaxCm: 30,
    measureLineCount: 0,
  },
)

const emit = defineEmits<{
  wallThicknessInput: [event: Event]
  commitWallThickness: []
  applyWallThickness: [thicknessCm: number]
  wallBalanceInput: [event: Event]
  commitWallBalance: []
  openingWidthInput: [event: Event]
  commitOpeningWidth: []
  openingHeightInput: [event: Event]
  commitOpeningHeight: []
  openingSillZInput: [event: Event]
  commitOpeningSillZ: []
  toggleOpeningHinge: []
  toggleOpeningSwing: []
  openingBovenlichtChange: [event: Event]
  copyOpening: []
  deleteOpenings: []
  splitWall: []
  deleteWalls: []
  clearSelection: []
  clearMeasures: []
}>()

const hint = computed(() => {
  if (activeTool.value === 'measure') {
    return 'Sleep tussen 2 punten voor maatlijn · Shift = horizontaal/verticaal · snapt aan hoekpunten · Esc = annuleren/maatlijnen wissen · spatie + sleep = pan'
  }
  if (activeTool.value === 'draw_wall') {
    return 'Sleep muurlijn · soft-snap naar hoekpunten · Shift = horizontaal/verticaal · spatie + sleep = pan · Esc = annuleren'
  }
  if (activeTool.value === 'draw_room') {
    return 'Sleep rechthoekige kamer · soft-snap naar hoekpunten · begin op bestaand eindpunt voor directe koppeling · hoek op bestaande muur splitst die muur · Shift = vierkant · Esc = annuleren'
  }
  if (activeTool.value === 'add_door') {
    return 'Klik op een muur om een deur te plaatsen · kies type en maat · spatie + sleep = pan'
  }
  if (activeTool.value === 'add_window') {
    return 'Klik op een muur om een raam te plaatsen · kies type, breedte, vloerafstand en glashoogte · spatie + sleep = pan'
  }
  if (activeTool.value === 'box_select') {
    return 'Sleep box — muren volledig binnen selectie · Shift/Ctrl+box = toevoegen · Ctrl+klik = (de)selecteer · Esc = deselecteer · spatie + sleep = pan'
  }
  if (props.selectedWallPanel) {
    const count = props.selectedWallPanel.count
    if (count === 1) {
      return '1 muur geselecteerd · pas dikte/uitlijning aan · spatie + sleep = pan · dubbelklik + sleep = schuiven (loodrecht op muur) · Ctrl+klik = (de)selecteer · Ctrl+hoekpunt-sleep = zonder snap'
    }
    return `${count} muren geselecteerd · pas dikte/uitlijning aan of verwijder de groep · spatie + sleep = pan`
  }
  if (props.selectedOpeningPanel) {
    const count = props.selectedOpeningPanel.count
    if (props.selectedOpeningPanel.openingType === 'window') {
      if (count === 1) {
        return '1 raam geselecteerd · pas breedte/vloerafstand/glashoogte aan · kopieer om opnieuw te plaatsen · sleep = verplaatsen langs muur · Ctrl+klik = (de)selecteer'
      }
      return `${count} ramen geselecteerd · pas instellingen aan of verwijder selectie · spatie + sleep = pan`
    }
    if (count === 1) {
      return '1 deur geselecteerd · pas maat/hoogte/spiegelen aan · kopieer om opnieuw te plaatsen · sleep = verplaatsen langs muur · Ctrl+klik = (de)selecteer'
    }
    return `${count} deuren geselecteerd · pas instellingen aan of verwijder selectie · spatie + sleep = pan`
  }
  return 'Kies selectie-tool · spatie + sleep = pan · dubbelklik + sleep = schuiven (loodrecht op muur) · Ctrl+klik = (de)selecteer · Esc = deselecteer · hoekpunt = verslepen (snapt aan andere uiteinden) · Ctrl+sleep = zonder snap'
})
</script>

<template>
  <p class="fml-preview-hint">{{ hint }}</p>
  <div class="canvas-toolbelt-dock fml-preview-toolbelt-dock">
    <div class="canvas-toolbelt-dock__row">
      <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--face">
        <CanvasToolbelt
          embedded
          :tools="FML_SELECT_TOOLS"
          :active-tool="activeTool"
          :show-undo="false"
          @update:active-tool="activeTool = $event as FmlToolId | null"
        />
      </div>
      <div class="canvas-toolbelt-dock__sep" aria-hidden="true" />
      <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--fml">
        <CanvasToolbelt
          embedded
          :tools="FML_EDIT_TOOLS"
          :active-tool="activeTool"
          :show-undo="false"
          @update:active-tool="activeTool = $event as FmlToolId | null"
        />
      </div>

      <FmlPreviewToolbarSettings
        v-model:active-tool="activeTool"
        v-model:add-door-subtype="addDoorSubtype"
        v-model:add-door-width-cm="addDoorWidthCm"
        v-model:add-window-subtype="addWindowSubtype"
        v-model:add-window-width-cm="addWindowWidthCm"
        v-model:add-window-sill-z-cm="addWindowSillZCm"
        v-model:add-window-height-cm="addWindowHeightCm"
        :selected-wall-panel="selectedWallPanel"
        :selected-opening-panel="selectedOpeningPanel"
        :wall-thickness-draft="wallThicknessDraft"
        :wall-thickness-mixed="wallThicknessMixed"
        :wall-balance-draft="wallBalanceDraft"
        :wall-balance-mixed="wallBalanceMixed"
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
        :thickness-min-cm="thicknessMinCm"
        :thickness-mid-cm="thicknessMidCm"
        :thickness-max-cm="thicknessMaxCm"
        :measure-line-count="measureLineCount"
        @wall-thickness-input="emit('wallThicknessInput', $event)"
        @commit-wall-thickness="emit('commitWallThickness')"
        @apply-wall-thickness="emit('applyWallThickness', $event)"
        @wall-balance-input="emit('wallBalanceInput', $event)"
        @commit-wall-balance="emit('commitWallBalance')"
        @opening-width-input="emit('openingWidthInput', $event)"
        @commit-opening-width="emit('commitOpeningWidth')"
        @opening-height-input="emit('openingHeightInput', $event)"
        @commit-opening-height="emit('commitOpeningHeight')"
        @opening-sill-z-input="emit('openingSillZInput', $event)"
        @commit-opening-sill-z="emit('commitOpeningSillZ')"
        @toggle-opening-hinge="emit('toggleOpeningHinge')"
        @toggle-opening-swing="emit('toggleOpeningSwing')"
        @opening-bovenlicht-change="emit('openingBovenlichtChange', $event)"
        @copy-opening="emit('copyOpening')"
        @delete-openings="emit('deleteOpenings')"
        @split-wall="emit('splitWall')"
        @delete-walls="emit('deleteWalls')"
        @clear-selection="emit('clearSelection')"
        @clear-measures="emit('clearMeasures')"
      />
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
</style>
