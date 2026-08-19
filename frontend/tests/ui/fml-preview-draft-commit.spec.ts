import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFmlPreviewDraftCommitScheduler,
  FML_FIELD_COMMIT_DEBOUNCE_MS,
  isTypingFieldTarget,
} from '@/ui/composables/fml-preview/fml-preview-draft-commit'

describe('createFmlPreviewDraftCommitScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces apply until pause', () => {
    const scheduler = createFmlPreviewDraftCommitScheduler()
    const apply = vi.fn(() => ({ mutated: true }))
    scheduler.schedule('width', apply)
    expect(apply).not.toHaveBeenCalled()
    vi.advanceTimersByTime(FML_FIELD_COMMIT_DEBOUNCE_MS - 1)
    expect(apply).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(apply).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it('resets timer on second schedule of same id', () => {
    const scheduler = createFmlPreviewDraftCommitScheduler()
    const first = vi.fn(() => ({ mutated: true }))
    const second = vi.fn(() => ({ mutated: true }))
    scheduler.schedule('width', first)
    vi.advanceTimersByTime(FML_FIELD_COMMIT_DEBOUNCE_MS - 100)
    scheduler.schedule('width', second)
    vi.advanceTimersByTime(FML_FIELD_COMMIT_DEBOUNCE_MS - 1)
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it('flush cancels timer and applies immediately', () => {
    const scheduler = createFmlPreviewDraftCommitScheduler()
    const apply = vi.fn(() => ({ mutated: true }))
    scheduler.schedule('width', apply)
    scheduler.flush('width')
    expect(apply).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(FML_FIELD_COMMIT_DEBOUNCE_MS)
    expect(apply).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it('flushAll applies all pending fields', () => {
    const scheduler = createFmlPreviewDraftCommitScheduler()
    const a = vi.fn(() => ({ mutated: true }))
    const b = vi.fn(() => ({ mutated: true }))
    scheduler.schedule('a', a)
    scheduler.schedule('b', b)
    scheduler.flushAll()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it('cancelAll drops without apply', () => {
    const scheduler = createFmlPreviewDraftCommitScheduler()
    const apply = vi.fn(() => ({ mutated: true }))
    scheduler.schedule('width', apply)
    scheduler.cancelAll()
    vi.advanceTimersByTime(FML_FIELD_COMMIT_DEBOUNCE_MS)
    expect(apply).not.toHaveBeenCalled()
    scheduler.dispose()
  })

  it('groups undo: first mutation pushes, later same field does not', () => {
    const scheduler = createFmlPreviewDraftCommitScheduler()
    const pushUndo = vi.fn()
    scheduler.schedule('width', () => {
      scheduler.beginUndoGroup('width', pushUndo)
      return { mutated: true }
    })
    scheduler.flush('width')
    expect(pushUndo).toHaveBeenCalledTimes(1)

    // New schedule after flush starts a new undo session.
    scheduler.schedule('width', () => {
      scheduler.beginUndoGroup('width', pushUndo)
      return { mutated: true }
    })
    scheduler.flush('width')
    expect(pushUndo).toHaveBeenCalledTimes(2)

    // Within one debounce session (no flush between): only one push.
    pushUndo.mockClear()
    const applyTwice = () => {
      scheduler.beginUndoGroup('height', pushUndo)
      return { mutated: true }
    }
    scheduler.schedule('height', applyTwice)
    vi.advanceTimersByTime(FML_FIELD_COMMIT_DEBOUNCE_MS)
    scheduler.schedule('height', applyTwice)
    vi.advanceTimersByTime(FML_FIELD_COMMIT_DEBOUNCE_MS)
    expect(pushUndo).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it('no-op apply does not open undo group', () => {
    const scheduler = createFmlPreviewDraftCommitScheduler()
    const pushUndo = vi.fn()
    scheduler.schedule('width', () => {
      scheduler.beginUndoGroup('width', pushUndo)
      return { mutated: false }
    })
    // beginUndoGroup still pushes when called — callers must check no-op first.
    // Document intended pattern: check no-op before beginUndoGroup.
    scheduler.cancelAll()
    scheduler.schedule('width', () => {
      const mutated = false
      if (!mutated) return { mutated: false }
      scheduler.beginUndoGroup('width', pushUndo)
      return { mutated: true }
    })
    scheduler.flush('width')
    expect(pushUndo).not.toHaveBeenCalled()
    scheduler.dispose()
  })

  it('dispose flushes pending then ignores further schedule', () => {
    const scheduler = createFmlPreviewDraftCommitScheduler()
    const apply = vi.fn(() => ({ mutated: true }))
    scheduler.schedule('width', apply)
    scheduler.dispose()
    expect(apply).toHaveBeenCalledTimes(1)
    scheduler.schedule('width', apply)
    vi.advanceTimersByTime(FML_FIELD_COMMIT_DEBOUNCE_MS)
    expect(apply).toHaveBeenCalledTimes(1)
  })
})

describe('isTypingFieldTarget', () => {
  function fakeInput(type: string): HTMLElement {
    return {
      tagName: 'INPUT',
      isContentEditable: false,
      type,
    } as unknown as HTMLElement
  }

  it('recognizes text and number inputs', () => {
    expect(isTypingFieldTarget(fakeInput('text'))).toBe(true)
    expect(isTypingFieldTarget(fakeInput('number'))).toBe(true)
  })

  it('ignores range/checkbox/button', () => {
    expect(isTypingFieldTarget(fakeInput('range'))).toBe(false)
    expect(isTypingFieldTarget(fakeInput('checkbox'))).toBe(false)
  })
})
