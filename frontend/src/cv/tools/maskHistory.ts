import { cloneMask } from './maskImage'

export type ByteArrayHistory = {
  push: (buf: Uint8Array) => void
  /** Restores into `current` in place. Returns true when a snapshot was applied. */
  undo: (current: Uint8Array) => boolean
  clear: () => void
  canUndo: () => boolean
}

/** Shared undo stack for binary masks and ink overlays (caller picks maxSteps). */
export function createByteArrayHistory(options: { maxSteps: number }): ByteArrayHistory {
  const maxSteps = Math.max(1, options.maxSteps)
  const stack: Uint8Array[] = []

  return {
    push(buf: Uint8Array) {
      stack.push(cloneMask(buf))
      if (stack.length > maxSteps) {
        stack.shift()
      }
    },
    undo(current: Uint8Array) {
      const previous = stack.pop()
      if (!previous || previous.length !== current.length) return false
      current.set(previous)
      return true
    },
    clear() {
      stack.length = 0
    },
    canUndo() {
      return stack.length > 0
    },
  }
}
