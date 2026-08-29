<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import FmlChromeDialog from './FmlChromeDialog.vue'
import {
  cancelFmlChromeDialog,
  confirmFmlChromeDialog,
  fmlChromeDialogState,
  hasFmlChromeDialogHost,
  registerFmlChromeDialogHost,
} from '@/ui/composables/fml-chrome-dialog'

const pending = fmlChromeDialogState()
const isActiveHost = ref(false)
let unregister: (() => void) | null = null

const open = computed(() => isActiveHost.value && pending.value != null)
const request = computed(() => pending.value?.state.request ?? null)
const inputValue = computed(() => pending.value?.state.inputValue ?? '')
const listItems = computed(() => pending.value?.state.listItems ?? [])

function onInputValue(value: string): void {
  if (!pending.value) return
  pending.value.state.inputValue = value
}

function onListItemName(id: string, name: string): void {
  if (!pending.value) return
  const row = pending.value.state.listItems.find((item) => item.id === id)
  if (row) row.name = name
}

onMounted(() => {
  if (hasFmlChromeDialogHost()) return
  unregister = registerFmlChromeDialogHost()
  isActiveHost.value = true
})

onBeforeUnmount(() => {
  unregister?.()
  unregister = null
  isActiveHost.value = false
})
</script>

<template>
  <FmlChromeDialog
    v-if="isActiveHost && request"
    :open="open"
    :title="request.title"
    :message="request.message"
    :detail="request.detail"
    :input="request.kind === 'prompt'"
    :input-value="inputValue"
    :placeholder="request.placeholder"
    :list-edit="request.kind === 'listEdit'"
    :choice="request.kind === 'choice'"
    :list-items="listItems"
    :confirm-label="request.confirmLabel ?? ''"
    :cancel-label="request.cancelLabel"
    :hide-cancel="request.kind === 'alert'"
    @confirm="confirmFmlChromeDialog"
    @cancel="cancelFmlChromeDialog"
    @update:input-value="onInputValue"
    @update:list-item-name="onListItemName"
  />
</template>
