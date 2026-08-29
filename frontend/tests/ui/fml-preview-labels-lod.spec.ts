import { describe, expect, it } from 'vitest'
import {
  AREA_LABEL_CHAR_WIDTH,
  AREA_LABEL_HEIGHT_CM,
  AREA_LABEL_LINE_HEIGHT,
  AREA_LABEL_LOD_MIN_SCREEN_PX,
  areaLabelFontSizeStage,
  areaLabelKonvaConfig,
  areaLabelVisibleOnScreen,
  buildRenderAreas,
} from '@/ui/composables/fml-preview/fml-preview-render-areas'
import {
  clampViewScale,
  VIEW_SCALE_MAX,
  VIEW_SCALE_MIN,
} from '@/ui/composables/fml-preview/useFmlPreviewPanZoom'

describe('areaLabelFontSizeStage', () => {
  it('schaalt met layout.scale (wereldmaat)', () => {
    expect(areaLabelFontSizeStage(0.4)).toBeCloseTo(AREA_LABEL_HEIGHT_CM * 0.4)
    expect(areaLabelFontSizeStage(1)).toBe(AREA_LABEL_HEIGHT_CM)
    expect(areaLabelFontSizeStage(0)).toBe(0)
  })
})

describe('areaLabelVisibleOnScreen (LOD)', () => {
  it('verbergt labels onder min schermhoogte', () => {
    const font = AREA_LABEL_LOD_MIN_SCREEN_PX
    expect(areaLabelVisibleOnScreen(font, 1)).toBe(true)
    expect(areaLabelVisibleOnScreen(font, 0.99)).toBe(false)
    expect(areaLabelVisibleOnScreen(font / 2, 2)).toBe(true)
    expect(areaLabelVisibleOnScreen(font / 2, 1.9)).toBe(false)
  })
})

describe('areaLabelKonvaConfig', () => {
  it('gebruikt meegegeven fontSizeStage + perfectDrawEnabled false', () => {
    const cfg = areaLabelKonvaConfig('Keuken', 10, 20, '#111', 12)
    expect(cfg.fontSize).toBe(12)
    expect(cfg.x).toBe(10)
    expect(cfg.y).toBe(20)
    expect(cfg.text).toBe('Keuken')
    expect(cfg.perfectDrawEnabled).toBe(false)
    expect(cfg.listening).toBe(false)
    expect(cfg.wrap).toBe('none')
    expect(cfg.lineHeight).toBe(AREA_LABEL_LINE_HEIGHT)
  })

  it('multiline: breedte van langste regel, hoogte stapelt regels', () => {
    const font = 10
    const cfg = areaLabelKonvaConfig('Kort\nVeel langere regel', 0, 0, '#111', font)
    expect(cfg.text).toBe('Kort\nVeel langere regel')
    expect(cfg.width).toBeCloseTo('Veel langere regel'.length * font * AREA_LABEL_CHAR_WIDTH)
    expect(cfg.height).toBeCloseTo(2 * font * AREA_LABEL_LINE_HEIGHT)
    expect(cfg.offsetY).toBeCloseTo((cfg.height as number) / 2)
  })

  it('normaliseert CR/LF tot echte regels', () => {
    const cfg = areaLabelKonvaConfig('A\r\nB\rC', 0, 0, '#111', 10)
    expect(cfg.text).toBe('A\nB\nC')
    expect(cfg.height).toBeCloseTo(3 * 10 * AREA_LABEL_LINE_HEIGHT)
  })
})

describe('buildRenderAreas name_x/y', () => {
  it('zet benaming op centroid + offset', () => {
    const toStage = (x: number, y: number) => ({ x, y })
    const poly = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ]
    const [centered] = buildRenderAreas(
      [{ id: 'a1', poly, color: '#fff', name: 'Keuken', showAreaLabel: true }],
      toStage,
    )
    expect(centered.centroidCm).toEqual({ x: 50, y: 40 })
    expect(centered.labelCm).toEqual({ x: 50, y: 40 })
    const [shifted] = buildRenderAreas(
      [
        {
          id: 'a2',
          poly,
          color: '#fff',
          name: 'Keuken',
          showAreaLabel: true,
          name_x: 12,
          name_y: -8,
        },
      ],
      toStage,
    )
    expect(shifted.labelCm).toEqual({ x: 62, y: 32 })
    expect(shifted.labelX).toBe(62)
    expect(shifted.labelY).toBe(32)
  })
})

describe('buildRenderAreas showAreaLabel', () => {
  it('zet showAreaLabel door (default aan)', () => {
    const toStage = (x: number, y: number) => ({ x, y })
    const poly = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ]
    const [shown] = buildRenderAreas(
      [{ id: 'a1', poly, color: '#fff', showAreaLabel: true }],
      toStage,
    )
    expect(shown.showAreaLabel).toBe(true)
    const [hidden] = buildRenderAreas(
      [{ id: 'a2', poly, color: '#fff', showAreaLabel: false }],
      toStage,
    )
    expect(hidden.showAreaLabel).toBe(false)
  })
})

describe('clampViewScale', () => {
  it('clamped tussen VIEW_SCALE_MIN en VIEW_SCALE_MAX', () => {
    expect(VIEW_SCALE_MIN).toBe(0.05)
    expect(VIEW_SCALE_MAX).toBe(40)
    expect(clampViewScale(0.01)).toBe(VIEW_SCALE_MIN)
    expect(clampViewScale(100)).toBe(VIEW_SCALE_MAX)
    expect(clampViewScale(6)).toBe(6)
    expect(clampViewScale(20)).toBe(20)
  })
})
