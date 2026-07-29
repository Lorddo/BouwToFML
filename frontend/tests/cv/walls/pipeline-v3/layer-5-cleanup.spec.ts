import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import { runLayer5Cleanup } from '@/cv/walls/rooms/pipeline-v3/layer-5-cleanup'
import { repairDanglingConnections, weldNearConnectedEndpoints } from '@/cv/walls/rooms/pipeline-v3/engines/weld'
import { unifyNearEndpoints } from '@/cv/walls/rooms/pipeline-v3/engines/segment-ops'
import {
  cleanupTxMicroSegments,
  cleanupLlStairs,
} from '@/cv/walls/rooms/pipeline-v3/engines/cleanup'
import { resolveLayer5CleanupPolicy, layer5WeldPolicy, layer5TopologyPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-5'
import {
  V3_NATIVE_THROUGH_LAYER,
  listIncompleteLayers,
} from '@/cv/walls/rooms/pipeline-v3/native-layers'
import type { PipelineV3Layer4Result } from '@/cv/walls/rooms/pipeline-v3/types'
import type { RoomWallJunction } from '@/cv/walls/rooms/room-wall-skeleton-types'

function toJunctions(segments: Segment[], rootLabel = 1): RoomWallJunction[] {
  const graph = buildJunctionGraph(segments, 0)
  return graph.nodes.map((node) => ({
    rootLabel,
    x: node.x,
    y: node.y,
    kind: node.kind,
    angleDeg: node.angleDeg,
  }))
}

function makeLayer4(segments: Segment[], rootLabel = 1): PipelineV3Layer4Result {
  const cloned = segments.map((seg) => ({
    ...seg,
    a: { ...seg.a },
    b: { ...seg.b },
  }))
  const junctions = toJunctions(cloned, rootLabel)
  const face = {
    rootLabel,
    bbox: { x: 0, y: 0, width: 3000, height: 3000 },
    areaPx: 1,
    inkCoverageRatio: 1,
    segments: cloned,
    junctions,
    stats: {
      segmentCount: cloned.length,
      junctionCount: junctions.length,
      elapsedMs: 0,
    },
  }
  return {
    facesPositioned: [face],
    allSegmentsPositioned: cloned,
    allJunctionsPositioned: junctions,
    totalSegmentsPositioned: cloned.length,
    totalJunctionsPositioned: junctions.length,
    positionStats: { movedSegmentCount: 0, movedJunctionCount: 0 },
    invariantReport: {
      ok: true,
      errors: [],
      junctionKindCountsBefore: { I: 0, L: 0, T: 0, X: 0 },
      junctionKindCountsAfter: { I: 0, L: 0, T: 0, X: 0 },
    },
  }
}

describe('V3 native L5 gate', () => {
  it('natively completes through L6 (L5 included)', () => {
    expect(V3_NATIVE_THROUGH_LAYER).toBeGreaterThanOrEqual(5)
    expect(listIncompleteLayers().every((n) => n > V3_NATIVE_THROUGH_LAYER)).toBe(true)
  })

  it('Copy6 policy: no I-check, dangling repair on, no cluster weld', () => {
    expect(layer5TopologyPolicy.enforceINodeCheck).toBe(false)
    expect(layer5WeldPolicy.repairMaxGapPx).toBe(4)
    expect(layer5WeldPolicy.nearEndpointGapPx).toBe(0.8)
  })
})

describe('V3 L5 Copy6 dangling + near weld', () => {
  it('sluit twee dangling endpoints binnen repair-gap', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 102, y: 0 }, b: { x: 200, y: 0 } },
    ]
    const result = repairDanglingConnections(segments, layer5WeldPolicy)
    expect(result.repairedCount).toBeGreaterThan(0)
    const midA = result.segments[0]!.b
    const midB = result.segments[1]!.a
    expect(Math.hypot(midA.x - midB.x, midA.y - midB.y)).toBeLessThan(0.01)
  })

  it('near-weld trekt gedeelde junction-punten samen', () => {
    // Share near (100,0) — endpoints within weld gap that already share degree≥2 zone
    const shared: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 100.4, y: 0 }, b: { x: 200, y: 0 } },
      { a: { x: 100.2, y: 0 }, b: { x: 100.2, y: 80 } },
    ]
    const welded = weldNearConnectedEndpoints(shared, layer5WeldPolicy)
    expect(welded.weldedCount).toBeGreaterThan(0)
  })

  it('bake ULP-drift naar byte-identieke hub (2D_3E @516 class)', () => {
    const xA = 726.6384507234749
    const xB = 726.6384507234748
    const y = 516
    const segments: Segment[] = [
      { a: { x: xA, y }, b: { x: xA, y: 425 } },
      { a: { x: xB, y }, b: { x: xB, y: 570 } },
    ]
    expect(xA).not.toBe(xB)
    const unified = unifyNearEndpoints(segments, 1)
    expect(unified.unifiedCount).toBeGreaterThan(0)
    const hubA = unified.segments[0]!.a
    const hubB = unified.segments[1]!.a
    expect(hubA.x).toBe(hubB.x)
    expect(hubA.y).toBe(hubB.y)
    const graph = buildJunctionGraph(unified.segments, 0)
    const atHub = graph.nodes.filter((n) => Math.hypot(n.x - hubA.x, n.y - y) < 1e-9)
    expect(atHub).toHaveLength(1)
    expect(atHub[0]!.kind).toBe('L') // deg-2 collinear → graph labels L, angle≈0
    expect(atHub[0]!.angleDeg).toBeLessThan(5)
  })
})

