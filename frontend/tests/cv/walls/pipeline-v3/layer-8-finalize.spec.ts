import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import { pruneISpurs } from '@/cv/walls/rooms/pipeline-v3/engines/prune'
import { runLayer8Finalize } from '@/cv/walls/rooms/pipeline-v3/layer-8-finalize'
import {
  layer8HvPolicy,
  layer8PrunePolicy,
  layer8WeldPolicy,
  resolveLayer8FinalizePolicy,
} from '@/cv/walls/rooms/pipeline-v3/policies/layer-8'
import { V3_NATIVE_THROUGH_LAYER } from '@/cv/walls/rooms/pipeline-v3/native-layers'
import type { PipelineV3Layer7Result } from '@/cv/walls/rooms/pipeline-v3/types'
import type { RoomWallFaceSkeleton } from '@/cv/walls/rooms/room-wall-skeleton-types'

function pruneL8(segments: Segment[], referenceWallThicknessPx: number) {
  const policy = resolveLayer8FinalizePolicy(referenceWallThicknessPx).prune
  return pruneISpurs(segments, policy)
}

function offsetSegments(segments: Segment[], dx: number, dy: number): Segment[] {
  return segments.map((segment) => ({
    ...segment,
    a: { x: segment.a.x + dx, y: segment.a.y + dy },
    b: { x: segment.b.x + dx, y: segment.b.y + dy },
  }))
}

function makeFace(segments: Segment[]): RoomWallFaceSkeleton {
  return {
    rootLabel: 1,
    bbox: { x0: 0, y0: 0, x1: 100, y1: 100 },
    areaPx: 1,
    inkCoverageRatio: 1,
    segments,
    junctions: [],
    stats: { segmentCount: segments.length, junctionCount: 0, elapsedMs: 0 },
  }
}

function makeLayer7(segments: Segment[]): PipelineV3Layer7Result {
  const face = makeFace(segments)
  return {
    facesAligned: [face],
    allSegmentsAligned: segments,
    allJunctionsAligned: [],
    totalSegmentsAligned: segments.length,
    totalJunctionsAligned: 0,
    collapseStats: {
      chainsCollapsed: 0,
      segmentsRemoved: 0,
      fakeLRemoved: 0,
      dedupedCount: 0,
      facesSkippedTopology: 0,
    },
  }
}

describe('V3 L8 native gate', () => {
  it('natively completes at least through L8', () => {
    expect(V3_NATIVE_THROUGH_LAYER).toBeGreaterThanOrEqual(8)
    expect(layer8HvPolicy.layerId).toBe(8)
    expect(layer8HvPolicy.postPositionSnapPx).toBe(0)
    expect(layer8WeldPolicy.nearEndpointGapPx).toBe(1)
    expect(layer8PrunePolicy.mode).toBe('once-ltx')
    expect(layer8PrunePolicy.terminalKinds).toEqual(['L', 'T', 'X'])
    expect(layer8PrunePolicy.protectStructuralTx).toBe(true)
  })

  it('HV policy is bare (≠ L4 seal thresholds)', () => {
    expect(layer8HvPolicy.prePositionSnapPx).toBe(2)
    expect(layer8HvPolicy.postPositionSnapPx).toBe(0)
  })
})

