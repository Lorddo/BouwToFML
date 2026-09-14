import { describe, expect, it } from 'vitest'
import {
  addThicknessToCatalog,
  removeThicknessFromCatalog,
  replaceThicknessInCatalog,
  catalogFromLegacyLimits,
  classifyThicknessSlot,
  FACTORY_THICKNESS_CMS,
  limitsFromCatalog,
  nearestCatalogCm,
  nextUnusedCatalogCm,
  normalizeThicknessCatalog,
  thicknessPxToCm,
} from '@/core/plan/wall-thickness-catalog'

describe('normalizeThicknessCatalog', () => {
  it('leeg of ongeldig → factory 10/20/30', () => {
    expect(normalizeThicknessCatalog(undefined)).toEqual([...FACTORY_THICKNESS_CMS])
    expect(normalizeThicknessCatalog([])).toEqual([10, 20, 30])
    expect(normalizeThicknessCatalog([0, -4, Number.NaN])).toEqual([10, 20, 30])
  })

  it('sorteert unieke positieve cm', () => {
    expect(normalizeThicknessCatalog([30, 10, 20, 10])).toEqual([10, 20, 30])
  })

  it('houdt 1 cm-stappen (8/9/10/11)', () => {
    expect(normalizeThicknessCatalog([11, 8, 10, 9])).toEqual([8, 9, 10, 11])
  })

  it('houdt 12.1 en 12.4 gescheiden', () => {
    expect(normalizeThicknessCatalog([12.1, 12.4, 20, 30])).toEqual([12.1, 12.4, 20, 30])
  })

  it('houdt 15 vs 20 gescheiden', () => {
    expect(normalizeThicknessCatalog([15, 20, 30])).toEqual([15, 20, 30])
  })

  it('padt tot min 3 met factory', () => {
    expect(normalizeThicknessCatalog([15])).toEqual([10, 15, 20])
  })

  it('capped op 8 en houdt extremen', () => {
    const raw = [8, 10, 12, 15, 18, 22, 26, 30, 40, 51]
    const catalog = normalizeThicknessCatalog(raw)
    expect(catalog).toHaveLength(8)
    expect(catalog[0]).toBe(8)
    expect(catalog[catalog.length - 1]).toBe(51)
  })
})

describe('addThicknessToCatalog', () => {
  it('voegt een nieuwe maat toe', () => {
    expect(addThicknessToCatalog([10, 20, 30], 15)).toEqual([10, 15, 20, 30])
  })

  it('voegt 10.5 toe naast 10', () => {
    expect(addThicknessToCatalog([10, 20, 30], 10.5)).toEqual([10, 10.5, 20, 30])
  })

  it('slaat alleen exacte dubbelen over', () => {
    expect(addThicknessToCatalog([10, 20, 30], 10)).toEqual([10, 20, 30])
  })

  it('voegt niet toe boven cap 8', () => {
    const full = [8, 12, 16, 20, 26, 32, 40, 51]
    expect(addThicknessToCatalog(full, 70)).toEqual(full)
  })
})

describe('removeThicknessFromCatalog', () => {
  it('verwijdert een slot boven het minimum', () => {
    expect(removeThicknessFromCatalog([10, 15, 20, 30], 15)).toEqual([10, 20, 30])
  })

  it('houdt min 3', () => {
    expect(removeThicknessFromCatalog([10, 20, 30], 20)).toEqual([10, 20, 30])
  })
})

describe('replaceThicknessInCatalog', () => {
  it('vervangt één slot en blijft uniek-gesorteerd', () => {
    expect(replaceThicknessInCatalog([10, 20, 30], 30, 38)).toEqual([10, 20, 38])
  })

  it('voegt toe als oldCm niet in de catalogus zit', () => {
    expect(replaceThicknessInCatalog([10, 20, 30], 15, 16)).toEqual([10, 16, 20, 30])
  })

  it('laat ongewijzigd bij dezelfde afgeronde cm', () => {
    expect(replaceThicknessInCatalog([10, 20, 30], 20, 20)).toEqual([10, 20, 30])
  })
})

describe('classify / nearest / limits', () => {
  it('kiest de dichtstbijzijnde slot', () => {
    const cms = [10, 20, 30]
    expect(classifyThicknessSlot(11, cms)).toBe(0)
    expect(classifyThicknessSlot(18, cms)).toBe(1)
    expect(classifyThicknessSlot(28, cms)).toBe(2)
    expect(nearestCatalogCm(18, cms)).toBe(20)
  })

  it('legacy min/mid/max → catalogus', () => {
    expect(catalogFromLegacyLimits({ minCm: 10, midCm: 20, maxCm: 30 })).toEqual([10, 20, 30])
  })

  it('limitsFromCatalog: first / midden / last', () => {
    expect(limitsFromCatalog([10, 20, 30])).toEqual({ minCm: 10, midCm: 20, maxCm: 30 })
    expect(limitsFromCatalog([10, 15, 20, 30])).toEqual({ minCm: 10, midCm: 15, maxCm: 30 })
  })
})

describe('nextUnusedCatalogCm', () => {
  it('bindt eerst de dikste vrije catalogus-cm', () => {
    expect(nextUnusedCatalogCm([], [10, 20, 30])).toBe(30)
    expect(nextUnusedCatalogCm([30], [10, 20, 30])).toBe(20)
    expect(nextUnusedCatalogCm([30, 20], [10, 20, 30])).toBe(10)
  })
})

describe('thicknessPxToCm', () => {
  it('volgt extractionToPlan (px / pxPerMm / 10)', () => {
    expect(thicknessPxToCm(60, 0.2, 0.2)).toBe(30)
    expect(thicknessPxToCm(0, 0.2, 0.2)).toBeNull()
  })
})