describe('V3 L5 Copy6 cleanup ops', () => {
  it('verwijdert T/X micro-stub', () => {
    const policy = resolveLayer5CleanupPolicy(30)
    // Micro from T-hub to a leaf that also has another segment (Copy6 requires leaf incidents)
    const segments: Segment[] = [
      { a: { x: 0, y: 100 }, b: { x: 100, y: 100 } },
      { a: { x: 100, y: 100 }, b: { x: 200, y: 100 } },
      { a: { x: 100, y: 100 }, b: { x: 100, y: 200 } },
      { a: { x: 100, y: 100 }, b: { x: 103, y: 100 } }, // 3px micro in T-zone
      { a: { x: 103, y: 100 }, b: { x: 103, y: 160 } }, // leaf arm
    ]
    const result = cleanupTxMicroSegments(segments, policy)
    expect(result.removedCount).toBeGreaterThan(0)
    expect(result.segments.length).toBeLessThan(segments.length)
  })

  it('collapse L+L stair micro', () => {
    const policy = resolveLayer5CleanupPolicy(30)
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 50, y: 0 } },
      { a: { x: 50, y: 0 }, b: { x: 51, y: 1 } }, // micro stair
      { a: { x: 51, y: 1 }, b: { x: 100, y: 1 } },
    ]
    const result = cleanupLlStairs(segments, policy)
    expect(result.collapsedCount).toBeGreaterThan(0)
    expect(result.segments.length).toBe(2)
  })
})

