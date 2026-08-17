import { describe, expect, it } from 'vitest'
import { FML_ALIGN_FIXTURE_REFID, resolveFixtureCatalog } from '@/core/fml/fixture-refid-catalog'
import { buildFixtureSymbol } from '@/core/fml/fixture-symbols'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import {
  buildWindowSymbol,
  resolveWindowPanelCount,
  WINDOW_ORNAMENT_DIAMETER_PX,
} from '@/ui/composables/fml-preview/fml-preview-opening-render'
import { resolveOpeningCatalog } from '@/core/fml/opening-refid-catalog'
import { buildRenderFixtures } from '@/ui/composables/fml-preview/fml-preview-render-openings'

describe('fixture catalog + symbols', () => {
  it('resolves Template ID fixture refids', () => {
    expect(resolveFixtureCatalog('5bbfd9e1325ca8d3c59e23b35401eeec71424256').kind).toBe(
      'countertop',
    )
    expect(resolveFixtureCatalog('17e3ab9295832bd22e220a7f861580bb5aaeb007').label).toBe('Toilet')
    expect(resolveFixtureCatalog('c17bf1853d916f1b0ece0259bb0d5b4313c71730').kind).toBe('heat_pump')
  })

  it('resolves Mooiland 3090 fixture refids', () => {
    expect(resolveFixtureCatalog('4536785e9e82fc33642fa523ed85a4520bd4a91a').kind).toBe(
      'stair_winder_180',
    )
    expect(resolveFixtureCatalog('db74ce14813eb0d5c54c8992806b22fb846ee34c').kind).toBe(
      'countertop',
    )
    expect(resolveFixtureCatalog('d8dfd3e5683d86a7d9db8a8f7d3260b87ea8213f').kind).toBe('canopy')
    expect(resolveFixtureCatalog('72752422845c99169f50216772287e8471e2ff48').kind).toBe('chimney')
    expect(resolveFixtureCatalog('0bcc0bc80f610a0cb428012520b7006d7fcb1ce8').kind).toBe('railing')
    expect(resolveFixtureCatalog('a88fc7b43bb9e44a54c400a9ab8071dc1a0b2032').kind).toBe('skylight')
    expect(resolveFixtureCatalog('a816372ed69d80b54927513990336c750ca6f2b0').kind).toBe(
      'shower_head',
    )
    expect(resolveFixtureCatalog('a816372ed69d80b54927513990336c750ca6f2b0').stroke).toBe('#0f766e')
    expect(resolveFixtureCatalog('0c4ab4d4ccdc801b4093f10a9aa9c0bfd08ab584').kind).toBe('toilet')
    expect(resolveFixtureCatalog(FML_ALIGN_FIXTURE_REFID).kind).toBe('oil_bottle')
    expect(resolveFixtureCatalog(FML_ALIGN_FIXTURE_REFID).label).toBe('Oil bottle')
  })

  it('builds non-empty geometry for known kinds', () => {
    const boiler = buildFixtureSymbol('boiler', 45, 40)
    expect(boiler.rects).toHaveLength(1)
    expect(boiler.circles).toHaveLength(2)
    const heatPump = buildFixtureSymbol('heat_pump', 60, 70)
    expect(heatPump.polylines.length).toBeGreaterThan(0)
    const oilBottle = buildFixtureSymbol('oil_bottle', 7.582, 7.582)
    expect(oilBottle.circles).toHaveLength(2)
    expect(oilBottle.rects).toHaveLength(0)
    expect(oilBottle.circles[0]?.[2]).toBeGreaterThan(oilBottle.circles[1]?.[2] ?? 0)
  })

  it('builds stair / canopy / chimney / skylight symbols', () => {
    const stair = buildFixtureSymbol('stair_winder_180', 105, 243)
    expect(stair.rects).toHaveLength(1)
    expect(stair.circles).toHaveLength(0)
    expect(stair.polylines.length).toBeGreaterThan(8)
    expect(stair.arrowPolylines?.length).toBe(2)
    expect(stair.strokeWidth).toBeLessThan(0.8)
    expect(stair.overWalls).toBe(false)
    expect(buildFixtureSymbol('countertop', 180, 60).overWalls).toBe(false)

    const canopy = buildFixtureSymbol('canopy', 91, 39)
    expect(canopy.dash?.length).toBeGreaterThan(0)
    expect(canopy.overWalls).toBe(true)
    expect(canopy.strokeWidth).toBeLessThan(1)

    const chimney = buildFixtureSymbol('chimney', 60, 40)
    expect(chimney.circles).toHaveLength(1)
    expect(chimney.polylines).toHaveLength(2)
    expect(chimney.circleFill).toBe('transparent')
    expect(chimney.overWalls).toBe(true)

    const skylight = buildFixtureSymbol('skylight', 56, 55)
    expect(skylight.dash?.length).toBeGreaterThan(0)
    expect(skylight.fill).toBe('#dbeafe')
    expect(skylight.stroke).toBe('#60a5fa')
    const pivotX = stair.polylines[0]?.[0] ?? 0
    const pivotY = stair.polylines[0]?.[1] ?? 1
    expect(pivotX).toBeCloseTo(52.5, 5)
    expect(Math.abs(pivotY)).toBeLessThan(0.01)
    const wideSideHit = stair.polylines.some((line) => (line[2] ?? 0) < -20)
    expect(wideSideHit).toBe(true)
    const arrow = stair.arrowPolylines?.[0] ?? []
    expect(arrow[0]).toBeCloseTo(0, 5)
    expect(arrow[2]).toBe(arrow[4])
    expect(arrow[3]).not.toBe(arrow[5])
    expect(arrow[5]).toBe(arrow[7])
    expect(-pivotX).toBeLessThan(-30)
    expect(buildFixtureSymbol('railing', 118, 10).polylines.length).toBeGreaterThan(2)
  })

  it('builds quarter-turn stairs in the same stroke style as the 180 winder', () => {
    const winder = buildFixtureSymbol('stair_winder_180', 105, 243)
    const bg = buildFixtureSymbol('stair_quarter_90', 85, 155)
    const up = buildFixtureSymbol('stair_quarter_90_up', 85, 155)
    expect(bg.stroke).toBe(winder.stroke)
    expect(bg.fill).toBe(winder.fill)
    expect(bg.strokeWidth).toBe(winder.strokeWidth)
    expect(bg.arrowStrokeWidth).toBe(winder.arrowStrokeWidth)
    expect(bg.overWalls).toBe(false)
    expect(bg.rects).toHaveLength(0)
    expect(bg.fillPolygons?.length).toBe(1)
    expect(bg.dashPolylines?.length).toBe(1)
    expect(bg.arrowPolylines?.length).toBe(2)
    expect(bg.polylines.length).toBeGreaterThan(6)

    const bgCutY = ((bg.dashPolylines?.[0]?.[1] ?? 0) + (bg.dashPolylines?.[0]?.[3] ?? 0)) / 2
    const upCutY = ((up.dashPolylines?.[0]?.[1] ?? 0) + (up.dashPolylines?.[0]?.[3] ?? 0)) / 2
    expect(bgCutY).toBeLessThan(0)
    expect(upCutY).toBeGreaterThan(0)

    const bgTipY = bg.arrowPolylines?.[0]?.[5] ?? 0
    const upTipY = up.arrowPolylines?.[0]?.[5] ?? 0
    expect(bgTipY).toBeLessThan(bg.arrowPolylines?.[0]?.[1] ?? 0)
    expect(upTipY).toBeLessThan(up.arrowPolylines?.[0]?.[1] ?? 0)
  })

  it('fills wastafel/douchekop to the item bbox so they sit on the wall', () => {
    const sink = buildFixtureSymbol('sink_large', 56.54, 48.49)
    expect(sink.rects[0]?.[0]).toBeCloseTo(-56.54 / 2, 5)
    expect(sink.rects[0]?.[1]).toBeCloseTo(-48.49 / 2, 5)
    expect(sink.rects[0]?.[2]).toBeCloseTo(56.54, 5)
    expect(sink.rects[0]?.[3]).toBeCloseTo(48.49, 5)
    expect(sink.circles[0]?.[1]).toBeGreaterThan(0)

    const shower = buildFixtureSymbol('shower_head', 40.6, 38.11)
    const plate = shower.polylines[0] ?? []
    expect(plate[1]).toBeCloseTo(38.11 / 2, 5)
    expect(plate[3]).toBeCloseTo(38.11 / 2, 5)
    expect(shower.circles[0]?.[1]).toBeLessThan(0)
  })

  it('fills toilet to the item bbox (~40×70)', () => {
    const toilet = buildFixtureSymbol('toilet', 38.884, 68.054)
    expect(toilet.rects[0]?.[0]).toBeCloseTo(-38.884 / 2, 5)
    expect(toilet.rects[0]?.[2]).toBeCloseTo(38.884, 5)
    const bowl = toilet.ellipses[0] ?? []
    expect(bowl[2]).toBeCloseTo(38.884 * 0.48, 5)
    expect(bowl[1] + bowl[3]).toBeCloseTo(68.054 / 2, 4)
  })

  it('puts keukenblad under walls and afdak over with dash', () => {
    const fixtures = buildRenderFixtures(
      {
        name: 'bg',
        level: 1,
        height: 260,
        walls: [],
        items: [
          {
            refid: 'db74ce14813eb0d5c54c8992806b22fb846ee34c',
            x: 0,
            y: 0,
            width: 180,
            height: 60,
          },
          {
            refid: 'd8dfd3e5683d86a7d9db8a8f7d3260b87ea8213f',
            x: 10,
            y: 10,
            width: 91,
            height: 39,
          },
        ],
      },
      (x, y) => ({ x, y }),
    )
    expect(fixtures[0]?.overWalls).toBe(false)
    expect(fixtures[1]?.overWalls).toBe(true)
    expect(fixtures[1]?.dash?.length).toBeGreaterThan(0)
  })

  it('omits hidden afdak-armatuur from render', () => {
    expect(resolveFixtureCatalog('7518d7dd885df41f7caddb870d2561bdc5a1a861').kind).toBe('hidden')
    const fixtures = buildRenderFixtures(
      {
        name: 'bg',
        level: 1,
        height: 260,
        walls: [],
        items: [
          {
            refid: 'd8dfd3e5683d86a7d9db8a8f7d3260b87ea8213f',
            x: 0,
            y: 0,
            width: 91,
            height: 39,
          },
          {
            refid: '7518d7dd885df41f7caddb870d2561bdc5a1a861',
            x: 0,
            y: 0,
            width: 13,
            height: 19,
          },
        ],
      },
      (x, y) => ({ x, y }),
    )
    expect(fixtures).toHaveLength(1)
    expect(fixtures[0]?.label).toBe('Beton afdak')
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
    const m = multi.mullions[1]
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
    expect(plan.floors[0]?.items?.[0]?.refid).toBe('5bbfd9e1325ca8d3c59e23b35401eeec71424256')
  })
})
