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
            '.plan-chrome-dialog__choice-input:checked, .plan-chrome-dialog__choice-input',
          )
        : props.listEdit
          ? document.querySelector<HTMLInputElement>('.plan-chrome-dialog__list-input')
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
      class="plan-chrome-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'plan-chrome-dialog-title'"
    >
      <div class="plan-chrome-dialog__backdrop" @click="emit('cancel')" />
      <div
        class="plan-chrome-dialog__card"
        :class="{ 'plan-chrome-dialog__card--wide': listEdit || choice }"
      >
        <div class="plan-chrome-dialog__head">
          <h3 id="plan-chrome-dialog-title">{{ title }}</h3>
          <button type="button" :aria-label="cancelLabel || confirmLabel" @click="emit('cancel')">
            ×
          </button>
        </div>
        <p v-if="message" class="plan-chrome-dialog__body">{{ message }}</p>
        <p v-if="detail" class="plan-chrome-dialog__detail">{{ detail }}</p>
        <input
          v-if="input"
          ref="inputRef"
          class="plan-chrome-dialog__input"
          type="text"
          :value="inputValue"
          :placeholder="placeholder"
          @input="emit('update:inputValue', ($event.target as HTMLInputElement).value)"
        />
        <div v-if="listEdit" class="plan-chrome-dialog__list">
          <label v-for="row in listItems" :key="row.id" class="plan-chrome-dialog__list-row">
            <input
              class="plan-chrome-dialog__input plan-chrome-dialog__list-input"
              type="text"
              :value="row.name"
              @input="
                emit('update:listItemName', row.id, ($event.target as HTMLInputElement).value)
              "
            />
            <button
              v-if="listManage"
              type="button"
              class="plan-chrome-dialog__list-remove"
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
            class="plan-chrome-dialog__list-add"
            @click="emit('list-add')"
          >
            {{ listAddLabel || '+' }}
          </button>
        </div>
        <div
          v-if="choice"
          class="plan-chrome-dialog__list"
          role="radiogroup"
          :aria-labelledby="'plan-chrome-dialog-title'"
        >
          <label
            v-for="row in listItems"
            :key="row.id"
            class="plan-chrome-dialog__choice"
            :class="{ 'is-on': inputValue === row.id }"
          >
            <input
              class="plan-chrome-dialog__choice-input"
              type="radio"
              name="plan-chrome-dialog-choice"
              :value="row.id"
              :checked="inputValue === row.id"
              @change="emit('update:inputValue', row.id)"
            />
            <span>{{ row.name }}</span>
          </label>
        </div>
        <div class="plan-chrome-dialog__actions">
          <button
            v-if="!hideCancel"
            type="button"
            class="plan-chrome-dialog__btn"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <button
            ref="confirmRef"
            type="button"
            class="plan-chrome-dialog__btn plan-chrome-dialog__btn--primary"
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
@import '../plan-canvas/plan-canvas-tokens.css';

.plan-chrome-dialog {
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

.plan-chrome-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(15 23 42 / 0.32);
  pointer-events: auto;
}

.plan-chrome-dialog__card {
  position: relative;
  width: min(420px, 100%);
  padding: 14px 16px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgb(15 23 42 / 0.18);
  pointer-events: auto;
}

.plan-chrome-dialog__card--wide {
  width: min(480px, 100%);
}

.plan-chrome-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.plan-chrome-dialog__head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  color: #0f172a;
}

.plan-chrome-dialog__head button {
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

.plan-chrome-dialog__body,
.plan-chrome-dialog__detail {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.45;
  color: #334155;
}

.plan-chrome-dialog__detail {
  color: var(--plan-muted, #64748b);
  font-size: 12px;
}

.plan-chrome-dialog__input {
  width: 100%;
  height: 36px;
  margin: 4px 0 10px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-sizing: border-box;
  font-size: var(--plan-touch-input-font-size, 16px);
  color: #0f172a;
}

.plan-chrome-dialog__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0 10px;
  max-height: min(50vh, 320px);
  overflow: auto;
}

.plan-chrome-dialog__list-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.plan-chrome-dialog__list-input {
  margin: 0;
  flex: 1;
}

.plan-chrome-dialog__list-remove,
.plan-chrome-dialog__list-add {
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

.plan-chrome-dialog__list-add {
  width: auto;
  padding: 0 10px;
  align-self: flex-start;
  min-height: 32px;
}

.plan-chrome-dialog__choice {
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

.plan-chrome-dialog__choice.is-on {
  border-color: var(--plan-accent, #2563eb);
  background: #eff6ff;
}

.plan-chrome-dialog__choice-input {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--plan-accent, #2563eb);
}

.plan-chrome-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.plan-chrome-dialog__btn {
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

.plan-chrome-dialog__btn--primary {
  border-color: var(--plan-accent, #2563eb);
  background: var(--plan-accent, #2563eb);
  color: #fff;
  font-weight: 600;
}
</style>
