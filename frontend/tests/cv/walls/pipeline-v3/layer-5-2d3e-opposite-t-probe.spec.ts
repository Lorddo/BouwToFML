import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import { runLayer5Cleanup } from '@/cv/walls/rooms/pipeline-v3/layer-5-cleanup'
import { cleanupTxMicroSegments } from '@/cv/walls/rooms/pipeline-v3/engines/cleanup'
import { resolveLayer5CleanupPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-5'
import type { PipelineV3Layer4Result } from '@/cv/walls/rooms/pipeline-v3/types'

/**
 * 2D_3E probe (234,1285): L4 has opposite T @ (221.7,1355) + T @ (230.9,1355)
 * linked by a ~9px H micro-chain. tx-micro must NOT collapse that into an X
 * or yank the long V into a diagonal (export-26 regression).
 */
const ZONE_L4: Segment[] = [
  { a: { x: 221.70148314014597, y: 1219.105682544735 }, b: { x: 194, y: 1219.105682544735 } },
  { a: { x: 266, y: 1219.105682544735 }, b: { x: 265, y: 1219.105682544735 } },
  { a: { x: 265, y: 1219.105682544735 }, b: { x: 221.70148314014597, y: 1219.105682544735 } },
  { a: { x: 221.70148314014597, y: 1300 }, b: { x: 221.70148314014597, y: 1219.105682544735 } },
  { a: { x: 230.90031451631594, y: 1355.2679377083682 }, b: { x: 223.5, y: 1355.2679377083684 } },
  { a: { x: 223.5, y: 1355.2679377083684 }, b: { x: 223.5, y: 1355.2679377083684 } },
  { a: { x: 223.5, y: 1355.2679377083684 }, b: { x: 221.70148314014597, y: 1355.2679377083682 } },
  { a: { x: 221.70148314014597, y: 1355.2679377083682 }, b: { x: 221.70148314014597, y: 1300 } },
  { a: { x: 230.5, y: 1385 }, b: { x: 230.90031451631594, y: 1355.2679377083682 } },
  { a: { x: 643.7089608945234, y: 1356.0540454707825 }, b: { x: 242, y: 1356.0540454707825 } },
  { a: { x: 242, y: 1356.0540454707825 }, b: { x: 234.75, y: 1356.0540454707825 } },
  { a: { x: 234.75, y: 1356.0540454707825 }, b: { x: 234.75, y: 1356.0540454707825 } },
  { a: { x: 234.75, y: 1356.0540454707825 }, b: { x: 230.90031451631594, y: 1355.2679377083682 } },
  { a: { x: 221.70148314014597, y: 1355.2679377083682 }, b: { x: 132, y: 1355.2679377083682 } },
]

/** Post-cleanup state with explicit 9.2px bridge between two T hubs. */
const BRIDGE_BETWEEN_TS: Segment[] = [
  { a: { x: 221.7, y: 1300 }, b: { x: 221.7, y: 1219.1 } },
  { a: { x: 221.7, y: 1355.3 }, b: { x: 221.7, y: 1300 } },
  { a: { x: 230.5, y: 1385 }, b: { x: 230.9, y: 1355.3 } },
  { a: { x: 194, y: 1219.1 }, b: { x: 221.7, y: 1219.1 } },
  { a: { x: 221.7, y: 1219.1 }, b: { x: 265, y: 1219.1 } },
  { a: { x: 132, y: 1355.3 }, b: { x: 221.7, y: 1355.3 } },
  { a: { x: 221.7, y: 1355.3 }, b: { x: 230.9, y: 1355.3 } },
  { a: { x: 230.9, y: 1355.3 }, b: { x: 242, y: 1356.1 } },
  { a: { x: 242, y: 1356.1 }, b: { x: 643.7, y: 1356.1 } },
]

function offsetSegments(segments: Segment[], dx: number, dy: number): Segment[] {
  return segments.map((segment) => ({
    ...segment,
    a: { x: segment.a.x + dx, y: segment.a.y + dy },
    b: { x: segment.b.x + dx, y: segment.b.y + dy },
  }))
}

function makeLayer4(segments: Segment[]): PipelineV3Layer4Result {
  const cloned = segments.map((seg) => ({ ...seg, a: { ...seg.a }, b: { ...seg.b } }))
  const junctions = buildJunctionGraph(cloned, 0).nodes.map((node) => ({
    rootLabel: 1,
    x: node.x,
    y: node.y,
    kind: node.kind,
    angleDeg: node.angleDeg,
  }))
  const face = {
    rootLabel: 1,
    bbox: { x: 0, y: 0, width: 3000, height: 3000 },
    areaPx: 1,
    inkCoverageRatio: 1,
    segments: cloned,
    junctions,
    stats: { segmentCount: cloned.length, junctionCount: junctions.length, elapsedMs: 0 },
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

function zoneBottomJunctions(segments: Segment[], dx = 0, dy = 0) {
  return buildJunctionGraph(segments, 0).nodes.filter(
    (n) => n.y > 1345 + dy && n.y < 1365 + dy && n.x > 210 + dx && n.x < 245 + dx,
  )
}

function diagonalInZone(segments: Segment[], dx = 0, dy = 0) {
  return segments.filter((s) => {
    const mx = (s.a.x + s.b.x) / 2
    const my = (s.a.y + s.b.y) / 2
    if (!(mx > 180 + dx && mx < 280 + dx && my > 1200 + dy && my < 1400 + dy)) return false
    return Math.abs(s.a.x - s.b.x) > 3 && Math.abs(s.a.y - s.b.y) > 3
  })
}

describe('2D_3E L5 opposite-T (234,1285)', () => {
  ;[
    [0, 0],
    [1234, 987],
  ].forEach(([dx, dy]) => {
    it(`tx-micro: behoud junction↔junction brug (offset ${dx},${dy})`, () => {
      // ref=36 → txZoneMax=10 ≥ 9.2px bridge (pre-fix collapsed this)
      const policy = resolveLayer5CleanupPolicy(36)
      expect(policy.txZoneMaxPx).toBeGreaterThanOrEqual(9.2)

      const next = cleanupTxMicroSegments(offsetSegments(BRIDGE_BETWEEN_TS, dx, dy), policy)
      expect(diagonalInZone(next.segments, dx, dy)).toHaveLength(0)

      const bottom = zoneBottomJunctions(next.segments, dx, dy)
      expect(bottom.some((n) => n.kind === 'X')).toBe(false)
      expect(bottom.filter((n) => n.kind === 'T').length).toBeGreaterThanOrEqual(2)
    })

    it(`full L5: verticale hartlijn blijft behouden (offset ${dx},${dy})`, () => {
      const out = runLayer5Cleanup({
        layer4: makeLayer4(offsetSegments(ZONE_L4, dx, dy)),
        referenceWallThicknessPx: 36,
      })

      expect(diagonalInZone(out.allSegmentsCleaned, dx, dy)).toHaveLength(0)

      const bottom = zoneBottomJunctions(out.allSegmentsCleaned, dx, dy)
      expect(bottom.some((n) => n.kind === 'X')).toBe(false)
      const ts = bottom.filter((n) => n.kind === 'T')
      expect(ts.length).toBeGreaterThanOrEqual(2)
      expect(ts.some((n) => Math.abs(n.x - (221.7 + dx)) <= 2)).toBe(true)
      expect(ts.some((n) => Math.abs(n.x - (230.9 + dx)) <= 2)).toBe(true)

      const vertical = out.allSegmentsCleaned.find(
        (s) =>
          Math.abs(s.a.x - (221.7 + dx)) <= 1.5
          && Math.abs(s.b.x - (221.7 + dx)) <= 1.5
          && Math.min(s.a.y, s.b.y) < 1310 + dy
          && Math.max(s.a.y, s.b.y) > 1340 + dy,
      )
      expect(vertical).toBeTruthy()
    })
  })
})
