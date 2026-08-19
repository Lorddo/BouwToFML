import { describe, expect, it } from 'vitest'
import { fixtureSymbolLocalBounds } from '@/ui/composables/fml-preview/fml-preview-fixture-bounds'
import { buildFixtureSymbol } from '@/core/fml/fixture-symbols'

describe('fixtureSymbolLocalBounds', () => {
  it('fits a filled rect', () => {
    const bounds = fixtureSymbolLocalBounds({
      rects: [[-10, -5, 20, 10]],
      ellipses: [],
      circles: [],
      polylines: [],
    })
    expect(bounds).toEqual({ x: -10, y: -5, width: 20, height: 10 })
  })

  it('follows the drawn toilet, not an extra padded box', () => {
    const symbol = buildFixtureSymbol('toilet', 40, 70)
    const bounds = fixtureSymbolLocalBounds(symbol)
    expect(bounds.width).toBeLessThanOrEqual(40)
    expect(bounds.height).toBeLessThanOrEqual(70)
    expect(bounds.width).toBeGreaterThan(5)
    expect(bounds.height).toBeGreaterThan(5)
  })
})
