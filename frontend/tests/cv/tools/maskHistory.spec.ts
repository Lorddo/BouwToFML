import { describe, expect, it } from 'vitest'
import { createByteArrayHistory } from '@/cv/tools/maskHistory'

describe('createByteArrayHistory', () => {
  it('push → undo → redo restores state; new push clears redo', () => {
    const history = createByteArrayHistory({ maxSteps: 10 })
    const current = new Uint8Array([0, 0, 0, 0])

    history.push(current)
    current.set([1, 1, 1, 1])
    expect(history.canUndo()).toBe(true)
    expect(history.canRedo()).toBe(false)

    expect(history.undo(current)).toBe(true)
    expect([...current]).toEqual([0, 0, 0, 0])
    expect(history.canUndo()).toBe(false)
    expect(history.canRedo()).toBe(true)

    expect(history.redo(current)).toBe(true)
    expect([...current]).toEqual([1, 1, 1, 1])
    expect(history.canUndo()).toBe(true)
    expect(history.canRedo()).toBe(false)

    history.push(current)
    current.set([2, 2, 2, 2])
    expect(history.canRedo()).toBe(false)
  })
})
