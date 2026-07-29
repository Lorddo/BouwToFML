import { describe, expect, it } from 'vitest'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import type { Segment } from '@/cv/port/wallGraph'
import { mergeLayer2JitterSegments } from '@/cv/walls/rooms/pipeline-v3/layer-2-raw-segments'
import { pruneISpurs } from '@/cv/walls/rooms/pipeline-v3/engines/prune'
import { positionSegmentsHv } from '@/cv/walls/rooms/pipeline-v3/engines/hv'
import { runLayer5Cleanup } from '@/cv/walls/rooms/pipeline-v3/layer-5-cleanup'
import { runLayer6JunctionRepair } from '@/cv/walls/rooms/pipeline-v3/layer-6-repair'
import {
  absorbMicroCornerJogs,
  collapseInterJunctionChains,
  collapseOrthoStairStubs,
  parallelCoverAbsorb,
  straightenCollinearAxisChains,
} from '@/cv/walls/rooms/pipeline-v3/engines/collapse'
import { runLayer8Finalize } from '@/cv/walls/rooms/pipeline-v3/layer-8-finalize'
import { buildConnectorJunctionGraph } from '@/cv/walls/rooms/pipeline-v3/engines/connector'
import {
  resolveLayer3PrunePolicy,
} from '@/cv/walls/rooms/pipeline-v3/policies/layer-3'
import { resolveLayer4HvPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-4'
import { resolveLayer7AlignPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-7'
import { resolveLayer9DissolvePolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-9'
import { resolveLayer10FmlPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-10'
import type {
  PipelineV3Layer4Result,
  PipelineV3Layer5Result,
  PipelineV3Layer7Result,
} from '@/cv/walls/rooms/pipeline-v3/types'
import type { RoomWallFaceSkeleton } from '@/cv/walls/rooms/room-wall-skeleton-types'

type TopologySignature = {
  segCount: number
  kindCounts: Record<'I' | 'L' | 'T' | 'X', number>
  diagonalCount: number
}

function cloneSegments(segments: Segment[]): Segment[] {
  return segments.map((seg) => ({ ...seg, a: { ...seg.a }, b: { ...seg.b } }))
}

function offsetSegments(segments: Segment[], dx: number, dy: number): Segment[] {
  return segments.map((seg) => ({
    ...seg,
    a: { x: seg.a.x + dx, y: seg.a.y + dy },
    b: { x: seg.b.x + dx, y: seg.b.y + dy },
  }))
}

function scaleSegments(segments: Segment[], factor: number): Segment[] {
  return segments.map((seg) => ({
    ...seg,
    a: { x: seg.a.x * factor, y: seg.a.y * factor },
    b: { x: seg.b.x * factor, y: seg.b.y * factor },
  }))
}

function topologySignature(segments: Segment[]): TopologySignature {
  const graph = buildJunctionGraph(segments, 0)
  const kindCounts: Record<'I' | 'L' | 'T' | 'X', number> = { I: 0, L: 0, T: 0, X: 0 }
  for (const node of graph.nodes) {
    kindCounts[node.kind] += 1
  }
  const diagonalCount = segments.filter((seg) => {
    const dx = Math.abs(seg.b.x - seg.a.x)
    const dy = Math.abs(seg.b.y - seg.a.y)
    return dx > 1.5 && dy > 1.5
  }).length
  return { segCount: segments.length, kindCounts, diagonalCount }
}

function makeFace(segments: Segment[], rootLabel = 1): RoomWallFaceSkeleton {
  const graph = buildJunctionGraph(segments, 0)
  const junctions = graph.nodes.map((node) => ({
    rootLabel,
    x: node.x,
    y: node.y,
    kind: node.kind,
    angleDeg: node.angleDeg,
  }))
  return {
    rootLabel,
    bbox: { x: 0, y: 0, width: 4000, height: 4000 },
    areaPx: 1,
    inkCoverageRatio: 1,
    segments: cloneSegments(segments),
    junctions,
    stats: {
      segmentCount: segments.length,
      junctionCount: junctions.length,
      elapsedMs: 0,
    },
  }
}

function makeLayer4Result(segments: Segment[]): PipelineV3Layer4Result {
  const face = makeFace(segments)
  return {
    facesPositioned: [face],
    allSegmentsPositioned: cloneSegments(segments),
    allJunctionsPositioned: [...face.junctions],
    totalSegmentsPositioned: segments.length,
    totalJunctionsPositioned: face.junctions.length,
    positionStats: { movedSegmentCount: 0, movedJunctionCount: 0 },
    invariantReport: {
      ok: true,
      errors: [],
      junctionKindCountsBefore: { I: 0, L: 0, T: 0, X: 0 },
      junctionKindCountsAfter: { I: 0, L: 0, T: 0, X: 0 },
    },
  }
}

function makeLayer5Result(segments: Segment[]): PipelineV3Layer5Result {
  const cloned = cloneSegments(segments)
  const graph = buildConnectorJunctionGraph(cloned)
  const junctions = graph.nodes.map((node) => ({
    rootLabel: 1,
    x: node.x,
    y: node.y,
    kind: node.kind,
    angleDeg: node.angleDeg,
  }))
  const face = {
    ...makeFace(cloned, 1),
    junctions,
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

function makeLayer7Result(segments: Segment[]): PipelineV3Layer7Result {
  const face = makeFace(segments)
  return {
    facesAligned: [face],
    allSegmentsAligned: cloneSegments(segments),
    allJunctionsAligned: [...face.junctions],
    totalSegmentsAligned: segments.length,
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

const BASE_FIXTURE: Segment[] = [
  { a: { x: 0, y: 0 }, b: { x: 120, y: 0 } },
  { a: { x: 120, y: 0 }, b: { x: 240, y: 0 } },
  { a: { x: 120, y: 0 }, b: { x: 120, y: 90 } },
  { a: { x: 240, y: 0 }, b: { x: 320, y: 0 } },
  { a: { x: 320, y: 0 }, b: { x: 320, y: 120 } },
  { a: { x: 120, y: 90 }, b: { x: 120, y: 150 } },
]

const L6_CHAMFER_FIXTURE: Segment[] = [
  { a: { x: 0, y: 40 }, b: { x: 40, y: 40 } },
  { a: { x: 40, y: 40 }, b: { x: 48, y: 32 } },
  { a: { x: 48, y: 32 }, b: { x: 56, y: 24 } },
  { a: { x: 56, y: 24 }, b: { x: 56, y: 0 } },
]

const L9_COVER_FIXTURE: Segment[] = [
  { a: { x: 1515.2593541390515, y: 907.6953047376124 }, b: { x: 1515.2593541390515, y: 567.4006785403706 } },
  { a: { x: 1515.2593541390515, y: 907.6953047376124 }, b: { x: 1515.2593541390515, y: 886.5840005392155 } },
  { a: { x: 1515.2593541390515, y: 886.5840005392155 }, b: { x: 970.553840378512, y: 886.5840005392155 } },
  { a: { x: 1515.2593541390518, y: 1334.0680002436966 }, b: { x: 1515.2593541390515, y: 907.6953047376124 } },
]

const L10_MICRO_CORNER_FIXTURE: Segment[] = [
  { a: { x: 1353.9463520275667, y: 1044.0492764016738 }, b: { x: 1353.946352027567, y: 1229.7002808483203 } },
  { a: { x: 1353.946352027567, y: 1229.7002808483203 }, b: { x: 1349, y: 1229.7002808483205 } },
  { a: { x: 1349, y: 1229.7002808483205 }, b: { x: 1132.25, y: 1229.7002808483205 } },
]

const cases: Array<{
  layer: 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' | 'L9' | 'L10'
  fixture: Segment[]
  run: (segments: Segment[], referenceWallThicknessPx: number) => Segment[]
}> = [
  {
    layer: 'L2',
    fixture: BASE_FIXTURE,
    run: (segments, ref) =>
      mergeLayer2JitterSegments({
        segments,
        distanceMap: null,
        maskWidth: 5000,
        maskHeight: 5000,
        referenceWallThicknessPx: ref,
      }).segments,
  },
  {
    layer: 'L3',
    fixture: BASE_FIXTURE,
    run: (segments, ref) => pruneISpurs(segments, resolveLayer3PrunePolicy(ref)).segments,
  },
  {
    layer: 'L4',
    fixture: BASE_FIXTURE,
    run: (segments, ref) =>
      positionSegmentsHv({
        face: makeFace(segments),
        distanceMap: null,
        maskWidth: 0,
        maskHeight: 0,
        policy: resolveLayer4HvPolicy(ref),
        referenceWallThicknessPx: ref,
      }).face.segments,
  },
  {
    layer: 'L5',
    fixture: BASE_FIXTURE,
    run: (segments, ref) => runLayer5Cleanup({ layer4: makeLayer4Result(segments), referenceWallThicknessPx: ref }).allSegmentsCleaned,
  },
  {
    layer: 'L6',
    fixture: L6_CHAMFER_FIXTURE,
    run: (segments, ref) =>
      runLayer6JunctionRepair({
        layer5: makeLayer5Result(segments),
        referenceWallThicknessPx: ref,
      }).allSegmentsRepaired,
  },
  {
    layer: 'L7',
    fixture: BASE_FIXTURE,
    run: (segments, ref) => {
      const policy = resolveLayer7AlignPolicy(ref).collapse
      return collapseInterJunctionChains({
        segments,
        thicknessBySegment: segments.map(() => ref),
        policy,
        referenceWallThicknessPx: ref,
      }).segments
    },
  },
  {
    layer: 'L8',
    fixture: BASE_FIXTURE,
    run: (segments, ref) =>
      runLayer8Finalize({
        layer7: makeLayer7Result(segments),
        referenceWallThicknessPx: ref,
      }).allSegmentsFinalized,
  },
  {
    layer: 'L9',
    fixture: L9_COVER_FIXTURE,
    run: (segments, ref) => {
      const policy = resolveLayer9DissolvePolicy(ref).collapse
      const collapsed = collapseInterJunctionChains({
        segments,
        thicknessBySegment: segments.map(() => ref),
        policy,
        referenceWallThicknessPx: ref,
      })
      const stubbed = collapseOrthoStairStubs(collapsed.segments, policy)
      return parallelCoverAbsorb(stubbed.segments, policy).segments
    },
  },
  {
    layer: 'L10',
    fixture: L10_MICRO_CORNER_FIXTURE,
    run: (segments, ref) => {
      const policy = resolveLayer10FmlPolicy(ref).collapse
      const collapsed = collapseInterJunctionChains({
        segments,
        thicknessBySegment: segments.map(() => ref),
        policy,
        referenceWallThicknessPx: ref,
      })
      const straightened = straightenCollinearAxisChains(collapsed.segments, policy)
      return absorbMicroCornerJogs(straightened.segments, policy).segments
    },
  },
]

describe('pipeline-v3 invariance signatures', () => {
  for (const testCase of cases) {
    it(`${testCase.layer} is translatie-invariant`, () => {
      const baseline = topologySignature(testCase.run(cloneSegments(testCase.fixture), 30))
      const shifted = topologySignature(
        testCase.run(offsetSegments(cloneSegments(testCase.fixture), 1234, 987), 30),
      )
      expect(shifted).toEqual(baseline)
    })

    it(`${testCase.layer} is schaal-invariant (x1.5, x0.6)`, () => {
      const baseline = topologySignature(testCase.run(cloneSegments(testCase.fixture), 30))
      const upscaled = topologySignature(
        testCase.run(scaleSegments(cloneSegments(testCase.fixture), 1.5), 45),
      )
      const downscaled = topologySignature(
        testCase.run(scaleSegments(cloneSegments(testCase.fixture), 0.6), 18),
      )
      expect(upscaled).toEqual(baseline)
      expect(downscaled).toEqual(baseline)
    })
  }
})
