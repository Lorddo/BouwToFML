import { describe, expect, it } from 'vitest'
import {
  buildRenderDimensions,
  buildRenderLabels,
  buildRenderLines,
  clampLabelFontSize,
  labelKonvaFontStyle,
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

  it('notatielijn: type, kleur en dash', () => {
    const [dashed] = buildRenderLines(
      [
        {
          id: 'l3',
          a: { x: 0, y: 0 },
          b: { x: 10, y: 0 },
          type: 'dashed_line',
          color: '#FF0000',
          thickness: 3,
        },
      ],
      toStage,
    )
    expect(dashed.stroke).toBe('#FF0000')
    expect(dashed.strokeWidth).toBe(3)
    expect(dashed.dash).toEqual([8, 6])

    const [dotted] = buildRenderLines(
      [
        {
          id: 'l4',
          a: { x: 0, y: 0 },
          b: { x: 10, y: 0 },
          type: 'dotted_line',
          color: 0,
          thickness: 1,
        },
      ],
      toStage,
    )
    expect(dotted.stroke).toBe('#111827')
    expect(dotted.dash).toEqual([2, 4])

    const [dashdotted] = buildRenderLines(
      [
        {
          id: 'l5',
          a: { x: 0, y: 0 },
          b: { x: 10, y: 0 },
          type: 'dashdotted_line',
          color: 255,
          thickness: 2,
        },
      ],
      toStage,
    )
    expect(dashdotted.dash).toEqual([8, 4, 2, 4])
    expect(dashdotted.stroke).toBe('#0000ff')
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

  it('label: fontSize clamp + bold/italic/outline in render', () => {
    expect(clampLabelFontSize(16)).toBe(16)
    expect(clampLabelFontSize(0)).toBe(1)
    expect(clampLabelFontSize(999)).toBe(200)
    expect(labelKonvaFontStyle(true, false)).toBe('bold')
    expect(labelKonvaFontStyle(false, true)).toBe('italic')
    expect(labelKonvaFontStyle(true, true)).toBe('bold italic')
    expect(labelKonvaFontStyle()).toBe('normal')

    const [label] = buildRenderLabels(
      [
        {
          id: 't1',
          x: 10,
          y: 20,
          text: 'Hallo',
          fontFamily: 'arial',
          fontSize: 18,
          letterSpacing: 0,
          fontColor: '#FF00AA',
          backgroundColor: '#f4f8f4',
          align: 'left',
          rotation: 0,
          outline: true,
          bold: true,
          italic: true,
        },
      ],
      toStage,
    )
    expect(label.fontSize).toBe(18)
    expect(label.fontColor).toBe('#FF00AA')
    expect(label.outline).toBe(true)
    expect(label.bold).toBe(true)
    expect(label.italic).toBe(true)
  })
})
