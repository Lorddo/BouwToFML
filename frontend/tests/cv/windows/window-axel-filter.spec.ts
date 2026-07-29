import { describe, expect, it } from 'vitest'
import {
  assembleFaceDualSpace,
  buildFaceSpaceFromComponents,
} from '@/cv/walls/rooms/face-dual-space'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import { runWindowAxelFilter, type WindowAxelRefBand } from '@/cv/windows'

function component(
  label: number,
  bbox: { x: number; y: number; width: number; height: number },
): RasterRoomComponent {
  return {
    label,
    areaPx: bbox.width * bbox.height,
    bbox,
    touchesBorder: false,
  }
}

function multiStripRef(overrides: Partial<WindowAxelRefBand> = {}): WindowAxelRefBand {
  return {
    refIndex: 0,
    stripCount: 3,
    stripHeightsPx: [8, 8, 8],
    targetStripHeightPx: 8,
    targetStripHeightRatio: 8 / 24,
    axisBandHeightPx: 24,
    orientation: 'horizontal',
    fullStripCount: 3,
    fullStripHeightsPx: [8, 8, 8],
    framingSizeRange: null,
    topRailRange: null,
    bottomRailRange: null,
    ...overrides,
  }
}

function dualFrom(params: {
  components: RasterRoomComponent[]
  classes?: Array<[number, RoomRasterClass]>
  wallInkAdjacency?: Map<number, Set<number>>
  wallInkClassificationByLabel?: Map<number, RoomRasterClass>
}) {
  const classificationByLabel = new Map(
    params.classes ?? params.components.map((c) => [c.label, 'wall' as RoomRasterClass]),
  )
  const white = buildFaceSpaceFromComponents({
    kind: 'opening-white',
    components: params.components,
    parentMap: new Map(),
    classificationByLabel,
  })
  const ink = buildFaceSpaceFromComponents({
    kind: 'wall-ink',
    components: params.components,
    parentMap: new Map(),
    classificationByLabel: params.wallInkClassificationByLabel ?? classificationByLabel,
    adjacency: params.wallInkAdjacency ?? new Map(),
  })
  return assembleFaceDualSpace(white, ink)
}

function runWithRef(ref: WindowAxelRefBand) {
  return runWindowAxelFilter({
    dual: dualFrom({
      components: [component(1, { x: 20, y: 20, width: 90, height: 12 })],
      classes: [[1, 'unknown']],
    }),
    refBands: [ref],
  })
}

function runMulti(params: {
  components: RasterRoomComponent[]
  classes?: Array<[number, RoomRasterClass]>
  ref?: WindowAxelRefBand
  wallInkAdjacency?: Map<number, Set<number>>
  wallInkClassificationByLabel?: Map<number, RoomRasterClass>
}) {
  return runWindowAxelFilter({
    dual: dualFrom(params),
    refBands: [params.ref ?? multiStripRef()],
  })
}

