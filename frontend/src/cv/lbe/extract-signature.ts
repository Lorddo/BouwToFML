import type { ExampleSample } from '@/core/extraction'

import type {

  DoorSignature,

  GeometricSignature,

  WallSignature,

  WindowSignature,

} from '@/core/extraction/geometric-signature'

import { bboxOrientation, measureInkBandInBox, measureInkBBoxInBox, measureParallelSpacingInBox } from '@/cv/port/wallKernel'

import {

  inferWallRenderStyle,

  type InferWallRenderStyleOptions,

} from './infer-wall-render-style'
import { wallMinLengthPxForRenderStyle } from './wall-min-length'



type CvMat = { cols: number; rows: number; ucharPtr: (y: number, x: number) => Uint8Array }



export interface ExtractSignatureOptions extends InferWallRenderStyleOptions {
  expectDoorArc?: boolean
}



function clampRange(center: number, spread = 0.15): { min: number; max: number } {

  const min = Math.max(1, Math.round(center * (1 - spread)))

  const max = Math.max(min + 1, Math.round(center * (1 + spread)))

  return { min, max }

}



function wallStyleFields(
  renderStyle: WallSignature['renderStyle'],
  thicknessPx: number,
  measuredSpacing: number | null,
  parallelLineCount?: number,
): Pick<WallSignature, 'parallelLineCount' | 'parallelSpacingPx' | 'closeKernelPx'> {
  return {
    parallelLineCount:
      renderStyle === 'parallel_lines'
        ? Math.max(2, parallelLineCount ?? 2)
        : undefined,
    parallelSpacingPx:
      renderStyle === 'parallel_lines'
        ? Math.max(thicknessPx, measuredSpacing ?? Math.round(thicknessPx * 1.2))
        : undefined,
    closeKernelPx: renderStyle === 'details' ? Math.max(3, thicknessPx) : undefined,
  }
}

/** Strip velden die niet bij renderStyle horen (voorkomt Hough-ruis op solid exports). */
export function finalizeWallSignature(wall: WallSignature): WallSignature {
  const base: WallSignature = {
    renderStyle: wall.renderStyle,
    renderStyleSource: wall.renderStyleSource,
    renderStyleConfidence: wall.renderStyleConfidence,
    thicknessPx: wall.thicknessPx,
    angleToleranceDeg: wall.angleToleranceDeg,
    minLengthPx: wall.minLengthPx,
    rejectDiagonalHatch: wall.renderStyle === 'details',
  }
  if (wall.renderStyle === 'parallel_lines') {
    return {
      ...base,
      parallelLineCount: wall.parallelLineCount,
      parallelSpacingPx: wall.parallelSpacingPx,
      lineFingerprint: wall.lineFingerprint,
    }
  }
  if (wall.renderStyle === 'details') {
    return { ...base, closeKernelPx: wall.closeKernelPx }
  }
  return base
}



function makeWallSignature(

  mat: CvMat,

  sample: ExampleSample,

  options?: ExtractSignatureOptions,

): WallSignature {

  const orientation = bboxOrientation(sample)

  const band = measureInkBandInBox(mat, sample.bbox, orientation)

  const thicknessPx = Math.max(3, Math.round(band?.thicknessPx ?? 14))

  const measuredSpacing = measureParallelSpacingInBox(mat, sample.bbox, orientation)

  const inferred = inferWallRenderStyle(mat, sample, options)



  return finalizeWallSignature({

    renderStyle: inferred.renderStyle,

    renderStyleSource: 'auto',

    renderStyleConfidence: inferred.confidence,

    thicknessPx,

    ...wallStyleFields(inferred.renderStyle, thicknessPx, measuredSpacing, inferred.parallelLineCount),

    angleToleranceDeg: 12,

    minLengthPx: wallMinLengthPxForRenderStyle(inferred.renderStyle),

    rejectDiagonalHatch: inferred.renderStyle === 'details',

  })

}



function mergeWallSignaturePreservingManualStyle(

  fresh: WallSignature,

  existing?: WallSignature,

): WallSignature {

  if (!existing || existing.renderStyleSource !== 'manual') return finalizeWallSignature(fresh)



  const renderStyle = existing.renderStyle

  return finalizeWallSignature({

    ...fresh,

    renderStyle,

    renderStyleSource: 'manual',

    renderStyleConfidence: existing.renderStyleConfidence,

    parallelLineCount:
      renderStyle === 'parallel_lines'
        ? fresh.parallelLineCount ?? existing.parallelLineCount
        : undefined,
    parallelSpacingPx:
      renderStyle === 'parallel_lines'
        ? fresh.parallelSpacingPx ?? existing.parallelSpacingPx
        : undefined,
    closeKernelPx:
      renderStyle === 'details' ? fresh.closeKernelPx ?? existing.closeKernelPx : undefined,
    minLengthPx: wallMinLengthPxForRenderStyle(renderStyle),

    lineFingerprint:
      renderStyle === 'parallel_lines'
        ? fresh.lineFingerprint ?? existing.lineFingerprint
        : undefined,

  })

}



