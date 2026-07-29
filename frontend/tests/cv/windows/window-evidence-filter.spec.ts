import { describe, expect, it } from 'vitest'
import {
  assembleFaceDualSpace,
  buildFaceSpaceFromComponents,
} from '@/cv/walls/rooms/face-dual-space'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import {
  expandSizeRange,
  filterWindowsByRefEvidence,
  growFullStackFromSeedFaces,
  normalizeSizeRange,
  type WindowAxelHypothesis,
  type WindowAxelRefBand,
  type WindowEvidenceKind,
  type WindowSizeRange2d,
} from '@/cv/windows'

function makeNormalizedRange(
  minW: number,
  minH: number,
  maxW: number,
  maxH: number,
  axisBandHeightPx: number,
  marginRatio = 0.4,
): WindowSizeRange2d {
  return normalizeSizeRange(expandSizeRange(minW, minH, maxW, maxH, marginRatio), axisBandHeightPx)
}

function makeRefBand(params: {
  orientation?: 'horizontal' | 'vertical'
  axisBandHeightPx?: number
  fullStripCount?: number
  targetStripHeightPx?: number
  fullStripHeightsPx?: number[]
  framing?: WindowAxelRefBand['framingSizeRange']
  topRailHeightPx?: number | null
  bottomRailHeightPx?: number | null
}): WindowAxelRefBand {
  const axisBandHeightPx = params.axisBandHeightPx ?? 12
  const fullStripCount = params.fullStripCount ?? 99
  const targetStripHeightPx = params.targetStripHeightPx ?? 6
  return {
    refIndex: 0,
    stripCount: 1,
    stripHeightsPx: [targetStripHeightPx],
    targetStripHeightPx,
    targetStripHeightRatio: targetStripHeightPx / axisBandHeightPx,
    axisBandHeightPx,
    orientation: params.orientation ?? 'horizontal',
    fullStripCount,
    fullStripHeightsPx:
      params.fullStripHeightsPx ??
      Array.from({ length: fullStripCount }, () => targetStripHeightPx),
    framingSizeRange: params.framing ?? null,
    topRailRange: null,
    bottomRailRange: null,
    topRailHeightPx: params.topRailHeightPx ?? null,
    bottomRailHeightPx: params.bottomRailHeightPx ?? null,
  }
}

function makeHypothesis(params: {
  id: string
  faceIds: number[]
  bbox: { x: number; y: number; width: number; height: number }
  orientation?: 'horizontal' | 'vertical'
}): WindowAxelHypothesis {
  const orientation =
    params.orientation ?? (params.bbox.height > params.bbox.width ? 'vertical' : 'horizontal')
  return {
    id: params.id,
    matchedRefIndex: 0,
    orientation,
    faceIds: params.faceIds,
    unionBBox: params.bbox,
    axisSpanPx: orientation === 'horizontal' ? params.bbox.width : params.bbox.height,
    score: 1,
  }
}

function component(
  label: number,
  bbox: { x: number; y: number; width: number; height: number },
): RasterRoomComponent {
  return {
    label,
    areaPx: Math.max(1, bbox.width * bbox.height),
    bbox,
    touchesBorder: false,
  }
}

function classificationMap(labels: number[]): Map<number, 'unknown'> {
  return new Map(labels.map((label) => [label, 'unknown']))
}

function parentMap(): Map<number, number> {
  return new Map()
}

/** Bidirectional adjacency from undirected edge list. */
function adjacencyFromEdges(edges: Array<[number, number]>): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>()
  const add = (a: number, b: number) => {
    const set = map.get(a) ?? new Set<number>()
    set.add(b)
    map.set(a, set)
  }
  for (const [a, b] of edges) {
    add(a, b)
    add(b, a)
  }
  return map
}

