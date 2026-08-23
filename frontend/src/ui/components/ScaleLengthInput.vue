<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  formatScaleLengthField,
  parseAndClampScaleLengthCm,
  type ScaleLengthClampOptions,
} from '@/ui/composables/settings/scale-length-field'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'

const props = withDefaults(
  defineProps<{
    /** Stored length in cm (FML). Never rewritten on unit switch. */
    cm: number
    unit: ScaleInputUnit
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
  }>(),
  {
    allowZero: false,
    allowNegative: false,
    disabled: false,
    mixed: false,
    hideSuffix: false,
    block: false,
  },
)

const emit = defineEmits<{
  'update:cm': [cm: number]
  /** Fired on blur / Enter after a successful parse (or no change). */
  commit: []
}>()

const { t } = useI18n()

const editing = ref(false)
const draft = ref('')

const clampOpts = computed((): ScaleLengthClampOptions => ({
  minCm: props.minCm,
  maxCm: props.maxCm,
  allowZero: props.allowZero,
  allowNegative: props.allowNegative,
}))

const unitLabel = computed(() => t(`common.${props.unit}`))
const showSuffix = computed(() => !props.hideSuffix && props.unit !== 'ft-in')

const display = computed(() => {
  if (props.mixed && !editing.value) return ''
  if (editing.value) return draft.value
  return formatScaleLengthField(props.cm, props.unit)
})

watch(
  () => [props.cm, props.unit, props.mixed] as const,
  () => {
    if (editing.value) return
    draft.value = props.mixed ? '' : formatScaleLengthField(props.cm, props.unit)
  },
)

function onFocus(): void {
  editing.value = true
  draft.value = props.mixed ? '' : formatScaleLengthField(props.cm, props.unit)
}

function onInput(raw: string): void {
  draft.value = raw
  const cm = parseAndClampScaleLengthCm(raw, props.unit, clampOpts.value)
  if (cm == null) return
  emit('update:cm', cm)
}

function onBlur(): void {
  editing.value = false
  emit('commit')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  event.preventDefault()
  const cm = parseAndClampScaleLengthCm(draft.value, props.unit, clampOpts.value)
  if (cm != null) emit('update:cm', cm)
  editing.value = false
  emit('commit')
  const el = event.target
  if (el instanceof HTMLElement) el.blur()
}
</script>

<template>
  <div class="scale-length-input" :class="{ 'scale-length-input--block': block }">
    <input
      type="text"
      inputmode="decimal"
      autocomplete="off"
      spellcheck="false"
      :class="inputClass"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :value="display"
      :placeholder="mixed ? '—' : undefined"
      @focus="onFocus"
      @blur="onBlur"
      @input="onInput(($event.target as HTMLInputElement).value)"
      @keydown="onKeydown"
    />
    <span v-if="showSuffix" class="scale-length-input__unit">{{ unitLabel }}</span>
  </div>
</template>

<style scoped>
.scale-length-input {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.scale-length-input--block {
  display: flex;
  width: 100%;
}

.scale-length-input--block input {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

.scale-length-input__unit {
  font-size: 11px;
  color: #64748b;
  min-width: 1.5em;
  flex: 0 0 auto;
}

.scale-length-input :deep(input) {
  box-sizing: border-box;
  width: var(--fml-toolbelt-input-width, 64px);
  min-width: var(--fml-toolbelt-input-width, 64px);
  font-size: 12px;
  padding: 1px 4px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}

.scale-length-input--block :deep(input) {
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  font-size: 13px;
  border-radius: 6px;
}
</style>
