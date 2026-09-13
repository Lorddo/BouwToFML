import { describe, expect, it } from 'vitest'
import { DEFAULT_FACADE_GROUP_NAMES } from '@/core/fml/facade-groups'
import { facadeGroupDisplayName } from '@/ui/composables/plan-canvas/facade-group-label'

describe('facadeGroupDisplayName', () => {
  const t = (key: string) =>
    key === 'result.toolbar.facadeGroupNames.front' ? 'Voor' : key

  it('vertaalt factory-id zolang de naam de Engelse canonical is', () => {
    expect(facadeGroupDisplayName({ id: 'front', name: DEFAULT_FACADE_GROUP_NAMES.front }, t)).toBe(
      'Voor',
    )
  })

  it('houdt een hernoemde groep', () => {
    expect(facadeGroupDisplayName({ id: 'front', name: 'Straat' }, t)).toBe('Straat')
  })

  it('custom id toont de opgeslagen naam', () => {
    expect(facadeGroupDisplayName({ id: 'G1', name: 'Aanbouw' }, t)).toBe('Aanbouw')
  })
})
