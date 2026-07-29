import { describe, expect, it } from 'vitest'
import {
  createDevSessionId,
  findDevSessionIdByImageName,
  resolveDevSessionStorageId,
} from '@/platform/dev-workspace/session-id'

describe('dev-workspace session-id', () => {
  const entries = [
    { id: 'session-a', session: { imageName: 'Kinderdijkstraat.pdf p1.png' } },
    { id: 'session-b', session: { imageName: 'De Roemer.pdf p1.png' } },
  ]

  it('vindt snapshot op exacte imageName', () => {
    expect(findDevSessionIdByImageName(entries, 'De Roemer.pdf p1.png')).toBe('session-b')
  })

  it('negeert verschillende afmetingen — alleen naam telt', () => {
    expect(
      resolveDevSessionStorageId(
        [{ id: 'old', session: { imageName: 'plattegrond.png' } }],
        'plattegrond.png',
      ),
    ).toBe('old')
  })

  it('maakt nieuw id bij andere imageName', () => {
    const id = resolveDevSessionStorageId(entries, 'NieuwePlattegrond.png')
    expect(id).not.toBe('session-a')
    expect(id).not.toBe('session-b')
    expect(id.startsWith('session-')).toBe(true)
  })

  it('createDevSessionId levert unieke waarden', () => {
    expect(createDevSessionId()).not.toBe(createDevSessionId())
  })
})
