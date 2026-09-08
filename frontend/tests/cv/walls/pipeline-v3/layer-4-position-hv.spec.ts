import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import { runLayer4PositionHv } from '@/cv/walls/rooms/pipeline-v3/layer-4-position-hv'
import { runLayer8Finalize } from '@/cv/walls/rooms/pipeline-v3/layer-8-finalize'
import { positionSegmentsHv } from '@/cv/walls/rooms/pipeline-v3/engines/hv'
import type { ObliqueAxis } from '@/cv/walls/rooms/pipeline-v3/engines/oblique'
import { projectOnto, signedOffset } from '@/cv/walls/rooms/pipeline-v3/engines/oblique/axis-line'
import { resolveLayer4HvPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-4'
import { resolveObliquePolicy } from '@/cv/walls/rooms/pipeline-v3/policies/oblique'
import {
  V3_NATIVE_THROUGH_LAYER,
  listIncompleteLayers,
} from '@/cv/walls/rooms/pipeline-v3/native-layers'
import type {
  PipelineV3Layer3Result,
  PipelineV3Layer7Result,
} from '@/cv/walls/rooms/pipeline-v3/types'
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

function makeFace(segments: Segment[], rootLabel = 1) {
  const cloned = segments.map((seg) => ({
    ...seg,
    a: { ...seg.a },
    b: { ...seg.b },
  }))
  const junctions = toJunctions(cloned, rootLabel)
  return {
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
}

function makeLayer3(segments: Segment[], rootLabel = 1): PipelineV3Layer3Result {
  const face = makeFace(segments, rootLabel)
  return {
    facesPruned: [face],
    allSegmentsPruned: face.segments,
    allJunctionsPruned: face.junctions,
    totalSegmentsPruned: face.segments.length,
    totalJunctionsPruned: face.junctions.length,
    pruneStats: { removedPathCount: 0, removedSegmentCount: 0 },
  }
}

function makeLayer7(segments: Segment[]): PipelineV3Layer7Result {
  const face = makeFace(segments)
  return {
    facesAligned: [face],
    allSegmentsAligned: face.segments,
    allJunctionsAligned: face.junctions,
    totalSegmentsAligned: face.segments.length,
    totalJunctionsAligned: face.junctions.length,
    collapseStats: {
      chainsCollapsed: 0,
      segmentsRemoved: 0,
      fakeLRemoved: 0,
      dedupedCount: 0,
      facesSkippedTopology: 0,
    },
  }
}

/** ~8° uit lood, kort genoeg dat |Δx|≤band → zonder as als V zou snappen. */
const OBLIQUE_A = { x: 100, y: 40 }
const OBLIQUE_B = { x: 107, y: 90 }
const OBLIQUE_MID = { x: 103.5, y: 65 }

function makeInjectedObliqueAxis(): ObliqueAxis {
  const dx = OBLIQUE_B.x - OBLIQUE_A.x
  const dy = OBLIQUE_B.y - OBLIQUE_A.y
  const len = Math.hypot(dx, dy)
  const line = {
    anchor: { ...OBLIQUE_A },
    direction: { x: dx / len, y: dy / len },
  }
  return {
    line,
    angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    tMin: 0,
    tMax: len,
    evidencePx: len,
    memberCount: 2,
    ridge: {
      samples: 10,
      offsetMedianPx: 0.5,
      offsetP90Px: 1,
      offsetMaxPx: 1.5,
      dtMedianPx: 15,
      dtDeficitMedianPx: 0,
      inInkRatio: 1,
    },
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
      face: layer3.facesPruned[0],
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
      face: layer3.facesPruned[0],
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

describe('V3 L4/L8 oblique-axis protect', () => {
  const axis = makeInjectedObliqueAxis()
  const obliquePolicy = resolveObliquePolicy(30)

  /** T: scheve gevel + echte H-binnenmuur. Zonder as zou knoop naar (Vx,Hy) gaan. */
  const tSegments: Segment[] = [
    { a: { ...OBLIQUE_A }, b: { ...OBLIQUE_B } },
    { a: { ...OBLIQUE_A }, b: { x: 20, y: 40 } },
  ]

  it('L4: knoop van scheve as + H blijft op axis.line (niet Vx,Hy)', () => {
    const without = positionSegmentsHv({
      face: makeFace(tSegments),
      distanceMap: null,
      maskWidth: 0,
      maskHeight: 0,
      policy: resolveLayer4HvPolicy(30),
      referenceWallThicknessPx: 30,
    })
    const withAxis = positionSegmentsHv({
      face: makeFace(tSegments),
      distanceMap: null,
      maskWidth: 0,
      maskHeight: 0,
      policy: resolveLayer4HvPolicy(30),
      referenceWallThicknessPx: 30,
      obliqueAxes: [axis],
      obliquePolicy,
    })

    const hubWithout = without.face.junctions.find((j) => j.kind === 'T' || j.kind === 'L')
    const hubWith = withAxis.face.junctions.find((j) => j.kind === 'T' || j.kind === 'L')
    expect(hubWith).toBeDefined()

    // Met as: knoop op de gevellijn.
    expect(Math.abs(signedOffset(axis.line, hubWith!))).toBeLessThan(1)

    // Zonder as trekt H/V de knoop van de lijn (regressie-anker).
    if (hubWithout) {
      expect(Math.abs(signedOffset(axis.line, hubWithout))).toBeGreaterThan(0.5)
    }

    // Geveleinden blijven collineair op dezelfde lijn.
    const facade = withAxis.face.segments.find(
      (seg) =>
        Math.hypot(seg.a.x - OBLIQUE_B.x, seg.a.y - OBLIQUE_B.y) < 2 ||
        Math.hypot(seg.b.x - OBLIQUE_B.x, seg.b.y - OBLIQUE_B.y) < 2,
    )
    expect(facade).toBeDefined()
    expect(Math.abs(signedOffset(axis.line, facade!.a))).toBeLessThan(1)
    expect(Math.abs(signedOffset(axis.line, facade!.b))).toBeLessThan(1)
  })

  it('L4 runLayer4PositionHv: geïnjecteerde as houdt invarianten', () => {
    const layer3 = makeLayer3(tSegments)
    const layer4 = runLayer4PositionHv({
      layer3,
      referenceWallThicknessPx: 30,
      obliqueAxes: [axis],
    })
    expect(layer4.invariantReport.ok).toBe(true)
    const hub = layer4.allJunctionsPositioned.find((j) => j.kind === 'T' || j.kind === 'L')
    expect(hub).toBeDefined()
    expect(Math.abs(signedOffset(axis.line, hub!))).toBeLessThan(1)
  })

  it('L8: knoop blijft op de lijn na tweede HV-pass', () => {
    // Start alsof L7 de L3-geometrie nog heeft (as-leden nog op hartlijn).
    const layer7 = makeLayer7(tSegments)
    const layer8 = runLayer8Finalize({
      layer7,
      referenceWallThicknessPx: 30,
      obliqueAxes: [axis],
    })
    const hub = layer8.allJunctionsFinalized.find((j) => j.kind === 'T' || j.kind === 'L')
    expect(hub).toBeDefined()
    expect(Math.abs(signedOffset(axis.line, hub!))).toBeLessThan(1)

    const onAxis = layer8.allSegmentsFinalized.filter(
      (seg) =>
        Math.abs(signedOffset(axis.line, seg.a)) < 1.5 &&
        Math.abs(signedOffset(axis.line, seg.b)) < 1.5 &&
        Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) > 50,
    )
    expect(onAxis.length).toBeGreaterThanOrEqual(1)
  })

  it('zonder assen: orthogonale T ongewijzigd t.o.v. bestaand pad', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 101 }, b: { x: 100, y: 100 } },
      { a: { x: 100, y: 100 }, b: { x: 200, y: 101 } },
      { a: { x: 100, y: 100 }, b: { x: 101, y: 200 } },
    ]
    const a = positionSegmentsHv({
      face: makeFace(segments),
      distanceMap: null,
      maskWidth: 0,
      maskHeight: 0,
      policy: resolveLayer4HvPolicy(30),
      referenceWallThicknessPx: 30,
    })
    const b = positionSegmentsHv({
      face: makeFace(segments),
      distanceMap: null,
      maskWidth: 0,
      maskHeight: 0,
      policy: resolveLayer4HvPolicy(30),
      referenceWallThicknessPx: 30,
      obliqueAxes: [],
      obliquePolicy,
    })
    expect(a.face.segments).toEqual(b.face.segments)
    expect(a.face.junctions.map((j) => ({ x: j.x, y: j.y, kind: j.kind }))).toEqual(
      b.face.junctions.map((j) => ({ x: j.x, y: j.y, kind: j.kind })),
    )
  })

  it('projectOnto helper: punt op lijn blijft', () => {
    const p = projectOnto(axis.line, OBLIQUE_MID)
    expect(Math.abs(signedOffset(axis.line, p))).toBeLessThan(1e-9)
  })
})
