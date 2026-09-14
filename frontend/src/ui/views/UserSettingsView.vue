<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProjectFmlDefaults } from '@/ui/composables/project/types'
import {
  CORNER_MARKER_MODES,
  downloadUserSettingsJson,
  loadUserSettings,
  parseUserSettingsJson,
  createFactoryUserSettings,
  resetUserSettingsToFactory,
  saveUserSettings,
  SCALE_INPUT_UNITS,
  UNIT_SYSTEMS,
  PLAN_DISPLAY_STYLE_CHOICES,
  UserSettingsParseError,
  type CornerMarkerMode,
  type OpeningMergeSettings,
  type PlanDisplaySettings,
  type OpeningDisplayColorKey,
  type PlanDisplayStyleChoice,
  type ScaleInputUnit,
  type UnitSystem,
  type UserSettingsV1,
  FACTORY_OPENING_COLORS,
  DEFAULT_CLEAR_HEIGHT_FILL_COLOR,
} from '@/ui/composables/settings/user-settings'
import {
  effectiveRoomTypeColor,
  factoryRoomTypeColor,
  listRoomTypes,
  parseFmlHex,
} from '@/core/fml/roomtype-catalog'
import { applyLocale, SUPPORTED_LOCALES, type AppLocale } from '@/ui/i18n'
import { PLAN_ROOM_TAG_COLOR_SETTINGS_VISIBLE } from '@/ui/composables/workspace/constants'
import HexColorField from '@/ui/components/HexColorField.vue'
import ScaleLengthInput from '@/ui/components/ScaleLengthInput.vue'
import ThicknessCatalogFields from '@/ui/components/ThicknessCatalogFields.vue'
import FacadeGroupPresetFields from '@/ui/components/FacadeGroupPresetFields.vue'
import { limitsFromCatalog } from '@/core/fml/fml-wall-thickness-catalog'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    /** Workspace = converter; viewer = losse editor (PLG-native). */
    variant?: 'workspace' | 'viewer'
  }>(),
  { variant: 'workspace' },
)

const isViewer = computed(() => props.variant === 'viewer')
const showRoomTags = computed(() => isViewer.value || PLAN_ROOM_TAG_COLOR_SETTINGS_VISIBLE)

const emit = defineEmits<{
  saved: []
  close: []
}>()

const skipSaveOnUnmount = ref(false)

function cloneSettings(settings: UserSettingsV1): UserSettingsV1 {
  return {
    version: settings.version,
    locale: settings.locale,
    unitSystem: settings.unitSystem,
    scaleInputUnit: settings.scaleInputUnit,
    defaults: { ...settings.defaults },
    planDisplay: {
      ...settings.planDisplay,
      openingColors: { ...settings.planDisplay.openingColors },
      facadeGroups: settings.planDisplay.facadeGroups.map((group) => ({ ...group })),
    },
    openingMerge: { ...settings.openingMerge },
    roomTagColors: { ...settings.roomTagColors },
  }
}

const draft = reactive(cloneSettings(loadUserSettings()))
const statusMessage = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const importInputRef = ref<HTMLInputElement | null>(null)

const roomTypeRows = computed(() =>
  listRoomTypes().map((rt) => {
    const key = String(rt.role)
    const effective = effectiveRoomTypeColor(rt.role, draft.roomTagColors)
    const factory = factoryRoomTypeColor(rt.role)
    return {
      role: rt.role,
      name: rt.name,
      key,
      color: effective,
      hasOverride: Object.prototype.hasOwnProperty.call(draft.roomTagColors, key),
      factory,
    }
  }),
)

const hasAnyRoomTagOverride = computed(() => Object.keys(draft.roomTagColors).length > 0)

watch(
  () => draft.locale,
  (locale) => {
    applyLocale(locale)
  },
)

function patchDefaults(patch: Partial<ProjectFmlDefaults>) {
  Object.assign(draft.defaults, patch)
}

function patchThicknessCatalog(cms: number[]) {
  const limits = limitsFromCatalog(cms)
  patchDefaults({ thicknessCms: cms, ...limits })
}

function patchViewer(patch: Partial<PlanDisplaySettings>) {
  Object.assign(draft.planDisplay, patch)
}

function patchConversion(patch: Partial<OpeningMergeSettings>) {
  Object.assign(draft.openingMerge, patch)
}