describe('pruneISpurs L8 once-ltx', () => {
  it('verwijdert kort I→L/T pad in één sweep (stopt bij eerste L)', () => {
    const segments: Segment[] = [
      { a: { x: 55, y: 930 }, b: { x: 55, y: 791 } },
      { a: { x: 55, y: 791 }, b: { x: 26, y: 790 } },
      { a: { x: 55, y: 791 }, b: { x: 55, y: 711 } },
      { a: { x: 26, y: 790 }, b: { x: 23, y: 792 } },
    ]
    const pruned = pruneL8(segments, 60)
    expect(pruned.pruneStats.removedPathCount).toBe(1)
    expect(pruned.pruneStats.removedSegmentCount).toBe(1)
    expect(pruned.segments).toHaveLength(3)
  })

  it('laat lang I→T pad staan', () => {
    const segments: Segment[] = [
      { a: { x: 430, y: 344 }, b: { x: 431, y: 266 } },
      { a: { x: 430, y: 344 }, b: { x: 320, y: 344 } },
      { a: { x: 430, y: 344 }, b: { x: 540, y: 344 } },
    ]
    const pruned = pruneL8(segments, 60)
    expect(pruned.pruneStats.removedSegmentCount).toBe(0)
    expect(pruned.segments).toHaveLength(3)
  })

  it('BouwTek11: verwijdert korte I→L verticale stomp, horizontale muur blijft (offset-invariant)', () => {
    const base: Segment[] = [
      { a: { x: 129.5, y: 44.572750925447686 }, b: { x: 129.5, y: 16 } },
      { a: { x: 241.91778635559288, y: 44.57275092544769 }, b: { x: 129.5, y: 44.572750925447686 } },
    ]
    ;[
      [0, 0],
      [1234, 987],
    ].forEach(([dx, dy]) => {
      const pruned = pruneL8(offsetSegments(base, dx, dy), 33)
      expect(pruned.pruneStats.removedPathCount).toBe(1)
      expect(pruned.pruneStats.removedSegmentCount).toBe(1)
      expect(pruned.segments).toHaveLength(1)
      expect(Math.abs(pruned.segments[0]!.a.y - (44.57 + dy))).toBeLessThan(0.1)
      expect(Math.abs(pruned.segments[0]!.b.y - (44.57 + dy))).toBeLessThan(0.1)
    })
  })

  it('prunet niet als I-pad geen L/T/X bereikt', () => {
    const segments: Segment[] = [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }]
    const pruned = pruneL8(segments, 60)
    expect(pruned.pruneStats.removedPathCount).toBe(0)
    expect(pruned.segments).toHaveLength(1)
    const graph = buildJunctionGraph(pruned.segments, 0)
    expect(graph.nodes.some((node) => node.kind === 'I')).toBe(true)
  })

  it('BouwTek11: behoudt T bij structurele verticale arm (offset-invariant)', () => {
    const base: Segment[] = [
      { a: { x: 1513, y: 44 }, b: { x: 1138, y: 43 } },
      { a: { x: 1138, y: 43 }, b: { x: 1047, y: 45 } },
      { a: { x: 1138, y: 65 }, b: { x: 1138, y: 43 } },
    ]
    ;[
      [0, 0],
      [1234, 987],
    ].forEach(([dx, dy]) => {
      const segments = offsetSegments(base, dx, dy)
      const anchor = { x: 1138 + dx, y: 43 + dy }
      const before = buildJunctionGraph(segments, 0)
      expect(
        before.nodes.some((node) => node.kind === 'T' && Math.hypot(node.x - anchor.x, node.y - anchor.y) < 2),
      ).toBe(true)
      const pruned = pruneL8(segments, 30)
      const after = buildJunctionGraph(pruned.segments, 0)
      expect(
        after.nodes.some((node) => node.kind === 'T' && Math.hypot(node.x - anchor.x, node.y - anchor.y) < 2),
      ).toBe(true)
      expect(pruned.pruneStats.removedPathCount).toBe(0)
    })
  })

  it('documenteert parallel L/T als L9-restje (geen I-spur, offset-invariant)', () => {
    // Through-V overlaps short branch between T@907 and L@886 — not an I-spur.
    const base: Segment[] = [
      { a: { x: 1515.26, y: 907.7 }, b: { x: 1515.26, y: 567.4 } },
      { a: { x: 1515.26, y: 907.7 }, b: { x: 1515.26, y: 886.58 } },
      { a: { x: 1515.26, y: 886.58 }, b: { x: 970.55, y: 886.58 } },
      { a: { x: 1515.26, y: 1334.07 }, b: { x: 1515.26, y: 907.7 } },
    ]
    ;[
      [0, 0],
      [1234, 987],
    ].forEach(([dx, dy]) => {
      const pruned = pruneL8(offsetSegments(base, dx, dy), 30)
      expect(pruned.pruneStats.removedPathCount).toBe(0)
      expect(pruned.segments).toHaveLength(4)
    })
  })
})

describe('runLayer8Finalize', () => {
  it('runt HV+prune op L7 face zonder mask (geen distance map)', () => {
    const segments: Segment[] = [
      { a: { x: 100, y: 0 }, b: { x: 100, y: 50 } },
      { a: { x: 100, y: 50 }, b: { x: 100, y: 40 } },
      { a: { x: 100, y: 40 }, b: { x: 40, y: 40 } },
    ]
    const result = runLayer8Finalize({
      layer7: makeLayer7(segments),
      referenceWallThicknessPx: 30,
    })
    expect(result.facesFinalized).toHaveLength(1)
    expect(result.totalSegmentsFinalized).toBeGreaterThan(0)
    expect(result.finalizeStats.removedPathCount).toBeGreaterThanOrEqual(0)
  })
})
