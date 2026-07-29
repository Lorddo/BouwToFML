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
})