function onRoomTagColorInput(role: number, value: string) {
  const hex = parseFmlHex(value)
  if (!hex) return
  const key = String(role)
  const factory = factoryRoomTypeColor(role)
  if (hex === factory) {
    delete draft.roomTagColors[key]
  } else {
    draft.roomTagColors[key] = hex
  }
}

function resetRoomTagColor(role: number) {
  delete draft.roomTagColors[String(role)]
}

function resetAllRoomTagColors() {
  for (const key of Object.keys(draft.roomTagColors)) {
    delete draft.roomTagColors[key]
  }
}

function clearMessages() {
  statusMessage.value = null
  errorMessage.value = null
}

function onLocaleChange(event: Event) {
  draft.locale = (event.target as HTMLSelectElement).value as AppLocale
}

function onUnitSystemChange(event: Event) {
  draft.unitSystem = (event.target as HTMLSelectElement).value as UnitSystem
}

function onScaleUnitChange(event: Event) {
  draft.scaleInputUnit = (event.target as HTMLSelectElement).value as ScaleInputUnit
}

function onCornerMarkerModeChange(event: Event) {
  patchViewer({
    cornerMarkerMode: (event.target as HTMLSelectElement).value as CornerMarkerMode,
  })
}

function onPlanDisplayStyleChange(event: Event) {
  patchViewer({
    planDisplayStyle: (event.target as HTMLSelectElement).value as PlanDisplayStyleChoice,
  })
}

function cornerMarkerModeLabel(mode: CornerMarkerMode): string {
  if (mode === 'off') return t('settings.cornerMarkersOff')
  if (mode === 'square') return t('settings.cornerMarkersSquare')
  return t('settings.cornerMarkersSkew')
}

function planDisplayStyleLabel(style: PlanDisplayStyleChoice): string {
  if (style === 'bouw') return t('settings.planDisplayStyleBouw')
  if (style === 'architect') return t('settings.planDisplayStyleArchitect')
  return t('settings.planDisplayStyleEditor')
}

const openingColorRows: { key: OpeningDisplayColorKey; labelKey: string }[] = [
  { key: 'door', labelKey: 'settings.openingColorDoor' },
  { key: 'window', labelKey: 'settings.openingColorWindow' },
  { key: 'bovenlicht', labelKey: 'settings.openingColorBovenlicht' },
]

function openingColorIsOverride(key: OpeningDisplayColorKey): boolean {
  return draft.planDisplay.openingColors[key].toLowerCase() !== FACTORY_OPENING_COLORS[key]
}

const hasAnyOpeningColorOverride = computed(() =>
  openingColorRows.some((row) => openingColorIsOverride(row.key)),
)

function onOpeningColorInput(key: OpeningDisplayColorKey, value: string): void {
  const hex = parseFmlHex(value)
  if (!hex) return
  draft.planDisplay.openingColors[key] = hex
}

function resetOpeningColor(key: OpeningDisplayColorKey): void {
  draft.planDisplay.openingColors[key] = FACTORY_OPENING_COLORS[key]
}

function resetAllOpeningColors(): void {
  draft.planDisplay.openingColors = { ...FACTORY_OPENING_COLORS }
}

const clearHeightFillIsOverride = computed(
  () =>
    draft.planDisplay.clearHeightFillColor.toUpperCase() !==
    DEFAULT_CLEAR_HEIGHT_FILL_COLOR.toUpperCase(),
)

function onClearHeightFillColorInput(value: string): void {
  const hex = parseFmlHex(value)
  if (!hex) return
  draft.planDisplay.clearHeightFillColor = hex
}

function resetClearHeightFillColor(): void {
  draft.planDisplay.clearHeightFillColor = DEFAULT_CLEAR_HEIGHT_FILL_COLOR
}

function persistDraft(): UserSettingsV1 {
  const saved = saveUserSettings({
    version: 1,
    locale: draft.locale,
    unitSystem: draft.unitSystem,
    scaleInputUnit: draft.scaleInputUnit,
    defaults: { ...draft.defaults },
    planDisplay: { ...draft.planDisplay },
    openingMerge: { ...draft.openingMerge },
    roomTagColors: { ...draft.roomTagColors },
  })
  Object.assign(draft, cloneSettings(saved))
  applyLocale(saved.locale)
  emit('saved')
  return saved
}

