import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import {
  collapseInterJunctionChains,
  thicknessCompatible,
  buildCollapseJunctionGraph,
} from '@/cv/walls/rooms/pipeline-v3/engines/collapse'
import { layer7CollapsePolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-7'
import { V3_NATIVE_THROUGH_LAYER } from '@/cv/walls/rooms/pipeline-v3/native-layers'

function collapse(
  segments: Segment[],
  thicknessBySegment?: number[],
  referenceWallThicknessPx = 30,
) {
  const thickness = thicknessBySegment ?? segments.map(() => 30)
  return collapseInterJunctionChains({
    segments,
    thicknessBySegment: thickness,
    policy: layer7CollapsePolicy,
    referenceWallThicknessPx,
  })
}

function countJunctionKinds(segments: Segment[]): Record<'I' | 'L' | 'T' | 'X', number> {
  const graph = buildCollapseJunctionGraph(segments, layer7CollapsePolicy)
  const counts: Record<'I' | 'L' | 'T' | 'X', number> = { I: 0, L: 0, T: 0, X: 0 }
  for (const node of graph.nodes) counts[node.kind] += 1
  return counts
}

function offsetSegments(segments: Segment[], dx: number, dy: number): Segment[] {
  return segments.map((segment) => ({
    ...segment,
    a: { x: segment.a.x + dx, y: segment.a.y + dy },
    b: { x: segment.b.x + dx, y: segment.b.y + dy },
  }))
}

describe('V3 L7 native gate', () => {
  it('natively completes through at least L7', () => {
    expect(V3_NATIVE_THROUGH_LAYER).toBeGreaterThanOrEqual(7)
    expect(layer7CollapsePolicy.enableStubCollapse).toBe(false)
  })
})

describe('collapseInterJunctionChains (V3)', () => {
  it('merges fake-L H-keten met exacte endpoints', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 40 }, b: { x: 100, y: 40 } },
      { a: { x: 100, y: 40 }, b: { x: 200, y: 41 } },
      { a: { x: 200, y: 41 }, b: { x: 300, y: 41 } },
    ]
    const result = collapse(segments)
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]?.a).toEqual({ x: 0, y: 40 })
    expect(result.segments[0]?.b).toEqual({ x: 300, y: 41 })
    expect(result.stats.chainsCollapsed).toBe(1)
    expect(result.stats.segmentsRemoved).toBe(2)
  })

  it('behoudt echte 90° hoek', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 100, y: 0 }, b: { x: 100, y: 80 } },
    ]
    const result = collapse(segments)
    expect(result.segments).toHaveLength(2)
    expect(result.stats.chainsCollapsed).toBe(0)
  })

  it('collapsed fake-L op T-branch-arm', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 50, y: 0 }, b: { x: 50, y: 12 } },
      { a: { x: 50, y: 12 }, b: { x: 50, y: 24 } },
    ]
    const result = collapse(segments)
    expect(result.segments).toHaveLength(2)
    const vertical = result.segments.find((seg) => seg.a.x === 50 && seg.b.x === 50)
    expect(vertical).toBeDefined()
    expect(vertical?.a).toEqual({ x: 50, y: 0 })
    expect(vertical?.b).toEqual({ x: 50, y: 24 })
    expect(result.stats.chainsCollapsed).toBe(1)
    expect(result.stats.segmentsRemoved).toBe(1)
  })

  it('behoudt T bij through-arm met twee H-stukken', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 50, y: 0 } },
      { a: { x: 50, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 50, y: 0 }, b: { x: 50, y: 40 } },
    ]
    const before = countJunctionKinds(segments)
    const result = collapse(segments)
    const after = countJunctionKinds(result.segments)
    expect(before.T).toBe(1)
    expect(after.T).toBe(1)
    expect(result.segments).toHaveLength(3)
  })

  it('collapsed fake-L tussen twee T-ankers op through-arm', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 50, y: 0 } },
      { a: { x: 50, y: 0 }, b: { x: 50, y: 20 } },
      { a: { x: 50, y: 0 }, b: { x: 60, y: 0 } },
      { a: { x: 60, y: 0 }, b: { x: 70, y: 0 } },
      { a: { x: 70, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 100, y: 0 }, b: { x: 100, y: 25 } },
      { a: { x: 100, y: 0 }, b: { x: 130, y: 0 } },
    ]
    const before = countJunctionKinds(segments)
    const result = collapse(segments)
    const after = countJunctionKinds(result.segments)
    expect(before.T).toBe(2)
    expect(after.T).toBe(2)
    expect(result.stats.chainsCollapsed).toBeGreaterThan(0)
    expect(
      result.segments.some(
        (seg) =>
          (seg.a.x === 50 && seg.a.y === 0 && seg.b.x === 100 && seg.b.y === 0) ||
          (seg.b.x === 50 && seg.b.y === 0 && seg.a.x === 100 && seg.a.y === 0),
      ),
    ).toBe(true)
  })

  it('split keten bij dikte-mismatch', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 10 }, b: { x: 40, y: 10 } },
      { a: { x: 40, y: 10 }, b: { x: 80, y: 10 } },
      { a: { x: 80, y: 10 }, b: { x: 120, y: 10 } },
    ]
    const result = collapse(segments, [30, 30, 4], 30)
    expect(result.segments.length).toBeGreaterThan(1)
    expect(result.stats.chainsCollapsed).toBe(1)
    expect(result.segments.some((seg) => seg.a.x === 0 && seg.b.x === 80)).toBe(true)
    expect(result.segments.some((seg) => seg.a.x === 80 && seg.b.x === 120)).toBe(true)
  })

  it('merge collineaire fake-L binnen max-band meetruis (ref×0.85)', () => {
    const segments: Segment[] = [
      {
        a: { x: 572.7225507703973, y: 483.0467104938556 },
        b: { x: 572.7225507703973, y: 377.49999999999994 },
      },
      {
        a: { x: 572.7225507703973, y: 377.49999999999994 },
        b: { x: 572.7225507703973, y: 317.4688309613627 },
      },
    ]
    const result = collapse(segments, [30, 10], 30)
    expect(result.segments).toHaveLength(1)
    expect(result.stats.chainsCollapsed).toBe(1)
  })

  it('merge dik-dun-dik kozijn als één keten', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 100, y: 0 }, b: { x: 110, y: 0 } },
      { a: { x: 110, y: 0 }, b: { x: 210, y: 0 } },
    ]
    const result = collapse(segments, [30, 10, 30], 30)
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]?.a).toEqual({ x: 0, y: 0 })
    expect(result.segments[0]?.b).toEqual({ x: 210, y: 0 })
    expect(result.stats.chainsCollapsed).toBe(1)
  })

  it('houdt dik-dun gescheiden zonder tweede dikke arm', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 100, y: 0 }, b: { x: 110, y: 0 } },
    ]
    const result = collapse(segments, [30, 4], 30)
    expect(result.segments).toHaveLength(2)
    expect(result.stats.chainsCollapsed).toBe(0)
  })

  it('verbindt niet bij sub-pixel endpoint-gap (exact only)', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 20 }, b: { x: 50, y: 20 } },
      { a: { x: 50.5, y: 20 }, b: { x: 100, y: 20 } },
    ]
    const result = collapse(segments)
    expect(result.segments).toHaveLength(2)
    expect(result.stats.chainsCollapsed).toBe(0)
  })

  /** BouwTek11 probe (1081,53) — horizontale keten mag niet door I-arm @ x≈1060 heen. */
  it('BouwTek11: keten-collapse stopt bij loodrechte I-arm (offset-invariant)', () => {
    const base: Segment[] = [
      { a: { x: 1523.12, y: 43.57 }, b: { x: 1138, y: 43.6 } },
      { a: { x: 1138, y: 43.59765817896812 }, b: { x: 1047, y: 44.04350494093784 } },
      { a: { x: 1047, y: 44.04350494093784 }, b: { x: 1023, y: 45.74180760247558 } },
      { a: { x: 1023, y: 45.74180760247558 }, b: { x: 790, y: 45.66 } },
      { a: { x: 1060.436766592504, y: 43.97124672662886 }, b: { x: 1060.436766592504, y: 411 } },
    ]

    ;[
      [0, 0],
      [1234, 987],
    ].forEach(([dx, dy]) => {
      const segments = offsetSegments(base, dx, dy)
      const before = countJunctionKinds(segments)
      const result = collapse(segments)
      const after = countJunctionKinds(result.segments)

      expect(before.I).toBeGreaterThanOrEqual(1)
      expect(after.I).toBeGreaterThanOrEqual(before.I)

      const hasMegaThrough = result.segments.some((seg) => {
        const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
        const minX = Math.min(seg.a.x, seg.b.x)
        const maxX = Math.max(seg.a.x, seg.b.x)
        return len > 600 && minX <= 790 + dx && maxX >= 1520 + dx
      })
      expect(hasMegaThrough).toBe(false)

      const vertical = result.segments.find(
        (seg) =>
          Math.abs(seg.a.x - (1060.44 + dx)) <= 1 &&
          Math.abs(seg.b.x - (1060.44 + dx)) <= 1 &&
          Math.max(seg.a.y, seg.b.y) > 350 + dy,
      )
      expect(vertical).toBeDefined()
    })
  })
})

describe('thicknessCompatible (V3)', () => {
  it('accepteert vergelijkbare diktes (zelfde band)', () => {
    expect(thicknessCompatible(30, 28, layer7CollapsePolicy, 30)).toBe(true)
  })

  it('weigert grote dikte-spreiding (verschillende band)', () => {
    expect(thicknessCompatible(30, 10, layer7CollapsePolicy, 30)).toBe(false)
  })

  it('valt terug op ratio zonder referentie', () => {
    expect(thicknessCompatible(30, 28, layer7CollapsePolicy)).toBe(true)
    expect(thicknessCompatible(30, 10, layer7CollapsePolicy)).toBe(false)
  })
})
