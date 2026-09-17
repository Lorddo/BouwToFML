import { describe, expect, it } from 'vitest'
import {
  FIT_DRAWN_PLAN_PAD_CM,
  resolveFitContentBounds,
  shouldRefitForExtraBoundsAppear,
  shouldRefitForUnderlayAppear,
  worldOverflowsLayout,
} from '@/ui/composables/canvas-kernel/usePlanCanvasViewport'

const layout = {
  minX: 0,
  minY: 0,
  spanX: 2000,
  spanY: 1500,
  scale: 1,
  offsetX: 24,
  offsetY: 24,
}

describe('worldOverflowsLayout', () => {
  it('houdt geometrie binnen de lege-plan world', () => {
    expect(worldOverflowsLayout(layout, { minX: 10, minY: 10, spanX: 800, spanY: 600 })).toBe(false)
  })

  it('ziet import/generate die buiten de stale fit valt', () => {
    expect(worldOverflowsLayout(layout, { minX: 0, minY: 0, spanX: 4000, spanY: 1500 })).toBe(true)
    expect(worldOverflowsLayout(layout, { minX: -200, minY: 0, spanX: 1000, spanY: 800 })).toBe(
      true,
    )
  })
})

describe('shouldRefitForExtraBoundsAppear', () => {
  const underlay = { minX: 0, minY: 0, spanX: 1200, spanY: 900 }
  const rotatedLarger = { minX: -200, minY: -300, spanX: 1600, spanY: 1500 }

  it('herfit wanneer de onderlegger voor het eerst binnenkomt', () => {
    expect(shouldRefitForExtraBoundsAppear(underlay, null)).toBe(true)
    expect(shouldRefitForExtraBoundsAppear(underlay, undefined)).toBe(true)
    expect(
      shouldRefitForExtraBoundsAppear(underlay, { minX: 0, minY: 0, spanX: 0, spanY: 0 }),
    ).toBe(true)
  })

  it('herfit niet bij rotatie-AABB-groei van een bestaande onderlegger', () => {
    expect(shouldRefitForExtraBoundsAppear(rotatedLarger, underlay)).toBe(false)
    // Grotere AABB kan wél overflowen t.o.v. de fit-world — dat mag geen auto-reset triggeren.
    expect(worldOverflowsLayout(layout, rotatedLarger)).toBe(true)
  })

  it('negeert lege/ongeldige next bounds', () => {
    expect(shouldRefitForExtraBoundsAppear(null, null)).toBe(false)
    expect(shouldRefitForExtraBoundsAppear({ minX: 0, minY: 0, spanX: 0, spanY: 100 }, null)).toBe(
      false,
    )
  })
})

describe('shouldRefitForUnderlayAppear', () => {
  const underlay = { minX: 0, minY: 0, spanX: 4000, spanY: 3000 }

  it('herfit niet als er al getekende geometrie is', () => {
    expect(shouldRefitForUnderlayAppear(underlay, null, true)).toBe(false)
  })

  it('herfit wél op een lege floor wanneer de onderlegger binnenkomt', () => {
    expect(shouldRefitForUnderlayAppear(underlay, null, false)).toBe(true)
  })
})

describe('resolveFitContentBounds', () => {
  const drawn = { minX: 100, minY: 80, spanX: 800, spanY: 600 }
  const underlay = { minX: 0, minY: 0, spanX: 4000, spanY: 3000 }
  const padded = {
    minX: drawn.minX - FIT_DRAWN_PLAN_PAD_CM,
    minY: drawn.minY - FIT_DRAWN_PLAN_PAD_CM,
    spanX: drawn.spanX + FIT_DRAWN_PLAN_PAD_CM * 2,
    spanY: drawn.spanY + FIT_DRAWN_PLAN_PAD_CM * 2,
  }

  it('kiest de getekende plattegrond boven een grotere onderlegger, met maatlijn-marge', () => {
    expect(resolveFitContentBounds(drawn, underlay)).toEqual(padded)
  })

  it('valt terug op de onderlegger als er nog niets getekend is', () => {
    expect(resolveFitContentBounds(null, underlay)).toEqual(underlay)
  })

  it('levert null zonder geometrie en zonder onderlegger', () => {
    expect(resolveFitContentBounds(null, null)).toBeNull()
  })
})
