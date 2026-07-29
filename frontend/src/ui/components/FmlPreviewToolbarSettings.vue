<script setup lang="ts">
import { computed } from 'vue'
import type { DoorAddSubtype, WindowAddSubtype } from '@/core/fml/opening-add-presets'
import type { FmlToolId } from './canvas/fmlToolbeltItems'
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
  copyOpening: []
  deleteOpenings: []
  splitWall: []
  deleteWalls: []
  clearSelection: []
  clearMeasures: []
}>()

const thicknessPresets = computed(() => [
  { id: 'min' as const, label: 'Min', cm: props.thicknessMinCm },
  { id: 'mid' as const, label: 'Middel', cm: props.thicknessMidCm },
  { id: 'max' as const, label: 'Max', cm: props.thicknessMaxCm },
])

const isDrawWallOrRoom = computed(
  () => activeTool.value === 'draw_wall' || activeTool.value === 'draw_room',
)

/** Matcht draft op min/mid/max; leeg = handmatige overschrijving. */
const drawThicknessBand = computed<'min' | 'mid' | 'max' | ''>(() => {
  if (props.wallThicknessMixed) return ''
  const cm = Math.round(props.wallThicknessDraft)
  if (cm === Math.round(props.thicknessMinCm)) return 'min'
  if (cm === Math.round(props.thicknessMidCm)) return 'mid'
  if (cm === Math.round(props.thicknessMaxCm)) return 'max'
  return ''
})

function onDrawThicknessBandChange(event: Event): void {
  const band = (event.target as HTMLSelectElement).value as 'min' | 'mid' | 'max' | ''
  const preset = thicknessPresets.value.find((item) => item.id === band)
  if (!preset) return
  emit('applyWallThickness', preset.cm)
}

const doorSubtypeOptions: { value: DoorAddSubtype; label: string }[] = [
  { value: 'standard', label: 'Standaard' },
  { value: 'closet', label: 'Kast' },
  { value: 'double', label: 'Dubbel' },
  { value: 'pocket', label: 'Pocketdeur' },
  { value: 'sliding_single', label: 'Schuifpui (1)' },
  { value: 'sliding', label: 'Schuifpui (2)' },
  { value: 'garage', label: 'Garagedeur' },
]

const windowSubtypeOptions: { value: WindowAddSubtype; label: string }[] = [
  { value: 'single', label: 'Enkel' },
  { value: 'double', label: 'Dubbel' },
  { value: 'triple', label: 'Triple' },
  { value: 'round', label: 'Rond' },
  { value: 'half_round', label: 'Half-rond' },
]

const openingKindLabel = computed(() => {
  const panel = props.selectedOpeningPanel
  if (!panel) return ''
  if (panel.openingType === 'window') {
    return panel.count === 1 ? '1 raam' : `${panel.count} ramen`
  }
  if (panel.openingType === 'mixed') {
    return `${panel.count} openingen`
  }
  return panel.count === 1 ? '1 deur' : `${panel.count} deuren`
})

const isDoorSelection = computed(() => props.selectedOpeningPanel?.openingType === 'door')
const isWindowSelection = computed(() => props.selectedOpeningPanel?.openingType === 'window')
const canCopyOpening = computed(() => props.selectedOpeningPanel?.count === 1)

const openingHingeTitle = computed(() => {
  if (props.openingHingeMixed) return 'Scharnier: gemengd — klik om te wisselen'
  return props.openingHingeAtStartDraft
    ? 'Scharnier: start — klik om naar eind te zetten'
    : 'Scharnier: eind — klik om naar start te zetten'
})

const openingSwingTitle = computed(() => {
  if (props.openingSwingMixed) return 'Zwaai: gemengd — klik om te wisselen'
  return props.openingSwingRightDraft
    ? 'Zwaai: rechts — klik om naar links te zetten'
    : 'Zwaai: links — klik om naar rechts te zetten'
})

const showSettings = computed(
  () =>
    props.selectedWallPanel != null ||
    props.selectedOpeningPanel != null ||
    activeTool.value === 'draw_wall' ||
    activeTool.value === 'draw_room' ||
    activeTool.value === 'add_door' ||
    activeTool.value === 'add_window',
)

const showMeasureStrip = computed(
  () => activeTool.value === 'measure' && (props.measureLineCount ?? 0) > 0,
)
</script>

