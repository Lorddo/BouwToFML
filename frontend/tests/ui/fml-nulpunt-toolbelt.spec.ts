import { describe, expect, it } from 'vitest'
import { getFmlSelectTools, type FmlToolId } from '@/ui/components/canvas/fmlToolbeltItems'

describe('FML nulpunt toolbelt', () => {
  it('zet nulpunt in de select-toolbelt naast measure', () => {
    const tools = getFmlSelectTools()
    const ids = tools.map((t) => t.id as FmlToolId)
    expect(ids).toContain('nulpunt')
    expect(ids.indexOf('nulpunt')).toBeGreaterThan(ids.indexOf('measure'))
    const nulpunt = tools.find((t) => t.id === 'nulpunt')
    expect(nulpunt?.icon).toBe('origin')
  })
})