/** Test-helper: bouw pipeline-dual uit component-lijsten (zelfde shape als vroeger). */
function evidence(params: {
  hypotheses: WindowAxelHypothesis[]
  refBands: WindowAxelRefBand[]
  components: RasterRoomComponent[]
  parentMap?: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  wallInkComponents?: RasterRoomComponent[]
  wallInkParentMap?: Map<number, number>
  wallInkClassificationByLabel?: Map<number, RoomRasterClass>
  wallInkAdjacency?: Map<number, Set<number>>
  evidenceModes?: ReadonlyArray<WindowEvidenceKind>
}) {
  const parent = params.parentMap ?? parentMap()
  const white = buildFaceSpaceFromComponents({
    kind: 'opening-white',
    components: params.components,
    parentMap: parent,
    classificationByLabel: params.classificationByLabel,
  })
  // Zonder wallInkComponents: lege ink-faces (oude API); adjacency mag wél gezet zijn.
  const ink = buildFaceSpaceFromComponents({
    kind: 'wall-ink',
    components: params.wallInkComponents ?? [],
    parentMap: params.wallInkParentMap ?? parent,
    classificationByLabel: params.wallInkClassificationByLabel ?? params.classificationByLabel,
    adjacency: params.wallInkAdjacency ?? new Map(),
  })
  return filterWindowsByRefEvidence({
    hypotheses: params.hypotheses,
    refBands: params.refBands,
    dual: assembleFaceDualSpace(white, ink),
    evidenceModes: params.evidenceModes,
  })
}

