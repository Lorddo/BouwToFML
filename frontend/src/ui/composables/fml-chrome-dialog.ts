import { ref } from 'vue'
import { tGlobal } from '@/ui/i18n'

export type FmlChromeDialogKind = 'alert' | 'confirm' | 'prompt'

export interface FmlChromeDialogRequest {
  kind: FmlChromeDialogKind
  title: string
  message?: string
  detail?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

export interface FmlChromeDialogState {
  request: FmlChromeDialogRequest
  inputValue: string
}

type DialogResult = boolean | string | null

interface PendingDialog {
  state: FmlChromeDialogState
  resolve: (value: DialogResult) => void
}

const pending = ref<PendingDialog | null>(null)
let hostCount = 0

export function hasFmlChromeDialogHost(): boolean {
  return hostCount > 0
}

export function registerFmlChromeDialogHost(): () => void {
  hostCount += 1
  return () => {
    hostCount = Math.max(0, hostCount - 1)
    if (hostCount === 0 && pending.value) {
      const current = pending.value
      pending.value = null
      current.resolve(current.state.request.kind === 'prompt' ? null : false)
    }
  }
}

/** Test-only: drop host + pending so specs don't leak native fallbacks. */
export function resetFmlChromeDialogForTests(): void {
  if (pending.value) {
    const current = pending.value
    pending.value = null
    current.resolve(current.state.request.kind === 'prompt' ? null : false)
  }
  hostCount = 0
}

export function fmlChromeDialogState(): typeof pending {
  return pending
}

function defaultsFor(request: FmlChromeDialogRequest): FmlChromeDialogRequest {
  return {
    ...request,
    confirmLabel:
      request.confirmLabel ??
      (request.kind === 'alert' ? tGlobal('common.dismiss') : tGlobal('common.apply')),
    cancelLabel: request.cancelLabel ?? tGlobal('common.cancel'),
  }
}

export function showFmlChromeDialog(request: FmlChromeDialogRequest): Promise<DialogResult> {
  if (pending.value) {
    const previous = pending.value
    pending.value = null
    previous.resolve(previous.state.request.kind === 'prompt' ? null : false)
  }

  if (hostCount === 0) {
    return Promise.resolve(nativeFallback(request))
  }

  return new Promise((resolve) => {
    pending.value = {
      state: {
        request: defaultsFor(request),
        inputValue: request.defaultValue ?? '',
      },
      resolve,
    }
  })
}

function nativeFallback(request: FmlChromeDialogRequest): DialogResult {
  const text = [request.message, request.detail].filter(Boolean).join('\n\n')
  const body = text.length > 0 ? `${request.title}\n\n${text}` : request.title
  if (request.kind === 'prompt') {
    return window.prompt(body, request.defaultValue ?? '')
  }
  if (request.kind === 'alert') {
    window.alert(body)
    return true
  }
  return window.confirm(body)
}

export function resolveFmlChromeDialog(value: DialogResult): void {
  const current = pending.value
  if (!current) return
  pending.value = null
  current.resolve(value)
}

export function cancelFmlChromeDialog(): void {
  const kind = pending.value?.state.request.kind
  resolveFmlChromeDialog(kind === 'prompt' ? null : false)
}

export function confirmFmlChromeDialog(): void {
  const current = pending.value
  if (!current) return
  if (current.state.request.kind === 'prompt') {
    resolveFmlChromeDialog(current.state.inputValue)
    return
  }
  resolveFmlChromeDialog(true)
}

export async function alertFmlChrome(request: Omit<FmlChromeDialogRequest, 'kind'>): Promise<void> {
  await showFmlChromeDialog({ ...request, kind: 'alert' })
}

export async function confirmFmlChrome(
  request: Omit<FmlChromeDialogRequest, 'kind'>,
): Promise<boolean> {
  return (await showFmlChromeDialog({ ...request, kind: 'confirm' })) === true
}

export async function promptFmlChrome(
  request: Omit<FmlChromeDialogRequest, 'kind'>,
): Promise<string | null> {
  const result = await showFmlChromeDialog({ ...request, kind: 'prompt' })
  return typeof result === 'string' ? result : null
}

export async function promptFacadeGroupName(): Promise<string | null> {
  const name = await promptFmlChrome({
    title: tGlobal('result.toolbar.facadeGroupNameTitle'),
    message: tGlobal('result.toolbar.facadeGroupNameHint'),
    defaultValue: tGlobal('result.toolbar.facadeGroupNameDefault'),
    placeholder: tGlobal('result.toolbar.facadeGroupNameDefault'),
    confirmLabel: tGlobal('common.apply'),
  })
  if (name == null) return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : null
}