<template>
  <template v-if="showSettings">
    <div class="canvas-toolbelt-dock__sep" aria-hidden="true" />
    <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--fml">
      <span v-if="selectedWallPanel" class="fml-toolbelt__meta">
        {{ selectedWallPanel.count === 1 ? '1 muur' : `${selectedWallPanel.count} muren` }}
      </span>
      <span v-if="selectedOpeningPanel" class="fml-toolbelt__meta">
        {{ openingKindLabel }}
      </span>
      <div v-if="selectedWallPanel || isDrawWallOrRoom" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">{{ isDrawWallOrRoom ? 'Muurtype' : 'Dikte' }}</span>
        <div class="fml-toolbelt__field-controls">
          <select
            v-if="isDrawWallOrRoom"
            class="fml-toolbelt__select fml-toolbelt__select--thickness"
            aria-label="Muurtype (dikte)"
            :value="drawThicknessBand"
            @change="onDrawThicknessBandChange"
          >
            <option v-if="drawThicknessBand === ''" value="" disabled>Aangepast</option>
            <option v-for="preset in thicknessPresets" :key="preset.id" :value="preset.id">
              {{ preset.label }} ({{ preset.cm }} cm)
            </option>
          </select>
          <input
            type="number"
            min="1"
            max="200"
            step="1"
            class="fml-toolbelt__thickness-input"
            aria-label="Muurdikte in cm"
            :value="wallThicknessMixed ? '' : wallThicknessDraft"
            :placeholder="wallThicknessMixed ? '—' : undefined"
            @input="emit('wallThicknessInput', $event)"
            @change="emit('commitWallThickness')"
          />
          <span class="fml-toolbelt__unit">cm</span>
          <div
            v-if="selectedWallPanel"
            class="fml-toolbelt__presets"
            role="group"
            aria-label="Dikte presets"
          >
            <button
              v-for="preset in thicknessPresets"
              :key="preset.id"
              type="button"
              class="fml-toolbelt__preset-btn"
              :title="`Zet geselecteerde muren op ${preset.label.toLowerCase()} (${preset.cm} cm)`"
              :aria-label="`${preset.label} dikte ${preset.cm} cm`"
              @click="emit('applyWallThickness', preset.cm)"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="selectedWallPanel" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label" title="Hartlijn-offset in muurband"
          >Uitlijning</span
        >
        <div class="fml-toolbelt__field-controls">
          <input
            type="range"
            min="0.25"
            max="0.8"
            step="0.05"
            class="fml-toolbelt__balance-input"
            aria-label="Muuruitlijning (balance)"
            :value="wallBalanceMixed ? 0.5 : wallBalanceDraft"
            :disabled="wallBalanceMixed"
            @input="emit('wallBalanceInput', $event)"
            @change="emit('commitWallBalance')"
          />
          <span class="fml-toolbelt__unit">{{
            wallBalanceMixed ? '—' : wallBalanceDraft.toFixed(2)
          }}</span>
        </div>
      </div>
      <div v-if="selectedOpeningPanel" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">Breedte</span>
        <div class="fml-toolbelt__field-controls">
          <input
            type="number"
            min="10"
            max="400"
            step="1"
            class="fml-toolbelt__thickness-input"
            :aria-label="isWindowSelection ? 'Raambreedte in cm' : 'Deurbreedte in cm'"
            :value="openingWidthMixed ? '' : openingWidthDraft"
            :placeholder="openingWidthMixed ? '—' : undefined"
            @input="emit('openingWidthInput', $event)"
            @change="emit('commitOpeningWidth')"
          />
          <span class="fml-toolbelt__unit">cm</span>
        </div>
      </div>
      <div v-if="activeTool === 'add_door'" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">Deurtype</span>
        <div class="fml-toolbelt__field-controls">
          <select v-model="addDoorSubtype" class="fml-toolbelt__select" aria-label="Deurtype">
            <option v-for="opt in doorSubtypeOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>
      <div v-if="activeTool === 'add_door'" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">Maat</span>
        <div class="fml-toolbelt__field-controls">
          <input
            v-model.number="addDoorWidthCm"
            type="number"
            min="10"
            max="400"
            step="1"
            class="fml-toolbelt__thickness-input"
            aria-label="Deurmaat in cm"
          />
          <span class="fml-toolbelt__unit">cm</span>
        </div>
      </div>
      <div v-if="activeTool === 'add_window'" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">Raamtype</span>
        <div class="fml-toolbelt__field-controls">
          <select v-model="addWindowSubtype" class="fml-toolbelt__select" aria-label="Raamtype">
            <option v-for="opt in windowSubtypeOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>
      <div v-if="activeTool === 'add_window'" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">Maat</span>
        <div class="fml-toolbelt__field-controls">
          <input
            v-model.number="addWindowWidthCm"
            type="number"
            min="10"
            max="400"
            step="1"
            class="fml-toolbelt__thickness-input"
            aria-label="Raammaat in cm"
          />
          <span class="fml-toolbelt__unit">cm</span>
        </div>
      </div>
      <div v-if="activeTool === 'add_window'" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">Vloer</span>
        <div class="fml-toolbelt__field-controls">
          <input
            v-model.number="addWindowSillZCm"
            type="number"
            min="0"
            max="400"
            step="1"
            class="fml-toolbelt__thickness-input"
            aria-label="Afstand van vloer in cm"
          />
          <span class="fml-toolbelt__unit">cm</span>
        </div>
      </div>
      <div v-if="activeTool === 'add_window'" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">Glas</span>
        <div class="fml-toolbelt__field-controls">
          <input
            v-model.number="addWindowHeightCm"
            type="number"
            min="50"
            max="500"
            step="1"
            class="fml-toolbelt__thickness-input"
            aria-label="Glashoogte in cm"
          />
          <span class="fml-toolbelt__unit">cm</span>
        </div>
      </div>
      <div v-if="isDoorSelection" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">Hoogte</span>
        <div class="fml-toolbelt__field-controls">
          <input
            type="number"
            min="50"
            max="500"
            step="1"
            class="fml-toolbelt__thickness-input"
            aria-label="Deurhoogte in cm"
            :value="openingHeightMixed ? '' : openingHeightDraft"
            :placeholder="openingHeightMixed ? '—' : undefined"
            @input="emit('openingHeightInput', $event)"
            @change="emit('commitOpeningHeight')"
          />
          <span class="fml-toolbelt__unit">cm</span>
        </div>
      </div>
      <div v-if="isWindowSelection" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">Vloer</span>
        <div class="fml-toolbelt__field-controls">
          <input
            type="number"
            min="0"
            max="400"
            step="1"
            class="fml-toolbelt__thickness-input"
            aria-label="Afstand van vloer in cm"
            :value="openingSillZMixed ? '' : openingSillZDraft"
            :placeholder="openingSillZMixed ? '—' : undefined"
            @input="emit('openingSillZInput', $event)"
            @change="emit('commitOpeningSillZ')"
          />
          <span class="fml-toolbelt__unit">cm</span>
        </div>
      </div>
      <div v-if="isWindowSelection" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">Glas</span>
        <div class="fml-toolbelt__field-controls">
          <input
            type="number"
            min="50"
            max="500"
            step="1"
            class="fml-toolbelt__thickness-input"
            aria-label="Glashoogte in cm"
            :value="openingHeightMixed ? '' : openingHeightDraft"
            :placeholder="openingHeightMixed ? '—' : undefined"
            @input="emit('openingHeightInput', $event)"
            @change="emit('commitOpeningHeight')"
          />
          <span class="fml-toolbelt__unit">cm</span>
        </div>
      </div>
      <button
        v-if="selectedWallPanel?.count === 1"
        type="button"
        class="canvas-toolbelt__btn"
        title="Muur splitsen"
        aria-label="Muur splitsen"
        :disabled="!selectedWallPanel?.canSplit"
        @click="emit('splitWall')"
      >
        <svg class="canvas-toolbelt__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M3 5v14h8V5H3zm10 0v14h8V5h-8zM5 7h4v10H5V7zm12 0h4v10h-4V7z"
          />
        </svg>
      </button>
      <button
        v-if="isDoorSelection"
        type="button"
        class="canvas-toolbelt__btn"
        :class="{ 'canvas-toolbelt__btn--active': !openingHingeMixed && !openingHingeAtStartDraft }"
        :title="openingHingeTitle"
        :aria-label="openingHingeTitle"
        @click="emit('toggleOpeningHinge')"
      >
        <svg class="canvas-toolbelt__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7V4zm2 2v12h6V6H9zm-4 1h2v2H5V7zm0 4h2v2H5v-2zm0 4h2v2H5v-2z"
          />
        </svg>
      </button>
      <button
        v-if="isDoorSelection"
        type="button"
        class="canvas-toolbelt__btn"
        :class="{ 'canvas-toolbelt__btn--active': !openingSwingMixed && openingSwingRightDraft }"
        :title="openingSwingTitle"
        :aria-label="openingSwingTitle"
        @click="emit('toggleOpeningSwing')"
      >
        <svg class="canvas-toolbelt__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 4a8 8 0 0 1 8 8h-2a6 6 0 0 0-6-6V4zm1 7.5V20h-2v-8.5L7.4 15l-1.4-1.4L12 7.6l6 6-1.4 1.4L13 11.5z"
          />
        </svg>
      </button>
      <button
        v-if="selectedOpeningPanel && canCopyOpening"
        type="button"
        class="canvas-toolbelt__btn"
        title="Kopieer — activeert plaats-tool met dezelfde settings"
        aria-label="Opening kopiëren"
        @click="emit('copyOpening')"
      >
        <svg class="canvas-toolbelt__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
          />
        </svg>
      </button>
      <button
        v-if="selectedWallPanel"
        type="button"
        class="canvas-toolbelt__btn"
        :title="
          selectedWallPanel.count === 1 ? 'Muur verwijderen' : 'Geselecteerde muren verwijderen'
        "
        :aria-label="
          selectedWallPanel.count === 1 ? 'Muur verwijderen' : 'Geselecteerde muren verwijderen'
        "
        @click="emit('deleteWalls')"
      >
        <svg class="canvas-toolbelt__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
          />
        </svg>
      </button>
      <button
        v-if="selectedOpeningPanel"
        type="button"
        class="canvas-toolbelt__btn"
        :title="
          selectedOpeningPanel.count === 1
            ? isWindowSelection
              ? 'Raam verwijderen'
              : 'Deur verwijderen'
            : 'Geselecteerde openingen verwijderen'
        "
        :aria-label="
          selectedOpeningPanel.count === 1
            ? isWindowSelection
              ? 'Raam verwijderen'
              : 'Deur verwijderen'
            : 'Geselecteerde openingen verwijderen'
        "
        @click="emit('deleteOpenings')"
      >
        <svg class="canvas-toolbelt__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
          />
        </svg>
      </button>
      <button
        v-if="selectedWallPanel || selectedOpeningPanel"
        type="button"
        class="canvas-toolbelt__btn"
        title="Deselecteer (Esc)"
        aria-label="Deselecteer"
        @click="emit('clearSelection')"
      >
        <svg class="canvas-toolbelt__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
          />
        </svg>
      </button>
    </div>
  </template>

  <template v-if="showMeasureStrip">
    <div class="canvas-toolbelt-dock__sep" aria-hidden="true" />
    <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--fml">
      <span class="fml-toolbelt__meta"
        >{{ measureLineCount }} maatlijn{{ measureLineCount === 1 ? '' : 'en' }}</span
      >
      <button
        type="button"
        class="canvas-toolbelt__btn"
        title="Alle maatlijnen wissen"
        aria-label="Alle maatlijnen wissen"
        @click="emit('clearMeasures')"
      >
        <svg class="canvas-toolbelt__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
          />
        </svg>
      </button>
    </div>
  </template>
