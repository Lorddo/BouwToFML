import { describe, expect, it } from 'vitest'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { resolveFixtureCatalog } from '@/core/fml/fixture-refid-catalog'
import { buildFixtureSymbol } from '@/core/fml/fixture-symbols'
import {
  buildWindowSymbol,
  resolveWindowPanelCount,
  WINDOW_ORNAMENT_DIAMETER_PX,
} from '@/ui/composables/fml-preview/fml-preview-opening-render'
import { resolveOpeningCatalog } from '@/core/fml/opening-refid-catalog'

describe('fixture catalog + symbols', () => {
  it('resolves Template ID fixture refids', () => {
    expect(resolveFixtureCatalog('5bbfd9e1325ca8d3c59e23b35401eeec71424256').kind).toBe(
      'countertop',
    )
    expect(resolveFixtureCatalog('17e3ab9295832bd22e220a7f861580bb5aaeb007').label).toBe('Toilet')
    expect(resolveFixtureCatalog('c17bf1853d916f1b0ece0259bb0d5b4313c71730').kind).toBe(
      'heat_pump',
    )
  })

  it('builds non-empty geometry for known kinds', () => {
    const boiler = buildFixtureSymbol('boiler', 45, 40)
    expect(boiler.rects).toHaveLength(1)
    expect(boiler.circles).toHaveLength(2)
    const heatPump = buildFixtureSymbol('heat_pump', 60, 70)
    expect(heatPump.polylines.length).toBeGreaterThan(0)
  })
})

describe('window panels + ornament', () => {
  it('uses catalog panels instead of width heuristic for triple', () => {
    const catalog = resolveOpeningCatalog('e3296a727699a3fc70e70dfec4ab715ed368ef63', 'window')
    // width 200 zou zonder panels=3 als dubbel tellen (drempel 220)
    expect(resolveWindowPanelCount(200, catalog.kind, catalog.panels)).toBe(3)
  })

  it('clips mullions to wall thickness, adds end caps, and keeps round ornament at 10px', () => {
    const identity = (x: number, y: number) => ({ x, y })
    const multi = buildWindowSymbol({
      startCm: { x: 0, y: 0 },
      endCm: { x: 150, y: 0 },
      thicknessCm: 15,
      toStagePoint: identity,
      panelCount: 2,
      kind: 'multi',
    })
    // begin + midden + eind
    expect(multi.mullions).toHaveLength(3)
    const m = multi.mullions[1]!
    // half thickness = 7.5 → y van -7.5 tot 7.5
    expect(m[1]).toBeCloseTo(-7.5, 5)
    expect(m[3]).toBeCloseTo(7.5, 5)

    const single = buildWindowSymbol({
      startCm: { x: 0, y: 0 },
      endCm: { x: 100, y: 0 },
      thicknessCm: 15,
      toStagePoint: identity,
      panelCount: 1,
      kind: 'single',
    })
    expect(single.mullions).toHaveLength(2)

    const round = buildWindowSymbol({
      startCm: { x: 0, y: 0 },
      endCm: { x: 98, y: 0 },
      thicknessCm: 15,
      toStagePoint: identity,
      panelCount: 1,
      kind: 'round',
    })
    expect(round.ornament?.kind).toBe('round')
    expect(round.ornament?.radius).toBe(WINDOW_ORNAMENT_DIAMETER_PX / 2)
  })
})

describe('importFmlV3 items', () => {
  it('parses design items from Template ID style payload', () => {
    const { plan } = importFmlV3({
      name: 'test',
      floors: [
        {
          name: 'f0',
          level: 0,
          height: 280,
          designs: [
            {
              walls: [],
              items: [
                {
                  refid: '5bbfd9e1325ca8d3c59e23b35401eeec71424256',
                  x: 10,
                  y: 20,
                  width: 130,
                  height: 60,
                  guid: 'abc123',
                },
              ],
            },
          ],
        },
      ],
    })
    expect(plan.floors[0]?.items).toHaveLength(1)
    expect(plan.floors[0]?.items?.[0]?.refid).toBe(
      '5bbfd9e1325ca8d3c59e23b35401eeec71424256',
    )
  })
})
