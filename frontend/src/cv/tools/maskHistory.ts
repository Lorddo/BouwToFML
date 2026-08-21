import { cloneMask } from './maskImage'

export type ByteArrayHistory = {
  push: (buf: Uint8Array) => void
  /** Restores into `current` in place. Returns true when a snapshot was applied. */
  undo: (current: Uint8Array) => boolean
  /** Restores into `current` in place. Returns true when a snapshot was applied. */
  redo: (current: Uint8Array) => boolean
  clear: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

/** Shared undo/redo stack for binary masks and ink overlays (caller picks maxSteps). */
export function createByteArrayHistory(options: { maxSteps: number }): ByteArrayHistory {
  const maxSteps = Math.max(1, options.maxSteps)
  const stack: Uint8Array[] = []
  const redoStack: Uint8Array[] = []

  return {
    push(buf: Uint8Array) {
      stack.push(cloneMask(buf))
      if (stack.length > maxSteps) {
        stack.shift()
      }
      redoStack.length = 0
    },
    undo(current: Uint8Array) {
      const previous = stack.pop()
      if (!previous || previous.length !== current.length) return false
      redoStack.push(cloneMask(current))
      if (redoStack.length > maxSteps) {
        redoStack.shift()
      }
      current.set(previous)
      return true
    },
    redo(current: Uint8Array) {
      const next = redoStack.pop()
      if (!next || next.length !== current.length) return false
      stack.push(cloneMask(current))
      if (stack.length > maxSteps) {
        stack.shift()
      }
      current.set(next)
      return true
    },
    clear() {
      stack.length = 0
      redoStack.length = 0
    },
    canUndo() {
      return stack.length > 0
    },
    canRedo() {
      return redoStack.length > 0
    },
  }
}
