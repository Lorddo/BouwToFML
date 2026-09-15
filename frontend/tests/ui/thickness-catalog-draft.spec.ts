import { describe, expect, it } from 'vitest'
import { createThicknessCatalogEditSession } from '@/ui/components/thickness-catalog-draft'

describe('createThicknessCatalogEditSession', () => {
  it('houdt 20 committed terwijl je 2 typt; replace pas bij commit', () => {
    const session = createThicknessCatalogEditSession()
    session.type(1, 2)
    expect(session.peek(1)).toBe(2)
    expect(session.commitExisting(1, 20)).toEqual({ kind: 'replace', oldCm: 20, newCm: 2 })
    expect(session.peek(1)).toBeUndefined()
  })

  it('select-all + eerste cijfer is nog geen catalogus-write', () => {
    const session = createThicknessCatalogEditSession()
    session.type(1, 3)
    expect(session.commitExisting(1, 20)).toEqual({ kind: 'replace', oldCm: 20, newCm: 3 })
  })

  it('type 2 dan 25: alleen de laatste draft gaat mee', () => {
    const session = createThicknessCatalogEditSession()
    session.type(1, 2)
    session.type(1, 25)
    expect(session.commitExisting(1, 20)).toEqual({ kind: 'replace', oldCm: 20, newCm: 25 })
  })

  it('geen replace als de maat gelijk blijft', () => {
    const session = createThicknessCatalogEditSession()
    session.type(1, 20)
    expect(session.commitExisting(1, 20)).toBeNull()
  })

  it('geen replace zonder typed draft', () => {
    const session = createThicknessCatalogEditSession()
    expect(session.commitExisting(1, 20)).toBeNull()
  })

  it('nieuwe rij: add pas bij commit, niet als de maat al bestaat', () => {
    const session = createThicknessCatalogEditSession()
    session.type(9, 18)
    expect(session.commitNew(9, [10, 20, 30])).toEqual({ kind: 'add', cm: 18 })
    session.type(9, 20)
    expect(session.commitNew(9, [10, 20, 30])).toBeNull()
  })
})
