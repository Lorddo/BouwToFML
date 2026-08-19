import { describe, expect, it } from 'vitest'
import {
  buildRenderDimensions,
  buildRenderLines,
} from '@/ui/composables/fml-preview/fml-preview-render-annotations'

const toStage = (x: number, y: number) => ({ x, y })

describe('fml-preview-render-annotations', () => {
  it('notatielijn gebruikt thickness als schermpixels (min 1)', () => {
    const [thin] = buildRenderLines(
      [
        {
          id: 'l1',
          a: { x: 0, y: 0 },
          b: { x: 10, y: 0 },
          type: 'solid_line',
          color: 0,
          thickness: 2,
        },
      ],
      toStage,
    )
    expect(thin.strokeWidth).toBe(2)

    const [fallback] = buildRenderLines(
      [
        {
          id: 'l2',
          a: { x: 0, y: 0 },
          b: { x: 10, y: 0 },
          type: 'solid_line',
          color: 0,
          thickness: 0,
        },
      ],
      toStage,
    )
    expect(fallback.strokeWidth).toBe(1)
  })

  it('maatlijn: ticks + meters-label in midden', () => {
    const [dim] = buildRenderDimensions(
      [{ id: 'd1', type: 'custom_dimension', a: { x: 0, y: 0 }, b: { x: 250, y: 0 } }],
      toStage,
      6,
    )
    expect(dim.points).toEqual([0, 0, 250, 0])
    expect(dim.tickA).toEqual([0, -6, 0, 6])
    expect(dim.tickB).toEqual([250, -6, 250, 6])
    expect(dim.labelX).toBe(125)
    expect(dim.labelY).toBe(0)
    expect(dim.label).toBe('2.50 m')
  })
})
