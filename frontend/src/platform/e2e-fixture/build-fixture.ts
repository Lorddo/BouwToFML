import type { PipelineLayer1FaceDebug, SegmentCandidate } from '@/core/extraction/types'
import type { RoomWallJunctionDebug } from '@/core/extraction/types'
import { rebuildLayer1FromFaceDebug } from '@/cv/walls/rooms/pipeline-v3/run-finalize-v3'
import { clonePlain } from '@/platform/dev-workspace/clone-plain'
import { encodeInt32Rle, fnv1aHex, base64ToBytes } from './rle-codec'
import type {
  E2eFixture,
  E2eFixtureBuildInput,
  E2eFixtureLayer1,
  E2eFixtureLayer1Face,
  EncodedInt32Raster,
} from './types'

function normalizeLayer1Face(face: E2eFixtureLayer1Face): E2eFixtureLayer1Face {
  return {
    rootLabel: face.rootLabel,
    bbox: { ...face.bbox },
    areaPx: face.areaPx,
    inkCoverageRatio: face.inkCoverageRatio,
    segments: face.segments.map((seg) => ({
      a: { ...seg.a },
      b: { ...seg.b },
      ...(seg.templateIndex !== undefined ? { templateIndex: seg.templateIndex } : {}),
    })),
    junctions: face.junctions.map((j) => ({ ...j })),
    stats: {
      segmentCount: face.segments.length,
      junctionCount: face.junctions.length,
      elapsedMs: 0,
    },
  }
}

export function normalizeFixtureLayer1(layer1: E2eFixtureLayer1): E2eFixtureLayer1 {
  const facesRaw = layer1.facesRaw.map(normalizeLayer1Face)
  return {
    facesRaw,
    allSegmentsRaw: facesRaw.flatMap((f) => f.segments),
    allJunctionsRaw: facesRaw.flatMap((f) => f.junctions),
    totalSegmentsRaw: facesRaw.reduce((n, f) => n + f.segments.length, 0),
    totalJunctionsRaw: facesRaw.reduce((n, f) => n + f.junctions.length, 0),
    ...(layer1.faceDebug
      ? { faceDebug: layer1.faceDebug.map((f) => ({ ...f, bbox: { ...f.bbox } })) }
      : {}),
  }
}

/** Bouw layer1 uit de PipelineV3Debug layer-1 entry (faces + flat lists). */
export function layer1FromPipelineDebug(params: {
  faces: PipelineLayer1FaceDebug[]
  segments: SegmentCandidate[]
  junctions: RoomWallJunctionDebug[]
}): E2eFixtureLayer1 {
  const rebuilt = rebuildLayer1FromFaceDebug(params)
  return normalizeFixtureLayer1({
    facesRaw: rebuilt.facesRaw,
    allSegmentsRaw: rebuilt.allSegmentsRaw,
    allJunctionsRaw: rebuilt.allJunctionsRaw,
    totalSegmentsRaw: rebuilt.totalSegmentsRaw,
    totalJunctionsRaw: rebuilt.totalJunctionsRaw,
    faceDebug: params.faces,
  })
}

export function computeFixtureChecksum(params: {
  maskRuns: number[]
  labelsRleBase64: string
  rawLabelsRleBase64: string
}): string {
  const maskBytes = Int32Array.from(params.maskRuns)
  return fnv1aHex([
    new Uint8Array(maskBytes.buffer, maskBytes.byteOffset, maskBytes.byteLength),
    base64ToBytes(params.labelsRleBase64),
    base64ToBytes(params.rawLabelsRleBase64),
  ])
}

function encodeRaster(data: Int32Array, width: number, height: number): EncodedInt32Raster {
  return {
    width,
    height,
    rleBase64: encodeInt32Rle(data, width, height),
  }
}

/** Pure builder: state → serialiseerbaar fixture.json-object. */
export function buildE2eFixture(input: E2eFixtureBuildInput): E2eFixture {
  if (input.maskRle.width !== input.width || input.maskRle.height !== input.height) {
    throw new Error(
      `maskRle size ${input.maskRle.width}×${input.maskRle.height} ≠ ${input.width}×${input.height}`,
    )
  }
  if (input.labelsData.length !== input.width * input.height) {
    throw new Error(`labelsData length ${input.labelsData.length} ≠ ${input.width * input.height}`)
  }
  if (input.rawLabelsData.length !== input.width * input.height) {
    throw new Error(
      `rawLabelsData length ${input.rawLabelsData.length} ≠ ${input.width * input.height}`,
    )
  }
  if (!(input.pxPerMmX > 0) || !(input.pxPerMmY > 0)) {
    throw new Error('pxPerMmX/Y must be > 0')
  }
  if (!(input.referenceWallThicknessPx > 0)) {
    throw new Error('referenceWallThicknessPx must be > 0')
  }

  const layer1 = normalizeFixtureLayer1(input.layer1)
  const labelsRle = encodeRaster(input.labelsData, input.width, input.height)
  const rawLabelsRle = encodeRaster(input.rawLabelsData, input.width, input.height)
  const checksum = computeFixtureChecksum({
    maskRuns: input.maskRle.runs,
    labelsRleBase64: labelsRle.rleBase64,
    rawLabelsRleBase64: rawLabelsRle.rleBase64,
  })

  return {
    version: 1,
    slug: input.slug,
    width: input.width,
    height: input.height,
    pxPerMmX: input.pxPerMmX,
    pxPerMmY: input.pxPerMmY,
    referenceWallThicknessPx: input.referenceWallThicknessPx,
    maskRle: {
      width: input.maskRle.width,
      height: input.maskRle.height,
      runs: [...input.maskRle.runs],
    },
    layer1,
    labelsRle,
    rawLabelsRle,
    parentMap: input.parentMap.map(([a, b]) => [a, b]),
    classificationByLabel: input.classificationByLabel.map(([a, b]) => [a, b]),
    // clonePlain: Vue reactive proxies falen op structuredClone
    resolvedDoors: clonePlain(input.resolvedDoors),
    stage4ResolvedWindows: clonePlain(input.stage4ResolvedWindows),
    fml: clonePlain(input.fml),
    checksum,
  }
}

export function slugFromImageName(imageName: string | null | undefined): string {
  const base = (imageName ?? 'fixture')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'fixture'
}
