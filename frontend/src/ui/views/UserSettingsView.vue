<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProjectFmlDefaults } from '@/ui/composables/project/types'
import {
  downloadUserSettingsJson,
  loadUserSettings,
  parseUserSettingsJson,
  resetUserSettingsToFactory,
  saveUserSettings,
  SCALE_INPUT_UNITS,
  UserSettingsParseError,
  type FmlConversionSettings,
  type FmlViewerSettings,
  type ScaleInputUnit,
  type UserSettingsV1,
} from '@/ui/composables/settings/user-settings'
import { applyLocale, SUPPORTED_LOCALES, type AppLocale } from '@/ui/i18n'

const { t } = useI18n()

const emit = defineEmits<{
  saved: []
  back: []
  openFmlViewer: []
}>()

function cloneSettings(settings: UserSettingsV1): UserSettingsV1 {
  return {
    version: settings.version,
    locale: settings.locale,
    scaleInputUnit: settings.scaleInputUnit,
    defaults: { ...settings.defaults },
    fmlViewer: { ...settings.fmlViewer },
    fmlConversion: { ...settings.fmlConversion },
  }
}

const draft = reactive(cloneSettings(loadUserSettings()))
const statusMessage = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const importInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => draft.locale,
  (locale) => {
    applyLocale(locale)
  },
)

function patchDefaults(patch: Partial<ProjectFmlDefaults>) {
  Object.assign(draft.defaults, patch)
}

function patchViewer(patch: Partial<FmlViewerSettings>) {
  Object.assign(draft.fmlViewer, patch)
}

function patchConversion(patch: Partial<FmlConversionSettings>) {
  Object.assign(draft.fmlConversion, patch)
}

function clearMessages() {
  statusMessage.value = null
  errorMessage.value = null
}

function onLocaleChange(event: Event) {
  draft.locale = (event.target as HTMLSelectElement).value as AppLocale
}

function onScaleUnitChange(event: Event) {
  draft.scaleInputUnit = (event.target as HTMLSelectElement).value as ScaleInputUnit
}

function onSave() {
  clearMessages()
  const saved = saveUserSettings({
    version: 1,
    locale: draft.locale,
    scaleInputUnit: draft.scaleInputUnit,
    defaults: { ...draft.defaults },
    fmlViewer: { ...draft.fmlViewer },
    fmlConversion: { ...draft.fmlConversion },
  })
  Object.assign(draft, cloneSettings(saved))
  applyLocale(saved.locale)
  statusMessage.value = t('settings.saved')
  emit('saved')
}

