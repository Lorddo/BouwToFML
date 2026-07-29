import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import {
  buildPruneJunctionGraph,
  pruneISpurs,
  tracePathFromIToFirstTx,
} from '@/cv/walls/rooms/pipeline-v3/engines/prune'
import { resolveLayer3PrunePolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-3'
import {
  V3_NATIVE_THROUGH_LAYER,
  listIncompleteLayers,
} from '@/cv/walls/rooms/pipeline-v3/native-layers'

const policyAt = (referenceWallThicknessPx: number) =>
  resolveLayer3PrunePolicy(referenceWallThicknessPx)

function offsetSegments(segments: Segment[], dx: number, dy: number): Segment[] {
  return segments.map((segment) => ({
    ...segment,
    a: { x: segment.a.x + dx, y: segment.a.y + dy },
    b: { x: segment.b.x + dx, y: segment.b.y + dy },
  }))
}

describe('V3 native L3 gate', () => {
  it('natively completes at least through L3', () => {
    expect(V3_NATIVE_THROUGH_LAYER).toBeGreaterThanOrEqual(3)
    expect(listIncompleteLayers()).not.toContain(3)
  })
})

describe('tracePathFromIToFirstTx', () => {
  it('meet vanaf I tot eerste T en telt L-segmenten mee', () => {
    const segments: Segment[] = [
      { a: { x: 55, y: 930 }, b: { x: 55, y: 791 } },
      { a: { x: 55, y: 791 }, b: { x: 26, y: 790 } },
      { a: { x: 55, y: 791 }, b: { x: 55, y: 711 } },
      { a: { x: 26, y: 790 }, b: { x: 23, y: 792 } },
    ]

    const trace = tracePathFromIToFirstTx({
      segments,
      iPoint: { x: 23, y: 792 },
      policy: policyAt(60),
    })

    expect(trace.reachedTx).toBe(true)
    expect(trace.pathSegments).toHaveLength(2)
    expect(Math.round(trace.pathLengthPx)).toBe(33)
  })

  it('geeft reachedTx=false als pad geen T/X bereikt', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { a: { x: 10, y: 0 }, b: { x: 20, y: 0 } },
    ]
    const trace = tracePathFromIToFirstTx({
      segments,
      iPoint: { x: 0, y: 0 },
      policy: policyAt(60),
    })
    expect(trace.reachedTx).toBe(false)
    expect(trace.pathSegments).toHaveLength(2)
  })
})

describe('pruneISpurs', () => {
  it('verwijdert volledige korte I-spur-pad', () => {
    const segments: Segment[] = [
      { a: { x: 55, y: 930 }, b: { x: 55, y: 791 } },
      { a: { x: 55, y: 791 }, b: { x: 26, y: 790 } },
      { a: { x: 55, y: 791 }, b: { x: 55, y: 711 } },
      { a: { x: 26, y: 790 }, b: { x: 23, y: 792 } },
    ]
    const pruned = pruneISpurs(segments, policyAt(60))

    expect(pruned.pruneStats.removedPathCount).toBe(1)
    expect(pruned.pruneStats.removedSegmentCount).toBe(2)
    expect(pruned.segments).toHaveLength(2)
  })

  it('behoudt I-pad dat langer is dan referenceWallThickness', () => {
    const segments: Segment[] = [
      { a: { x: 430, y: 344 }, b: { x: 431, y: 266 } },
      { a: { x: 430, y: 344 }, b: { x: 320, y: 344 } },
      { a: { x: 430, y: 344 }, b: { x: 540, y: 344 } },
    ]
    const pruned = pruneISpurs(segments, policyAt(60))

    expect(pruned.pruneStats.removedPathCount).toBe(0)
    expect(pruned.pruneStats.removedSegmentCount).toBe(0)
    expect(pruned.segments).toHaveLength(3)
  })

  it('werkt iteratief en verwijdert meerdere korte I-paden kortste-eerst', () => {
    const segments: Segment[] = [
      { a: { x: -40, y: 0 }, b: { x: 0, y: 0 } },
      { a: { x: 0, y: 0 }, b: { x: 40, y: 0 } },
      { a: { x: 0, y: 0 }, b: { x: 0, y: 10 } },
      { a: { x: 0, y: 0 }, b: { x: 0, y: -15 } },
    ]
    const pruned = pruneISpurs(segments, policyAt(60))

    expect(pruned.pruneStats.removedPathCount).toBe(2)
    expect(pruned.pruneStats.removedSegmentCount).toBe(2)
    expect(pruned.segments).toHaveLength(2)
  })

  it('prunet niet als een I-pad geen T/X bereikt', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { a: { x: 10, y: 0 }, b: { x: 20, y: 0 } },
    ]
    const pruned = pruneISpurs(segments, policyAt(60))
    expect(pruned.pruneStats.removedPathCount).toBe(0)
    expect(pruned.segments).toHaveLength(2)
  })

  it('BouwTek11 probe (230,248): verwijdert korte horizontale I-stomp naar T (offset-invariant)', () => {
    const base: Segment[] = [
      { a: { x: 243, y: 247 }, b: { x: 221, y: 247 } },
      { a: { x: 242, y: 287 }, b: { x: 243, y: 247 } },
      { a: { x: 243, y: 247 }, b: { x: 242, y: 180 } },
    ]
    ;[
      [0, 0],
      [1234, 987],
    ].forEach(([dx, dy]) => {
      const shifted = offsetSegments(base, dx, dy)
      const anchor = { x: 221 + dx, y: 247 + dy }
      const pruned = pruneISpurs(shifted, policyAt(33))
      expect(pruned.pruneStats.removedPathCount).toBeGreaterThanOrEqual(1)
      expect(
        pruned.segments.some(
          (seg) =>
            Math.hypot(seg.a.x - anchor.x, seg.a.y - anchor.y) < 2 ||
            Math.hypot(seg.b.x - anchor.x, seg.b.y - anchor.y) < 2,
        ),
      ).toBe(false)
    })
  })

  it('geeft na prune geen degree-0 I-junctions in junction-graaf', () => {
    const segments: Segment[] = [
      { a: { x: 55, y: 930 }, b: { x: 55, y: 791 } },
      { a: { x: 55, y: 791 }, b: { x: 26, y: 790 } },
      { a: { x: 55, y: 791 }, b: { x: 55, y: 711 } },
      { a: { x: 26, y: 790 }, b: { x: 23, y: 792 } },
    ]
    const policy = policyAt(60)
    const pruned = pruneISpurs(segments, policy)
    const graph = buildPruneJunctionGraph(pruned.segments, policy)
    const iNodes = graph.nodes.filter((node) => node.kind === 'I')
    expect(iNodes).toHaveLength(2)
    expect(
      iNodes.every(
        (node) => graph.edges.filter((e) => e.a === node.id || e.b === node.id).length === 1,
      ),
    ).toBe(true)
  })
})
