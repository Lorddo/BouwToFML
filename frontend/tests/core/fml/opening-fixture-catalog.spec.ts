import { describe, expect, it } from 'vitest'
import {
  FML_ALIGN_FIXTURE_REFID,
  listFixturePlaceOptions,
  resolveFixtureCatalog,
} from '@/core/fml/fixture-refid-catalog'
import { fixturePlaceSizeCm } from '@/core/fml/fixture-place-defaults'
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

  it('lists placeable catalog rows with default footprints', () => {
    const options = listFixturePlaceOptions()
    expect(options.length).toBeGreaterThan(10)
    expect(options.every((item) => item.refid && item.kind !== 'hidden')).toBe(true)
    expect(fixturePlaceSizeCm('countertop')).toEqual({ width: 120, height: 60 })
    expect(fixturePlaceSizeCm('generic')).toEqual({ width: 60, height: 60 })
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

    const chase = buildFixtureSymbol('koof', 125, 28)
    expect(chase.rects[0]?.[2]).toBeCloseTo(125, 5)
    expect(chase.rects[0]?.[3]).toBeCloseTo(28, 5)
    expect(chase.circles).toHaveLength(0)
    expect(chase.polylines).toHaveLength(2)
    expect(chase.polylines[0]).toEqual([-62.5, -14, 62.5, 14])
    expect(chase.polylines[1]).toEqual([-62.5, 14, 62.5, -14])
    expect(chase.stroke).toBe('#0f172a')
    expect(chase.overWalls).toBe(true)

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

    const mirror = { x: true }
    const ostadeUp = buildFixtureSymbol('stair_quarter_90', 73, 130.86, mirror)
    const ostadeDown = buildFixtureSymbol('stair_quarter_90_up', 73, 130.86, mirror)
    const upPivotX = ostadeUp.polylines[0]?.[2] ?? 0
    const upPivotY = ostadeUp.polylines[0]?.[3] ?? 0
    expect(upPivotX).toBeGreaterThan(0)
    const upShaft = ostadeUp.arrowPolylines?.[0] ?? []
    expect(upShaft[5] ?? 0).toBeLessThan(upShaft[1] ?? 0)
    expect(upShaft[2] ?? 0).toBeLessThan(upShaft[0] ?? 0)
    const upHoriz = ostadeUp.polylines.filter(
      (p) => Math.abs((p[1] ?? 0) - (p[3] ?? 0)) < 0.05 && Math.abs((p[0] ?? 0) - (p[2] ?? 0)) > 20,
    )
    const aboveSpil = upHoriz.filter(
      (p) => (p[1] ?? 0) < upPivotY - 1 && (p[1] ?? 0) > -130.86 / 2 + 1,
    )
    expect(aboveSpil.length).toBe(3)
    const belowSpilUp = upHoriz.filter(
      (p) => (p[1] ?? 0) > upPivotY + 1 && (p[1] ?? 0) < 73 / 2 - 1,
    )
    expect(belowSpilUp.length).toBe(0)

    const annaUp = buildFixtureSymbol('stair_quarter_90', 90, 145.4)
    const annaUpPivotX = annaUp.polylines[0]?.[2] ?? 0
    expect(annaUpPivotX).toBeLessThan(0)

    const downPivotX = ostadeDown.polylines[0]?.[2] ?? 0
    const downPivotY = ostadeDown.polylines[0]?.[3] ?? 0
    expect(downPivotX).toBeGreaterThan(0)
    expect(downPivotY).toBeGreaterThan(0)
    const downShaft = ostadeDown.arrowPolylines?.[0] ?? []
    expect(downShaft[4] ?? 0).toBeGreaterThan(downShaft[0] ?? 0)
    expect(downShaft[5] ?? 0).toBeCloseTo(downShaft[3] ?? 0, 5)
    expect(downShaft[5] ?? 0).toBeLessThan(downShaft[1] ?? 0)
    const downHoriz = ostadeDown.polylines.filter(
      (p) => Math.abs((p[1] ?? 0) - (p[3] ?? 0)) < 0.05 && Math.abs((p[0] ?? 0) - (p[2] ?? 0)) > 20,
    )
    const belowSpil = downHoriz.filter((p) => (p[1] ?? 0) > downPivotY + 1)
    expect(belowSpil.length).toBe(3)
    const aboveTurn = downHoriz.filter(
      (p) => (p[1] ?? 0) < downPivotY - 1 && (p[1] ?? 0) > -130.86 / 2 + 1,
    )
    expect(aboveTurn.length).toBe(0)

    const anna = buildFixtureSymbol('stair_quarter_90_up', 73, 130.86)
    const annaPivotX = anna.polylines[0]?.[2] ?? 0
    const annaPivotY = anna.polylines[0]?.[3] ?? 0
    expect(annaPivotX).toBeLessThan(0)
    expect(annaPivotY).toBeGreaterThan(0)
    const annaShaft = anna.arrowPolylines?.[0] ?? []
    expect(annaShaft[4] ?? 0).toBeLessThan(annaShaft[0] ?? 0)

    const fixtures = buildRenderFixtures(
      {
        name: '1e',
        level: 1,
        height: 264,
        walls: [],
        items: [
          {
            refid: '7f4bebad787178e920c4c7aa11954aad24e457a1',
            x: 108.2,
            y: 1081.3,
            width: 73,
            height: 130.86,
            rotation: 0,
            mirrored: [1, 0],
          },
          {
            refid: 'e28361f3a9cdd47134d12b3e183481cfa638668f',
            x: 110.86,
            y: 999.47,
            width: 121.47,
            height: 73,
            rotation: 90,
            mirrored: [1, 0],
          },
        ],
      },
      (x, y) => ({ x, y }),
    )
    expect(fixtures).toHaveLength(2)
    expect(fixtures[0]?.scaleX).toBeGreaterThan(0)
    expect(fixtures[1]?.scaleX).toBeGreaterThan(0)
    expect(fixtures[1]?.rotationDeg).toBe(90)

    const ostade2e = buildFixtureSymbol('stair_quarter_90_up', 121.47, 73, {
      x: true,
      rotation: 90,
    })
    const anna4e = buildFixtureSymbol('stair_quarter_90_up', 148.8, 86.9, { rotation: 270 })
    const ostadeDashX = ostade2e.dashPolylines?.[0]?.[2] ?? 0
    const annaDashX = anna4e.dashPolylines?.[0]?.[2] ?? 0
    expect(ostadeDashX).toBeGreaterThan(0)
    expect(annaDashX).toBeLessThan(0)

    const amstelveen1e = buildFixtureSymbol('stair_quarter_90_up', 137, 90.3, {
      y: true,
      rotation: 90,
    })
    const amstelveenDashX = amstelveen1e.dashPolylines?.[0]?.[2] ?? 0
    expect(amstelveenDashX).toBeLessThan(0)

    const amstelveenBg = buildFixtureSymbol('stair_quarter_90', 92, 153, {
      x: true,
      rotation: 180,
    })
    const amstelveenBgCutY =
      ((amstelveenBg.dashPolylines?.[0]?.[1] ?? 0) + (amstelveenBg.dashPolylines?.[0]?.[3] ?? 0)) /
      2
    expect(amstelveenBgCutY).toBeLessThan(0)
  })

  it('links Oosterpoort toilet, straight stair (rot/mirror baked), and trapgat default', () => {
    expect(resolveFixtureCatalog('fc3f4092037285fb0d17702b7a3920e2910de0cc')).toMatchObject({
      kind: 'toilet',
      label: 'Toilet',
    })
    expect(resolveFixtureCatalog('17f4fb9a53843a0e345bfd587144ed48c08bf6f5')).toMatchObject({
      kind: 'stair_straight',
      label: 'Rechte trap',
    })
    expect(resolveFixtureCatalog('sym-stair-opening')).toMatchObject({
      kind: 'stair_opening',
      label: 'Trapgat',
    })

    const winder = buildFixtureSymbol('stair_winder_180', 105, 243)
    const straight = buildFixtureSymbol('stair_straight', 85, 225.33)
    expect(straight.stroke).toBe(winder.stroke)
    expect(straight.strokeWidth).toBe(winder.strokeWidth)
    expect(straight.arrowStrokeWidth).toBe(winder.arrowStrokeWidth)
    expect(straight.overWalls).toBe(false)
    const cutY =
      ((straight.dashPolylines?.[0]?.[1] ?? 0) + (straight.dashPolylines?.[0]?.[3] ?? 0)) / 2
    expect(cutY).toBeLessThan(0)
    const shaft = straight.arrowPolylines?.[0] ?? []
    expect(shaft[3] ?? 0).toBeLessThan(shaft[1] ?? 0)

    const oosterpoort = buildFixtureSymbol('stair_straight', 85, 225.33, { rotation: 90 })
    const oosterCutY =
      ((oosterpoort.dashPolylines?.[0]?.[1] ?? 0) + (oosterpoort.dashPolylines?.[0]?.[3] ?? 0)) / 2
    expect(oosterCutY).toBeLessThan(0)

    const opening = buildFixtureSymbol('stair_opening', 169, 85)
    expect(opening.polylines).toHaveLength(2)
    expect(opening.dash).toEqual([6, 4])
    expect(opening.fill).toBe('transparent')

    const fixtures = buildRenderFixtures(
      {
        name: 'Kelder',
        level: 0,
        height: 202,
        walls: [],
        items: [
          {
            refid: '17f4fb9a53843a0e345bfd587144ed48c08bf6f5',
            x: 1051.9,
            y: 881.8,
            width: 85,
            height: 225.33,
            rotation: 90,
            mirrored: [0, 0],
          },
        ],
      },
      (x, y) => ({ x, y }),
    )
    expect(fixtures).toHaveLength(1)
    expect(fixtures[0]?.scaleX).toBeGreaterThan(0)
    expect(fixtures[0]?.scaleY).toBeGreaterThan(0)
    expect(fixtures[0]?.rotationDeg).toBe(90)
  })

  it('links Poort6 double straight stair and trapgat object', () => {
    expect(resolveFixtureCatalog('825bce5ff93725dbd0ab11b82e6a2b13f96475cf')).toMatchObject({
      kind: 'stair_straight_double',
      label: 'Dubbele rechte trap',
    })
    expect(resolveFixtureCatalog('c86e7f32a692444a8ff2a19e3cd29ce6ecc9c444')).toMatchObject({
      kind: 'stair_opening',
      label: 'Trapgat',
    })

    const pair = buildFixtureSymbol('stair_straight_double', 203, 217)
    const winder = buildFixtureSymbol('stair_winder_180', 105, 243)
    expect(pair.stroke).toBe(winder.stroke)
    expect(pair.strokeWidth).toBe(winder.strokeWidth)
    expect(pair.arrowStrokeWidth).toBe(winder.arrowStrokeWidth)
    expect(pair.overWalls).toBe(false)
    expect(pair.arrowPolylines).toHaveLength(4)
    expect(pair.dashPolylines).toHaveLength(2)

    const upShaft = pair.arrowPolylines?.[0] ?? []
    const downShaft = pair.arrowPolylines?.[2] ?? []
    expect(upShaft[1] ?? 0).toBeGreaterThan(0)
    expect(upShaft[2] ?? 0).toBeLessThan(upShaft[0] ?? 0)
    expect(downShaft[1] ?? 0).toBeLessThan(0)
    expect(downShaft[2] ?? 0).toBeGreaterThan(downShaft[0] ?? 0)

    const fixtures = buildRenderFixtures(
      {
        name: 'Begane grond',
        level: 1,
        height: 255,
        walls: [],
        items: [
          {
            refid: '825bce5ff93725dbd0ab11b82e6a2b13f96475cf',
            x: 590,
            y: 783.2,
            width: 203,
            height: 217,
            rotation: 270,
            mirrored: [0, 0],
          },
        ],
      },
      (x, y) => ({ x, y }),
    )
    expect(fixtures).toHaveLength(1)
    expect(fixtures[0]?.scaleX).toBeGreaterThan(0)
    expect(fixtures[0]?.scaleY).toBeGreaterThan(0)
    expect(fixtures[0]?.rotationDeg).toBe(270)
  })

  it('links Poort6 dakkapel as a U-wall with two outer windows', () => {
    expect(resolveFixtureCatalog('a8c2aefd352dbcdd65543fa95659b1cc096ad73f')).toMatchObject({
      kind: 'dormer',
      label: 'Dakkapel',
    })

    const symbol = buildFixtureSymbol('dormer', 180, 27.48)
    expect(symbol.overWalls).toBe(true)
    expect(symbol.fill).toBe('#111827')
    expect(symbol.rects).toHaveLength(5)
    expect(symbol.polylines).toHaveLength(4)

    const left = symbol.rects[0] ?? []
    const right = symbol.rects[1] ?? []
    expect(left[0]).toBeCloseTo(-90, 5)
    expect((right[0] ?? 0) + (right[2] ?? 0)).toBeCloseTo(90, 5)
    expect(left[3]).toBeCloseTo(27.48, 5)

    const outer = symbol.rects.slice(2)
    expect(outer).toHaveLength(3)
    for (const rect of outer) {
      expect((rect[1] ?? 0) + (rect[3] ?? 0)).toBeCloseTo(27.48 / 2, 5)
    }
    const wideOnRoomSide = symbol.rects.filter((rect) => (rect[2] ?? 0) > 80 && (rect[1] ?? 0) < -2)
    expect(wideOnRoomSide).toHaveLength(0)

    const glassY = symbol.polylines.map((line) => line[1] ?? 0)
    expect(glassY.every((y) => y > 0)).toBe(true)
    const glassMidX = symbol.polylines.map((line) => ((line[0] ?? 0) + (line[2] ?? 0)) / 2)
    expect(glassMidX.filter((x) => x < 0)).toHaveLength(2)
    expect(glassMidX.filter((x) => x > 0)).toHaveLength(2)
    const sideInner = -90 + (left[2] ?? 0)
    const glassLeft = Math.min(...symbol.polylines.map((line) => line[0] ?? 0))
    expect(glassLeft - sideInner).toBeLessThan(4)

    const narrow = buildFixtureSymbol('dormer', 90.01, 29.53)
    expect(narrow.rects).toHaveLength(5)
    expect(narrow.polylines).toHaveLength(4)

    const fixtures = buildRenderFixtures(
      {
        name: 'Tweede verdieping',
        level: 3,
        height: 263,
        walls: [],
        items: [
          {
            refid: 'a8c2aefd352dbcdd65543fa95659b1cc096ad73f',
            x: -348.49,
            y: 2034.56,
            width: 180,
            height: 27.48,
            rotation: 0,
            mirrored: [0, 0],
          },
        ],
      },
      (x, y) => ({ x, y }),
    )
    expect(fixtures).toHaveLength(1)
    expect(fixtures[0]?.label).toBe('Dakkapel')
    expect(fixtures[0]?.overWalls).toBe(true)
    expect(fixtures[0]?.scaleX).toBeGreaterThan(0)
    expect(fixtures[0]?.scaleY).toBeGreaterThan(0)
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

    const small = buildFixtureSymbol('sink_small', 35, 22)
    const ys = (small.polylines[0] ?? []).filter((_, i) => i % 2 === 1)
    expect(Math.min(...ys)).toBeCloseTo(-11, 5)
    expect(Math.max(...ys)).toBeCloseTo(11, 4)
    expect(small.circles[0]?.[1]).toBeGreaterThan(-11)
    expect(small.circles[0]?.[1]).toBeLessThan(0)
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

  it('resolves Kinderdijkstraat kitchen fixture refids', () => {
    expect(resolveFixtureCatalog('f6402c587fa67fbdba921024206525ee86432449').kind).toBe(
      'countertop',
    )
    expect(resolveFixtureCatalog('bd60660df8e8d48fa3f524a7536d1f78e6e0e21f')).toMatchObject({
      kind: 'fridge',
      label: 'Koelkast',
    })
    expect(resolveFixtureCatalog('79b71be64f8b275103e264cbd1c070d820bac2b4')).toMatchObject({
      kind: 'kitchen_sink',
      label: 'Wasbak (keuken)',
    })
    expect(resolveFixtureCatalog('a87ae8e3bd9b8c3c45d3330cbac583baa957c3bb')).toMatchObject({
      kind: 'cooktop',
      label: 'Kookplaat',
    })
  })

  it('builds fridge snowflake, kitchen sink faucet, and 4-burner cooktop', () => {
    const fridge = buildFixtureSymbol('fridge', 60, 60)
    expect(fridge.rects).toHaveLength(1)
    expect(fridge.polylines.length).toBe(14)
    const doorOuter = fridge.polylines[12] ?? []
    const doorInner = fridge.polylines[13] ?? []
    expect(doorOuter[1]).toBeCloseTo(30, 5)
    expect(doorInner[1]).toBeLessThan(doorOuter[1] ?? 0)
    expect(fridge.overWalls).toBe(false)

    const cabinet = buildFixtureSymbol('cabinet_high', 65, 65)
    expect(cabinet.rects).toHaveLength(1)
    expect(cabinet.polylines).toHaveLength(2)
    expect(cabinet.polylines[0]?.[1]).toBeCloseTo(32.5, 5)
    expect(cabinet.polylines[1]?.[1]).toBeLessThan(cabinet.polylines[0]?.[1] ?? 0)
    expect(cabinet.overWalls).toBe(false)

    const sink = buildFixtureSymbol('kitchen_sink', 45, 39)
    expect(sink.rects[0]?.[2]).toBeCloseTo(45, 5)
    expect(sink.rects[0]?.[3]).toBeCloseTo(39, 5)
    expect(sink.circles).toHaveLength(1)
    expect(sink.circles[0]?.[1]).toBeLessThan(0)
    expect(sink.fill).toBe('#94a3b8')
    expect(sink.overWalls).toBe(false)

    const hob = buildFixtureSymbol('cooktop', 60, 62)
    expect(hob.circles).toHaveLength(8)
    expect(hob.circleFill).toBe('transparent')
    expect(hob.fill).toBe('#94a3b8')
    expect(hob.overWalls).toBe(false)
  })

  it('draws keukenblad under kitchen appliances so the wasbak stays visible', () => {
    const fixtures = buildRenderFixtures(
      {
        name: 'keuken',
        level: 1,
        height: 260,
        walls: [],
        items: [
          {
            refid: '79b71be64f8b275103e264cbd1c070d820bac2b4',
            x: 0,
            y: 0,
            width: 45,
            height: 39,
          },
          {
            refid: 'f6402c587fa67fbdba921024206525ee86432449',
            x: 0,
            y: 0,
            width: 241,
            height: 60,
          },
          {
            refid: 'a87ae8e3bd9b8c3c45d3330cbac583baa957c3bb',
            x: 10,
            y: 10,
            width: 60,
            height: 62,
          },
        ],
      },
      (x, y) => ({ x, y }),
    )
    expect(fixtures.map((item) => item.label)).toEqual([
      'Keukenblad',
      'Wasbak (keuken)',
      'Kookplaat',
    ])
  })

  it('resolves Kinderdijkstraat bathroom, bedroom sink, and entrance arrow', () => {
    expect(resolveFixtureCatalog('cb00ebb224822113239b0ad246940f7f208570b3').kind).toBe(
      'shower_head',
    )
    expect(resolveFixtureCatalog('b9782bc372e695a56bc5b488f4f9114c8e8c7f28')).toMatchObject({
      kind: 'toilet_wall_hung',
      label: 'Hangend toilet',
    })
    expect(resolveFixtureCatalog('06c0e13ac226ebda9c917c6a79ec8e58dd0a9b86').kind).toBe(
      'glass_wall',
    )
    expect(resolveFixtureCatalog('8911888116d02e6058deb14839e65290eb9041be').kind).toBe(
      'sink_large',
    )
    expect(resolveFixtureCatalog('sym-22')).toMatchObject({
      kind: 'entrance_arrow',
      label: 'Entree-pijl',
    })
    expect(resolveFixtureCatalog('sym-350')).toMatchObject({
      kind: 'north_cross',
      label: 'Noordkruis',
    })
    expect(resolveFixtureCatalog('d7ab51af239b365d146fc553319312f4f2d952df')).toMatchObject({
      kind: 'fuse_box',
      label: 'Stoppenkast',
    })
  })

  it('maps Kromme-Mijdrecht washbasin refid to small or large by size', () => {
    const refid = 'acd22f8f5814b4f22ecf1a698a4cadb6c8014739'
    expect(resolveFixtureCatalog(refid, { width: 35, height: 22 })).toMatchObject({
      kind: 'sink_small',
      label: 'Wasbak (klein)',
    })
    expect(resolveFixtureCatalog(refid, { width: 51.44, height: 33.71 })).toMatchObject({
      kind: 'sink_large',
      label: 'Wasbak (groot)',
    })
  })

  it('resolves Kromme-Mijdrecht dishwasher, fridge, washing machine, and cooktop', () => {
    expect(resolveFixtureCatalog('cb3dd8f2c8de396606e0794f6effc921aff7235d')).toMatchObject({
      kind: 'dishwasher',
      label: 'Vaatwasser',
    })
    expect(resolveFixtureCatalog('416c68a89eda39033eb729fa72f7058802555a9e')).toMatchObject({
      kind: 'fridge',
      label: 'Koelkast',
    })
    expect(resolveFixtureCatalog('856317b238f6a70ae6f0afffed1f6d5e3ab7b80c')).toMatchObject({
      kind: 'washing_machine',
      label: 'Wasmachine',
    })
    expect(resolveFixtureCatalog('20c1f9e918e3f5c28ea4012347c6d76a3745eecc').kind).toBe('cooktop')
    expect(resolveFixtureCatalog('f6402c587fa67fbdba921024206525ee86432449').kind).toBe(
      'countertop',
    )

    const dw = buildFixtureSymbol('dishwasher', 60, 60)
    expect(dw.circles.length).toBe(2)
    expect(dw.circles[0]?.[0]).toBeCloseTo(0)
    expect(dw.circles[0]?.[1]).toBeCloseTo(0)
    expect(dw.polylines).toHaveLength(5)
    expect(dw.overWalls).toBe(false)

    const wm = buildFixtureSymbol('washing_machine', 60, 60)
    expect(wm.rects).toHaveLength(1)
    expect(wm.circles).toHaveLength(0)
    expect(wm.fillPolygons?.length ?? 0).toBe(0)
    expect(wm.polylines).toHaveLength(2)
    const tubXs = (wm.polylines[0] ?? []).filter((_, i) => i % 2 === 0)
    expect(Math.max(...tubXs)).toBeLessThan(30)
    expect(wm.overWalls).toBe(false)

    const dry = buildFixtureSymbol('dryer', 60, 60)
    expect(dry.rects).toHaveLength(1)
    expect(dry.polylines).toHaveLength(1)
    expect(dry.circles).toHaveLength(1)
    expect(dry.circleFill).toBe('transparent')
  })

  it('builds wall-hung toilet, thin glass wall, and black entrance triangle', () => {
    const hung = buildFixtureSymbol('toilet_wall_hung', 37, 54.24)
    expect(hung.rects).toHaveLength(0)
    expect(hung.ellipses).toHaveLength(1)
    expect(hung.overWalls).toBe(false)
    const bowl = hung.ellipses[0] ?? []
    expect(bowl[1] + bowl[3]).toBeCloseTo(54.24 / 2, 4)

    const glass = buildFixtureSymbol('glass_wall', 72.36, 3)
    expect(glass.rects[0]?.[3]).toBeCloseTo(3, 5)
    expect(glass.fill).toBe('#e0f2fe')
    expect(glass.overWalls).toBe(true)

    const arrow = buildFixtureSymbol('entrance_arrow', 28, 40)
    expect(arrow.fillPolygons?.[0]).toEqual([14, 0, -14, 20, -14, -20])
    expect(arrow.fill).toBe('#0f172a')
    expect(arrow.overWalls).toBe(true)

    const north = buildFixtureSymbol('north_cross', 85, 200)
    const apexY = north.fillPolygons?.[0]?.[1] ?? 0
    expect(apexY).toBeLessThan(0)
    expect(north.circles).toHaveLength(1)
    expect(north.polylines).toHaveLength(3)
    expect(north.overWalls).toBe(true)

    const fuse = buildFixtureSymbol('fuse_box', 50.39, 9.11)
    expect(fuse.rects).toHaveLength(1)
    expect(fuse.circles).toHaveLength(3)
    expect(fuse.circleFill).toBe('#cbd5e1')
    expect(fuse.fill).toBe('#1e293b')
    expect(fuse.overWalls).toBe(false)
    expect(fuse.circles[1]?.[1]).toBeLessThan(0)
  })

  it('draws balcony balustrades as gray stair-rail bars', () => {
    expect(resolveFixtureCatalog('dbdefc3be5b710a2f123fc1acc137b621eeff0fc').kind).toBe(
      'balustrade',
    )
    expect(resolveFixtureCatalog('9ab4ec64a812dbdb0848ab5c0267c97edb99a7c8').kind).toBe(
      'balustrade',
    )
    const rail = buildFixtureSymbol('railing', 193, 5.902)
    const bal = buildFixtureSymbol('balustrade', 193, 5.902)
    expect(bal.polylines.length).toBe(rail.polylines.length)
    expect(bal.polylines.length).toBeGreaterThan(2)
    expect(bal.stroke).toBe('#64748b')
    expect(rail.stroke).toBe('#0f172a')
    expect(bal.strokeWidth).toBeLessThan(rail.strokeWidth ?? 2.2)
    expect(bal.fill).toBe('transparent')
    expect(bal.rects[0]?.[3]).toBeCloseTo(5.902, 5)
    expect(bal.overWalls).toBe(true)
  })

  it('resolves Van Ostadestraat 1e-achter bathroom, combo, stair, and long balustrade', () => {
    expect(resolveFixtureCatalog('793b53d25a8b26dbe12430fe86e07f8cdeb3bb2f')).toMatchObject({
      kind: 'bathtub',
      label: 'Losstaand bad',
    })
    expect(resolveFixtureCatalog('d1d3542887f4bc9da14060afc1e332c155a0cd48')).toMatchObject({
      kind: 'sink_double',
      label: 'Dubbele wastafel',
    })
    expect(resolveFixtureCatalog('faef118ee9bdcf21040eef84cbca59d8dc50a214')).toMatchObject({
      kind: 'washer_dryer',
      label: 'Was-droogcombinatie',
    })
    expect(resolveFixtureCatalog('7f4bebad787178e920c4c7aa11954aad24e457a1')).toMatchObject({
      kind: 'stair_quarter_90',
      label: 'Kwarttrap omhoog',
    })
    expect(resolveFixtureCatalog('e28361f3a9cdd47134d12b3e183481cfa638668f')).toMatchObject({
      kind: 'stair_quarter_90_up',
      label: 'Kwarttrap van beneden',
    })
    expect(resolveFixtureCatalog('a41b3eefff00293fdf1f5e04cb44295102cb3d57').kind).toBe(
      'balustrade',
    )
    expect(resolveFixtureCatalog('c2d966559ee73ca0f88779a2de90d8158f85e4fb')).toMatchObject({
      kind: 'cabinet_high',
      label: 'Hoge kast',
    })

    const tub = buildFixtureSymbol('bathtub', 160, 85)
    expect(tub.fillPolygons?.length).toBe(1)
    expect(tub.ellipses).toHaveLength(0)
    expect(tub.circles).toHaveLength(3)
    expect(tub.circles[0]?.[1]).toBeLessThan(0)
    expect(tub.polylines[0]?.length).toBeGreaterThan(4)
    expect(tub.polylines[0]?.at(-2)).toBeCloseTo(tub.polylines[0]?.[0] ?? 0, 5)
    expect(tub.polylines[0]?.at(-1)).toBeCloseTo(tub.polylines[0]?.[1] ?? 0, 5)
    expect(tub.overWalls).toBe(false)

    const double = buildFixtureSymbol('sink_double', 195, 52)
    expect(double.rects[0]?.[2]).toBeCloseTo(195, 5)
    expect(double.rects[0]?.[1]).toBeCloseTo(-26, 5)
    expect(double.circles).toHaveLength(4)
    expect(double.circles[2]?.[1]).toBeLessThan(0)

    const combo = buildFixtureSymbol('washer_dryer', 60, 60)
    expect(combo.rects).toHaveLength(1)
    expect(combo.circles).toHaveLength(1)
    expect(combo.circles[0]?.[1]).toBeGreaterThan(0)
    expect(combo.polylines.length).toBeGreaterThanOrEqual(3)
    expect(combo.fillPolygons?.length ?? 0).toBe(0)
    expect(combo.overWalls).toBe(false)

    const short = buildFixtureSymbol('balustrade', 74.22, 5.9)
    const long = buildFixtureSymbol('balustrade', 489.02, 5.9)
    expect(long.polylines.length).toBeGreaterThan(short.polylines.length)
    expect(long.rects[0]?.[3]).toBeCloseTo(5.9, 5)
    expect(long.stroke).toBe(short.stroke)
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

  it('resolves Anna van den Vondelstraat 3e CV and toilet mini-sink', () => {
    expect(resolveFixtureCatalog('0af9732417cdf12a734bd3133f493b18cfe03e91')).toMatchObject({
      kind: 'boiler',
      label: 'CV-ketel',
    })
    expect(
      resolveFixtureCatalog('05dfa289f4a5be6a1be7f0882a4d929060242b5d', {
        width: 38.7,
        height: 21.1,
      }),
    ).toMatchObject({
      kind: 'sink_small',
      label: 'Wasbak (klein)',
    })
    expect(
      resolveFixtureCatalog('05dfa289f4a5be6a1be7f0882a4d929060242b5d', {
        width: 44.8,
        height: 17.3,
      }),
    ).toMatchObject({
      kind: 'sink_small',
      label: 'Wasbak (klein)',
    })
    expect(resolveFixtureCatalog('719b88456badf9658c0a2b9afbe6922026b6fd71')).toMatchObject({
      kind: 'koof',
      label: 'Koof',
    })
    expect(resolveFixtureCatalog('c5686bd0f8ed8a56e5460743c11364c52e79719a')).toMatchObject({
      kind: 'sink_vanity',
      label: 'Inbouw wasbak',
    })
    const vanity = buildFixtureSymbol('sink_vanity', 89.6, 50)
    expect(vanity.rects[0]?.[2]).toBeCloseTo(89.6, 5)
    expect(vanity.ellipses).toHaveLength(1)
    expect(vanity.circles).toHaveLength(1)
    expect(vanity.circles[0]?.[1]).toBeLessThan(0)
    expect((vanity.ellipses[0]?.[1] ?? 0) + (vanity.ellipses[0]?.[3] ?? 0)).toBeLessThanOrEqual(
      25.1,
    )
    expect(vanity.fill).toBe('#f8fafc')
    expect(vanity.overWalls).toBe(false)
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
