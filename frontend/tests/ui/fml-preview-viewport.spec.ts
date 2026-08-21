import { describe, expect, it } from 'vitest'
import { worldOverflowsLayout } from '@/ui/composables/fml-preview/useFmlPreviewViewport'

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
