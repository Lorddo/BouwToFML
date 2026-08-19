/**
 * Debounced draft→plan commits for FML toolbelt number/text fields.
 *
 * - schedule: apply after debounce (typing pause)
 * - flush / flushAll: apply immediately (Enter, blur, leave selection)
 * - cancelAll: drop without apply (external plan replace)
 *
 * Apply closures must snapshot target ids + draft value at schedule time so a
 * later flush still hits the object that was being edited.
 */

import type { Ref } from 'vue'

export const FML_FIELD_COMMIT_DEBOUNCE_MS = 700

export type DraftCommitApplyResult = {
  /** True when the plan actually changed (triggers undo grouping). */
  mutated: boolean
}

export type DraftCommitApply = () => DraftCommitApplyResult | void

type PendingEntry = {
  apply: DraftCommitApply
  timer: ReturnType<typeof setTimeout> | null
}

export type FmlPreviewDraftCommitScheduler = {
  schedule: (id: string, apply: DraftCommitApply) => void
  flush: (id: string) => void
  flushAll: () => void
  cancelAll: () => void
  /** Call before a mutation that should share undo with prior applies of this field. */
  beginUndoGroup: (id: string, pushUndo: () => void) => void
  endUndoGroup: (id: string) => void
  dispose: () => void
}

export function createFmlPreviewDraftCommitScheduler(
  debounceMs: number = FML_FIELD_COMMIT_DEBOUNCE_MS,
): FmlPreviewDraftCommitScheduler {
  const pending = new Map<string, PendingEntry>()
  /** Field ids that already pushed undo in the current edit session. */
  const undoGrouped = new Set<string>()
  let disposed = false

  function clearTimer(entry: PendingEntry): void {
    if (entry.timer != null) {
      clearTimeout(entry.timer)
      entry.timer = null
    }
  }

  function runApply(id: string, apply: DraftCommitApply): void {
    const result = apply()
    const mutated = result == null ? true : result.mutated
    if (mutated) {
      undoGrouped.add(id)
    }
  }

  function schedule(id: string, apply: DraftCommitApply): void {
    if (disposed) return
    const existing = pending.get(id)
    if (existing) clearTimer(existing)
    const entry: PendingEntry = { apply, timer: null }
    entry.timer = setTimeout(() => {
      entry.timer = null
      pending.delete(id)
      runApply(id, apply)
    }, debounceMs)
    pending.set(id, entry)
  }

  function flush(id: string): void {
    const entry = pending.get(id)
    if (entry) {
      clearTimer(entry)
      pending.delete(id)
      runApply(id, entry.apply)
    }
    // Enter/blur ends the undo session for this field.
    undoGrouped.delete(id)
  }

  function flushAll(): void {
    const ids = [...pending.keys()]
    for (const id of ids) {
      const entry = pending.get(id)
      if (!entry) continue
      clearTimer(entry)
      pending.delete(id)
      runApply(id, entry.apply)
    }
    undoGrouped.clear()
  }

  function cancelAll(): void {
    for (const entry of pending.values()) clearTimer(entry)
    pending.clear()
    undoGrouped.clear()
  }

  function beginUndoGroup(id: string, pushUndo: () => void): void {
    if (undoGrouped.has(id)) return
    pushUndo()
    undoGrouped.add(id)
  }

  function endUndoGroup(id: string): void {
    undoGrouped.delete(id)
  }

  function dispose(): void {
    if (disposed) return
    // Unmount: flush pending so workspace floor remount does not lose drafts.
    flushAll()
    disposed = true
  }

  return {
    schedule,
    flush,
    flushAll,
    cancelAll,
    beginUndoGroup,
    endUndoGroup,
    dispose,
  }
}

/** True when Escape/Delete/Ctrl+Z should not steal focus from a typing field. */
export function isTypingFieldTarget(target: EventTarget | null): boolean {
  if (target == null || typeof target !== 'object') return false
  const el = target as HTMLElement & { type?: string }
  if (el.isContentEditable === true) return true
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : ''
  if (tag === 'TEXTAREA') return true
  if (tag !== 'INPUT') return false
  const type = (el.type || 'text').toLowerCase()
  if (
    type === 'range' ||
    type === 'checkbox' ||
    type === 'radio' ||
    type === 'button' ||
    type === 'submit' ||
    type === 'reset' ||
    type === 'file' ||
    type === 'color' ||
    type === 'hidden'
  ) {
    return false
  }
  return true
}

/**
 * Shared toolbelt number-field: draft + schedule + flush-on-commit.
 * Snapshot target ids inside `applyWithValue` before returning the apply closure.
 */
export function bindNumericDraftField(options: {
  fieldId: string
  draftCommit: FmlPreviewDraftCommitScheduler
  draft: Ref<number>
  mixed: Ref<boolean>
  /** Build apply closure; called with the numeric value after draft update. */
  applyWithValue: (value: number) => DraftCommitApply
}): {
  onInput: (event: Event) => void
  commit: () => void
} {
  const { fieldId, draftCommit, draft, mixed, applyWithValue } = options

  function onInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return
    draft.value = value
    mixed.value = false
    draftCommit.schedule(fieldId, applyWithValue(value))
  }

  function commit(): void {
    const value = draft.value
    draftCommit.schedule(fieldId, applyWithValue(value))
    draftCommit.flush(fieldId)
  }

  return { onInput, commit }
}
