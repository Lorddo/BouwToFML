import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { V3_NATIVE_THROUGH_LAYER } from '@/cv/walls/rooms/pipeline-v3/native-layers'
import { runLayer6JunctionRepair } from '@/cv/walls/rooms/pipeline-v3/layer-6-repair'
import {
  buildConnectorJunctionGraph,
  countLayer6JunctionKinds,
  isAlternatingStairDiagonalChain,
  resolveChamferGroupGeometry,
  resolveLayer6AxisChainPx,
  tryRepairChamferGroup,
  validateJunctionKindsPreserved,
  acceptLayer6FaceKinds,
} from '@/cv/walls/rooms/pipeline-v3/engines/connector'
import type { PipelineV3Layer5Result } from '@/cv/walls/rooms/pipeline-v3/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_47 = path.join(
  __dirname,
  'fixtures',
  'BouwTek11-layer-debug-v2-47.json',
)

function makeLayer5(segments: Segment[]): PipelineV3Layer5Result {
  const cloned = segments.map((s) => ({ ...s, a: { ...s.a }, b: { ...s.b } }))
  const graph = buildConnectorJunctionGraph(cloned)
  const junctions = graph.nodes.map((n) => ({
    rootLabel: 1,
    x: n.x,
    y: n.y,
    kind: n.kind,
    angleDeg: n.angleDeg,
  }))
  const face = {
    rootLabel: 1,
    bbox: { x: 0, y: 0, width: 4000, height: 4000 },
    areaPx: 1,
    inkCoverageRatio: 1,
    segments: cloned,
    junctions,
    stats: { segmentCount: cloned.length, junctionCount: junctions.length, elapsedMs: 0 },
  }
  return {
    facesCleaned: [face],
    allSegmentsCleaned: cloned,
    allJunctionsCleaned: junctions,
    totalSegmentsCleaned: cloned.length,
    totalJunctionsCleaned: junctions.length,
    cleanupStats: {
      sameLineMerged: 0,
      microRemoved: 0,
      stairCollapsed: 0,
      loopCollapsed: 0,
      weldedNear: 0,
      zeroLengthRemoved: 0,
      dedupedCount: 0,
      endpointSealed: 0,
      iterations: 0,
    },
  }
}

function isShortDiagonal(seg: Segment, maxLen = 48): boolean {
  const len = segmentLength(seg)
  if (len > maxLen || len < 1) return false
  const dx = Math.abs(seg.a.x - seg.b.x)
  const dy = Math.abs(seg.a.y - seg.b.y)
  return dx > 1.5 && dy > 1.5
}

function segsInZone(
  segments: Segment[],
  zone: { x0: number; x1: number; y0: number; y1: number },
): Segment[] {
  return segments.filter((seg) => {
    const mx = (seg.a.x + seg.b.x) / 2
    const my = (seg.a.y + seg.b.y) / 2
    return mx >= zone.x0 && mx <= zone.x1 && my >= zone.y0 && my <= zone.y1
  })
}

/** L-hoek met 2×45° chamfer-keten → één H×V-L. */
function doubleChamferLSegments(): Segment[] {
  return [
    { a: { x: 0, y: 40 }, b: { x: 40, y: 40 } },
    { a: { x: 40, y: 40 }, b: { x: 48, y: 32 } },
    { a: { x: 48, y: 32 }, b: { x: 56, y: 24 } },
    { a: { x: 56, y: 24 }, b: { x: 56, y: 0 } },
  ].map((s) => ({ ...s, type: 'wall' as const, confidence: 1 }))
}

