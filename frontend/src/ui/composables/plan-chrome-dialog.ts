import { ref } from 'vue'
import { tGlobal } from '@/ui/i18n'

export type PlanChromeDialogKind = 'alert' | 'confirm' | 'prompt' | 'listEdit' | 'choice'

export type FacadeGroupEditRow = { id: string; name: string }

export interface PlanChromeDialogRequest {
  kind: PlanChromeDialogKind
  title: string
  message?: string
  detail?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Voor `listEdit` (namen) en `choice` (opties; `id` = waarde). */
  listItems?: FacadeGroupEditRow[]
  /** listEdit: +/− rijen (gevelgroep-catalogus). */
  listManage?: boolean
  listAddLabel?: string
  listRemoveLabel?: string
  defaultNewName?: string
}

export interface PlanChromeDialogState {
  request: PlanChromeDialogRequest
  inputValue: string
  listItems: FacadeGroupEditRow[]
}

export type DialogResult = boolean | string | null | FacadeGroupEditRow[]

interface PendingDialog {
  state: PlanChromeDialogState
  resolve: (value: DialogResult) => void
}

const pending = ref<PendingDialog | null>(null)
let hostCount = 0

export function hasPlanChromeDialogHost(): boolean {
  return hostCount > 0
}

export function registerPlanChromeDialogHost(): () => void {
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
export function resetPlanChromeDialogForTests(): void {
  if (pending.value) {
    const current = pending.value
    pending.value = null
    current.resolve(cancelResultFor(current.state.request.kind))
  }
  hostCount = 0
}

export function planChromeDialogState(): typeof pending {
  return pending
}

function cancelResultFor(kind: PlanChromeDialogKind): DialogResult {
  if (kind === 'prompt' || kind === 'listEdit' || kind === 'choice') return null
  return false
}

function defaultsFor(request: PlanChromeDialogRequest): PlanChromeDialogRequest {
  return {
    ...request,
    confirmLabel:
      request.confirmLabel ??
      (request.kind === 'alert' ? tGlobal('common.dismiss') : tGlobal('common.apply')),
    cancelLabel: request.cancelLabel ?? tGlobal('common.cancel'),
  }
}

export function showPlanChromeDialog(request: PlanChromeDialogRequest): Promise<DialogResult> {
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

function nativeFallback(request: PlanChromeDialogRequest): DialogResult {
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
  if (request.kind === 'choice') {
    const options = request.listItems ?? []
    const fallback = request.defaultValue ?? options[0]?.id ?? ''
    const picked = window.prompt(body, fallback)
    if (picked == null) return null
    const trimmed = picked.trim()
    return options.some((row) => row.id === trimmed) ? trimmed : fallback
  }
  if (request.kind === 'alert') {
    window.alert(body)
    return true
  }
  return window.confirm(body)
}

export function resolvePlanChromeDialog(value: DialogResult): void {
  const current = pending.value
  if (!current) return
  pending.value = null
  current.resolve(value)
}

export function cancelPlanChromeDialog(): void {
  const kind = pending.value?.state.request.kind
  resolvePlanChromeDialog(kind ? cancelResultFor(kind) : null)
}

export function confirmPlanChromeDialog(): void {
  const current = pending.value
  if (!current) return
  if (current.state.request.kind === 'prompt' || current.state.request.kind === 'choice') {
    resolvePlanChromeDialog(current.state.inputValue)
    return
  }
  if (current.state.request.kind === 'listEdit') {
    resolvePlanChromeDialog(current.state.listItems.map((row) => ({ ...row })))
    return
  }
  resolvePlanChromeDialog(true)
}

export async function alertPlanChrome(request: Omit<PlanChromeDialogRequest, 'kind'>): Promise<void> {
  await showPlanChromeDialog({ ...request, kind: 'alert' })
}

export async function confirmPlanChrome(
  request: Omit<PlanChromeDialogRequest, 'kind'>,
): Promise<boolean> {
  return (await showPlanChromeDialog({ ...request, kind: 'confirm' })) === true
}

export async function promptPlanChrome(
  request: Omit<PlanChromeDialogRequest, 'kind'>,
): Promise<string | null> {
  const result = await showPlanChromeDialog({ ...request, kind: 'prompt' })
  return typeof result === 'string' ? result : null
}

/** Radio-keuze; resultaat = gekozen `id`, of null bij annuleren. */
export async function promptPlanChromeChoice(
  request: Omit<PlanChromeDialogRequest, 'kind'>,
): Promise<string | null> {
  const choices = request.listItems ?? []
  if (choices.length === 0) return null
  const defaultValue =
    request.defaultValue && choices.some((row) => row.id === request.defaultValue)
      ? request.defaultValue
      : choices[0]?.id
  const result = await showPlanChromeDialog({
    ...request,
    kind: 'choice',
    defaultValue,
    listItems: choices,
  })
  return typeof result === 'string' && choices.some((row) => row.id === result) ? result : null
}

export type PlanExportFormat = 'fml' | 'plg'

/** Zelfde FML/PLG-keuze als stap-4 «Project downloaden». Null = geannuleerd. */
export async function promptPlanExportFormat(): Promise<PlanExportFormat | null> {
  const picked = await promptPlanChromeChoice({
    title: tGlobal('result.downloadProjectTitle'),
    message: tGlobal('result.downloadProjectMessage'),
    listItems: [
      { id: 'fml', name: tGlobal('result.downloadFml') },
      { id: 'plg', name: tGlobal('result.downloadPlg') },
    ],
    defaultValue: 'fml',
    confirmLabel: tGlobal('common.apply'),
  })
  if (picked === 'fml' || picked === 'plg') return picked
  return null
}

export type FacadeSelectScope = 'floor' | 'all'

/** Chip «Selecteer»: huidige verdieping of alle verdiepingen. Null = geannuleerd. */
export async function promptFacadeSelectScope(params?: {
  name?: string
}): Promise<FacadeSelectScope | null> {
  const name = params?.name?.trim()
  const picked = await promptPlanChromeChoice({
    title: tGlobal('result.toolbar.facadeGroupSelectScopeTitle'),
    message: name
      ? tGlobal('result.toolbar.facadeGroupSelectScopeMessage', { name })
      : tGlobal('result.toolbar.facadeGroupSelectScopeHint'),
    defaultValue: 'floor',
    listItems: [
      { id: 'floor', name: tGlobal('result.toolbar.facadeGroupSelectScopeFloor') },
      { id: 'all', name: tGlobal('result.toolbar.facadeGroupSelectScopeAll') },
    ],
    confirmLabel: tGlobal('common.apply'),
  })
  if (picked === 'floor' || picked === 'all') return picked
  return null
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
  return confirmPlanChrome({
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
  const name = await promptPlanChrome({
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

/** Bewerk gevelgroepen (naam, toevoegen, verwijderen). Null = geannuleerd. */
export async function promptFacadeGroupsEdit(
  groups: readonly FacadeGroupEditRow[],
): Promise<FacadeGroupEditRow[] | null> {
  const result = await showPlanChromeDialog({
    kind: 'listEdit',
    title: tGlobal('result.toolbar.facadeGroupEditAllTitle'),
    message: tGlobal('result.toolbar.facadeGroupEditAllHint'),
    listItems: groups.map((g) => ({ id: g.id, name: g.name })),
    listManage: true,
    listAddLabel: tGlobal('settings.facadeGroupAdd'),
    listRemoveLabel: tGlobal('settings.facadeGroupRemove'),
    defaultNewName: tGlobal('result.toolbar.facadeGroupNameDefault'),
    confirmLabel: tGlobal('common.apply'),
  })
  if (!Array.isArray(result)) return null
  return result.map((row) => ({
    id: row.id,
    name: row.name.trim().length > 0 ? row.name.trim() : row.id,
  }))
}
