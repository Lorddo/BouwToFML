import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import {
  absorbMicroCornerJogs,
  capOffsetTolerancePx,
  collapseOrthoStairStubs,
  parallelCoverAbsorb,
  straightenCollinearAxisChains,
} from '@/cv/walls/rooms/pipeline-v3/engines/collapse'
import {
  layer9CollapsePolicy,
  resolveLayer9DissolvePolicy,
} from '@/cv/walls/rooms/pipeline-v3/policies/layer-9'
import {
  layer10CollapsePolicy,
  resolveLayer10FmlPolicy,
} from '@/cv/walls/rooms/pipeline-v3/policies/layer-10'
import {
  V3_NATIVE_THROUGH_LAYER,
  V3_PIPELINE_LAST_LAYER,
  isV3FmlReady,
  listIncompleteLayers,
} from '@/cv/walls/rooms/pipeline-v3/native-layers'
import {
  resolveFmlSourceLayer,
  hasFmlSemanticSource,
} from '@/cv/walls/rooms/build-semantic-walls-source'
import type { ExtractionOutput, PipelineV3Debug } from '@/core/extraction/types'

/** BouwTek11 L8-state ~(1514,892): short-V on through-V + H west @886. */
const BOUWTEK11_PARALLEL_L8: Segment[] = [
  // through-V north
  {
    a: { x: 1515.2593541390515, y: 907.6953047376124 },
    b: { x: 1515.2593541390515, y: 567.4006785403706 },
  },
  // short-V (redundant cover)
  {
    a: { x: 1515.2593541390515, y: 907.6953047376124 },
    b: { x: 1515.2593541390515, y: 886.5840005392155 },
  },
  // H west @ L886
  {
    a: { x: 1515.2593541390515, y: 886.5840005392155 },
    b: { x: 970.553840378512, y: 886.5840005392155 },
  },
  // through-V south
  {
    a: { x: 1515.2593541390518, y: 1334.0680002436966 },
    b: { x: 1515.2593541390515, y: 907.6953047376124 },
  },
]

/** V—(korte H)—V—(korte H)—V chamfer stair. */
const PROBE_CHAMFER_VHV: Segment[] = [
  { a: { x: 572, y: 483 }, b: { x: 572, y: 450 } },
  { a: { x: 572, y: 450 }, b: { x: 573, y: 450 } },
  { a: { x: 573, y: 450 }, b: { x: 573, y: 396 } },
  { a: { x: 573, y: 396 }, b: { x: 572, y: 396 } },
  { a: { x: 572, y: 396 }, b: { x: 572, y: 319 } },
]

/** 2D_3E ~(1354,1229): hard L + 5px H-jog + collinear H (fake 0° L). */
const PROBE_2D3E_MICRO_CORNER: Segment[] = [
  {
    a: { x: 1353.9463520275667, y: 1044.0492764016738 },
    b: { x: 1353.946352027567, y: 1229.7002808483203 },
  },
  {
    a: { x: 1353.946352027567, y: 1229.7002808483203 },
    b: { x: 1349, y: 1229.7002808483205 },
  },
  {
    a: { x: 1349, y: 1229.7002808483205 },
    b: { x: 1132.25, y: 1229.7002808483205 },
  },
]

function offsetSegments(segments: Segment[], dx: number, dy: number): Segment[] {
  return segments.map((segment) => ({
    ...segment,
    a: { x: segment.a.x + dx, y: segment.a.y + dy },
    b: { x: segment.b.x + dx, y: segment.b.y + dy },
  }))
}

