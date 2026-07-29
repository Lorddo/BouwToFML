import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import { traceSkeletonSegments } from '@/cv/port/wallSkeletonTrace'
import type { ConnectedWallBlob } from '../room-wall-connected-blobs'
import type {
  RoomWallFaceSkeleton,
  RoomWallJunction,
  RoomWallJunctionKind,
} from '../room-wall-skeleton-types'
import { resolveLayer1RawPolicy } from './policies/layer-1'
import type { PipelineV3Layer1Result } from './types'

function offsetSegment(seg: Segment, originX: number, originY: number): Segment {
  return {
    ...seg,
    a: { x: seg.a.x + originX, y: seg.a.y + originY },
    b: { x: seg.b.x + originX, y: seg.b.y + originY },
  }
}

function toRoomJunctionKind(kind: 'L' | 'T' | 'X' | 'I'): RoomWallJunctionKind {
  return kind
}

function invertMaskForSkeletonTracing(cv: OpenCV, mat: OpenCV['Mat']): OpenCV['Mat'] {
  const inverted = new cv.Mat()
  cv.bitwise_not(mat, inverted)
  return inverted
}

function buildJunctionsFromGraph(
  localGraph: ReturnType<typeof buildJunctionGraph>,
  rootLabel: number,
): RoomWallJunction[] {
  return localGraph.nodes.map((node) => ({
    rootLabel,
    x: node.x,
    y: node.y,
    kind: toRoomJunctionKind(node.kind),
    angleDeg: node.angleDeg,
  }))
}

function buildFaceSkeleton(params: {
  blob: ConnectedWallBlob
  segments: Segment[]
  started: number
  junctionGraphSnapPx: number
}): RoomWallFaceSkeleton {
  const localGraph = buildJunctionGraph(params.segments, params.junctionGraphSnapPx)
  const junctions = buildJunctionsFromGraph(localGraph, params.blob.componentId)
  return {
    rootLabel: params.blob.componentId,
    bbox: { ...params.blob.bbox },
    areaPx: params.blob.areaPx,
    inkCoverageRatio: 1,
    segments: params.segments,
    junctions,
    stats: {
      segmentCount: params.segments.length,
      junctionCount: junctions.length,
      elapsedMs: performance.now() - params.started,
    },
  }
}

/** V3 Laag 1 — native WASM skeleton (own types + policy; no pipeline-v2 import). */
export async function runLayer1RawWasm(params: {
  cv: OpenCV
  blobs: ConnectedWallBlob[]
  referenceWallThicknessPx?: number
}): Promise<PipelineV3Layer1Result> {
  const policy = resolveLayer1RawPolicy(params.referenceWallThicknessPx)
  const blobCount = params.blobs.length
  const facesRaw: RoomWallFaceSkeleton[] = []
  const allSegmentsRaw: Segment[] = []
  const allJunctionsRaw: RoomWallJunction[] = []

  for (let blobIndex = 0; blobIndex < params.blobs.length; blobIndex += 1) {
    const blob = params.blobs[blobIndex]
    reportPipelineProgress(
      blobCount > 1 ? `V3 Skeleton Laag 1 (${blobIndex + 1}/${blobCount})…` : 'V3 Skeleton Laag 1…',
    )
    const started = performance.now()
    const skeletonInput = invertMaskForSkeletonTracing(params.cv, blob.maskMat)
    const tracedSegments = await traceSkeletonSegments(skeletonInput)
    skeletonInput.delete()
    const rawGlobal = tracedSegments.map((seg) => offsetSegment(seg, blob.originX, blob.originY))
    const faceRaw = buildFaceSkeleton({
      blob,
      segments: rawGlobal,
      started,
      junctionGraphSnapPx: policy.junctionGraphSnapPx,
    })
    facesRaw.push(faceRaw)
    allSegmentsRaw.push(...rawGlobal)
    allJunctionsRaw.push(...faceRaw.junctions)
  }

  return {
    facesRaw,
    allSegmentsRaw,
    allJunctionsRaw,
    totalSegmentsRaw: allSegmentsRaw.length,
    totalJunctionsRaw: allJunctionsRaw.length,
  }
}
