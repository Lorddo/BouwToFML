import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { runLayer6JunctionRepair } from '@/cv/walls/rooms/pipeline-v3/layer-6-repair'
import { classifyLayer6Segment } from '@/cv/walls/rooms/pipeline-v3/engines/connector/segment-classify'
import { buildConnectorJunctionGraph } from '@/cv/walls/rooms/pipeline-v3/engines/connector'
import type { PipelineV3Layer5Result } from '@/cv/walls/rooms/pipeline-v3/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPORT_26 = path.join('c:/Users/jordi/Downloads', '2D_3E-layer-debug-v2 (26).json')
const FIXTURE_26 = path.join(__dirname, 'fixtures', '2D_3E-layer5-report26-top.json')

/** Report 26 L5 top-hoeken (TR + TL met 4px H-stub). */
const TOP_CORNERS_L5: Segment[] = [
  { a: { x: 1353.946352027567, y: 794.9886172232799 }, b: { x: 1353.946352027567, y: 59 } },
  { a: { x: 1353.946352027567, y: 59 }, b: { x: 1331, y: 43.5 } },
  { a: { x: 1331, y: 43.5 }, b: { x: 953, y: 43.5 } },
  { a: { x: 953, y: 43.5 }, b: { x: 940.5, y: 57.2326094645447 } },
  { a: { x: 940.5, y: 57.2326094645447 }, b: { x: 936.5, y: 57.2326094645447 } },
  { a: { x: 936.5, y: 57.2326094645447 }, b: { x: 936.5, y: 316.955288232587 } },
]

/** SE-hoek: V + unretractable chamfer + H — junction mag niet half-snappen. */
const SE_CHAMFER_L5: Segment[] = [
  { a: { x: 1354, y: 1921.993 }, b: { x: 1354, y: 2382 } },
  { a: { x: 1354, y: 2382 }, b: { x: 1338, y: 2398.5 } },
  { a: { x: 1338, y: 2398.5 }, b: { x: 1242, y: 2398.515 } },
]

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

function isDiagonal(seg: Segment, index: number): boolean {
  return classifyLayer6Segment(seg, index).kind === 'D'
}

function loadReport26Layer5(): Segment[] | null {
  const src = existsSync(FIXTURE_26) ? FIXTURE_26 : existsSync(REPORT_26) ? REPORT_26 : null
  if (!src) return null
  const raw = JSON.parse(readFileSync(src, 'utf8')) as {
    layers?: { layer5?: { segments?: Segment[] } }
    segments?: Segment[]
  }
  const segs = raw.layers?.layer5?.segments ?? raw.segments
  if (!segs?.length) return null
  return segs.map((s) => ({
    type: 'wall' as const,
    a: { ...s.a },
    b: { ...s.b },
    confidence: 0.75,
  }))
}

describe('V3 L6 2D_3E report-26 corner fixes', () => {
  it('top cluster: beide L-chamfers → H×V, geen diagonalen', () => {
    const out = runLayer6JunctionRepair({
      layer5: makeLayer5(TOP_CORNERS_L5),
      referenceWallThicknessPx: 30,
    })
    const segs = out.allSegmentsRepaired
    expect(segs.some((s, i) => isDiagonal(s, i))).toBe(false)

    const graph = buildConnectorJunctionGraph(segs)
    const tr = graph.nodes.find((n) => Math.hypot(n.x - 1353.95, n.y - 43.5) <= 3 && n.kind === 'L')
    const tl = graph.nodes.find((n) => Math.hypot(n.x - 936.5, n.y - 43.5) <= 3 && n.kind === 'L')
    expect(tr).toBeTruthy()
    expect(tl).toBeTruthy()
  })

  it('SE chamfer: connector ruimt op; geen stranded I half-repair', () => {
    const out = runLayer6JunctionRepair({
      layer5: makeLayer5(SE_CHAMFER_L5),
      referenceWallThicknessPx: 30,
    })
    const segs = out.allSegmentsRepaired
    expect(segs.some((s, i) => isDiagonal(s, i))).toBe(false)
    expect(segs).toHaveLength(2)

    const graph = buildConnectorJunctionGraph(segs)
    const corner = graph.nodes.find(
      (n) => Math.hypot(n.x - 1354, n.y - 2398.5) <= 3 && n.kind === 'L',
    )
    expect(corner).toBeTruthy()
    expect(graph.nodes.filter((n) => n.kind === 'I').length).toBeLessThanOrEqual(2)
  })

  it('full L5 face (report 26): top-hoeken blijven gerepareerd (geen face I-rollback)', () => {
    const all = loadReport26Layer5()
    if (!all) return // fixture/report ontbreekt in CI — cluster-tests dekken de fix

    const out = runLayer6JunctionRepair({
      layer5: makeLayer5(all),
      referenceWallThicknessPx: 30,
    })
    const top = out.allSegmentsRepaired.filter(
      (s) =>
        Math.hypot(s.a.x - 1140, s.a.y - 50) <= 280 || Math.hypot(s.b.x - 1140, s.b.y - 50) <= 280,
    )
    const topDiags = top.filter((s, i) => isDiagonal(s, i) && segmentLength(s) < 40)
    expect(topDiags.length).toBe(0)

    const graph = buildConnectorJunctionGraph(out.allSegmentsRepaired)
    const tr = graph.nodes.find((n) => Math.hypot(n.x - 1353.95, n.y - 43.5) <= 4 && n.kind === 'L')
    expect(tr).toBeTruthy()
    expect(out.repairStats.facesRolledBack).toBe(0)
  }, 30_000)
})
