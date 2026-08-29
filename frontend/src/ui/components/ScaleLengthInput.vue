<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createScaleLengthCommitGate,
  scaleLengthStepCm,
  stepScaleLengthCm,
  formatScaleLengthField,
  parseAndClampScaleLengthCm,
  type ScaleLengthClampOptions,
} from '@/ui/composables/settings/scale-length-field'
import type { ScaleInputUnit, UnitSystem } from '@/ui/composables/settings/scale-input-unit'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'

const props = withDefaults(
  defineProps<{
    /** Stored length in cm (FML). Never rewritten on unit switch. */
    cm: number
    unit: ScaleInputUnit
    /** Stepper volgt settings metric/imperial. Ontbreekt = live settings. */
    unitSystem?: UnitSystem
    minCm?: number
    maxCm?: number
    allowZero?: boolean
    allowNegative?: boolean
    disabled?: boolean
    mixed?: boolean
    ariaLabel?: string
    inputClass?: string
    /** Hide metric unit suffix (ft-in always hides). */
    hideSuffix?: boolean
    /** Full-width for settings/forms. */
    block?: boolean
    /**
     * Delay `update:cm` while typing / stepping (0 = live).
     * Blur and Enter still flush immediately.
     */
    debounceMs?: number
  }>(),
  {
    allowZero: false,
    allowNegative: false,
    disabled: false,
    mixed: false,
    hideSuffix: false,
    block: false,
    debounceMs: 0,
  },
)

const emit = defineEmits<{
  'update:cm': [cm: number]
  /** Fired on blur / Enter after a successful parse (or no change). */
  commit: []
}>()

const { t } = useI18n()

const inputEl = ref<HTMLInputElement | null>(null)
const editing = ref(false)
const draft = ref('')
/** Last typed/stepped cm not yet emitted (keeps −/+ stacking during debounce). */
const pendingCm = ref<number | null>(null)

const clampOpts = computed((): ScaleLengthClampOptions => ({
  minCm: props.minCm,
  maxCm: props.maxCm,
  allowZero: props.allowZero,
  allowNegative: props.allowNegative,
}))

const resolvedUnitSystem = computed((): UnitSystem => {
  return props.unitSystem ?? loadUserSettings().unitSystem
})

const liveCm = computed(() => pendingCm.value ?? props.cm)

const commitGate = createScaleLengthCommitGate(
  (cm) => {
    pendingCm.value = null
    emit('update:cm', cm)
  },
  () => props.debounceMs,
)

function scheduleCm(cm: number): void {
  pendingCm.value = cm
  commitGate.schedule(cm)
}

function flushCm(): void {
  commitGate.flush()
}

onUnmounted(() => {
  flushCm()
  commitGate.dispose()
})

const unitLabel = computed(() => t(`common.${props.unit}`))
const showSuffix = computed(() => !props.hideSuffix && props.unit !== 'ft-in')

const display = computed(() => {
  if (props.mixed && !editing.value) return ''
  if (editing.value) return draft.value
  if (pendingCm.value != null) return formatScaleLengthField(pendingCm.value, props.unit)
  return formatScaleLengthField(props.cm, props.unit)
})

const canStepDown = computed(() => {
  if (props.disabled) return false
  const next = stepScaleLengthCm(liveCm.value, resolvedUnitSystem.value, -1, clampOpts.value)
  return next !== liveCm.value
})

const canStepUp = computed(() => {
  if (props.disabled) return false
  const next = stepScaleLengthCm(liveCm.value, resolvedUnitSystem.value, 1, clampOpts.value)
  return next !== liveCm.value
})

watch(
  () => [props.cm, props.unit, props.mixed] as const,
  () => {
    if (editing.value || pendingCm.value != null) return
    draft.value = props.mixed ? '' : formatScaleLengthField(props.cm, props.unit)
  },
)

function onFocus(): void {
  editing.value = true
  draft.value = props.mixed ? '' : formatScaleLengthField(liveCm.value, props.unit)
}