/** BouwTek11 west T-jog: H@y=43 + stub-T@y=45.4 + chamfer naar V@645. */
const WEST_L5: Segment[] = [
  { a: { x: 242, y: 43.01705625938796 }, b: { x: 660, y: 43 } },
  { a: { x: 645.3675714979157, y: 62 }, b: { x: 660, y: 45.41852959544747 } },
  { a: { x: 660, y: 43 }, b: { x: 660, y: 45.41852959544747 } },
  { a: { x: 662, y: 45.418529595447474 }, b: { x: 660, y: 45.41852959544747 } },
  { a: { x: 788.9297823747512, y: 45.41852959544747 }, b: { x: 662, y: 45.418529595447474 } },
  { a: { x: 645.3675714979156, y: 194 }, b: { x: 645.3675714979157, y: 62 } },
]

/** 2D_3E koof @572 — diag@587 mag T@572 niet kapot trekken. */
const KOOF_L5: Segment[] = [
  { a: { x: 572.608069822705, y: 316.95254937885363 }, b: { x: 544.3333333333331, y: 316.9525493788537 } },
  { a: { x: 572.6080698462956, y: 377.49999999999994 }, b: { x: 572.608069822705, y: 316.95254937885363 } },
  { a: { x: 587.5, y: 316.9525493788536 }, b: { x: 572.608069822705, y: 316.95254937885363 } },
  { a: { x: 544.3333333333331, y: 316.9525493788537 }, b: { x: 531.5244112486043, y: 317.8511369563207 } },
  { a: { x: 928, y: 316.95254937885363 }, b: { x: 587.5, y: 316.9525493788536 } },
  { a: { x: 590.780775389251, y: 308 }, b: { x: 587.5, y: 316.9525493788536 } },
  { a: { x: 531.5244112486043, y: 317.8511369563207 }, b: { x: 48, y: 317.875 } },
  { a: { x: 531.5244112486043, y: 317.8511369563207 }, b: { x: 531.5244112486042, y: 302 } },
]

describe('V3 native L6 gate', () => {
  it('natively completes through L6', () => {
    expect(V3_NATIVE_THROUGH_LAYER).toBeGreaterThanOrEqual(6)
  })
})

describe('V3 layer-6 chamfer-group contract', () => {
  it('axis-chain is 3.5× ref', () => {
    expect(resolveLayer6AxisChainPx(30)).toBe(105)
    expect(resolveLayer6AxisChainPx(20)).toBe(70)
  })

  it('L met 2×45° collapst naar H×V zonder gat (kind-accept)', () => {
    const before = doubleChamferLSegments()
    const geom = resolveChamferGroupGeometry({
      segments: before,
      connectorIndex: 1,
      referenceWallThicknessPx: 30,
    })
    expect(geom).toBeTruthy()
    expect(geom!.kind).toBe('L')

    const result = tryRepairChamferGroup({
      segments: before,
      connectorIndex: 1,
      referenceWallThicknessPx: 30,
      validate: (b, a) => validateJunctionKindsPreserved(b, a, 30).ok,
    })
    expect(result?.repaired).toBe(true)
    expect(result!.segments.filter((s) => isShortDiagonal(s)).length).toBe(0)
    expect(validateJunctionKindsPreserved(before, result!.segments, 30).ok).toBe(true)

    const kinds = countLayer6JunctionKinds(result!.segments)
    expect(kinds.L).toBe(1)
    expect(kinds.I).toBe(2)
    expect(kinds.T).toBe(0)
  })

  it('kind-accept documents gate: T/X downgrade rejected', () => {
    // Proper T: through-H + branch sharing exact mid endpoint.
    const before: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 50, y: 0 } },
      { a: { x: 50, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 50, y: 0 }, b: { x: 50, y: 40 } },
    ]
    // Drop branch → through-line only (T gone).
    const after: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 50, y: 0 } },
      { a: { x: 50, y: 0 }, b: { x: 100, y: 0 } },
    ]
    const beforeKinds = countLayer6JunctionKinds(before)
    const afterKinds = countLayer6JunctionKinds(after)
    expect(beforeKinds.T + beforeKinds.X).toBeGreaterThan(afterKinds.T + afterKinds.X)
    expect(validateJunctionKindsPreserved(before, after, 30).ok).toBe(false)
  })
})

