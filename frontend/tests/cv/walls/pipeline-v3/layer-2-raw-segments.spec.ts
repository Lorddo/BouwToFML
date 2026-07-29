import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import { mergeLayer2JitterSegments } from '@/cv/walls/rooms/pipeline-v3/layer-2-raw-segments'
import { resolveMergeTolerancePx } from '@/cv/walls/rooms/pipeline-v3/policies/layer-2'

function merge(segments: Segment[], referenceWallThicknessPx = 30) {
  return mergeLayer2JitterSegments({
    segments,
    distanceMap: null,
    maskWidth: 2000,
    maskHeight: 2000,
    referenceWallThicknessPx,
  })
}

describe('V3 mergeLayer2JitterSegments', () => {
  it('merges WASM-jitter keten op rechte horizontale muur', () => {
    const segments: Segment[] = [
      { a: { x: 239, y: 40 }, b: { x: 505, y: 40 } },
      { a: { x: 505, y: 40 }, b: { x: 512, y: 42 } },
      { a: { x: 512, y: 42 }, b: { x: 553, y: 42 } },
      { a: { x: 553, y: 42 }, b: { x: 560, y: 41 } },
      { a: { x: 560, y: 41 }, b: { x: 576, y: 41 } },
      { a: { x: 576, y: 41 }, b: { x: 583, y: 42 } },
      { a: { x: 583, y: 42 }, b: { x: 584, y: 42 } },
      { a: { x: 584, y: 42 }, b: { x: 591, y: 41 } },
    ]
    const result = merge(segments)
    expect(result.segments.length).toBeLessThan(segments.length)
    expect(result.mergedJunctionCount).toBeGreaterThan(0)
    const parent = Array.from({ length: result.segments.length }, (_, i) => i)
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
    const union = (i: number, j: number) => {
      parent[find(i)] = find(j)
    }
    for (let i = 0; i < result.segments.length; i += 1) {
      for (let j = i + 1; j < result.segments.length; j += 1) {
        const si = result.segments[i]!
        const sj = result.segments[j]!
        const shares = [si.a, si.b].some((p) =>
          [sj.a, sj.b].some((q) => Math.hypot(p.x - q.x, p.y - q.y) <= 1),
        )
        if (shares) union(i, j)
      }
    }
    expect(new Set(parent.map(find)).size).toBe(1)
  })

  it('behoudt 45° hoek (vert + schuin + horiz)', () => {
    const segments: Segment[] = [
      { a: { x: 1525, y: 252 }, b: { x: 1525, y: 56 } },
      { a: { x: 1525, y: 56 }, b: { x: 1513, y: 44 } },
      { a: { x: 1513, y: 44 }, b: { x: 1484, y: 44 } },
    ]
    const result = merge(segments)
    expect(result.segments.length).toBeGreaterThanOrEqual(3)
    const graph = buildJunctionGraph(result.segments, 0)
    const corner = graph.nodes.find((n) => Math.hypot(n.x - 1513, n.y - 44) <= 1)
    expect(corner?.angleDeg).toBeGreaterThanOrEqual(40)
  })

  it('behoudt 30° muur-verspringing', () => {
    const segments: Segment[] = [
      { a: { x: 1517, y: 1518 }, b: { x: 1517, y: 1391 } },
      { a: { x: 1517, y: 1518 }, b: { x: 1534, y: 1547 } },
      { a: { x: 1534, y: 1547 }, b: { x: 1534, y: 1561 } },
    ]
    const result = merge(segments)
    expect(result.segments.length).toBeGreaterThanOrEqual(3)
    const graph = buildJunctionGraph(result.segments, 0)
    const step = graph.nodes.find((n) => Math.hypot(n.x - 1517, n.y - 1518) <= 1)
    expect(step?.angleDeg).toBeGreaterThanOrEqual(25)
  })

  it('behoudt T-kruising (degree 3)', () => {
    const segments: Segment[] = [
      { a: { x: 1520, y: 1335 }, b: { x: 1520, y: 1222 } },
      { a: { x: 1559, y: 1222 }, b: { x: 1520, y: 1222 } },
      { a: { x: 1520, y: 1222 }, b: { x: 1520, y: 1208 } },
      { a: { x: 1561, y: 1225 }, b: { x: 1559, y: 1222 } },
    ]
    const result = merge(segments)
    expect(result.segments.length).toBeGreaterThanOrEqual(4)
    const graph = buildJunctionGraph(result.segments, 0)
    const tNode = graph.nodes.find((n) => Math.hypot(n.x - 1520, n.y - 1222) <= 1)
    expect(tNode?.kind).toBe('T')
  })

  it('merge niet wanneer offset boven mask-tolerantie bij dunne muur', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 40 }, b: { x: 100, y: 40 } },
      { a: { x: 100, y: 40 }, b: { x: 107, y: 44 } },
    ]
    const tolerance = resolveMergeTolerancePx(10)
    expect(tolerance).toBe(2)
    const result = merge(segments, 10)
    expect(result.segments).toHaveLength(2)
  })
})

describe('V3 resolveMergeTolerancePx', () => {
  it('schaalt 20% met clamp 2–8px', () => {
    expect(resolveMergeTolerancePx(10)).toBe(2)
    expect(resolveMergeTolerancePx(30)).toBe(6)
    expect(resolveMergeTolerancePx(50)).toBe(8)
  })
})
