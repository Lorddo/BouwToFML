import { describe, expect, it } from 'vitest'
import { applyLocale } from '@/ui/i18n'
import {
  displayAreaLabelLocalized,
  fixtureCategoryLabel,
  fixtureDisplayLabel,
  fixtureItemDisplayLabel,
  roomTypeDisplayName,
} from '@/ui/i18n/catalog-labels'

describe('catalog-labels', () => {
  it('translates fixtures and room types with the locale', () => {
    applyLocale('en')
    expect(fixtureDisplayLabel('skylight', 'Dakraam')).toBe('Skylight')
    expect(fixtureCategoryLabel('dak', 'dak')).toBe('Roof')
    expect(roomTypeDisplayName(0, 'Woonkamer')).toBe('Living room')
    applyLocale('nl')
    expect(fixtureDisplayLabel('skylight', 'Dakraam')).toBe('Dakraam')
    expect(roomTypeDisplayName(0, 'Woonkamer')).toBe('Woonkamer')
    applyLocale('en')
  })

  it('keeps a custom fixture name and translates a catalog label', () => {
    applyLocale('en')
    expect(fixtureItemDisplayLabel({ kind: 'skylight', name: 'Kitchen roof' }, 'Dakraam')).toBe(
      'Kitchen roof',
    )
    expect(fixtureItemDisplayLabel({ kind: 'skylight', name: 'Dakraam' }, 'Dakraam')).toBe(
      'Skylight',
    )
    applyLocale('en')
  })

  it('translates canvas room labels and Trapgat', () => {
    applyLocale('en')
    expect(displayAreaLabelLocalized({ role: 0, name: 'Woonkamer' })).toBe('Living room')
    expect(displayAreaLabelLocalized({ customName: 'MK', role: 0, name: 'Woonkamer' })).toBe('MK')
    expect(displayAreaLabelLocalized({ customName: 'Trapgat', isCutout: true })).toBe('Stairwell')
    expect(displayAreaLabelLocalized({ isCutout: true })).toBe('Stairwell')
    applyLocale('nl')
    expect(displayAreaLabelLocalized({ customName: 'Trapgat', isCutout: true })).toBe('Trapgat')
    applyLocale('en')
  })
})
