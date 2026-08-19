import { describe, expect, it } from 'vitest'
import {
  FML_AREA_SIDE_DIMS_TOOL_ID,
  getFmlSelectTools,
  type FmlToolId,
} from '@/ui/components/canvas/fmlToolbeltItems'

describe('FML nulpunt toolbelt', () => {
  it('zet nulpunt in de select-toolbelt naast measure', () => {
    const tools = getFmlSelectTools()
    const ids = tools.map((t) => t.id as FmlToolId)
    expect(ids).toContain('nulpunt')
    expect(ids.indexOf('nulpunt')).toBeGreaterThan(ids.indexOf('measure'))
    const nulpunt = tools.find((t) => t.id === 'nulpunt')
    expect(nulpunt?.icon).toBe('origin')
  })

  it('zet area-zijdematen als toggle tussen measure en nulpunt', () => {
    const tools = getFmlSelectTools()
    const ids = tools.map((t) => t.id)
    expect(ids.indexOf(FML_AREA_SIDE_DIMS_TOOL_ID)).toBe(ids.indexOf('measure') + 1)
    expect(ids.indexOf('nulpunt')).toBe(ids.indexOf(FML_AREA_SIDE_DIMS_TOOL_ID) + 1)
    const dims = tools.find((t) => t.id === FML_AREA_SIDE_DIMS_TOOL_ID)
    expect(dims?.toggle).toBe(true)
    expect(dims?.icon).toBe('dims')
  })
})