function onSave() {
  clearMessages()
  persistDraft()
  statusMessage.value = t('settings.saved')
}

function onCancel() {
  skipSaveOnUnmount.value = true
  const loaded = loadUserSettings()
  Object.assign(draft, cloneSettings(loaded))
  applyLocale(loaded.locale)
  emit('close')
}

function onResetFactory() {
  clearMessages()
  if (isViewer.value) {
    const factory = createFactoryUserSettings()
    const current = loadUserSettings()
    const saved = saveUserSettings({
      ...current,
      locale: factory.locale,
      unitSystem: factory.unitSystem,
      scaleInputUnit: factory.scaleInputUnit,
      defaults: { ...factory.defaults },
      roomTagColors: {},
      planDisplay: {
        ...current.planDisplay,
        cornerMarkerMode: factory.planDisplay.cornerMarkerMode,
        openingColors: { ...factory.planDisplay.openingColors },
        slicerOffsetSnapCm: factory.planDisplay.slicerOffsetSnapCm,
        planDisplayStyle: factory.planDisplay.planDisplayStyle,
        ridgeDisplayWidthCm: factory.planDisplay.ridgeDisplayWidthCm,
        showRidgeDisplay: factory.planDisplay.showRidgeDisplay,
        showCanvasGrid: factory.planDisplay.showCanvasGrid,
        showRoofOverlayOnPlan: factory.planDisplay.showRoofOverlayOnPlan,
        showRoofPlanesOnPlan: factory.planDisplay.showRoofPlanesOnPlan,
        showClearHeight150: factory.planDisplay.showClearHeight150,
        showClearHeight200: factory.planDisplay.showClearHeight200,
        showClearHeightPlanFill: factory.planDisplay.showClearHeightPlanFill,
        clearHeightFillColor: factory.planDisplay.clearHeightFillColor,
        facadeGroups: factory.planDisplay.facadeGroups.map((group) => ({ ...group })),
      },
    })
    Object.assign(draft, cloneSettings(saved))
    applyLocale(saved.locale)
    statusMessage.value = t('settings.factoryRestored')
    emit('saved')
    return
  }
  const factory = resetUserSettingsToFactory()
  Object.assign(draft, cloneSettings(factory))
  applyLocale(factory.locale)
  statusMessage.value = t('settings.factoryRestored')
  emit('saved')
}

function onExport() {
  clearMessages()
  downloadUserSettingsJson({
    version: 1,
    locale: draft.locale,
    unitSystem: draft.unitSystem,
    scaleInputUnit: draft.scaleInputUnit,
    defaults: { ...draft.defaults },
    planDisplay: { ...draft.planDisplay },
    openingMerge: { ...draft.openingMerge },
    roomTagColors: { ...draft.roomTagColors },
  })
  statusMessage.value = t('settings.exportDownloaded')
}

function onImportClick() {
  importInputRef.value?.click()
}

async function onImportFile(event: Event) {
  clearMessages()
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const parsed = parseUserSettingsJson(text)
    const saved = saveUserSettings(parsed)
    Object.assign(draft, cloneSettings(saved))
    applyLocale(saved.locale)
    statusMessage.value = t('settings.imported', { name: file.name })
    emit('saved')
  } catch (err) {
    if (err instanceof UserSettingsParseError) {
      errorMessage.value =
        err.message === 'settings.parseVersion'
          ? t('settings.parseVersion', { version: 1 })
          : t(err.message)
    } else {
      errorMessage.value = t('settings.importFailed')
    }
  }
}

onBeforeUnmount(() => {
  if (skipSaveOnUnmount.value) return
  persistDraft()
})
</script>