function onInput(raw: string): void {
  draft.value = raw
  const cm = parseAndClampScaleLengthCm(raw, props.unit, clampOpts.value)
  if (cm == null) return
  scheduleCm(cm)
}

function onBlur(): void {
  editing.value = false
  flushCm()
  emit('commit')
}

function applyStep(direction: 1 | -1): void {
  if (props.disabled) return
  const next = stepScaleLengthCm(liveCm.value, resolvedUnitSystem.value, direction, clampOpts.value)
  if (next === liveCm.value) return
  editing.value = false
  draft.value = formatScaleLengthField(next, props.unit)
  scheduleCm(next)
  if (props.debounceMs <= 0) emit('commit')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    applyStep(event.key === 'ArrowUp' ? 1 : -1)
    return
  }
  if (event.key !== 'Enter') return
  event.preventDefault()
  const cm = parseAndClampScaleLengthCm(draft.value, props.unit, clampOpts.value)
  if (cm != null) scheduleCm(cm)
  flushCm()
  editing.value = false
  emit('commit')
  const el = event.target
  if (el instanceof HTMLElement) el.blur()
}

const stepAria = computed(() => {
  const stepCm = scaleLengthStepCm(resolvedUnitSystem.value)
  const label = formatScaleLengthField(stepCm, props.unit)
  const step = showSuffix.value ? `${label} ${unitLabel.value}` : label
  return {
    down: t('common.lengthStepDown', { step }),
    up: t('common.lengthStepUp', { step }),
  }
})

function focus(): void {
  inputEl.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div class="scale-length-input" :class="{ 'scale-length-input--block': block }">
    <div class="scale-length-input__field" :class="inputClass">
      <button
        type="button"
        class="scale-length-input__step"
        tabindex="-1"
        :disabled="!canStepDown"
        :aria-label="stepAria.down"
        @mousedown.prevent
        @click="applyStep(-1)"
      >
        −
      </button>
      <input
        ref="inputEl"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        spellcheck="false"
        :disabled="disabled"
        :aria-label="ariaLabel"
        :value="display"
        :placeholder="mixed ? '—' : undefined"
        @focus="onFocus"
        @blur="onBlur"
        @input="onInput(($event.target as HTMLInputElement).value)"
        @keydown="onKeydown"
      />
      <button
        type="button"
        class="scale-length-input__step"
        tabindex="-1"
        :disabled="!canStepUp"
        :aria-label="stepAria.up"
        @mousedown.prevent
        @click="applyStep(1)"
      >
        +
      </button>
    </div>
    <span v-if="showSuffix" class="scale-length-input__unit">{{ unitLabel }}</span>
  </div>
</template>

<style scoped>
.scale-length-input {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.scale-length-input--block {
  display: flex;
  width: 100%;
}

.scale-length-input__field {
  display: inline-flex;
  align-items: stretch;
  box-sizing: border-box;
  width: var(--fml-toolbelt-input-width, 92px);
  min-width: var(--fml-toolbelt-input-width, 92px);
  height: 26px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  overflow: hidden;
}

.scale-length-input--block .scale-length-input__field {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  height: 28px;
  border-radius: 6px;
}

.scale-length-input__field input {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  margin: 0;
  padding: 0 2px;
  border: none;
  border-radius: 0;
  background: transparent;
  font-size: 12px;
  text-align: center;
  color: inherit;
}

.scale-length-input--block .scale-length-input__field input {
  height: 100%;
  font-size: 13px;
}

.scale-length-input__step {
  flex: 0 0 20px;
  width: 20px;
  padding: 0;
  border: none;
  background: #f8fafc;
  color: #475569;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.scale-length-input__step:hover:not(:disabled) {
  background: #e2e8f0;
  color: #0f172a;
}

.scale-length-input__step:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.scale-length-input__unit {
  font-size: 11px;
  color: #64748b;
  min-width: 1.5em;
  flex: 0 0 auto;
}

.scale-length-input :deep(input:disabled) {
  opacity: 0.6;
}
</style>
