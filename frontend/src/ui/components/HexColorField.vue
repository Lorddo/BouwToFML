<script setup lang="ts">
import { ref, watch } from 'vue'
import { parseFmlHex, UNLABELED_AREA_COLOR } from '@/core/fml/roomtype-catalog'

const model = defineModel<string>({ required: true })

defineProps<{
  ariaLabel?: string
}>()

function displayHex(raw: string): string {
  return parseFmlHex(raw) ?? UNLABELED_AREA_COLOR
}

const draft = ref(displayHex(model.value))

watch(model, (value) => {
  const next = displayHex(value)
  if (parseFmlHex(draft.value) !== next) draft.value = next
})

function commit(hex: string): void {
  draft.value = hex
  if (parseFmlHex(model.value) !== hex) model.value = hex
}

function onSwatch(event: Event): void {
  const parsed = parseFmlHex((event.target as HTMLInputElement).value)
  if (parsed) commit(parsed)
}

function onDraftInput(event: Event): void {
  draft.value = (event.target as HTMLInputElement).value
  const parsed = parseFmlHex(draft.value)
  if (parsed) commit(parsed)
}

function onDraftBlur(): void {
  draft.value = displayHex(model.value)
}

function onDraftFocus(event: FocusEvent): void {
  ;(event.target as HTMLInputElement).select()
}
</script>

<template>
  <span class="hex-color-field" role="group" :aria-label="ariaLabel">
    <input
      class="hex-color-field__swatch"
      type="color"
      :aria-label="ariaLabel"
      :value="displayHex(model)"
      @input="onSwatch"
    />
    <input
      class="hex-color-field__hex"
      type="text"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      maxlength="7"
      :aria-label="ariaLabel ? `${ariaLabel} hex` : 'hex'"
      :value="draft"
      @input="onDraftInput"
      @focus="onDraftFocus"
      @blur="onDraftBlur"
    />
  </span>
</template>

<style scoped>
.hex-color-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hex-color-field__swatch {
  box-sizing: border-box;
  width: 28px;
  height: 24px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.hex-color-field__hex {
  box-sizing: border-box;
  width: 7.4em;
  height: 24px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.02em;
  padding: 1px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #334155;
}
</style>