</template>

<style scoped>
.fml-toolbelt__field {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 4px;
  border-left: 1px solid #e2e8f0;
  margin-left: 2px;
}

.fml-toolbelt__field:first-of-type {
  border-left: none;
  margin-left: 0;
}

.fml-toolbelt__field-label {
  font-size: 10px;
  line-height: 1.2;
  color: #64748b;
}

.fml-toolbelt__field-controls {
  display: flex;
  align-items: center;
  gap: 3px;
}

.fml-toolbelt__thickness-input {
  width: 44px;
  font-size: 12px;
  padding: 1px 3px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}

.fml-toolbelt__balance-input {
  width: 64px;
}

.fml-toolbelt__select {
  min-width: 108px;
  height: 24px;
  font-size: 12px;
  padding: 1px 4px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #334155;
}

.fml-toolbelt__select--thickness {
  min-width: 118px;
}

.fml-toolbelt__unit {
  font-size: 10px;
  color: #64748b;
  min-width: 18px;
}

.fml-toolbelt__presets {
  display: flex;
  gap: 2px;
  margin-left: 2px;
}

.fml-toolbelt__preset-btn {
  min-width: 28px;
  height: 22px;
  padding: 0 5px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #f8fafc;
  color: #334155;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

.fml-toolbelt__preset-btn:hover {
  background: #e0f2fe;
  border-color: #7dd3fc;
  color: #0369a1;
}

.canvas-toolbelt__btn--active {
  background: #e0f2fe;
  border-color: #7dd3fc;
  color: #0369a1;
}
</style>