describe('V3 L5 orchestrator Copy6 loop', () => {
  it('dicht dangling gap via runLayer5Cleanup', () => {
    const layer4 = makeLayer4([
      { a: { x: 0, y: 10 }, b: { x: 100, y: 10 } },
      { a: { x: 102, y: 10 }, b: { x: 200, y: 10 } },
    ])
    const result = runLayer5Cleanup({ layer4, referenceWallThicknessPx: 30 })
    expect(result.facesCleaned).toHaveLength(1)
    expect(result.cleanupStats.endpointSealed).toBe(0)
    const segs = result.facesCleaned[0]!.segments
    // After dangling repair the gap should be closed (shared endpoint)
    const endpoints = segs.flatMap((s) => [s.a, s.b])
    const nearPairs = endpoints.filter((p, i) =>
      endpoints.some(
        (q, j) => i < j && Math.hypot(p.x - q.x, p.y - q.y) < 0.01,
      ),
    )
    expect(nearPairs.length).toBeGreaterThan(0)
  })

  it('verwijdert 1px mid-chain stub (BouwTek11 @1202–1203 class)', () => {
    // Collinear H with 1px micro — incidentAt(eps=1) sees both ends as one ball,
    // so ll-stair/tx cannot clean; drop≤eps + dangling repair must.
    const layer4 = makeLayer4([
      { a: { x: 1461, y: 886.584 }, b: { x: 1203, y: 886.584 } },
      { a: { x: 1203, y: 886.584 }, b: { x: 1202, y: 886.584 } },
      { a: { x: 1202, y: 886.584 }, b: { x: 970.55, y: 886.584 } },
    ])
    const result = runLayer5Cleanup({ layer4, referenceWallThicknessPx: 30 })
    const face = result.facesCleaned[0]!
    const segs = face.segments
    const short = segs.filter(
      (s) => Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y) <= 1,
    )
    expect(short).toHaveLength(0)
    expect(segs.length).toBeLessThanOrEqual(2)
    // No leftover I at the former micro (outer ends of an open wall may still be I)
    const midIs = face.junctions.filter(
      (j) => j.kind === 'I' && Math.abs(j.x - 1202.5) <= 2 && Math.abs(j.y - 886.584) <= 1,
    )
    expect(midIs).toHaveLength(0)
  })

  it('T-arm short stub: reconnect long V (BouwTek11 @645,243)', () => {
    // L4: T hub + 3.3px stub up + long V continuation → expect T at hub, no junction at y=240
    const x = 645.3675714979157
    const hubY = 243.30459110304145
    const layer4 = makeLayer4([
      { a: { x, y: 281.01107789607755 }, b: { x, y: 247 } },
      { a: { x, y: 247 }, b: { x, y: hubY } },
      { a: { x: 693, y: hubY }, b: { x, y: hubY } },
      { a: { x, y: hubY }, b: { x, y: 240 } }, // 3.3px stub BEFORE long V (order bug)
      { a: { x, y: 240 }, b: { x: 645.3675714979156, y: 194 } },
    ])
    const result = runLayer5Cleanup({ layer4, referenceWallThicknessPx: 30 })
    const face = result.facesCleaned[0]!
    const nearHub = face.junctions.filter((j) => Math.hypot(j.x - x, j.y - hubY) <= 1)
    const nearLeaf = face.junctions.filter((j) => Math.hypot(j.x - x, j.y - 240) <= 1)
    expect(nearLeaf).toHaveLength(0)
    expect(nearHub.some((j) => j.kind === 'T')).toBe(true)
  })

  it('BouwTek11 export-62 zone @645,243: no stranded I after full L4 replay', async () => {
    const fs = await import('node:fs')
    const path = 'C:/Users/jordi/Downloads/BouwTek11-layer-debug-v2 (62).json'
    if (!fs.existsSync(path)) return
    const report = JSON.parse(fs.readFileSync(path, 'utf8')) as {
      layers: { layer4: { segments: Segment[] } }
    }
    const layer4 = makeLayer4(report.layers.layer4.segments)
    const result = runLayer5Cleanup({ layer4, referenceWallThicknessPx: 30 })
    const face = result.facesCleaned[0]!
    const x = 645.3675714979157
    const hubY = 243.30459110304145
    const nearLeaf = face.junctions.filter((j) => Math.hypot(j.x - x, j.y - 240) <= 1.5)
    const nearHub = face.junctions.filter((j) => Math.hypot(j.x - x, j.y - hubY) <= 1.5)
    expect(nearLeaf.filter((j) => j.kind === 'I')).toHaveLength(0)
    expect(nearLeaf.filter((j) => j.kind === 'L')).toHaveLength(0)
    expect(nearHub.some((j) => j.kind === 'T')).toBe(true)
  })

  it('rolt face terug bij connectivity-fail (component split)', () => {
    // Two separate walls far apart — cleanup should not invent connections beyond gap
    const layer4 = makeLayer4([
      { a: { x: 0, y: 0 }, b: { x: 50, y: 0 } },
      { a: { x: 500, y: 0 }, b: { x: 550, y: 0 } },
    ])
    const result = runLayer5Cleanup({ layer4, referenceWallThicknessPx: 30 })
    expect(result.facesCleaned[0]!.segments).toHaveLength(2)
    expect(result.cleanupStats.weldedNear).toBe(0)
  })

  it('2D_3E corridor @516: geen dubbele I na L5 (ref=77, ULP bake)', () => {
    // L4 corridor around probe (716,488): collinear V through (726.64,516) +
    // 0.36px H micro at y=425. Wall ref 77px triggers same-line; bake must keep
    // one through-hub at y=516 (not two I's that L6 later pulls apart).
    const layer4 = makeLayer4([
      { a: { x: 726.6384507234746, y: 570 }, b: { x: 726.6384507234749, y: 516 } },
      { a: { x: 726.6384507234748, y: 621.5532841546399 }, b: { x: 726.6384507234746, y: 570 } },
      { a: { x: 1155.8787804508847, y: 424.99123438745255 }, b: { x: 742.25, y: 424.9912343874526 } },
      { a: { x: 742.25, y: 424.9912343874526 }, b: { x: 727, y: 424.9912343874526 } },
      { a: { x: 726.6384507234749, y: 516 }, b: { x: 726.6384507234748, y: 424.99123438745255 } },
      { a: { x: 726.6384507234748, y: 424.99123438745255 }, b: { x: 727, y: 424.9912343874526 } },
      { a: { x: 727, y: 424.9912343874526 }, b: { x: 682, y: 424.99123438745255 } },
      { a: { x: 682, y: 424.99123438745255 }, b: { x: 678.4168261426993, y: 401 } },
      { a: { x: 682, y: 424.99123438745255 }, b: { x: 482, y: 424.99123438745255 } },
      { a: { x: 747.75, y: 346.7730399480269 }, b: { x: 746.9783376298436, y: 417 } },
      { a: { x: 746.9783376298436, y: 417 }, b: { x: 746.9783376298436, y: 417 } },
      { a: { x: 746.9783376298436, y: 417 }, b: { x: 742.25, y: 424.9912343874526 } },
    ])
    const result = runLayer5Cleanup({ layer4, referenceWallThicknessPx: 77 })
    const face = result.facesCleaned[0]!
    const at516 = face.junctions.filter(
      (j) => Math.abs(j.y - 516) <= 0.5 && Math.abs(j.x - 726.64) <= 2,
    )
    expect(at516.filter((j) => j.kind === 'I')).toHaveLength(0)
    expect(at516.length).toBe(1)
    // Segment hubs at y=516 must be byte-identical across incidents
    const endsAt516 = face.segments.flatMap((s) =>
      [s.a, s.b].filter((p) => Math.abs(p.y - 516) <= 0.5 && Math.abs(p.x - 726.64) <= 2),
    )
    expect(endsAt516.length).toBeGreaterThanOrEqual(2)
    const hub = endsAt516[0]!
    for (const p of endsAt516) {
      expect(p.x).toBe(hub.x)
      expect(p.y).toBe(hub.y)
    }
  })
})