function onResetFactory() {
  clearMessages()
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
    scaleInputUnit: draft.scaleInputUnit,
    defaults: { ...draft.defaults },
    fmlViewer: { ...draft.fmlViewer },
    fmlConversion: { ...draft.fmlConversion },
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

function onReload() {
  clearMessages()
  const loaded = loadUserSettings()
  Object.assign(draft, cloneSettings(loaded))
  applyLocale(loaded.locale)
}

function onBack() {
  applyLocale(loadUserSettings().locale)
  emit('back')
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-header">
      <div>
        <h2>{{ t('settings.title') }}</h2>
        <p class="hint">{{ t('settings.hint') }}</p>
      </div>
      <button type="button" class="secondary" @click="onBack">
        {{ t('settings.backToWorkspace') }}
      </button>
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
      <h3>{{ t('settings.scaleUnit') }}</h3>
      <p class="hint">{{ t('settings.scaleUnitHint') }}</p>
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
          <input
            type="number"
            :value="draft.defaults.wallHeightCm"
            @change="
              patchDefaults({ wallHeightCm: Number(($event.target as HTMLInputElement).value) })
            "
          />
        </label>
        <label class="field compact">
          <span>{{ t('settings.doorHeightCm') }}</span>
          <input
            type="number"
            :value="draft.defaults.doorHeightCm"
            @change="
              patchDefaults({ doorHeightCm: Number(($event.target as HTMLInputElement).value) })
            "
          />
        </label>
        <label class="field compact">
          <span>{{ t('settings.windowHeightCm') }}</span>
          <input
            type="number"
            :value="draft.defaults.windowHeightCm"
            @change="
              patchDefaults({ windowHeightCm: Number(($event.target as HTMLInputElement).value) })
            "
          />
        </label>
        <label class="field compact">
          <span>{{ t('settings.sillZCm') }}</span>
          <input
            type="number"
            :value="draft.defaults.windowSillZCm"
            @change="
              patchDefaults({ windowSillZCm: Number(($event.target as HTMLInputElement).value) })
            "
          />
        </label>
        <label class="field compact">
          <span :title="t('settings.bovenlichtGapTitle')">{{ t('settings.bovenlichtGapCm') }}</span>
          <input
            type="number"
            min="0"
            :value="draft.defaults.bovenlichtGapCm"
            @change="
              patchDefaults({
                bovenlichtGapCm: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
        </label>
        <label class="field compact">
          <span :title="t('settings.bovenlichtHeightTitle')">{{
            t('settings.bovenlichtHeightCm')
          }}</span>
          <input
            type="number"
            min="1"
            :value="draft.defaults.bovenlichtHeightCm"
            @change="
              patchDefaults({
                bovenlichtHeightCm: Number(($event.target as HTMLInputElement).value),
              })
            "
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
        <label class="field compact">
          <span>{{ t('settings.minCm') }}</span>
          <input
            type="number"
            :value="draft.defaults.thicknessMinCm"
            @change="
              patchDefaults({ thicknessMinCm: Number(($event.target as HTMLInputElement).value) })
            "
          />
        </label>
        <label class="field compact">
          <span>{{ t('settings.midCm') }}</span>
          <input
            type="number"
            :value="draft.defaults.thicknessMidCm"
            @change="
              patchDefaults({ thicknessMidCm: Number(($event.target as HTMLInputElement).value) })
            "
          />
        </label>
        <label class="field compact">
          <span>{{ t('settings.maxCm') }}</span>
          <input
            type="number"
            :value="draft.defaults.thicknessMaxCm"
            @change="
              patchDefaults({ thicknessMaxCm: Number(($event.target as HTMLInputElement).value) })
            "
          />
        </label>
      </div>
    </section>

    <section class="panel settings-section">
      <h3>{{ t('settings.fmlConversion') }}</h3>
      <p class="hint">{{ t('settings.fmlConversionHint') }}</p>
      <div class="defaults-grid">
        <label class="field compact check conversion-check">
          <input
            type="checkbox"
            :checked="draft.fmlConversion.mergeDoubleDoors"
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
            :checked="draft.fmlConversion.mergeMultiWindows"
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

    <section class="panel settings-section">
      <h3>{{ t('settings.fmlViewer') }}</h3>
      <div class="opacity-row">
        <div class="opacity-label">
          <span>{{ t('settings.underlayOpacity') }}</span>
          <span>{{ draft.fmlViewer.underlayOpacityPct }}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="draft.fmlViewer.underlayOpacityPct"
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
          <span>{{ t('settings.fmlOpacity') }}</span>
          <span>{{ draft.fmlViewer.fmlOpacityPct }}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="draft.fmlViewer.fmlOpacityPct"
          :aria-label="t('settings.fmlOpacityAria')"
          @input="
            patchViewer({
              fmlOpacityPct: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
      </div>
      <p class="hint">{{ t('settings.openFmlViewerHint') }}</p>
      <button type="button" class="secondary" @click="emit('openFmlViewer')">
        {{ t('settings.openFmlViewer') }}
      </button>
    </section>

    <div class="actions">
      <button type="button" class="primary" @click="onSave">{{ t('settings.save') }}</button>
      <button type="button" @click="onResetFactory">{{ t('settings.resetFactory') }}</button>
      <button type="button" @click="onExport">{{ t('settings.export') }}</button>
      <button type="button" @click="onImportClick">{{ t('settings.import') }}</button>
      <button type="button" class="secondary" @click="onReload">{{ t('settings.reload') }}</button>
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
