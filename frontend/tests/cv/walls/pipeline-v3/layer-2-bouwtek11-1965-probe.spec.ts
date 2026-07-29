import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import { mergeLayer2JitterSegments } from '@/cv/walls/rooms/pipeline-v3/layer-2-raw-segments'

/** BouwTek11 probe (1126,1965) — T @ (1132,1963) mag niet verdwijnen */
const BOUWTEK11_1965_L1: Segment[] = [
  { a: { x: 1129, y: 1964 }, b: { x: 1116, y: 1964 } },
  { a: { x: 1132, y: 1963 }, b: { x: 1129, y: 1964 } },
  { a: { x: 1134, y: 1964 }, b: { x: 1132, y: 1963 } },
  { a: { x: 1132, y: 1963 }, b: { x: 1132, y: 1946 } },
  { a: { x: 1141, y: 1964 }, b: { x: 1134, y: 1964 } },
  { a: { x: 1116, y: 1964 }, b: { x: 1116, y: 1948 } },
  { a: { x: 1116, y: 1964 }, b: { x: 1111, y: 1965 } },
  { a: { x: 1111, y: 1965 }, b: { x: 1086, y: 1965 } },
]

function offsetSegments(segments: Segment[], dx: number, dy: number): Segment[] {
  return segments.map((segment) => ({
    ...segment,
    a: { x: segment.a.x + dx, y: segment.a.y + dy },
    b: { x: segment.b.x + dx, y: segment.b.y + dy },
  }))
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

describe('V3 BouwTek11 probe (1126,1965) T-behoud', () => {
  ;[
    [0, 0],
    [1234, 987],
  ].forEach(([dx, dy]) => {
    const anchorA = { x: 1132 + dx, y: 1963 + dy }
    const anchorB = { x: 1116 + dx, y: 1964 + dy }
    const shifted = offsetSegments(BOUWTEK11_1965_L1, dx, dy)

    it(`Layer 1 heeft T op anker A (offset ${dx},${dy})`, () => {
      const graph = buildJunctionGraph(shifted, 0)
      const t = graph.nodes.find((n) => Math.hypot(n.x - anchorA.x, n.y - anchorA.y) <= 1)
      expect(t?.kind).toBe('T')
    })

    it(`Layer 2 behoudt T op anker A (offset ${dx},${dy})`, () => {
      const result = runL2(shifted)
      const graph = buildJunctionGraph(result.segments, 0)
      const t = graph.nodes.find((n) => Math.hypot(n.x - anchorA.x, n.y - anchorA.y) <= 1)
      expect(t?.kind).toBe('T')

      const touchesJunction = result.segments.some(
        (s) =>
          (Math.hypot(s.a.x - anchorA.x, s.a.y - anchorA.y) <= 1
            || Math.hypot(s.b.x - anchorA.x, s.b.y - anchorA.y) <= 1)
          && Math.abs(s.a.y - s.b.y) <= 2,
      )
      expect(touchesJunction).toBe(true)
    })

    it(`Layer 2 behoudt T op anker B (offset ${dx},${dy})`, () => {
      const result = runL2(shifted)
      const graph = buildJunctionGraph(result.segments, 0)
      const t = graph.nodes.find((n) => Math.hypot(n.x - anchorB.x, n.y - anchorB.y) <= 1)
      expect(t?.kind).toBe('T')
    })
  })
})