function clampToImage(mat: CvMat, sample: ExampleSample) {

  const x = Math.max(0, Math.floor(sample.bbox.x))

  const y = Math.max(0, Math.floor(sample.bbox.y))

  const width = Math.max(1, Math.min(mat.cols - x, Math.ceil(sample.bbox.width)))

  const height = Math.max(1, Math.min(mat.rows - y, Math.ceil(sample.bbox.height)))

  return { x, y, width, height }

}



function measureLongestLightGapPx(mat: CvMat, sample: ExampleSample): number {

  const box = clampToImage(mat, sample)

  const horizontal = box.width >= box.height

  const scanCount = 7

  const gaps: number[] = []

  if (horizontal) {

    const yStart = box.y + Math.floor(box.height * 0.15)

    const yEnd = box.y + box.height - Math.floor(box.height * 0.15)

    for (let i = 0; i < scanCount; i += 1) {

      const y = Math.round(yStart + ((yEnd - yStart) * i) / Math.max(1, scanCount - 1))

      let run = 0

      let best = 0

      for (let x = box.x; x < box.x + box.width; x += 1) {

        const light = mat.ucharPtr(y, x)[0] >= 240

        run = light ? run + 1 : 0

        if (run > best) best = run

      }

      gaps.push(best)

    }

  } else {

    const xStart = box.x + Math.floor(box.width * 0.15)

    const xEnd = box.x + box.width - Math.floor(box.width * 0.15)

    for (let i = 0; i < scanCount; i += 1) {

      const x = Math.round(xStart + ((xEnd - xStart) * i) / Math.max(1, scanCount - 1))

      let run = 0

      let best = 0

      for (let y = box.y; y < box.y + box.height; y += 1) {

        const light = mat.ucharPtr(y, x)[0] >= 240

        run = light ? run + 1 : 0

        if (run > best) best = run

      }

      gaps.push(best)

    }

  }

  if (gaps.length === 0) return Math.max(6, Math.round(Math.max(box.width, box.height)))

  const sorted = gaps.sort((a, b) => a - b)

  return Math.max(6, Math.round(sorted[Math.floor((sorted.length - 1) / 2)]))

}



function makeDoorSignature(
  mat: CvMat,
  sample: ExampleSample,
): DoorSignature {

  const ink = measureInkBBoxInBox(mat, sample.bbox) ?? sample.bbox

  const openingWidth = Math.max(

    6,

    Math.round(Math.max(measureLongestLightGapPx(mat, sample), Math.max(ink.width, ink.height) * 0.7)),

  )

  const symbolDepthPx = Math.max(6, Math.round(Math.min(ink.width, ink.height)))

  const hasArc = false

  return {

    openingWidthPx: clampRange(openingWidth),

    hasArc,

    symbolDepthPx,

    allowedRotationsDeg: [0, 90, 180, 270],

  }

}



function makeWindowSignature(mat: CvMat, sample: ExampleSample): WindowSignature {

  const ink = measureInkBBoxInBox(mat, sample.bbox) ?? sample.bbox

  const openingWidth = Math.max(

    6,

    Math.round(Math.max(measureLongestLightGapPx(mat, sample), Math.max(ink.width, ink.height) * 0.7)),

  )

  const symbolDepthPx = Math.max(4, Math.round(Math.min(ink.width, ink.height)))

  return {

    insideWall: true,

    openingWidthPx: clampRange(openingWidth),

    symbolDepthPx,

  }

}



function extractGeometricSignature(

  mat: CvMat,

  sample: ExampleSample,

  options?: ExtractSignatureOptions,

): GeometricSignature | null {

  if (sample.type !== 'wall' && sample.type !== 'door' && sample.type !== 'window') {

    return null

  }



  const base = {

    id: `${sample.type}-sig-${sample.id}`,

    type: sample.type,

    sourceExampleId: sample.id,

  } as const



  if (sample.type === 'wall') {

    return { ...base, wall: makeWallSignature(mat, sample, options) }

  }

  if (sample.type === 'door') {

    return { ...base, door: makeDoorSignature(mat, sample) }

  }

  return { ...base, window: makeWindowSignature(mat, sample) }

}



export function extractSignaturesFromExamples(

  mat: CvMat,

  examples: ExampleSample[],

  options?: ExtractSignatureOptions,

): GeometricSignature[] {

  return examples

    .map((sample) => {

      if (sample.type !== 'wall') {

        return sample.signature ?? extractGeometricSignature(mat, sample, options)

      }



      const fresh = extractGeometricSignature(mat, sample, options)

      if (!fresh?.wall) return fresh



      return {

        ...fresh,

        wall: mergeWallSignaturePreservingManualStyle(fresh.wall, sample.signature?.wall),

      }

    })

    .filter((sig): sig is GeometricSignature => sig !== null)

}


