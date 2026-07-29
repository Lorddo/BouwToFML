import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import { runLayer4PositionHv } from '@/cv/walls/rooms/pipeline-v3/layer-4-position-hv'
import { positionSegmentsHv } from '@/cv/walls/rooms/pipeline-v3/engines/hv'
import { resolveLayer4HvPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-4'
import {
  V3_NATIVE_THROUGH_LAYER,
  listIncompleteLayers,
} from '@/cv/walls/rooms/pipeline-v3/native-layers'
import type { PipelineV3Layer3Result } from '@/cv/walls/rooms/pipeline-v3/types'
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

function makeLayer3(segments: Segment[], rootLabel = 1): PipelineV3Layer3Result {
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
    facesPruned: [face],
    allSegmentsPruned: cloned,
    allJunctionsPruned: junctions,
    totalSegmentsPruned: cloned.length,
    totalJunctionsPruned: junctions.length,
    pruneStats: { removedPathCount: 0, removedSegmentCount: 0 },
  }
}

describe('V3 native L4 gate', () => {
  it('is included in native through L5', () => {
    expect(V3_NATIVE_THROUGH_LAYER).toBeGreaterThanOrEqual(4)
    expect(listIncompleteLayers()).not.toContain(4)
  })
})

describe('V3 L4 bare HV — alles mee', () => {
  it('gebruikt mask-dikte voor V-clustering i.p.v. referentie-fallback', () => {
    // Twee bijna-parallelle V-armen delen een junction. Bij ref-fallback (30px) clusteren ze foutief samen.
    const segments: Segment[] = [
      { a: { x: 100, y: 140 }, b: { x: 96, y: 80 } },
      { a: { x: 100, y: 140 }, b: { x: 104, y: 200 } },
    ]
    const layer3 = makeLayer3(segments)
    const width = 260
    const height = 260
    const distanceMap = new Float32Array(width * height)

    // Alleen verder van de junction staat mask-thickness (dt=3 -> dikte 6px).
    // Rond de oude single-sample punten blijft dt=0, zodat deze test regressie vangt.
    for (let y = 90; y <= 125; y += 1) {
      distanceMap[y * width + 98] = 3
    }
    for (let y = 155; y <= 195; y += 1) {
      distanceMap[y * width + 102] = 3
    }

    const positioned = positionSegmentsHv({
      face: layer3.facesPruned[0]!,
      distanceMap,
      maskWidth: width,
      maskHeight: height,
      policy: resolveLayer4HvPolicy(30),
      referenceWallThicknessPx: 30,
    })

    const [segA, segB] = positioned.face.segments
    // Bij correcte mask-dikte blijven de vrije einden op verschillende assen (niet samengevouwen tot 1 lijn).
    expect(Math.abs(segA.b.x - segB.b.x)).toBeGreaterThan(1)
  })

  it('verplaatst T-junction en alle aangesloten eindpunten naar hetzelfde punt', () => {
    // Slightly skewed T: hub near (100,100), H left/right + V down
    const segments: Segment[] = [
      { a: { x: 0, y: 101 }, b: { x: 100, y: 100 } },
      { a: { x: 100, y: 100 }, b: { x: 200, y: 101 } },
      { a: { x: 100, y: 100 }, b: { x: 101, y: 200 } },
    ]
    const layer3 = makeLayer3(segments)
    const tBefore = layer3.allJunctionsPruned.find((j) => j.kind === 'T')
    expect(tBefore).toBeDefined()

    const positioned = positionSegmentsHv({
      face: layer3.facesPruned[0]!,
      distanceMap: null,
      maskWidth: 0,
      maskHeight: 0,
      policy: resolveLayer4HvPolicy(30),
      referenceWallThicknessPx: 30,
    })

    const tAfter = positioned.face.junctions.find((j) => j.kind === 'T')
    expect(tAfter).toBeDefined()
    expect(tAfter!.kind).toBe('T')

    const touching = positioned.face.segments.filter(
      (seg) =>
        Math.hypot(seg.a.x - tAfter!.x, seg.a.y - tAfter!.y) < 1e-6 ||
        Math.hypot(seg.b.x - tAfter!.x, seg.b.y - tAfter!.y) < 1e-6,
    )
    expect(touching).toHaveLength(3)

    const kinds = positioned.face.junctions.reduce(
      (acc, j) => {
        acc[j.kind] += 1
        return acc
      },
      { I: 0, L: 0, T: 0, X: 0 } as Record<'I' | 'L' | 'T' | 'X', number>,
    )
    const beforeKinds = layer3.allJunctionsPruned.reduce(
      (acc, j) => {
        acc[j.kind] += 1
        return acc
      },
      { I: 0, L: 0, T: 0, X: 0 } as Record<'I' | 'L' | 'T' | 'X', number>,
    )
    expect(kinds).toEqual(beforeKinds)
  })

  it('behoudt Copy6/7 invarianten (geen T→I-explosie)', () => {
    const segments: Segment[] = [
      { a: { x: 1129, y: 1964 }, b: { x: 1116, y: 1964 } },
      { a: { x: 1132, y: 1963 }, b: { x: 1129, y: 1964 } },
      { a: { x: 1134, y: 1964 }, b: { x: 1132, y: 1963 } },
      { a: { x: 1132, y: 1963 }, b: { x: 1132, y: 1946 } },
      { a: { x: 1141, y: 1964 }, b: { x: 1134, y: 1964 } },
      { a: { x: 1116, y: 1964 }, b: { x: 1116, y: 1948 } },
      { a: { x: 1116, y: 1964 }, b: { x: 1111, y: 1965 } },
      { a: { x: 1111, y: 1965 }, b: { x: 1086, y: 1965 } },
    ]
    const layer3 = makeLayer3(segments)
    const layer4 = runLayer4PositionHv({
      layer3,
      referenceWallThicknessPx: 30,
    })
    expect(layer4.invariantReport.ok).toBe(true)
    expect(layer4.invariantReport.junctionKindCountsAfter).toEqual(
      layer4.invariantReport.junctionKindCountsBefore,
    )
  })

  it('roept geen seal/weld aan (bare HV only)', () => {
    expect(resolveLayer4HvPolicy().postPositionSnapPx).toBe(0)
    expect(resolveLayer4HvPolicy().prePositionSnapPx).toBe(2)
  })
})
