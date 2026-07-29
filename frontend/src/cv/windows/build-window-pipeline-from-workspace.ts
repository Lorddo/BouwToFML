import type { PreprocessConfig } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import { analyzeOpeningRef } from '@/cv/refs/opening-ref-analyze'
import { grayMatFromBwBytes } from '@/cv/refs/ref-crop-bw'
import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { analyzeWindowAxelRef } from './window-axel-ref'
import {
  resolveWindowMinSpanPxByOrientation,
  runWindowStagePipeline,
  type RunWindowStagePipelineResult,
} from './run-window-stage-pipeline'
import type { WindowAxelRefBand } from './types'

export type WindowRefRect = { x: number; y: number; width: number; height: number }

/** Stap-2 raam-rects → axel REF-bands (gedeeld door UI refresh + face-report export). */
export async function collectWindowAxelRefBands(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement
  windowRects: WindowRefRect[]
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  /** Canonieke bron na bake (gebakken inkt); anders rebuild per opening. */
  baseBw?: { data: Uint8Array; width: number; height: number } | null
}): Promise<WindowAxelRefBand[]> {
  const sharedWallBwMat = params.baseBw
    ? grayMatFromBwBytes(params.cv, params.baseBw.data, params.baseBw.width, params.baseBw.height)
    : undefined
  try {
    const refBands: WindowAxelRefBand[] = []
    for (let i = 0; i < params.windowRects.length; i += 1) {
      const rect = params.windowRects[i]
      const profile = await analyzeOpeningRef({
        cv: params.cv,
        image: params.image,
        rect,
        kind: 'window',
        preprocess: params.preprocess,
        eraserMask: params.eraserMask,
        sharedWallBwMat,
      })
      const band = analyzeWindowAxelRef({
        refIndex: i,
        profile,
      })
      if (!band) continue
      refBands.push(band)
    }
    return refBands
  } finally {
    sharedWallBwMat?.delete()
  }
}

/** Dual + REF-bands → Stage 1–4 (min-span uit ppm). */
export function runWindowStagePipelineWithBands(params: {
  dual: FaceDualSpace
  refBands: WindowAxelRefBand[]
  windowRects: WindowRefRect[]
  ppm: { x: number; y: number }
  doorArcFaceIds: ReadonlySet<number>
  wallThicknessPx: number
}): RunWindowStagePipelineResult {
  return runWindowStagePipeline({
    dual: params.dual,
    refBands: params.refBands,
    minSpanPxByOrientation: resolveWindowMinSpanPxByOrientation(params.ppm),
    refRects: params.windowRects.map((rect, refIndex) => ({
      refIndex,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    })),
    doorArcFaceIds: params.doorArcFaceIds,
    wallThicknessPx: params.wallThicknessPx,
    pxPerMmX: params.ppm.x,
    pxPerMmY: params.ppm.y,
  })
}
