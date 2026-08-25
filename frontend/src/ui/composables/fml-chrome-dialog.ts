import { ref } from 'vue'
import { tGlobal } from '@/ui/i18n'

export type FmlChromeDialogKind = 'alert' | 'confirm' | 'prompt' | 'listEdit'

export type FacadeGroupEditRow = { id: string; name: string }

export interface FmlChromeDialogRequest {
  kind: FmlChromeDialogKind
  title: string
  message?: string
  detail?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Voor `listEdit`: startwaarden per rij. */
  listItems?: FacadeGroupEditRow[]
}

export interface FmlChromeDialogState {
  request: FmlChromeDialogRequest
  inputValue: string
  listItems: FacadeGroupEditRow[]
}

export type DialogResult = boolean | string | null | FacadeGroupEditRow[]

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
      current.resolve(cancelResultFor(current.state.request.kind))
    }
  }
}

/** Test-only: drop host + pending so specs don't leak native fallbacks. */
export function resetFmlChromeDialogForTests(): void {
  if (pending.value) {
    const current = pending.value
    pending.value = null
    current.resolve(cancelResultFor(current.state.request.kind))
  }
  hostCount = 0
}

export function fmlChromeDialogState(): typeof pending {
  return pending
}

function cancelResultFor(kind: FmlChromeDialogKind): DialogResult {
  if (kind === 'prompt' || kind === 'listEdit') return null
  return false
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
    previous.resolve(cancelResultFor(previous.state.request.kind))
  }

  if (hostCount === 0) {
    return Promise.resolve(nativeFallback(request))
  }

  return new Promise((resolve) => {
    pending.value = {
      state: {
        request: defaultsFor(request),
        inputValue: request.defaultValue ?? '',
        listItems: (request.listItems ?? []).map((row) => ({ ...row })),
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
  if (request.kind === 'listEdit') {
    // Geen nette multi-edit in native; annuleer.
    window.alert(body)
    return null
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
  resolveFmlChromeDialog(kind ? cancelResultFor(kind) : null)
}

export function confirmFmlChromeDialog(): void {
  const current = pending.value
  if (!current) return
  if (current.state.request.kind === 'prompt') {
    resolveFmlChromeDialog(current.state.inputValue)
    return
  }
  if (current.state.request.kind === 'listEdit') {
    resolveFmlChromeDialog(current.state.listItems.map((row) => ({ ...row })))
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

export async function confirmFacadeStackedFloors(params: {
  count: number
  mode: 'assign' | 'detach'
}): Promise<boolean> {
  const messageKey =
    params.mode === 'detach'
      ? params.count === 1
        ? 'result.toolbar.facadeGroupStackedDetachOne'
        : 'result.toolbar.facadeGroupStackedDetachMany'
      : params.count === 1
        ? 'result.toolbar.facadeGroupStackedAssignOne'
        : 'result.toolbar.facadeGroupStackedAssignMany'
  return confirmFmlChrome({
    title: tGlobal('result.toolbar.facadeGroupStackedTitle'),
    message: tGlobal(messageKey, { count: params.count }),
    confirmLabel: tGlobal('result.toolbar.facadeGroupStackedYes'),
    cancelLabel: tGlobal('result.toolbar.facadeGroupStackedNo'),
  })
}

export async function promptFacadeGroupName(opts?: {
  currentName?: string
}): Promise<string | null> {
  const fallback = tGlobal('result.toolbar.facadeGroupNameDefault')
  const current = opts?.currentName?.trim()
  const name = await promptFmlChrome({
    title: tGlobal('result.toolbar.facadeGroupNameTitle'),
    message: tGlobal('result.toolbar.facadeGroupNameHint'),
    defaultValue: current && current.length > 0 ? current : fallback,
    placeholder: fallback,
    confirmLabel: tGlobal('common.apply'),
  })
  if (name == null) return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Bewerk alle gevelgroep-namen in één dialoog. Null = geannuleerd. */
export async function promptFacadeGroupsEdit(
  groups: readonly FacadeGroupEditRow[],
): Promise<FacadeGroupEditRow[] | null> {
  const result = await showFmlChromeDialog({
    kind: 'listEdit',
    title: tGlobal('result.toolbar.facadeGroupEditAllTitle'),
    message: tGlobal('result.toolbar.facadeGroupEditAllHint'),
    listItems: groups.map((g) => ({ id: g.id, name: g.name })),
    confirmLabel: tGlobal('common.apply'),
  })
  if (!Array.isArray(result)) return null
  return result.map((row) => ({
    id: row.id,
    name: row.name.trim().length > 0 ? row.name.trim() : row.id,
  }))
}