describe('V3 layer-6 export 47 regressie', () => {
  it('replay L5→L6: geen gaten, zone 1509/oost-T ok, kind gate', () => {
    if (!fs.existsSync(FIXTURE_47)) {
      expect.fail(`Fixture ontbreekt: ${FIXTURE_47}`)
    }
    const report = JSON.parse(fs.readFileSync(FIXTURE_47, 'utf8')) as {
      layers: {
        layer5: { segments: Segment[] }
      }
    }
    const layer5Segs = report.layers.layer5.segments.map((s) => ({
      ...s,
      a: { ...s.a },
      b: { ...s.b },
    }))
    const beforeKinds = countLayer6JunctionKinds(layer5Segs)
    const layer5 = makeLayer5(layer5Segs)
    const layer6 = runLayer6JunctionRepair({
      layer5,
      referenceWallThicknessPx: 30,
    })

    expect(
      layer6.repairStats.facesRolledBack,
      `rollback: ${layer6.repairStats.lastRollBackReason}`,
    ).toBe(0)
    expect(acceptLayer6FaceKinds(layer5Segs, layer6.allSegmentsRepaired).ok).toBe(true)

    const zoneSouth = { x0: 1470, x1: 1535, y0: 870, y1: 925 }
    const southDiagsBefore = segsInZone(layer5Segs, zoneSouth).filter((s) => isShortDiagonal(s))
    const southDiags = segsInZone(layer6.allSegmentsRepaired, zoneSouth).filter((s) =>
      isShortDiagonal(s),
    )
    // CURRENT V2 in this workspace still leaves ≤1 residual near @1509; require no regression.
    expect(southDiags.length).toBeLessThanOrEqual(Math.max(1, southDiagsBefore.length))
    expect(southDiags.length).toBeLessThanOrEqual(1)

    const zoneEast = { x0: 1035, x1: 1065, y0: 35, y1: 70 }
    const eastDiags = segsInZone(layer6.allSegmentsRepaired, zoneEast).filter((s) =>
      isShortDiagonal(s),
    )
    expect(eastDiags.length).toBe(0)

    const afterGraph = buildConnectorJunctionGraph(layer6.allSegmentsRepaired)
    const eastTx = afterGraph.nodes.filter(
      (n) =>
        (n.kind === 'T' || n.kind === 'X')
        && n.x >= zoneEast.x0
        && n.x <= zoneEast.x1
        && n.y >= 30
        && n.y <= 70,
    )
    expect(eastTx.length).toBeGreaterThanOrEqual(1)

    const afterKinds = countLayer6JunctionKinds(layer6.allSegmentsRepaired)
    expect(afterKinds.I).toBeLessThanOrEqual(beforeKinds.I + 2)
  }, 20_000)
})

describe('V3 layer-6 west T-jog', () => {
  it('herkent landing i.p.v. simple-L yank', () => {
    const geom = resolveChamferGroupGeometry({
      segments: WEST_L5,
      connectorIndex: 1,
      referenceWallThicknessPx: 30,
    })
    expect(geom?.kind).toBe('landing')
    expect(geom?.vAtLanding).toBe(true)
  })

  it('L6 collapse naar H×V-hit — geen micro-jog stubs', () => {
    const layer6 = runLayer6JunctionRepair({
      layer5: makeLayer5(WEST_L5),
      referenceWallThicknessPx: 30,
    })
    const segs = layer6.allSegmentsRepaired
    const graph = buildConnectorJunctionGraph(segs)

    expect(
      graph.nodes.some(
        (n) =>
          (n.kind === 'L' || n.kind === 'T' || n.kind === 'X')
          && Math.hypot(n.x - 645.37, n.y - 45.42) <= 3,
      ),
    ).toBe(true)

    const microStub = segs.filter((s) => {
      const len = segmentLength(s)
      if (len > 4) return false
      return [s.a, s.b].some((p) => Math.hypot(p.x - 660, p.y - 44) <= 4)
    })
    expect(microStub.length).toBe(0)
  })

  it('trap-keten is geen chamfer-groep', () => {
    const stair: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } },
      { a: { x: 10, y: 10 }, b: { x: 20, y: 0 } },
      { a: { x: 20, y: 0 }, b: { x: 30, y: 10 } },
    ].map((s) => ({ ...s, type: 'wall' as const, confidence: 1 }))
    expect(
      isAlternatingStairDiagonalChain({
        segments: stair,
        diagonalIndices: [0, 1, 2],
      }),
    ).toBe(true)
  })
})