<template>
  <div class="settings-page">
    <div class="settings-header">
      <div>
        <h2>{{ isViewer ? t('settings.titleViewer') : t('settings.title') }}</h2>
        <p class="hint">{{ isViewer ? t('settings.hintViewer') : t('settings.hint') }}</p>
      </div>
    </div>

    <p v-if="statusMessage" class="status ok">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="status err">{{ errorMessage }}</p>

    <section class="panel settings-section">
      <h3>{{ t('settings.language') }}</h3>
      <label class="field compact">
        <span>{{ t('settings.language') }}</span>
        <select :value="draft.locale" @change="onLocaleChange">
          <option v-for="locale in SUPPORTED_LOCALES" :key="locale" :value="locale">
            {{
              locale === 'en'
                ? t('settings.localeEn')
                : locale === 'nl'
                  ? t('settings.localeNl')
                  : t('settings.localeTh')
            }}
          </option>
        </select>
      </label>
    </section>

    <section class="panel settings-section">
      <h3>{{ t('settings.units') }}</h3>
      <p class="hint">{{ t('settings.unitsHint') }}</p>
      <label class="field compact">
        <span>{{ t('settings.unitSystem') }}</span>
        <select :value="draft.unitSystem" @change="onUnitSystemChange">
          <option v-for="system in UNIT_SYSTEMS" :key="system" :value="system">
            {{
              system === 'metric'
                ? t('settings.unitSystemMetric')
                : t('settings.unitSystemImperial')
            }}
          </option>
        </select>
      </label>
      <label class="field compact">
        <span>{{ t('settings.scaleUnit') }}</span>
        <select :value="draft.scaleInputUnit" @change="onScaleUnitChange">
          <option v-for="unit in SCALE_INPUT_UNITS" :key="unit" :value="unit">
            {{ t(`common.${unit}`) }}
          </option>
        </select>
      </label>
    </section>

    <section class="panel settings-section">
      <h3>{{ t('settings.heights') }}</h3>
      <div class="defaults-grid">
        <label class="field compact">
          <span>{{ t('settings.wallHeightCm') }}</span>
          <ScaleLengthInput
            block
            :unit-system="draft.unitSystem"
            :cm="draft.defaults.wallHeightCm"
            :unit="draft.scaleInputUnit"
            :min-cm="1"
            @update:cm="patchDefaults({ wallHeightCm: $event })"
          />
        </label>
        <label class="field compact">
          <span>{{ t('settings.doorHeightCm') }}</span>
          <ScaleLengthInput
            block
            :unit-system="draft.unitSystem"
            :cm="draft.defaults.doorHeightCm"
            :unit="draft.scaleInputUnit"
            :min-cm="1"
            @update:cm="patchDefaults({ doorHeightCm: $event })"
          />
        </label>
        <label class="field compact">
          <span>{{ t('settings.windowHeightCm') }}</span>
          <ScaleLengthInput
            block
            :unit-system="draft.unitSystem"
            :cm="draft.defaults.windowHeightCm"
            :unit="draft.scaleInputUnit"
            :min-cm="1"
            @update:cm="patchDefaults({ windowHeightCm: $event })"
          />
        </label>
        <label class="field compact">
          <span>{{ t('settings.sillZCm') }}</span>
          <ScaleLengthInput
            block
            :unit-system="draft.unitSystem"
            :cm="draft.defaults.windowSillZCm"
            :unit="draft.scaleInputUnit"
            :min-cm="0"
            allow-zero
            @update:cm="patchDefaults({ windowSillZCm: $event })"
          />
        </label>
        <label class="field compact">
          <span :title="t('settings.bovenlichtGapTitle')">{{ t('settings.bovenlichtGapCm') }}</span>
          <ScaleLengthInput
            block
            :unit-system="draft.unitSystem"
            :cm="draft.defaults.bovenlichtGapCm"
            :unit="draft.scaleInputUnit"
            :min-cm="0"
            allow-zero
            @update:cm="patchDefaults({ bovenlichtGapCm: $event })"
          />
        </label>
        <label class="field compact">
          <span :title="t('settings.bovenlichtHeightTitle')">{{
            t('settings.bovenlichtHeightCm')
          }}</span>
          <ScaleLengthInput
            block
            :unit-system="draft.unitSystem"
            :cm="draft.defaults.bovenlichtHeightCm"
            :unit="draft.scaleInputUnit"
            :min-cm="1"
            @update:cm="patchDefaults({ bovenlichtHeightCm: $event })"
          />
        </label>
        <label class="field compact check">
          <input
            type="checkbox"
            :checked="draft.defaults.bovenlichtDefault"
            @change="
              patchDefaults({
                bovenlichtDefault: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          <span>{{ t('settings.bovenlichtDoors') }}</span>
        </label>
        <label class="field compact check">
          <input
            type="checkbox"
            :checked="draft.defaults.windowBovenlichtDefault"
            @change="
              patchDefaults({
                windowBovenlichtDefault: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          <span>{{ t('settings.bovenlichtWindows') }}</span>
        </label>
      </div>
    </section>

    <section class="panel settings-section">
      <h3>{{ t('settings.thicknesses') }}</h3>
      <p class="hint">{{ t('settings.thicknessHint') }}</p>
      <div class="defaults-grid">
        <div class="field compact catalog-field">
          <span>{{ t('settings.thicknessCatalog') }}</span>
          <ThicknessCatalogFields
            :cms="draft.defaults.thicknessCms"
            :unit="draft.scaleInputUnit"
            :unit-system="draft.unitSystem"
            block
            @update:cms="patchThicknessCatalog"
          />
        </div>
        <label class="field compact">
          <span>{{ t('settings.dakThicknessCm') }}</span>
          <ScaleLengthInput
            block
            :unit-system="draft.unitSystem"
            :cm="draft.defaults.dakThicknessCm"
            :unit="draft.scaleInputUnit"
            :min-cm="1"
            @update:cm="patchDefaults({ dakThicknessCm: $event })"
          />
        </label>
        <label class="field compact">
          <span>{{ t('settings.slabThicknessCm') }}</span>
          <ScaleLengthInput
            block
            :unit-system="draft.unitSystem"
            :cm="draft.defaults.slabThicknessCm"
            :unit="draft.scaleInputUnit"
            :min-cm="1"
            @update:cm="patchDefaults({ slabThicknessCm: $event })"
          />
        </label>
      </div>
    </section>

    <section v-if="isViewer" class="panel settings-section">
      <h3>{{ t('settings.facadeGroups') }}</h3>
      <p class="hint">{{ t('settings.facadeGroupsHint') }}</p>
      <FacadeGroupPresetFields
        :groups="draft.planDisplay.facadeGroups"
        @update:groups="patchViewer({ facadeGroups: $event })"
      />
    </section>

    <section v-if="!isViewer" class="panel settings-section">
      <h3>{{ t('settings.openingMerge') }}</h3>
      <p class="hint">{{ t('settings.openingMergeHint') }}</p>
      <div class="defaults-grid">
        <label class="field compact check conversion-check">
          <input
            type="checkbox"
            :checked="draft.openingMerge.mergeDoubleDoors"
            @change="
              patchConversion({
                mergeDoubleDoors: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          <span>{{ t('settings.mergeDoubleDoors') }}</span>
        </label>
        <label class="field compact check conversion-check">
          <input
            type="checkbox"
            :checked="draft.openingMerge.mergeMultiWindows"
            @change="
              patchConversion({
                mergeMultiWindows: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          <span>{{ t('settings.mergeMultiWindows') }}</span>
        </label>
      </div>
    </section>

    <section v-if="showRoomTags" class="panel settings-section">
      <h3>{{ t('settings.roomTags') }}</h3>
      <p class="hint">{{ t('settings.roomTagsHint') }}</p>
      <div class="roomtag-list">
        <div v-for="row in roomTypeRows" :key="row.role" class="roomtag-row">
          <span class="roomtag-name">{{ row.name }}</span>
          <HexColorField
            :model-value="row.color"
            :aria-label="row.name"
            @update:model-value="onRoomTagColorInput(row.role, $event)"
          />
          <button
            v-if="row.hasOverride"
            type="button"
            class="secondary roomtag-reset"
            :title="t('settings.roomTagResetRow')"
            @click="resetRoomTagColor(row.role)"
          >
            {{ t('settings.roomTagResetRow') }}
          </button>
        </div>
      </div>
      <button
        type="button"
        class="secondary"
        :disabled="!hasAnyRoomTagOverride"
        :title="t('settings.roomTagResetAllTitle')"
        @click="resetAllRoomTagColors"
      >
        {{ t('settings.roomTagResetAll') }}
      </button>
    </section>

    <section v-if="!isViewer" class="panel settings-section">
      <h3>{{ t('settings.planDisplay') }}</h3>
      <div class="opacity-row">
        <div class="opacity-label">
          <span>{{ t('settings.underlayOpacity') }}</span>
          <span>{{ draft.planDisplay.underlayOpacityPct }}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="draft.planDisplay.underlayOpacityPct"
          :aria-label="t('settings.underlayOpacityAria')"
          @input="
            patchViewer({
              underlayOpacityPct: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
      </div>
      <div class="opacity-row">
        <div class="opacity-label">
          <span>{{ t('settings.contentOpacity') }}</span>
          <span>{{ draft.planDisplay.contentOpacityPct }}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="draft.planDisplay.contentOpacityPct"
          :aria-label="t('settings.contentOpacityAria')"
          @input="
            patchViewer({
              contentOpacityPct: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
      </div>
    </section>

    <section class="panel settings-section">
      <h3>{{ t('settings.dakSection') }}</h3>
      <p class="hint">{{ t('settings.dakSectionHint') }}</p>
      <label class="field compact check">
        <input
          type="checkbox"
          :checked="draft.planDisplay.showRidgeDisplay"
          @change="
            patchViewer({
              showRidgeDisplay: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span>{{ t('settings.showRidgeDisplay') }}</span>
      </label>
      <p class="hint">{{ t('settings.showRidgeDisplayHint') }}</p>
      <label v-if="draft.planDisplay.showRidgeDisplay" class="field compact">
        <span>{{ t('settings.ridgeDisplayWidthCm') }}</span>
        <ScaleLengthInput
          block
          :unit-system="draft.unitSystem"
          :cm="draft.planDisplay.ridgeDisplayWidthCm"
          :unit="draft.scaleInputUnit"
          :min-cm="1"
          :max-cm="80"
          :aria-label="t('settings.ridgeDisplayWidthCm')"
          @update:cm="patchViewer({ ridgeDisplayWidthCm: $event })"
        />
      </label>
      <p v-if="draft.planDisplay.showRidgeDisplay" class="hint">
        {{ t('settings.ridgeDisplayWidthHint') }}
      </p>
      <label class="field compact check">
        <input
          type="checkbox"
          :checked="draft.planDisplay.showRoofPlanesOnPlan"
          @change="
            patchViewer({
              showRoofPlanesOnPlan: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span>{{ t('settings.showRoofPlanesOnPlan') }}</span>
      </label>
      <p class="hint">{{ t('settings.showRoofPlanesOnPlanHint') }}</p>
      <label class="field compact check">
        <input
          type="checkbox"
          :checked="draft.planDisplay.showClearHeight150"
          @change="
            patchViewer({
              showClearHeight150: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span>{{ t('settings.showClearHeight150') }}</span>
      </label>
      <p class="hint">{{ t('settings.showClearHeight150Hint') }}</p>
      <label class="field compact check">
        <input
          type="checkbox"
          :checked="draft.planDisplay.showClearHeight200"
          @change="
            patchViewer({
              showClearHeight200: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span>{{ t('settings.showClearHeight200') }}</span>
      </label>
      <p class="hint">{{ t('settings.showClearHeight200Hint') }}</p>
      <label class="field compact check">
        <input
          type="checkbox"
          :checked="draft.planDisplay.showClearHeightPlanFill"
          @change="
            patchViewer({
              showClearHeightPlanFill: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span>{{ t('settings.showClearHeightPlanFill') }}</span>
      </label>
      <p class="hint">{{ t('settings.showClearHeightPlanFillHint') }}</p>
      <div class="roomtag-list">
        <div class="roomtag-row">
          <span class="roomtag-name">{{ t('settings.clearHeightFillColor') }}</span>
          <HexColorField
            :model-value="draft.planDisplay.clearHeightFillColor"
            :aria-label="t('settings.clearHeightFillColor')"
            @update:model-value="onClearHeightFillColorInput"
          />
          <button
            v-if="clearHeightFillIsOverride"
            type="button"
            class="secondary roomtag-reset"
            :title="t('settings.roomTagResetRow')"
            @click="resetClearHeightFillColor"
          >
            {{ t('settings.roomTagResetRow') }}
          </button>
        </div>
      </div>
      <p class="hint">{{ t('settings.clearHeightFillColorHint') }}</p>
    </section>

    <section class="panel settings-section">
      <h3>{{ t('settings.openingColors') }}</h3>
      <p class="hint">{{ t('settings.openingColorsHint') }}</p>
      <label class="field compact">
        <span>{{ t('settings.planDisplayStyle') }}</span>
        <select :value="draft.planDisplay.planDisplayStyle" @change="onPlanDisplayStyleChange">
          <option v-for="style in PLAN_DISPLAY_STYLE_CHOICES" :key="style" :value="style">
            {{ planDisplayStyleLabel(style) }}
          </option>
        </select>
      </label>
      <p class="hint">{{ t('settings.planDisplayStyleHint') }}</p>
      <label class="field compact check">
        <input
          type="checkbox"
          :checked="draft.planDisplay.showCanvasGrid"
          @change="
            patchViewer({
              showCanvasGrid: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span>{{ t('settings.showCanvasGrid') }}</span>
      </label>
      <p class="hint">{{ t('settings.showCanvasGridHint') }}</p>
      <div class="roomtag-list">
        <div v-for="row in openingColorRows" :key="row.key" class="roomtag-row">
          <span class="roomtag-name">{{ t(row.labelKey) }}</span>
          <HexColorField
            :model-value="draft.planDisplay.openingColors[row.key]"
            :aria-label="t(row.labelKey)"
            @update:model-value="onOpeningColorInput(row.key, $event)"
          />
          <button
            v-if="openingColorIsOverride(row.key)"
            type="button"
            class="secondary roomtag-reset"
            :title="t('settings.roomTagResetRow')"
            @click="resetOpeningColor(row.key)"
          >
            {{ t('settings.roomTagResetRow') }}
          </button>
        </div>
      </div>
      <button
        type="button"
        class="secondary"
        :disabled="!hasAnyOpeningColorOverride"
        :title="t('settings.openingColorsResetAllTitle')"
        @click="resetAllOpeningColors"
      >
        {{ t('settings.openingColorsResetAll') }}
      </button>
    </section>

    <section class="panel settings-section">
      <h3>{{ t('settings.cornerMarkers') }}</h3>
      <p class="hint">{{ t('settings.cornerMarkersHint') }}</p>
      <label class="field compact">
        <span>{{ t('settings.cornerMarkers') }}</span>
        <select :value="draft.planDisplay.cornerMarkerMode" @change="onCornerMarkerModeChange">
          <option v-for="mode in CORNER_MARKER_MODES" :key="mode" :value="mode">
            {{ cornerMarkerModeLabel(mode) }}
          </option>
        </select>
      </label>
      <label class="field compact">
        <span>{{ t('settings.slicerOffsetSnapCm') }}</span>
        <ScaleLengthInput
          block
          :unit-system="draft.unitSystem"
          :cm="draft.planDisplay.slicerOffsetSnapCm"
          :unit="draft.scaleInputUnit"
          :min-cm="1"
          :max-cm="500"
          :aria-label="t('settings.slicerOffsetSnapCm')"
          @update:cm="patchViewer({ slicerOffsetSnapCm: $event })"
        />
      </label>
      <p class="hint">{{ t('settings.slicerOffsetSnapHint') }}</p>
    </section>

    <p class="hint">{{ t('settings.commitHint') }}</p>
    <div class="actions">
      <button type="button" class="primary" @click="onSave">{{ t('settings.save') }}</button>
      <button type="button" class="secondary" @click="onCancel">{{ t('common.cancel') }}</button>
      <button type="button" @click="onResetFactory">{{ t('settings.resetFactory') }}</button>
      <button type="button" @click="onExport">{{ t('settings.export') }}</button>
      <button type="button" @click="onImportClick">{{ t('settings.import') }}</button>
      <input
        ref="importInputRef"
        type="file"
        accept="application/json,.json"
        class="hidden-file"
        @change="onImportFile"
      />
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.settings-header h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.hint {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.settings-section h3 {
  margin: 0 0 10px;
  font-size: 14px;
}

.defaults-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #334155;
}

.field.compact input[type='number'],
.field.compact select {
  width: 100%;
}

.field.check {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding-top: 18px;
}

.field.conversion-check {
  padding-top: 0;
}

.opacity-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 10px;
  font-size: 12px;
  color: #334155;
}

.opacity-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.opacity-row input[type='range'] {
  width: 100%;
}

.roomtag-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.roomtag-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.roomtag-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}

.roomtag-reset {
  font-size: 12px;
  padding: 4px 8px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hidden-file {
  display: none;
}

.status {
  margin: 0;
  font-size: 13px;
}

.status.ok {
  color: #15803d;
}

.status.err {
  color: #b91c1c;
}

button.secondary {
  background: #f8fafc;
}
</style>
