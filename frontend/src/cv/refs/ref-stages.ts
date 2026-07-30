import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from '@/cv/port/wallGraph'
import type { PreprocessConfig } from '@/core/extraction/types'
import { cropRectToLocalBw, type RefBwMode } from './ref-crop-bw'
import { labelInkComponents, resolveOpeningUnits } from './ref-blob'
import { cropRefByFaces, type RefCropState } from './ref-face-crop'
import { buildFaceProfile } from './ref-face-profile'
import { findInkBounds } from './ref-deskew'
import {
  buildClassifiedProfile,
  classifyRawSegments,
  extractRawInkSegments,
} from './ref-ink-vectors'
import { detectMidlineInk } from './ref-midline-ink'
import { straightenRefLast } from './ref-straighten'
import { detectDoorSwingSector } from './ref-swing-arc'
import type { RefBlobUnit, RefFaceProfile, RefLineProfile, RefRect } from './types'

type RefKind = 'wall' | 'door' | 'window'
type Orientation = 'horizontal' | 'vertical'

export type RefStageArtifacts = {
  kind: RefKind
  bwMode: RefBwMode
  selected: RefCropState
  selectedFaceProfile: RefFaceProfile
  faceCropBBox: { x: number; y: number; width: number; height: number }
  faceCropped: RefCropState
  preStraightOrientation: Orientation
  preStraightRawSegments: Segment[]
  preStraightLineProfile: RefLineProfile
  straightened: RefCropState
  skewCorrectedDeg: number
  finalRawSegments: Segment[]
  finalLineProfile: RefLineProfile
  finalFaceProfile: RefFaceProfile
  finalLabels: Int32Array
  units: RefBlobUnit[]
  primaryBlob: RefBlobUnit | null
}

function resolveDominantOrientation(data: Uint8Array, width: number, height: number): Orientation {
  const bounds = findInkBounds(data, width, height, 0)
  if (!bounds) return width >= height ? 'horizontal' : 'vertical'
  return bounds.width >= bounds.height ? 'horizontal' : 'vertical'
}

function areaInBBox(
  data: Uint8Array,
  width: number,
  height: number,
  bbox: { x: number; y: number; width: number; height: number },
): number {
  let area = 0
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if ((data[y * width + x] ?? 255) < 128) area += 1
    }
  }
  return area
}

function centroidInBBox(
  data: Uint8Array,
  width: number,
  height: number,
  bbox: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  let n = 0
  let sx = 0
  let sy = 0
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if ((data[y * width + x] ?? 255) >= 128) continue
      sx += x
      sy += y
      n += 1
    }
  }
  if (n <= 0) return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
  return { x: sx / n, y: sy / n }
}

function buildComponentUnit(data: Uint8Array, width: number, height: number): RefBlobUnit {
  const bbox = findInkBounds(data, width, height, 0) ?? { x: 0, y: 0, width, height }
  return {
    index: 0,
    areaPx: areaInBBox(data, width, height, bbox),
    bbox,
    centroid: centroidInBBox(data, width, height, bbox),
    isPrimary: true,
    source: 'component',
    includesBothHeads: false,
  }
}

function selectStageInput(params: { data: Uint8Array; width: number; height: number }): {
  data: Uint8Array
} {
  return { data: params.data }
}