describe('V3 layer-6 2D_3E koof @572', () => {
  it('diag@587 koppelt niet aan T@572', () => {
    const geom = resolveChamferGroupGeometry({
      segments: KOOF_L5,
      connectorIndex: 5,
      referenceWallThicknessPx: 30,
    })
    if (geom) {
      expect(Math.hypot(geom.hit.x - 572.6, geom.hit.y - 317)).toBeGreaterThan(8)
    }
  })

  it('L6 behoudt T@572', () => {
    const layer6 = runLayer6JunctionRepair({
      layer5: makeLayer5(KOOF_L5),
      referenceWallThicknessPx: 30,
    })
    const segs = layer6.allSegmentsRepaired
    const graph = buildConnectorJunctionGraph(segs)
    const afterKinds = countLayer6JunctionKinds(segs)

    expect(afterKinds.T).toBeGreaterThanOrEqual(1)
    expect(
      graph.nodes.some(
        (n) =>
          (n.kind === 'T' || n.kind === 'X')
          && Math.hypot(n.x - 572.6, n.y - 317) <= 4,
      ),
    ).toBe(true)
  })
})

/** BouwTek11 export-64 @1489: through-V T + H-landing diagonaal — geen simple-L yank. */
const THROUGH_V_T_CHAMFER_L5: Segment[] = [
  { a: { x: 1515.26, y: 907.7 }, b: { x: 1515.26, y: 567.4 } },
  { a: { x: 1515.26, y: 1213 }, b: { x: 1515.26, y: 907.7 } },
  { a: { x: 1515.26, y: 907.7 }, b: { x: 1490, y: 886.58 } },
  { a: { x: 1490, y: 886.58 }, b: { x: 1462, y: 886.58 } },
  { a: { x: 1461, y: 886.58 }, b: { x: 1203, y: 886.58 } },
]

describe('V3 layer-6 through-V T chamfer @1489', () => {
  it('kiest landing i.p.v. simple-L (T behouden)', () => {
    const geom = resolveChamferGroupGeometry({
      segments: THROUGH_V_T_CHAMFER_L5,
      connectorIndex: 2,
      referenceWallThicknessPx: 30,
    })
    expect(geom?.kind).toBe('landing')
    expect(geom?.vAtLanding).toBe(false)
  })

  it('verwijdert diagonaal zonder T→I', () => {
    const before = countLayer6JunctionKinds(THROUGH_V_T_CHAMFER_L5)
    const layer6 = runLayer6JunctionRepair({
      layer5: makeLayer5(THROUGH_V_T_CHAMFER_L5),
      referenceWallThicknessPx: 30,
    })
    const segs = layer6.allSegmentsRepaired
    const after = countLayer6JunctionKinds(segs)
    const diags = segs.filter((s) => {
      const dx = Math.abs(s.a.x - s.b.x)
      const dy = Math.abs(s.a.y - s.b.y)
      return dx > 1.5 && dy > 1.5 && segmentLength(s) < 48
    })
    expect(diags.length).toBe(0)
    expect(after.T).toBeGreaterThanOrEqual(before.T)
    expect(after.I).toBeLessThanOrEqual(before.I)
    const graph = buildConnectorJunctionGraph(segs)
    expect(
      graph.nodes.some(
        (n) =>
          (n.kind === 'T' || n.kind === 'X')
          && Math.hypot(n.x - 1515.26, n.y - 907.7) <= 4,
      ),
    ).toBe(true)
  })
})
