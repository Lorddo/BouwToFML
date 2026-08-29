import { onBeforeUnmount, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { isTypingFieldTarget } from '@/ui/composables/fml-preview/fml-preview-draft-commit'

export type ToolbeltHotkey = 'Delete' | 'Escape'

/** Higher wins. Same priority → last registered. */
export const TOOLBELT_HOTKEY_PRIORITY = {
  /** Leave the active tool (X on the strip). */
  tool: 20,
  /** Delete the selected object. */
  object: 20,
  /** Deselect / clear tape lines. */
  chrome: 10,
} as const

type Entry = {
  id: number
  priority: number
  run: () => void
}

const stacks: Record<ToolbeltHotkey, Entry[]> = {
  Delete: [],
  Escape: [],
}

let nextId = 1
let listening = false

function entryCount(): number {
  return stacks.Delete.length + stacks.Escape.length
}

function syncWindowListener(): void {
  if (typeof window === 'undefined') return
  const n = entryCount()
  if (n > 0 && !listening) {
    window.addEventListener('keydown', onToolbeltHotkeyKeydown)
    listening = true
    return
  }
  if (n === 0 && listening) {
    window.removeEventListener('keydown', onToolbeltHotkeyKeydown)
    listening = false
  }
}

function pickBest(key: ToolbeltHotkey): Entry | null {
  const list = stacks[key]
  if (list.length === 0) return null
  let best = list[0]
  for (let i = 1; i < list.length; i++) {
    const entry = list[i]
    if (
      entry.priority > best.priority ||
      (entry.priority === best.priority && entry.id > best.id)
    ) {
      best = entry
    }
  }
  return best
}

export function hasToolbeltHotkey(key: ToolbeltHotkey): boolean {
  return stacks[key].length > 0
}

export function dispatchToolbeltHotkey(key: ToolbeltHotkey): boolean {
  const best = pickBest(key)
  if (!best) return false
  best.run()
  return true
}

export function onToolbeltHotkeyKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return
  if (event.key === 'Escape') {
    const typing = isTypingFieldTarget(event.target)
    if (typing && event.target instanceof HTMLElement) event.target.blur()
    if (dispatchToolbeltHotkey('Escape')) event.preventDefault()
    return
  }
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  if (isTypingFieldTarget(event.target)) return
  if (dispatchToolbeltHotkey('Delete')) event.preventDefault()
}

export function registerToolbeltHotkey(
  key: ToolbeltHotkey,
  run: () => void,
  priority: number = TOOLBELT_HOTKEY_PRIORITY.chrome,
): () => void {
  const id = nextId++
  stacks[key].push({ id, priority, run })
  syncWindowListener()
  return () => {
    stacks[key] = stacks[key].filter((entry) => entry.id !== id)
    syncWindowListener()
  }
}

/** Vue: bind a visible chrome action to Delete or Escape. */
export function useToolbeltHotkey(
  key: MaybeRefOrGetter<ToolbeltHotkey | null | undefined>,
  run: () => void,
  options?: {
    enabled?: MaybeRefOrGetter<boolean>
    priority?: MaybeRefOrGetter<number>
  },
): void {
  let unregister: (() => void) | null = null

  function stop(): void {
    unregister?.()
    unregister = null
  }

  function start(): void {
    stop()
    const hotkey = toValue(key)
    if (!hotkey) return
    if (options?.enabled != null && !toValue(options.enabled)) return
    const priority =
      options?.priority != null ? toValue(options.priority) : TOOLBELT_HOTKEY_PRIORITY.chrome
    unregister = registerToolbeltHotkey(hotkey, run, priority)
  }

  watch(
    [
      () => toValue(key),
      () => (options?.enabled != null ? toValue(options.enabled) : true),
      () =>
        options?.priority != null ? toValue(options.priority) : TOOLBELT_HOTKEY_PRIORITY.chrome,
    ],
    start,
    { immediate: true },
  )

  onBeforeUnmount(stop)
}

/** Test helper: drop all registrations + listener. */
export function resetToolbeltHotkeysForTests(): void {
  stacks.Delete = []
  stacks.Escape = []
  nextId = 1
  if (listening && typeof window !== 'undefined') {
    window.removeEventListener('keydown', onToolbeltHotkeyKeydown)
  }
  listening = false
}