describe('V3 L9/L10 dissolve → FML', () => {
  it('natively completes through L10 (fmlReady)', () => {
    expect(V3_PIPELINE_LAST_LAYER).toBe(10)
    expect(V3_NATIVE_THROUGH_LAYER).toBe(10)
    expect(listIncompleteLayers()).toEqual([])
    expect(isV3FmlReady()).toBe(true)
  })

  it('keeps stub/cover only on L9; axis-straighten + micro-corner only on L10', () => {
    expect(layer9CollapsePolicy.enableStubCollapse).toBe(true)
    expect(layer9CollapsePolicy.enableParallelCover).toBe(true)
    expect(layer9CollapsePolicy.enableMicroCornerAbsorb).toBe(false)
    expect(layer9CollapsePolicy.enableChainAxisStraighten).toBe(false)
    expect(layer10CollapsePolicy.enableStubCollapse).toBe(false)
    expect(layer10CollapsePolicy.enableParallelCover).toBe(false)
    expect(layer10CollapsePolicy.enableMicroCornerAbsorb).toBe(true)
    expect(layer10CollapsePolicy.enableChainAxisStraighten).toBe(true)
    expect(layer10CollapsePolicy.chainAxisMaxSpreadPx).toBe(5)
  })

  it('stair-stub: V—H—V—H—V → één segment', () => {
    const result = collapseOrthoStairStubs(PROBE_CHAMFER_VHV, layer9CollapsePolicy)
    expect(result.segments).toHaveLength(1)
    expect(result.stats.chainsCollapsed).toBe(1)
    const seg = result.segments[0]
    expect(Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)).toBeGreaterThan(150)
  })

  it('capOffsetTolerancePx: mid-boundary caps max-ref inflation', () => {
    expect(capOffsetTolerancePx(24)).toBe(24)
    expect(capOffsetTolerancePx(24, { midBoundaryPx: 40, maxBoundaryPx: 70 })).toBe(11)
    expect(capOffsetTolerancePx(8, { midBoundaryPx: 40, maxBoundaryPx: 70 })).toBe(8)
  })

  it('L9 policy: orthoStubTierMaxPx mid-capped when bandBoundariesPx set', () => {
    const uncapped = resolveLayer9DissolvePolicy(90).collapse.orthoStubTierMaxPx
    const capped = resolveLayer9DissolvePolicy(90, {
      midBoundaryPx: 40,
      maxBoundaryPx: 70,
    }).collapse.orthoStubTierMaxPx
    expect(uncapped).toBeGreaterThan(capped)
    expect(capped).toBe(11)
  })

  it('stair-stub: cross-band arms → preserve jog (noop)', () => {
    // Small offset within tier, but max vs min band → must not diagonalize.
    const jog: Segment[] = [
      { a: { x: 100, y: 0 }, b: { x: 100, y: 100 } },
      { a: { x: 100, y: 100 }, b: { x: 105, y: 100 } },
      { a: { x: 105, y: 100 }, b: { x: 105, y: 200 } },
    ]
    const policy = resolveLayer9DissolvePolicy(90, {
      midBoundaryPx: 40,
      maxBoundaryPx: 70,
    }).collapse
    const result = collapseOrthoStairStubs(jog, policy, [80, 50, 25], 90)
    expect(result.stats.chainsCollapsed).toBe(0)
    expect(result.segments).toHaveLength(3)
  })

  it('stair-stub: same-band micro offset still collapses', () => {
    const jog: Segment[] = [
      { a: { x: 100, y: 0 }, b: { x: 100, y: 100 } },
      { a: { x: 100, y: 100 }, b: { x: 105, y: 100 } },
      { a: { x: 105, y: 100 }, b: { x: 105, y: 200 } },
    ]
    const policy = resolveLayer9DissolvePolicy(90, {
      midBoundaryPx: 40,
      maxBoundaryPx: 70,
    }).collapse
    const result = collapseOrthoStairStubs(jog, policy, [80, 78, 82], 90)
    expect(result.stats.chainsCollapsed).toBe(1)
    expect(result.segments).toHaveLength(1)
  })

  it('stair-stub: large parallel offset above mid-capped tier → preserve', () => {
    // Linker-gevel-achtig: ~23px CL-offset; mid-cap @40 → tier 11.
    const jog: Segment[] = [
      { a: { x: 246, y: 2343 }, b: { x: 246, y: 2082 } },
      { a: { x: 246, y: 2082 }, b: { x: 269, y: 2082 } },
      { a: { x: 269, y: 2082 }, b: { x: 269, y: 1800 } },
    ]
    const policy = resolveLayer9DissolvePolicy(90, {
      midBoundaryPx: 40,
      maxBoundaryPx: 70,
    }).collapse
    expect(policy.orthoStubTierMaxPx).toBeLessThan(23)
    const result = collapseOrthoStairStubs(jog, policy)
    expect(result.stats.chainsCollapsed).toBe(0)
    expect(result.segments).toHaveLength(3)
  })

  it('BouwTek11: parallel-cover verwijdert short-V; H wordt T op through (offset-invariant)', () => {
    ;[
      [0, 0],
      [1234, 987],
    ].forEach(([dx, dy]) => {
      const shifted = offsetSegments(BOUWTEK11_PARALLEL_L8, dx, dy)
      const covered = parallelCoverAbsorb(shifted, layer9CollapsePolicy)
      expect(covered.stats.coveredCount).toBeGreaterThanOrEqual(1)
      expect(covered.segments.length).toBeLessThan(shifted.length + 2)

      // After absorb: at most one V piece in the former short-span band (through split),
      // never the original overlapping duplicate pair.
      const bandVs = covered.segments.filter((seg) => {
        const isV = Math.abs(seg.a.x - seg.b.x) < 1 && Math.abs(seg.a.y - seg.b.y) > 5
        if (!isV) return false
        const lo = Math.min(seg.a.y, seg.b.y)
        const hi = Math.max(seg.a.y, seg.b.y)
        return lo < 910 + dy && hi > 880 + dy && hi - lo < 40
      })
      expect(bandVs.length).toBeLessThanOrEqual(1)

      const graph = buildJunctionGraph(covered.segments, 1)
      const tAt886 = graph.nodes.some(
        (n) =>
          n.kind === 'T' && Math.abs(n.x - (1515.26 + dx)) < 1 && Math.abs(n.y - (886.58 + dy)) < 1,
      )
      expect(tAt886).toBe(true)

      const hRemains = covered.segments.some(
        (seg) =>
          Math.abs(seg.a.y - (886.58 + dy)) < 1 &&
          Math.abs(seg.b.y - (886.58 + dy)) < 1 &&
          Math.abs(seg.a.x - seg.b.x) > 100,
      )
      expect(hRemains).toBe(true)
    })
  })

  it('parallel-cover pakt ook near-parallel offset <=5px (zonder double-wall offset 8px te forceren)', () => {
    const nearParallel: Segment[] = [
      { a: { x: 100, y: 0 }, b: { x: 100, y: 200 } },
      { a: { x: 104, y: 80 }, b: { x: 104, y: 140 } },
      { a: { x: 60, y: 80 }, b: { x: 104, y: 80 } },
    ]
    const covered = parallelCoverAbsorb(nearParallel, layer9CollapsePolicy)
    expect(covered.stats.coveredCount).toBeGreaterThanOrEqual(1)

    const nearParallelResidual = covered.segments.filter((seg) => {
      const isV = Math.abs(seg.a.x - seg.b.x) < 1 && Math.abs(seg.a.y - seg.b.y) > 10
      if (!isV) return false
      const xMid = (seg.a.x + seg.b.x) / 2
      return Math.abs(xMid - 104) < 1
    })
    expect(nearParallelResidual).toHaveLength(0)
  })

  it('2D_3E: L10 micro-corner → één schone 90° L, geen 0° junk (offset-invariant)', () => {
    ;[
      [0, 0],
      [1234, 987],
    ].forEach(([dx, dy]) => {
      const result = absorbMicroCornerJogs(
        offsetSegments(PROBE_2D3E_MICRO_CORNER, dx, dy),
        layer10CollapsePolicy,
      )
      expect(result.stats.cornersAbsorbed).toBe(1)
      expect(result.segments).toHaveLength(2)

      const graph = buildJunctionGraph(result.segments, 0)
      const near = graph.nodes.filter((n) => Math.hypot(n.x - (1354 + dx), n.y - (1230 + dy)) < 8)
      expect(near).toHaveLength(1)
      expect(near[0].kind).toBe('L')
      expect(Math.abs(near[0].angleDeg - 90)).toBeLessThan(5)

      // Geen restje 0°-L rond het fake-jog punt.
      const junk = graph.nodes.filter(
        (n) => Math.abs(n.x - (1349 + dx)) < 1 && Math.abs(n.y - (1230 + dy)) < 2,
      )
      expect(junk).toHaveLength(0)
    })
  })

  it('L10 axis-straighten: 3 H via L/T met ≤2px drift → één y; 0px mee dan drop', () => {
    // Long H — 0px — licht scheve H — H met drift, plus V-tak op de T.
    const chain: Segment[] = [
      { a: { x: 0, y: 100.0 }, b: { x: 100, y: 100.0 } },
      { a: { x: 100, y: 100.0 }, b: { x: 100, y: 100.0 } }, // 0px
      { a: { x: 100, y: 100.0 }, b: { x: 140, y: 100.4 } },
      { a: { x: 140, y: 100.4 }, b: { x: 240, y: 100.8 } },
      { a: { x: 100, y: 100.0 }, b: { x: 100, y: 160 } },
    ]

    const result = straightenCollinearAxisChains(chain, layer10CollapsePolicy)
    expect(result.stats.chainsStraightened).toBeGreaterThanOrEqual(1)
    expect(result.stats.zeroStubsDropped).toBeGreaterThanOrEqual(1)

    const hs = result.segments.filter(
      (seg) => Math.abs(seg.a.y - seg.b.y) < 1e-6 && Math.abs(seg.a.x - seg.b.x) > 1,
    )
    expect(hs.length).toBeGreaterThanOrEqual(2)
    const ys = hs.map((seg) => seg.a.y)
    const spread = Math.max(...ys) - Math.min(...ys)
    expect(spread).toBeLessThan(1e-6)

    // V-tak blijft verticaal op x=100, junction-y = consensus.
    const v = result.segments.find(
      (seg) => Math.abs(seg.a.x - seg.b.x) < 1e-6 && Math.abs(seg.a.y - seg.b.y) > 10,
    )
    expect(v).toBeTruthy()
    expect(v!.a.x).toBe(100)
    expect(v!.a.y).toBe(ys[0])

    // Input-0px is weg na polish (geen FML-rommel).
    const zero = result.segments.find(
      (seg) => Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) < 1e-9,
    )
    expect(zero).toBeUndefined()
  })

  it('L10 axis-straighten: BouwTek11 V—H5—V jog (~4.5px) → één as, stub weg (offset-invariant)', () => {
    // L9-state ~(970,655): V@970.55 — 5px H — V@975.10 (+ through-V noord).
    const jog: Segment[] = [
      {
        a: { x: 970.553840378512, y: 886.5840005392155 },
        b: { x: 970.553840378512, y: 709.8119442366 },
      },
      {
        a: { x: 970.553840378512, y: 709.8119442366 },
        b: { x: 975.1012324605566, y: 709.8119442366 },
      },
      {
        a: { x: 975.1012324605566, y: 709.8119442366 },
        b: { x: 975.1012324605568, y: 567.4006785403706 },
      },
      {
        a: { x: 975.1012324605568, y: 567.4006785403706 },
        b: { x: 975.1012324605567, y: 414.0329545659554 },
      },
      // H west op de T
      {
        a: { x: 970.553840378512, y: 709.8119442366 },
        b: { x: 785.2115980695758, y: 709.8119442366 },
      },
      // H oost @567
      {
        a: { x: 1515.2593541390515, y: 567.4006785403706 },
        b: { x: 975.1012324605568, y: 567.4006785403706 },
      },
      // H @414
      { a: { x: 975.1012324605567, y: 414.0329545659554 }, b: { x: 648, y: 414.0329545659554 } },
      // H @886
      {
        a: { x: 1515.2593541390515, y: 886.5840005392155 },
        b: { x: 970.553840378512, y: 886.5840005392155 },
      },
    ]

    ;[
      [0, 0],
      [1234, 987],
    ].forEach(([dx, dy]) => {
      const result = straightenCollinearAxisChains(
        offsetSegments(jog, dx, dy),
        layer10CollapsePolicy,
      )
      expect(result.stats.chainsStraightened).toBeGreaterThanOrEqual(1)
      expect(result.stats.zeroStubsDropped).toBeGreaterThanOrEqual(1)

      const vs = result.segments.filter(
        (seg) => Math.abs(seg.a.x - seg.b.x) < 1e-6 && Math.abs(seg.a.y - seg.b.y) > 10,
      )
      expect(vs.length).toBeGreaterThanOrEqual(2)
      const xs = vs.map((seg) => seg.a.x)
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6)

      // Geen rest-H-brug van ~5px meer tussen de V-assen.
      const shortBridge = result.segments.filter((seg) => {
        const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
        return len > 0.5 && len < 8 && Math.abs(seg.a.y - seg.b.y) < 1e-6
      })
      expect(shortBridge).toHaveLength(0)

      const graph = buildJunctionGraph(result.segments, 0)
      const near710 = graph.nodes.filter(
        (n) => Math.abs(n.y - (709.81 + dy)) < 1 && Math.abs(n.x - xs[0]) < 1,
      )
      expect(near710.some((n) => n.kind === 'T')).toBe(true)
    })
  })

  it('L10 axis-straighten: grote offset (≥6px) via bridge niet mergen', () => {
    const jog: Segment[] = [
      { a: { x: 970, y: 886 }, b: { x: 970, y: 710 } },
      { a: { x: 970, y: 710 }, b: { x: 978, y: 710 } }, // 8px bridge, 8px offset
      { a: { x: 978, y: 710 }, b: { x: 978, y: 567 } },
    ]
    const result = straightenCollinearAxisChains(jog, layer10CollapsePolicy)
    const vs = result.segments.filter(
      (seg) => Math.abs(seg.a.x - seg.b.x) < 1e-6 && Math.abs(seg.a.y - seg.b.y) > 10,
    )
    expect(vs).toHaveLength(2)
    const xs = vs.map((seg) => seg.a.x).sort((a, b) => a - b)
    expect(xs[1] - xs[0]).toBeGreaterThan(5)
  })

  it('L10 axis-straighten: cross-band jog → geen shared axis (ook bij grote spread)', () => {
    // Linker-gevel-achtig: ~23px offset binnen geschaalde spread @ ref 160, maar max vs mid band.
    const jog: Segment[] = [
      { a: { x: 246, y: 2343 }, b: { x: 246, y: 2082 } },
      { a: { x: 246, y: 2082 }, b: { x: 269, y: 2082 } },
      { a: { x: 269, y: 2082 }, b: { x: 269, y: 1800 } },
    ]
    const policy = resolveLayer10FmlPolicy(160, {
      midBoundaryPx: 40,
      maxBoundaryPx: 70,
    }).collapse
    expect(policy.chainAxisMaxSpreadPx).toBeGreaterThanOrEqual(23)

    const crossBand = straightenCollinearAxisChains(jog, policy, [80, 50, 25], 160)
    const xsCross = [
      ...new Set(
        crossBand.segments
          .filter((seg) => Math.abs(seg.a.x - seg.b.x) < 1e-6 && Math.abs(seg.a.y - seg.b.y) > 10)
          .map((seg) => Math.round(seg.a.x)),
      ),
    ].sort((a, b) => a - b)
    expect(xsCross).toEqual([246, 269])
    expect(crossBand.stats.zeroStubsDropped).toBe(0)

    const sameBand = straightenCollinearAxisChains(jog, policy, [80, 78, 82], 160)
    const xsSame = [
      ...new Set(
        sameBand.segments
          .filter((seg) => Math.abs(seg.a.x - seg.b.x) < 1e-6 && Math.abs(seg.a.y - seg.b.y) > 10)
          .map((seg) => Math.round(seg.a.x)),
      ),
    ]
    expect(xsSame).toHaveLength(1)
    expect(sameBand.stats.zeroStubsDropped).toBeGreaterThanOrEqual(1)
  })

  it('FML reads L10 only when fmlReady', () => {
    const incomplete: PipelineV3Debug = {
      pipelineVersion: 'v3',
      layers: {
        layer8: {
          segments: [{ type: 'wall', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
          junctions: [],
        },
        layer9: {
          segments: [{ type: 'wall', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
          junctions: [],
        },
      },
      summary: {
        incompleteLayers: [10],
        completedThroughLayer: 9,
        fmlReady: false,
        bridgeMode: 'native',
      },
    }
    const complete: PipelineV3Debug = {
      pipelineVersion: 'v3',
      layers: {
        layer9: {
          segments: [{ type: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, confidence: 1 }],
          junctions: [],
        },
        layer10: {
          segments: [{ type: 'wall', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, confidence: 1 }],
          junctions: [],
        },
      },
      summary: {
        incompleteLayers: [],
        completedThroughLayer: 10,
        fmlReady: true,
        bridgeMode: 'native',
      },
    }

    expect(
      resolveFmlSourceLayer({
        pipelineV3Debug: incomplete,
        meta: { extractorId: 'geometry-lbe', elapsedMs: 1, wallPipelineVersion: 'v3' },
      } as ExtractionOutput),
    ).toBeUndefined()

    const source = resolveFmlSourceLayer({
      pipelineV3Debug: complete,
      meta: { extractorId: 'geometry-lbe', elapsedMs: 1, wallPipelineVersion: 'v3' },
    } as ExtractionOutput)
    expect(source?.segments).toHaveLength(1)
    expect(source?.segments[0]?.b.x).toBe(10)
    expect(
      hasFmlSemanticSource({
        pipelineV3Debug: complete,
        meta: { extractorId: 'geometry-lbe', elapsedMs: 1, wallPipelineVersion: 'v3' },
      } as ExtractionOutput),
    ).toBe(true)
  })
})
