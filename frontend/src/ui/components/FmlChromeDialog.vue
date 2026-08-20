<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message?: string
    detail?: string
    input?: boolean
    inputValue?: string
    placeholder?: string
    confirmLabel: string
    cancelLabel?: string
    hideCancel?: boolean
  }>(),
  {
    message: '',
    detail: '',
    input: false,
    inputValue: '',
    placeholder: '',
    cancelLabel: '',
    hideCancel: false,
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
  'update:inputValue': [value: string]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const confirmRef = ref<HTMLButtonElement | null>(null)

function focusPrimary(): void {
  void nextTick(() => {
    if (props.input) {
      inputRef.value?.focus()
      inputRef.value?.select()
      return
    }
    confirmRef.value?.focus()
  })
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('cancel')
    return
  }
  if (event.key === 'Enter' && !event.defaultPrevented) {
    if (event.target instanceof HTMLTextAreaElement) return
    event.preventDefault()
    emit('confirm')
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown, true)
      focusPrimary()
      return
    }
    document.removeEventListener('keydown', onKeydown, true)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fml-chrome-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'fml-chrome-dialog-title'"
    >
      <div class="fml-chrome-dialog__backdrop" @click="emit('cancel')" />
      <div class="fml-chrome-dialog__card">
        <div class="fml-chrome-dialog__head">
          <h3 id="fml-chrome-dialog-title">{{ title }}</h3>
          <button type="button" :aria-label="cancelLabel || confirmLabel" @click="emit('cancel')">
            ×
          </button>
        </div>
        <p v-if="message" class="fml-chrome-dialog__body">{{ message }}</p>
        <p v-if="detail" class="fml-chrome-dialog__detail">{{ detail }}</p>
        <input
          v-if="input"
          ref="inputRef"
          class="fml-chrome-dialog__input"
          type="text"
          :value="inputValue"
          :placeholder="placeholder"
          @input="emit('update:inputValue', ($event.target as HTMLInputElement).value)"
        />
        <div class="fml-chrome-dialog__actions">
          <button
            v-if="!hideCancel"
            type="button"
            class="fml-chrome-dialog__btn"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <button
            ref="confirmRef"
            type="button"
            class="fml-chrome-dialog__btn fml-chrome-dialog__btn--primary"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@import '../fml-preview/fml-canvas-tokens.css';

.fml-chrome-dialog {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px))
    max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
  pointer-events: none;
}

.fml-chrome-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(15 23 42 / 0.32);
  pointer-events: auto;
}

.fml-chrome-dialog__card {
  position: relative;
  width: min(420px, 100%);
  padding: 14px 16px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgb(15 23 42 / 0.18);
  pointer-events: auto;
}

.fml-chrome-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.fml-chrome-dialog__head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  color: #0f172a;
}

.fml-chrome-dialog__head button {
  flex-shrink: 0;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.fml-chrome-dialog__body,
.fml-chrome-dialog__detail {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.45;
  color: #334155;
}

.fml-chrome-dialog__detail {
  color: var(--fml-muted, #64748b);
  font-size: 12px;
}

.fml-chrome-dialog__input {
  width: 100%;
  height: 36px;
  margin: 4px 0 10px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-sizing: border-box;
  font-size: var(--fml-touch-input-font-size, 16px);
  color: #0f172a;
}

.fml-chrome-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.fml-chrome-dialog__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
  font-size: 13px;
  cursor: pointer;
}

.fml-chrome-dialog__btn--primary {
  border-color: var(--fml-accent, #2563eb);
  background: var(--fml-accent, #2563eb);
  color: #fff;
  font-weight: 600;
}
</style>
