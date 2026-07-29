import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import { mergeLayer2JitterSegments } from '@/cv/walls/rooms/pipeline-v3/layer-2-raw-segments'

/** BouwTek11 probe (1273,1964) — Layer 1 segments */
const BOUWTEK11_1964_L1: Segment[] = [
  { a: { x: 1274, y: 1964 }, b: { x: 1273, y: 1964 } },
  { a: { x: 1273, y: 1964 }, b: { x: 1272, y: 1963 } },
  { a: { x: 1278, y: 1965 }, b: { x: 1274, y: 1964 } },
  { a: { x: 1272, y: 1963 }, b: { x: 1268, y: 1964 } },
  { a: { x: 1272, y: 1963 }, b: { x: 1272, y: 1961 } },
  { a: { x: 1272, y: 1961 }, b: { x: 1271, y: 1959 } },
  { a: { x: 1268, y: 1964 }, b: { x: 1178, y: 1964 } },
  { a: { x: 1303, y: 1965 }, b: { x: 1278, y: 1965 } },
]

function countConnectedComponents(segments: Segment[], snapPx = 1): number {
  const parent = Array.from({ length: segments.length }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (i: number, j: number) => {
    parent[find(i)] = find(j)
  }
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const si = segments[i]
      const sj = segments[j]
      const shares = [si.a, si.b].some((p) =>
        [sj.a, sj.b].some((q) => Math.hypot(p.x - q.x, p.y - q.y) <= snapPx),
      )
      if (shares) union(i, j)
    }
  }
  return new Set(parent.map(find)).size
}

function runL2(segments: Segment[]) {
  return mergeLayer2JitterSegments({
    segments,
    distanceMap: null,
    maskWidth: 2000,
    maskHeight: 2000,
    referenceWallThicknessPx: 30,
  })
}

describe('V3 BouwTek11 probe (1273,1964) connectivity', () => {
  it('Layer 1 subgraph is één connected component', () => {
    expect(countConnectedComponents(BOUWTEK11_1964_L1)).toBe(1)
  })

  it('Layer 2 verliest connectiviteit niet', () => {
    const result = runL2(BOUWTEK11_1964_L1)
    expect(countConnectedComponents(result.segments, 0)).toBe(1)
  })
})
