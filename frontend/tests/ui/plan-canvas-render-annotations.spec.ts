import { describe, expect, it } from 'vitest'
import { AREA_LABEL_HEIGHT_CM } from '@/ui/composables/plan-canvas/plan-canvas-render-areas'
import {
  buildRenderDimensions,
  buildRenderLabels,
  buildRenderLines,
  clampLabelFontSize,
  commentLabelFontSizeStage,
  commentLabelHeightCm,
  DIM_TICK_HALF_CM,
  labelHitBoxCm,
  labelKonvaFontStyle,
} from '@/ui/composables/plan-canvas/plan-canvas-render-annotations'

const toStage = (x: number, y: number) => ({ x, y })

describe('plan-canvas-render-annotations', () => {
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

  it('maatlijn: ticks 40 cm totaal + meters-label in midden', () => {
    const [dim] = buildRenderDimensions(
      [{ id: 'd1', type: 'custom_dimension', a: { x: 0, y: 0 }, b: { x: 250, y: 0 } }],
      toStage,
    )
    expect(dim.points).toEqual([0, 0, 250, 0])
    expect(dim.tickA).toEqual([0, -20, 0, 20])
    expect(dim.tickB).toEqual([250, -20, 250, 20])
    expect(dim.labelX).toBe(125)
    expect(dim.labelY).toBe(0)
    expect(dim.label).toBe('2500 mm')
    const [meters] = buildRenderDimensions(
      [{ id: 'd1', type: 'custom_dimension', a: { x: 0, y: 0 }, b: { x: 250, y: 0 } }],
      toStage,
      DIM_TICK_HALF_CM,
      'm',
    )
    expect(meters.label).toBe('2.5 m')

    const [scaled] = buildRenderDimensions(
      [{ id: 'd1', type: 'custom_dimension', a: { x: 0, y: 0 }, b: { x: 250, y: 0 } }],
      (x, y) => ({ x: x * 2, y: y * 2 }),
    )
    expect(scaled.tickA).toEqual([0, -40, 0, 40])
    expect(scaled.tickB).toEqual([500, -40, 500, 40])
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

  it('comment-label: 16 px = kamerbenaming-hoogte, schaalt met layout', () => {
    expect(commentLabelHeightCm(16)).toBe(AREA_LABEL_HEIGHT_CM)
    expect(commentLabelHeightCm(8)).toBe(AREA_LABEL_HEIGHT_CM / 2)
    expect(commentLabelFontSizeStage(16, 0.4)).toBeCloseTo(AREA_LABEL_HEIGHT_CM * 0.4)
  })

  it('label-hitbox volgt align (links vanaf anker)', () => {
    const left = labelHitBoxCm({ text: 'Hallo', fontSize: 16, align: 'left' })
    expect(left.minX).toBe(0)
    expect(left.maxX).toBeGreaterThan(0)
    const center = labelHitBoxCm({ text: 'Hallo', fontSize: 16, align: 'center' })
    expect(center.minX).toBeCloseTo(-center.maxX)
  })
})