describe('window-axel-filter', () => {
  it('denormaliseert targetStripHeight vanuit ratio (ook als target px stale is)', () => {
    const result = runWithRef({
      refIndex: 0,
      stripCount: 1,
      stripHeightsPx: [6],
      // Stale absolute target; ratio+axis moeten leidend zijn => effectief 12px.
      targetStripHeightPx: 6,
      targetStripHeightRatio: 0.5,
      axisBandHeightPx: 24,
      orientation: 'horizontal',
      fullStripCount: 1,
      fullStripHeightsPx: [6],
      framingSizeRange: null,
      topRailRange: null,
      bottomRailRange: null,
    })
    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.faceIds).toEqual([1])
    expect(result.hypotheses[0]?.orientation).toBeDefined()
  })

  it('valt terug op target px/axis-band wanneer ratio ontbreekt', () => {
    // Zonder ratio: target=6 → max strip = 10.8; face h=12 valt al buiten kandidaat-plafond.
    const result = runWithRef({
      refIndex: 0,
      stripCount: 1,
      stripHeightsPx: [6],
      targetStripHeightPx: 6,
      axisBandHeightPx: 24,
      orientation: 'horizontal',
      fullStripCount: 1,
      fullStripHeightsPx: [6],
      framingSizeRange: null,
      topRailRange: null,
      bottomRailRange: null,
    } as WindowAxelRefBand)
    expect(result.hypotheses).toHaveLength(0)
  })

  it('accepteert multi-strip cluster op wall-faces via ink-brug', () => {
    const result = runMulti({
      components: [
        component(75, { x: 100, y: 40, width: 155, height: 8 }),
        component(81, { x: 100, y: 52, width: 155, height: 8 }),
        component(83, { x: 100, y: 64, width: 155, height: 8 }),
      ],
      classes: [
        [75, 'wall'],
        [81, 'wall'],
        [83, 'wall'],
      ],
      wallInkAdjacency: new Map([
        [75, new Set([81])],
        [81, new Set([75, 83])],
        [83, new Set([81])],
      ]),
    })
    const acceptedKeys = result.hypotheses.map((h) => h.faceIds.join('_'))
    // Goede triple moet erin zitten; volle 4-set is geen k-tuple (k=3).
    expect(acceptedKeys).toContain('75_81_83')
    expect(acceptedKeys.some((key) => key.split('_').length === 4)).toBe(false)
    // Generatief: meerdere overlapping triples ok; Stage 2/3 filtert.
    expect(result.hypotheses.length).toBeGreaterThanOrEqual(1)
  })

  it('verticaal raam: dunne glasstrips (2–4px) als Stage-1 hyp; dikke rails niet', () => {
    const result = runWindowAxelFilter({
      dual: dualFrom({
        components: [
          component(354, { x: 848, y: 1483, width: 10, height: 69 }),
          component(359, { x: 863, y: 1493, width: 2, height: 50 }),
          component(360, { x: 867, y: 1492, width: 4, height: 54 }),
          component(356, { x: 875, y: 1483, width: 10, height: 69 }),
        ],
        classes: [
          [354, 'wall'],
          [359, 'wall'],
          [360, 'wall'],
          [356, 'wall'],
        ],
        wallInkAdjacency: new Map([
          [354, new Set([359])],
          [359, new Set([354, 360])],
          [360, new Set([359, 356])],
          [356, new Set([360])],
        ]),
        wallInkClassificationByLabel: new Map([
          [354, 'wall'],
          [359, 'wall'],
          [360, 'wall'],
          [356, 'wall'],
        ]),
      }),
      refBands: [
        {
          refIndex: 0,
          stripCount: 2,
          stripHeightsPx: [2, 2],
          targetStripHeightPx: 2,
          targetStripHeightRatio: 2 / 9,
          axisBandHeightPx: 9,
          orientation: 'horizontal',
          fullStripCount: 3,
          fullStripHeightsPx: [2, 2, 9],
          framingSizeRange: null,
          topRailRange: null,
          bottomRailRange: null,
          topRailHeightPx: 9,
          bottomRailHeightPx: 2,
        },
      ],
    })
    const keys = result.hypotheses.map((h) => h.faceIds.join('_'))
    expect(keys).toContain('359_360')
    // Dikke rails (> target+tol) zijn geen Stage-1 kandidaten.
    expect(keys.some((k) => k.includes('354') || k.includes('356'))).toBe(false)
  })

  it('verwerpt lange doorlopende rail × korte glasstrip (4-ramen-band noise)', () => {
    const result = runWindowAxelFilter({
      dual: dualFrom({
        components: [
          component(3, { x: 382, y: 169, width: 678, height: 2 }),
          component(8, { x: 391, y: 181, width: 156, height: 2 }),
          component(16, { x: 392, y: 191, width: 154, height: 2 }),
        ],
        classes: [
          [3, 'wall'],
          [8, 'wall'],
          [16, 'wall'],
        ],
        wallInkAdjacency: new Map([
          [3, new Set([8])],
          [8, new Set([3, 16])],
          [16, new Set([8])],
        ]),
        wallInkClassificationByLabel: new Map([
          [3, 'wall'],
          [8, 'wall'],
          [16, 'wall'],
        ]),
      }),
      refBands: [
        {
          refIndex: 0,
          stripCount: 2,
          stripHeightsPx: [2, 2],
          targetStripHeightPx: 2,
          targetStripHeightRatio: 2 / 9,
          axisBandHeightPx: 9,
          orientation: 'horizontal',
          fullStripCount: 3,
          fullStripHeightsPx: [2, 2, 9],
          framingSizeRange: null,
          topRailRange: null,
          bottomRailRange: null,
        },
      ],
    })
    const keys = result.hypotheses.map((h) => h.faceIds.join('_'))
    expect(keys).toContain('8_16')
    expect(keys.some((k) => k.includes('3'))).toBe(false)
    expect(result.rejections.some((r) => r.reason === 'axis_span_spread')).toBe(true)
  })

  it('verwerpt dikke panelen (~36px) bij dunne strip-target (as-band×1.8 telt niet per strip)', () => {
    const result = runMulti({
      components: [
        component(10, { x: 100, y: 40, width: 155, height: 36 }),
        component(11, { x: 100, y: 80, width: 155, height: 36 }),
        component(12, { x: 100, y: 120, width: 155, height: 36 }),
      ],
      ref: multiStripRef({
        stripCount: 3,
        stripHeightsPx: [8, 8, 8],
        targetStripHeightPx: 8,
        targetStripHeightRatio: 8 / 24,
        axisBandHeightPx: 24,
      }),
      wallInkAdjacency: new Map([
        [10, new Set([11])],
        [11, new Set([10, 12])],
        [12, new Set([11])],
      ]),
    })
    expect(result.hypotheses).toHaveLength(0)
  })
})