describe('window-evidence-filter', () => {
  it('expands pooled min/max with 40% margin', () => {
    const range = expandSizeRange(8, 14, 14, 15, 0.4)
    expect(range.minWidth).toBeCloseTo(4.8)
    expect(range.minHeight).toBeCloseTo(8.4)
    expect(range.maxWidth).toBeCloseTo(19.6)
    expect(range.maxHeight).toBeCloseTo(21)
  })

  it('normalizes size range by axis band', () => {
    const range = expandSizeRange(8, 14, 14, 15, 0.4)
    const normalized = normalizeSizeRange(range, 12)
    expect(normalized.minWidth).toBeCloseTo(4.8 / 12)
    expect(normalized.minHeight).toBeCloseTo(8.4 / 12)
    expect(normalized.maxWidth).toBeCloseTo(19.6 / 12)
    expect(normalized.maxHeight).toBeCloseTo(21 / 12)
  })

  it('accepteert framing wanneer L/R kozijnen binnen band + size vallen', () => {
    const axisBandHeightPx = 14
    const framingRange = makeNormalizedRange(8, 14, 14, 15, axisBandHeightPx)
    const hypothesis = makeHypothesis({
      id: 'h-frame',
      faceIds: [1],
      bbox: { x: 200, y: 100, width: 120, height: 14 },
    })
    const components = [
      component(1, { x: 210, y: 102, width: 100, height: 4 }),
      component(2, { x: 190, y: 101, width: 10, height: 12 }),
      component(3, { x: 320, y: 101, width: 10, height: 12 }),
    ]
    const result = evidence({
      hypotheses: [hypothesis],
      refBands: [makeRefBand({ axisBandHeightPx, framing: framingRange })],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 3]),
    })
    expect(result.kept.map((row) => row.id)).toEqual(['h-frame'])
    expect(result.accepted[0]?.evidence).toBe('framing')
    expect(result.stats.acceptedByFraming).toBe(1)
    expect(result.stats.acceptedByStripStack).toBe(0)
    expect(result.stats.stripStackFailedBeforeFraming).toBe(0)
  })

  it('evidenceModes framing-only slaat strip_stack over (doorframe-pad)', () => {
    const axisBandHeightPx = 14
    const framingRange = makeNormalizedRange(8, 14, 14, 15, axisBandHeightPx)
    const hypothesis = makeHypothesis({
      id: 'h-doorframe',
      faceIds: [1],
      bbox: { x: 200, y: 100, width: 120, height: 14 },
    })
    const components = [
      component(1, { x: 210, y: 102, width: 100, height: 4 }),
      component(2, { x: 190, y: 101, width: 10, height: 12 }),
      component(3, { x: 320, y: 101, width: 10, height: 12 }),
    ]
    const result = evidence({
      hypotheses: [hypothesis],
      refBands: [makeRefBand({ axisBandHeightPx, framing: framingRange, fullStripCount: 3 })],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 3]),
      evidenceModes: ['framing'],
    })
    expect(result.kept.map((row) => row.id)).toEqual(['h-doorframe'])
    expect(result.accepted[0]?.evidence).toBe('framing')
    expect(result.stats.acceptedByStripStack).toBe(0)
    expect(result.stats.stripStackFailedBeforeFraming).toBe(0)
  })

  it('rejectt framing wanneer kozijn buiten framing-band valt', () => {
    const axisBandHeightPx = 13
    const framingRange = makeNormalizedRange(7, 13, 7, 13, axisBandHeightPx, 0.4)
    const hypothesis = makeHypothesis({
      id: 'h-band',
      faceIds: [1],
      bbox: { x: 200, y: 100, width: 80, height: 12 },
    })
    const components = [
      component(1, { x: 210, y: 102, width: 60, height: 4 }),
      // Te hoog t.o.v. band
      component(2, { x: 190, y: 90, width: 10, height: 30 }),
      component(3, { x: 280, y: 90, width: 10, height: 30 }),
    ]
    const result = evidence({
      hypotheses: [hypothesis],
      refBands: [makeRefBand({ axisBandHeightPx, framing: framingRange })],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 3]),
    })
    expect(result.kept).toHaveLength(0)
  })

  it('accepteert framing met lokale schaal (hyp-band ≠ ref axisBand)', () => {
    const axisBandHeightPx = 12
    const framingRange = makeNormalizedRange(8, 14, 14, 15, axisBandHeightPx)
    const hypothesis = makeHypothesis({
      id: 'h-scale',
      faceIds: [1],
      bbox: { x: 200, y: 100, width: 120, height: 28 },
    })
    const components = [
      component(1, { x: 210, y: 108, width: 100, height: 8 }),
      component(2, { x: 185, y: 104, width: 16, height: 20 }),
      component(3, { x: 318, y: 104, width: 16, height: 20 }),
    ]
    const result = evidence({
      hypotheses: [hypothesis],
      refBands: [makeRefBand({ axisBandHeightPx, framing: framingRange })],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 3]),
    })
    expect(result.kept.map((row) => row.id)).toEqual(['h-scale'])
    expect(result.stats.acceptedByFraming).toBe(1)
  })

  it('strip-stack: seed + ink-buren met REF-hoogtes → fullStripCount', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'glass-pair',
        faceIds: [1, 2],
        bbox: { x: 200, y: 100, width: 120, height: 24 },
      }),
    ]
    const components = [
      component(1, { x: 200, y: 100, width: 120, height: 8 }),
      component(2, { x: 202, y: 116, width: 118, height: 8 }),
      component(3, { x: 201, y: 108, width: 118, height: 8 }),
    ]
    const result = evidence({
      hypotheses,
      refBands: [
        makeRefBand({
          targetStripHeightPx: 8,
          fullStripCount: 3,
          fullStripHeightsPx: [8, 8, 8],
          framing: null,
          topRailHeightPx: 8,
          bottomRailHeightPx: 8,
        }),
      ],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 3]),
      wallInkComponents: components,
      wallInkParentMap: parentMap(),
      wallInkClassificationByLabel: classificationMap([1, 2, 3]),
      wallInkAdjacency: adjacencyFromEdges([
        [1, 3],
        [3, 2],
      ]),
    })
    expect(result.kept.map((row) => row.id)).toEqual(['glass-pair'])
    expect(result.accepted[0]?.evidence).toBe('strip_stack')
    expect(result.accepted[0]?.evidenceFaceIds).toEqual([1, 2, 3])
    expect(result.stats.acceptedByStripStack).toBe(1)
  })

  it('strip-stack met alleen topRail (asymmetrisch) → grow op expected heights', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'top-only',
        faceIds: [1, 2],
        bbox: { x: 200, y: 110, width: 120, height: 16 },
      }),
    ]
    const components = [
      component(1, { x: 200, y: 110, width: 120, height: 2 }),
      component(2, { x: 201, y: 118, width: 118, height: 2 }),
      component(3, { x: 200, y: 100, width: 120, height: 9 }), // top rail
    ]
    const result = evidence({
      hypotheses,
      refBands: [
        makeRefBand({
          targetStripHeightPx: 2,
          fullStripCount: 3,
          fullStripHeightsPx: [2, 2, 9],
          framing: null,
          topRailHeightPx: 9,
          bottomRailHeightPx: null,
        }),
      ],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 3]),
      wallInkComponents: components,
      wallInkParentMap: parentMap(),
      wallInkClassificationByLabel: classificationMap([1, 2, 3]),
      wallInkAdjacency: adjacencyFromEdges([
        [3, 1],
        [1, 2],
      ]),
    })
    expect(result.accepted[0]?.evidence).toBe('strip_stack')
    expect(result.accepted[0]?.evidenceFaceIds).toEqual([1, 2, 3])
    expect(result.stats.acceptedByStripStack).toBe(1)
  })

  it('strip-stack dual-space: wit-rails via ink-brug (ink telt niet als lid)', () => {
    // Stage-1 wit 10+11; rail 20 is wit; ink 99 is alleen brug tussen seed en rail.
    const hypotheses = [
      makeHypothesis({
        id: 'wit',
        faceIds: [10, 11],
        bbox: { x: 200, y: 100, width: 100, height: 20 },
      }),
    ]
    const white = [
      component(10, { x: 200, y: 100, width: 100, height: 6 }),
      component(11, { x: 200, y: 114, width: 100, height: 6 }),
      component(20, { x: 200, y: 122, width: 100, height: 8 }),
    ]
    const ink = [
      component(99, { x: 200, y: 106, width: 100, height: 2 }),
      component(98, { x: 200, y: 120, width: 100, height: 2 }),
    ]
    const result = evidence({
      hypotheses,
      refBands: [
        makeRefBand({
          targetStripHeightPx: 6,
          fullStripCount: 3,
          fullStripHeightsPx: [6, 6, 8],
          framing: null,
          topRailHeightPx: 8,
          bottomRailHeightPx: 6,
        }),
      ],
      components: white,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([10, 11, 20]),
      wallInkComponents: ink,
      wallInkParentMap: parentMap(),
      wallInkClassificationByLabel: classificationMap([99, 98]),
      wallInkAdjacency: adjacencyFromEdges([[99, 98]]),
    })
    expect(result.accepted[0]?.evidence).toBe('strip_stack')
    expect(result.accepted[0]?.evidenceFaceIds).toEqual([10, 11, 20])
  })

  it('strip-stack BFS mag non-match brug oversteken naar REF-strip', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'seed',
        faceIds: [1],
        bbox: { x: 200, y: 100, width: 80, height: 8 },
      }),
    ]
    const white = [
      component(1, { x: 200, y: 100, width: 80, height: 8 }),
      component(3, { x: 200, y: 111, width: 80, height: 8 }),
    ]
    const ink = [
      component(1, { x: 200, y: 100, width: 80, height: 8 }),
      // Brug: verkeerde dikte (geen REF-match), wel lokaal tussen seed en rail
      component(50, { x: 200, y: 108, width: 80, height: 3 }),
      component(3, { x: 200, y: 111, width: 80, height: 8 }),
    ]
    const result = evidence({
      hypotheses,
      refBands: [
        makeRefBand({
          targetStripHeightPx: 8,
          fullStripCount: 2,
          fullStripHeightsPx: [8, 8],
          framing: null,
          topRailHeightPx: 8,
          bottomRailHeightPx: 8,
        }),
      ],
      components: white,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 3]),
      wallInkComponents: ink,
      wallInkParentMap: parentMap(),
      wallInkClassificationByLabel: classificationMap([1, 50, 3]),
      wallInkAdjacency: adjacencyFromEdges([
        [1, 50],
        [50, 3],
      ]),
    })
    expect(result.accepted[0]?.evidence).toBe('strip_stack')
    expect(result.accepted[0]?.evidenceFaceIds).toEqual([1, 3])
  })

  it('strip-stack groeit beide perp-kanten (top én bottom)', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'seed',
        faceIds: [2],
        bbox: { x: 200, y: 110, width: 100, height: 8 },
      }),
    ]
    const components = [
      component(1, { x: 200, y: 100, width: 100, height: 8 }), // boven
      component(2, { x: 200, y: 110, width: 100, height: 8 }), // glas
      component(3, { x: 200, y: 120, width: 100, height: 8 }), // onder
    ]
    const result = evidence({
      hypotheses,
      refBands: [
        makeRefBand({
          targetStripHeightPx: 8,
          fullStripCount: 3,
          fullStripHeightsPx: [8, 8, 8],
          framing: null,
          topRailHeightPx: 8,
          bottomRailHeightPx: 8,
        }),
      ],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 3]),
      wallInkComponents: components,
      wallInkParentMap: parentMap(),
      wallInkClassificationByLabel: classificationMap([1, 2, 3]),
      wallInkAdjacency: adjacencyFromEdges([
        [1, 2],
        [2, 3],
      ]),
    })
    expect(result.accepted[0]?.evidence).toBe('strip_stack')
    expect(result.accepted[0]?.evidenceFaceIds).toEqual([1, 2, 3])
  })

  it('strip-stack weigert face met as-span > 1.5× seed', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'seed',
        faceIds: [1, 2],
        bbox: { x: 200, y: 100, width: 80, height: 20 },
      }),
    ]
    const components = [
      component(1, { x: 200, y: 100, width: 80, height: 8 }),
      component(2, { x: 202, y: 112, width: 78, height: 8 }),
      // Doorlopende rail ~5× langer
      component(3, { x: 50, y: 108, width: 400, height: 8 }),
    ]
    const result = evidence({
      hypotheses,
      refBands: [
        makeRefBand({
          targetStripHeightPx: 8,
          fullStripCount: 3,
          fullStripHeightsPx: [8, 8, 8],
          framing: null,
          topRailHeightPx: 8,
          bottomRailHeightPx: 8,
        }),
      ],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 3]),
      wallInkAdjacency: adjacencyFromEdges([
        [1, 3],
        [2, 3],
      ]),
    })
    expect(result.kept).toHaveLength(0)
    expect(result.stats.acceptedByStripStack).toBe(0)
  })

  it('strip-stack: 1px REF-hoogte matcht 1px-buur (±20%)', () => {
    const whiteFaces = [
      {
        root: 1,
        areaPx: 50,
        bbox: { x: 10, y: 10, width: 50, height: 1 },
        className: 'unknown' as const,
      },
      {
        root: 2,
        areaPx: 50,
        bbox: { x: 10, y: 12, width: 50, height: 1 },
        className: 'unknown' as const,
      },
    ]
    const ids = growFullStackFromSeedFaces({
      seedFaceIds: [1],
      orientation: 'horizontal',
      seedBbox: { x: 10, y: 10, width: 50, height: 1 },
      whiteFaces,
      inkFaces: [],
      wallInkAdjacency: new Map(),
      expectedHeightsPx: [1],
      maxFaceCount: 2,
    })
    expect(ids).toEqual([1, 2])
  })

  it('strip-stack weigert framing-post aan as-uiteinde (Probe-deur casus)', () => {
    // Verticaal glas-paar; T/B framing mag géén strip_stack vormen (as-midden-filter).
    const hypotheses = [
      makeHypothesis({
        id: 'probe-upper',
        faceIds: [307, 308],
        bbox: { x: 2704, y: 973, width: 9, height: 104 },
        orientation: 'vertical',
      }),
    ]
    const white = [
      component(307, { x: 2709, y: 973, width: 4, height: 104 }),
      component(308, { x: 2704, y: 974, width: 2, height: 103 }),
      // Lange dunne strip aan onder-uiteinde (aspect OK, centrum te ver van glas-midden)
      component(326, { x: 2704, y: 1055, width: 2, height: 40 }),
    ]
    const result = evidence({
      hypotheses,
      refBands: [
        makeRefBand({
          orientation: 'vertical',
          targetStripHeightPx: 2,
          fullStripCount: 3,
          fullStripHeightsPx: [2, 4, 2],
          framing: null,
          topRailHeightPx: 2,
          bottomRailHeightPx: 2,
        }),
      ],
      components: white,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([307, 308, 326]),
      wallInkComponents: white,
      wallInkParentMap: parentMap(),
      wallInkClassificationByLabel: classificationMap([307, 308, 326]),
      wallInkAdjacency: adjacencyFromEdges([
        [308, 326],
        [307, 326],
      ]),
    })
    expect(result.stats.acceptedByStripStack).toBe(0)
  })

  it('strip-stack rekruteert geen strip van andere gevel-opening (zelfde Y-band)', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'left',
        faceIds: [316, 317],
        bbox: { x: 863, y: 1002, width: 11, height: 284 },
        orientation: 'vertical',
      }),
    ]
    const white = [
      component(316, { x: 863, y: 1002, width: 4, height: 284 }),
      component(317, { x: 870, y: 1002, width: 4, height: 284 }),
      // Ver weg in X (deur/raam elders) — oude BFS pakte dit via as-overlap
      component(308, { x: 2704, y: 974, width: 2, height: 103 }),
    ]
    const ink = [...white, component(999, { x: 863, y: 1002, width: 2000, height: 284 })]
    const result = evidence({
      hypotheses,
      refBands: [
        makeRefBand({
          orientation: 'vertical',
          targetStripHeightPx: 4,
          fullStripCount: 3,
          fullStripHeightsPx: [4, 4, 2],
          framing: null,
          topRailHeightPx: 4,
          bottomRailHeightPx: 2,
        }),
      ],
      components: white,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([316, 317, 308]),
      wallInkComponents: ink,
      wallInkParentMap: parentMap(),
      wallInkClassificationByLabel: classificationMap([316, 317, 308, 999]),
      wallInkAdjacency: adjacencyFromEdges([
        [316, 999],
        [999, 308],
      ]),
    })
    expect(result.stats.acceptedByStripStack).toBe(0)
    const allEvidence = result.accepted.flatMap((row) => row.evidenceFaceIds)
    expect(allEvidence).not.toContain(308)
  })

  it('strip-stack weigert kort kozijn-post (geen strip-aspect)', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'seed',
        faceIds: [1, 2],
        bbox: { x: 200, y: 100, width: 120, height: 16 },
      }),
    ]
    const white = [
      component(1, { x: 200, y: 100, width: 120, height: 6 }),
      component(2, { x: 200, y: 110, width: 120, height: 6 }),
      component(8, { x: 190, y: 100, width: 10, height: 12 }),
      component(9, { x: 320, y: 100, width: 10, height: 12 }),
    ]
    const result = evidence({
      hypotheses,
      refBands: [
        makeRefBand({
          targetStripHeightPx: 6,
          fullStripCount: 4,
          fullStripHeightsPx: [6, 6, 12, 12],
          framing: null,
          topRailHeightPx: 6,
          bottomRailHeightPx: 6,
        }),
      ],
      components: white,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 8, 9]),
    })
    expect(result.stats.acceptedByStripStack).toBe(0)
  })

  it('rails + strip-fail → framing-fallback (zonder wallInkAdjacency)', () => {
    const axisBandHeightPx = 14
    const framingRange = makeNormalizedRange(8, 14, 14, 15, axisBandHeightPx)
    const hypothesis = makeHypothesis({
      id: 'h',
      faceIds: [1],
      bbox: { x: 200, y: 100, width: 120, height: 14 },
    })
    const components = [
      component(1, { x: 210, y: 102, width: 100, height: 4 }),
      component(2, { x: 190, y: 101, width: 10, height: 12 }),
      component(3, { x: 320, y: 101, width: 10, height: 12 }),
    ]
    const result = evidence({
      hypotheses: [hypothesis],
      refBands: [
        makeRefBand({
          axisBandHeightPx,
          framing: framingRange,
          fullStripCount: 4,
          topRailHeightPx: 8,
          bottomRailHeightPx: 8,
        }),
      ],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 3]),
    })
    expect(result.accepted[0]?.evidence).toBe('framing')
    expect(result.stats.stripStackFailedBeforeFraming).toBe(1)
  })

  it('Hal: 4 ink-faces adjacency-keten vanaf 1 seed → strip_stack', () => {
    const hypotheses = [
      makeHypothesis({ id: 'R1', faceIds: [16], bbox: { x: 795, y: 558, width: 152, height: 11 } }),
    ]
    // Strips raken elkaar (gap 0); oude test had 4–8px gaten die alleen via gevel-BFS gingen.
    const components = [
      component(16, { x: 795, y: 558, width: 152, height: 11 }),
      component(27, { x: 795, y: 569, width: 152, height: 11 }),
      component(36, { x: 795, y: 580, width: 152, height: 11 }),
      component(44, { x: 795, y: 591, width: 152, height: 11 }),
    ]
    const result = evidence({
      hypotheses,
      refBands: [
        makeRefBand({
          fullStripCount: 4,
          framing: null,
          targetStripHeightPx: 11,
          fullStripHeightsPx: [11, 11, 11, 11],
          topRailHeightPx: 11,
          bottomRailHeightPx: 11,
        }),
      ],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([16, 27, 36, 44]),
      wallInkComponents: components,
      wallInkParentMap: parentMap(),
      wallInkClassificationByLabel: classificationMap([16, 27, 36, 44]),
      wallInkAdjacency: adjacencyFromEdges([
        [16, 27],
        [27, 36],
        [36, 44],
      ]),
    })
    expect(result.kept.map((row) => row.id)).toEqual(['R1'])
    expect(result.accepted[0]?.evidence).toBe('strip_stack')
    expect(result.accepted[0]?.evidenceFaceIds).toEqual([16, 27, 36, 44])
  })

  it('checkt bij verticale kandidaat framing op top/bottom van de as', () => {
    const axisBandHeightPx = 14
    const framingRange = makeNormalizedRange(8, 14, 14, 15, axisBandHeightPx)
    const hypothesis = makeHypothesis({
      id: 'h4',
      faceIds: [40],
      bbox: { x: 400, y: 80, width: 14, height: 80 },
      orientation: 'vertical',
    })
    const components = [
      component(40, { x: 402, y: 90, width: 4, height: 60 }),
      component(41, { x: 401, y: 70, width: 12, height: 10 }),
      component(42, { x: 401, y: 160, width: 12, height: 10 }),
    ]
    const result = evidence({
      hypotheses: [hypothesis],
      refBands: [
        makeRefBand({ orientation: 'horizontal', axisBandHeightPx, framing: framingRange }),
      ],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([40, 41, 42]),
    })
    expect(result.kept.map((row) => row.id)).toEqual(['h4'])
    expect(result.stats.acceptedByFraming).toBe(1)
  })

  it('framing dual-path: inkt-band + inkt-kozijn accepteert als wit-pad faalt', () => {
    const axisBandHeightPx = 14
    const framingRange = makeNormalizedRange(8, 14, 14, 15, axisBandHeightPx)
    const hypothesis = makeHypothesis({
      id: 'dual',
      faceIds: [10],
      bbox: { x: 100, y: 100, width: 80, height: 10 },
      orientation: 'horizontal',
    })
    const whiteComponents = [
      component(10, { x: 110, y: 102, width: 60, height: 4 }),
      component(11, { x: 90, y: 96, width: 10, height: 18 }),
      component(12, { x: 180, y: 96, width: 10, height: 18 }),
    ]
    const inkComponents = [
      component(10, { x: 100, y: 98, width: 80, height: 14 }),
      component(11, { x: 90, y: 99, width: 10, height: 12 }),
      component(12, { x: 180, y: 99, width: 10, height: 12 }),
    ]
    const result = evidence({
      hypotheses: [hypothesis],
      refBands: [makeRefBand({ axisBandHeightPx, framing: framingRange })],
      components: whiteComponents,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([10, 11, 12]),
      wallInkComponents: inkComponents,
      wallInkParentMap: parentMap(),
      wallInkClassificationByLabel: classificationMap([10, 11, 12]),
    })
    expect(result.kept.map((row) => row.id)).toEqual(['dual'])
    expect(result.stats.acceptedByFraming).toBe(1)
  })

  it('laat dezelfde framing-face door meerdere hypotheses gebruiken', () => {
    const axisBandHeightPx = 14
    const framingRange = makeNormalizedRange(8, 14, 14, 15, axisBandHeightPx)
    const hypotheses = [
      makeHypothesis({
        id: 'h3-a',
        faceIds: [30],
        bbox: { x: 300, y: 300, width: 70, height: 14 },
      }),
      makeHypothesis({
        id: 'h3-b',
        faceIds: [31],
        bbox: { x: 300, y: 300, width: 70, height: 14 },
      }),
    ]
    const components = [
      component(30, { x: 315, y: 302, width: 40, height: 4 }),
      component(31, { x: 318, y: 303, width: 34, height: 3 }),
      component(32, { x: 290, y: 301, width: 10, height: 12 }),
      component(33, { x: 370, y: 301, width: 10, height: 12 }),
    ]
    const result = evidence({
      hypotheses,
      refBands: [makeRefBand({ axisBandHeightPx, framing: framingRange })],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([30, 31, 32, 33]),
    })
    expect(result.kept.map((row) => row.id).sort()).toEqual(['h3-a', 'h3-b'])
    expect(result.stats.acceptedByFraming).toBe(2)
  })

  it('rejectt wanneer framing en strip-stack beide ontbreken', () => {
    const axisBandHeightPx = 14
    const framingRange = makeNormalizedRange(8, 14, 14, 15, axisBandHeightPx)
    const hypotheses = [
      makeHypothesis({
        id: 'lonely',
        faceIds: [1],
        bbox: { x: 200, y: 100, width: 120, height: 12 },
      }),
    ]
    const components = [component(1, { x: 200, y: 100, width: 120, height: 12 })]
    const result = evidence({
      hypotheses,
      refBands: [makeRefBand({ axisBandHeightPx, fullStripCount: 4, framing: framingRange })],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1]),
    })
    expect(result.kept).toHaveLength(0)
    expect(result.stats.rejectedNoEvidence).toBe(1)
  })

  it('REF framing zonder top/bottom → framing-pad (niet strip_stack bij fullStripCount 1)', () => {
    const axisBandHeightPx = 14
    const framingRange = makeNormalizedRange(8, 14, 14, 15, axisBandHeightPx)
    const hypothesis = makeHypothesis({
      id: 'kozijn-only',
      faceIds: [1],
      bbox: { x: 200, y: 100, width: 120, height: 14 },
    })
    const components = [
      component(1, { x: 210, y: 102, width: 100, height: 4 }),
      component(2, { x: 190, y: 101, width: 10, height: 12 }),
      component(3, { x: 320, y: 101, width: 10, height: 12 }),
    ]
    const result = evidence({
      hypotheses: [hypothesis],
      refBands: [
        makeRefBand({
          axisBandHeightPx,
          framing: framingRange,
          fullStripCount: 1,
          fullStripHeightsPx: [4],
          topRailHeightPx: null,
          bottomRailHeightPx: null,
        }),
      ],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 3]),
    })
    expect(result.accepted[0]?.evidence).toBe('framing')
    expect(result.stats.acceptedByStripStack).toBe(0)
    expect(result.stats.stripStackFailedBeforeFraming).toBe(0)
  })

  it('REF zonder framing én zonder top/bottom → passthrough Stage-1 faces', () => {
    const hypothesis = makeHypothesis({
      id: 'plain',
      faceIds: [1, 2],
      bbox: { x: 200, y: 100, width: 100, height: 20 },
    })
    const components = [
      component(1, { x: 200, y: 100, width: 100, height: 8 }),
      component(2, { x: 200, y: 112, width: 100, height: 8 }),
      component(3, { x: 200, y: 124, width: 100, height: 8 }),
    ]
    const result = evidence({
      hypotheses: [hypothesis],
      refBands: [
        makeRefBand({
          fullStripCount: 1,
          fullStripHeightsPx: [8],
          framing: null,
          topRailHeightPx: null,
          bottomRailHeightPx: null,
        }),
      ],
      components,
      parentMap: parentMap(),
      classificationByLabel: classificationMap([1, 2, 3]),
      wallInkAdjacency: adjacencyFromEdges([
        [1, 2],
        [2, 3],
      ]),
    })
    expect(result.kept.map((row) => row.id)).toEqual(['plain'])
    expect(result.accepted[0]?.evidence).toBe('strip_stack')
    expect(result.accepted[0]?.evidenceFaceIds).toEqual([1, 2])
    expect(result.stats.acceptedByFraming).toBe(0)
  })
})
