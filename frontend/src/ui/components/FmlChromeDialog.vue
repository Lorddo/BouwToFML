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
    listEdit?: boolean
    choice?: boolean
    listItems?: Array<{ id: string; name: string }>
    listManage?: boolean
    listAddLabel?: string
    listRemoveLabel?: string
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
    listEdit: false,
    choice: false,
    listItems: () => [],
    listManage: false,
    listAddLabel: '',
    listRemoveLabel: '',
    cancelLabel: '',
    hideCancel: false,
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
  'update:inputValue': [value: string]
  'update:listItemName': [id: string, name: string]
  'list-add': []
  'list-remove': [id: string]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const confirmRef = ref<HTMLButtonElement | null>(null)

function focusPrimary(): void {
  void nextTick(() => {
    if (props.input || props.listEdit || props.choice) {
      const first = props.choice
        ? document.querySelector<HTMLInputElement>(
            '.fml-chrome-dialog__choice-input:checked, .fml-chrome-dialog__choice-input',
          )
        : props.listEdit
          ? document.querySelector<HTMLInputElement>('.fml-chrome-dialog__list-input')
          : inputRef.value
      first?.focus()
      if (props.input || props.listEdit) first?.select()
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
    if (event.target instanceof HTMLButtonElement && event.target !== confirmRef.value) return
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
      <div
        class="fml-chrome-dialog__card"
        :class="{ 'fml-chrome-dialog__card--wide': listEdit || choice }"
      >
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
        <div v-if="listEdit" class="fml-chrome-dialog__list">
          <label v-for="row in listItems" :key="row.id" class="fml-chrome-dialog__list-row">
            <input
              class="fml-chrome-dialog__input fml-chrome-dialog__list-input"
              type="text"
              :value="row.name"
              @input="
                emit('update:listItemName', row.id, ($event.target as HTMLInputElement).value)
              "
            />
            <button
              v-if="listManage"
              type="button"
              class="fml-chrome-dialog__list-remove"
              :title="listRemoveLabel"
              :aria-label="listRemoveLabel"
              @click="emit('list-remove', row.id)"
            >
              −
            </button>
          </label>
          <button
            v-if="listManage"
            type="button"
            class="fml-chrome-dialog__list-add"
            @click="emit('list-add')"
          >
            {{ listAddLabel || '+' }}
          </button>
        </div>
        <div
          v-if="choice"
          class="fml-chrome-dialog__list"
          role="radiogroup"
          :aria-labelledby="'fml-chrome-dialog-title'"
        >
          <label
            v-for="row in listItems"
            :key="row.id"
            class="fml-chrome-dialog__choice"
            :class="{ 'is-on': inputValue === row.id }"
          >
            <input
              class="fml-chrome-dialog__choice-input"
              type="radio"
              name="fml-chrome-dialog-choice"
              :value="row.id"
              :checked="inputValue === row.id"
              @change="emit('update:inputValue', row.id)"
            />
            <span>{{ row.name }}</span>
          </label>
        </div>
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

.fml-chrome-dialog__card--wide {
  width: min(480px, 100%);
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

.fml-chrome-dialog__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0 10px;
  max-height: min(50vh, 320px);
  overflow: auto;
}

.fml-chrome-dialog__list-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.fml-chrome-dialog__list-input {
  margin: 0;
  flex: 1;
}

.fml-chrome-dialog__list-remove,
.fml-chrome-dialog__list-add {
  width: 28px;
  height: 32px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  color: #475569;
}

.fml-chrome-dialog__list-add {
  width: auto;
  padding: 0 10px;
  align-self: flex-start;
  min-height: 32px;
}

.fml-chrome-dialog__choice {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
  font-size: 13px;
  cursor: pointer;
}

.fml-chrome-dialog__choice.is-on {
  border-color: var(--fml-accent, #2563eb);
  background: #eff6ff;
}

.fml-chrome-dialog__choice-input {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--fml-accent, #2563eb);
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
