import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { toStorableDevSession } from '@/platform/dev-workspace/storable'

describe('toStorableDevSession', () => {
  it('strips vue reactive proxies for IndexedDB', () => {
    const session = reactive({
      schemaVersion: 2,
      items: [{ id: 1, tags: ['wall'] }],
      nested: { values: [1, 2, 3] },
    })
    const stored = toStorableDevSession(session)
    expect(stored).not.toBe(session)
    expect(stored.items[0].tags).toEqual(['wall'])
    expect(JSON.stringify(stored)).toContain('"wall"')
  })

  it('preserves TypedArrays without expanding to number[]', () => {
    const labels = new Int32Array([0, 1, 0, 2])
    const mask = new Uint8Array([255, 0, 255, 0])
    const session = reactive({
      labels,
      mask,
      nested: { raw: labels },
    })
    const stored = toStorableDevSession(session)
    expect(stored.labels).toBeInstanceOf(Int32Array)
    expect(stored.mask).toBeInstanceOf(Uint8Array)
    expect(stored.nested.raw).toBeInstanceOf(Int32Array)
    expect(stored.labels).not.toBe(labels)
    expect(Array.from(stored.labels)).toEqual([0, 1, 0, 2])
    expect(Array.from(stored.mask)).toEqual([255, 0, 255, 0])
  })

  it('skips functions and undefined object keys', () => {
    const session = {
      a: 1,
      b: undefined as number | undefined,
      fn: () => 42,
      nested: { c: 3, d: undefined as string | undefined },
    }
    const stored = toStorableDevSession(session)
    expect(stored).toEqual({ a: 1, nested: { c: 3 } })
  })
})
