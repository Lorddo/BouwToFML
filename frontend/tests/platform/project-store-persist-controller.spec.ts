import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createProjectPersistController } from '@/platform/project-store/persist-controller'

describe('createProjectPersistController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces concurrent persistNow into one trailing write', async () => {
    const resolvers: Array<() => void> = []
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const ctrl = createProjectPersistController({ save })

    ctrl.persistNow()
    ctrl.persistNow()
    ctrl.persistNow()
    expect(save).toHaveBeenCalledTimes(1)

    resolvers[0]?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(2)

    resolvers[1]?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(2)
    ctrl.dispose()
  })

  it('debounces persistDebounced', async () => {
    const save = vi.fn(async () => undefined)
    const ctrl = createProjectPersistController({ save, debounceMs: 200 })

    ctrl.persistDebounced()
    ctrl.persistDebounced()
    expect(save).toHaveBeenCalledTimes(0)

    await vi.advanceTimersByTimeAsync(199)
    expect(save).toHaveBeenCalledTimes(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    ctrl.dispose()
  })

  it('skips when shouldSkip returns true', async () => {
    const save = vi.fn(async () => undefined)
    const ctrl = createProjectPersistController({
      save,
      shouldSkip: () => true,
    })
    ctrl.persistNow()
    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(0)
    ctrl.dispose()
  })
})