export async function runRefStages(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement
  rect: RefRect
  kind: RefKind
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  sharedWallBwMat?: OpenCV['Mat']
}): Promise<RefStageArtifacts> {
  const crop = cropRectToLocalBw({
    cv: params.cv,
    image: params.image,
    rect: params.rect,
    preprocess: params.preprocess,
    eraserMask: params.eraserMask,
    sharedWallBwMat: params.sharedWallBwMat,
    axisAlign: false,
  })

  try {
    const selectedBlob = selectStageInput({
      data: crop.bwData,
      width: crop.width,
      height: crop.height,
    })
    const selectedState: RefCropState = {
      bwData: selectedBlob.data,
      width: crop.width,
      height: crop.height,
      originalCanvas: crop.originalCanvas,
    }
    const selectedFaceProfile = buildFaceProfile(
      selectedState.bwData,
      selectedState.width,
      selectedState.height,
      undefined,
      params.kind === 'wall' ? { sealBorders: true } : undefined,
    )

    let protectedInkMask: Uint8Array | undefined
    if (params.kind === 'door') {
      const fullBbox = { x: 0, y: 0, width: selectedState.width, height: selectedState.height }
      const hasSwingArc = detectDoorSwingSector({
        data: selectedState.bwData,
        width: selectedState.width,
        height: selectedState.height,
        bbox: fullBbox,
      })
      if (!hasSwingArc) {
        const midline = detectMidlineInk({
          data: selectedState.bwData,
          width: selectedState.width,
          height: selectedState.height,
          bbox: fullBbox,
          orientation: resolveDominantOrientation(
            selectedState.bwData,
            selectedState.width,
            selectedState.height,
          ),
        })
        if (midline.hasMidline) protectedInkMask = midline.mask
      }
    }

    const faceCrop = cropRefByFaces({
      kind: params.kind,
      state: selectedState,
      faceProfile: selectedFaceProfile,
      padPx: params.kind === 'wall' ? 1 : 2,
      protectedInkMask,
    })

    const preOrientation = resolveDominantOrientation(
      faceCrop.state.bwData,
      faceCrop.state.width,
      faceCrop.state.height,
    )
    const preRawSegments = extractRawInkSegments({
      cv: params.cv,
      bwData: faceCrop.state.bwData,
      width: faceCrop.state.width,
      height: faceCrop.state.height,
    })
    const preLines = classifyRawSegments({
      segments: preRawSegments,
      orientation: preOrientation,
      minLengthPx: 3,
    })
    const preLineProfile = buildClassifiedProfile({
      lines: preLines,
      orientation: preOrientation,
    })

    const straightened = straightenRefLast({
      cv: params.cv,
      kind: params.kind,
      bwData: faceCrop.state.bwData,
      width: faceCrop.state.width,
      height: faceCrop.state.height,
      originalCanvas: faceCrop.state.originalCanvas,
      lines: preLineProfile.lines,
      orientation: preOrientation,
    })

    const finalRawSegments = extractRawInkSegments({
      cv: params.cv,
      bwData: straightened.bwData,
      width: straightened.width,
      height: straightened.height,
    })
    const finalLines = classifyRawSegments({
      segments: finalRawSegments,
      orientation: 'horizontal',
      minLengthPx: 3,
    })
    const finalLineProfile = buildClassifiedProfile({
      lines: finalLines,
      orientation: 'horizontal',
    })
    const finalFaceProfile = buildFaceProfile(
      straightened.bwData,
      straightened.width,
      straightened.height,
      undefined,
      params.kind === 'wall' ? { minAreaPx: 4, sealBorders: true } : { minAreaPx: 1 },
    )
    const finalLabels = labelInkComponents(
      straightened.bwData,
      straightened.width,
      straightened.height,
    ).labels

    // ESC:REF-05 (E)
    const unitsResolved =
      params.kind === 'wall'
        ? null
        : resolveOpeningUnits({
            data: straightened.bwData,
            width: straightened.width,
            height: straightened.height,
            singleUnit: params.kind === 'window',
          })
    const units = unitsResolved?.units.length
      ? unitsResolved.units
      : [buildComponentUnit(straightened.bwData, straightened.width, straightened.height)]
    const primaryBlob =
      unitsResolved?.primary ?? units.find((unit) => unit.isPrimary) ?? units[0] ?? null

    return {
      kind: params.kind,
      bwMode: crop.bwMode,
      selected: selectedState,
      selectedFaceProfile,
      faceCropBBox: faceCrop.cropBBox,
      faceCropped: faceCrop.state,
      preStraightOrientation: preOrientation,
      preStraightRawSegments: preRawSegments,
      preStraightLineProfile: preLineProfile,
      straightened: {
        bwData: straightened.bwData,
        width: straightened.width,
        height: straightened.height,
        originalCanvas: straightened.originalCanvas,
      },
      skewCorrectedDeg: straightened.totalCorrectionDeg,
      finalRawSegments,
      finalLineProfile,
      finalFaceProfile,
      finalLabels,
      units,
      primaryBlob,
    }
  } finally {
    crop.bwMat.delete()
  }
}
