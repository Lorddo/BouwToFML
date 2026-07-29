import type { OpenCV } from '@/cv/loadOpenCV'
import type { PreprocessConfig } from '@/core/extraction/types'
import { buildWallLayerBwMat, grayMatFromBwBytes } from './ref-crop-bw'
import { analyzeOpeningRef } from './opening-ref-analyze'
import { analyzeWallRef } from './wall-ref-analyze'
import type { OpeningRefProfile, ReferenceAnalysisReport, RefRect, WallRefProfile } from './types'

export type AnalyzeRefsInputRect = RefRect & {
  type: 'wall' | 'door' | 'window'
}

export async function analyzeAllReferenceRects(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement
  rects: AnalyzeRefsInputRect[]
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  drawing?: string | null
  /** Canonieke bron na bake (gebakken inkt); anders rebuild vanaf kleur. */
  baseBw?: { data: Uint8Array; width: number; height: number }
}): Promise<ReferenceAnalysisReport> {
  const wallRect = [...params.rects].reverse().find((r) => r.type === 'wall') ?? null
  const openingRects = params.rects.filter((r) => r.type === 'door' || r.type === 'window')

  const sharedWallBwMat = params.baseBw
    ? grayMatFromBwBytes(
        params.cv,
        params.baseBw.data,
        params.baseBw.width,
        params.baseBw.height,
      )
    : buildWallLayerBwMat({
        cv: params.cv,
        image: params.image,
        preprocess: params.preprocess,
        eraserMask: params.eraserMask,
      })
  try {
    let wall: WallRefProfile | null = null
    if (wallRect) {
      wall = await analyzeWallRef({
        cv: params.cv,
        image: params.image,
        rect: wallRect,
        preprocess: params.preprocess,
        eraserMask: params.eraserMask,
        sharedWallBwMat,
      })
    }

    const openings: OpeningRefProfile[] = []
    for (const rect of openingRects) {
      if (rect.type !== 'door' && rect.type !== 'window') continue
      openings.push(
        await analyzeOpeningRef({
          cv: params.cv,
          image: params.image,
          rect,
          kind: rect.type,
          preprocess: params.preprocess,
          eraserMask: params.eraserMask,
          sharedWallBwMat,
        }),
      )
    }

    return {
      exportedAt: new Date().toISOString(),
      drawing: params.drawing ?? null,
      wall,
      openings,
    }
  } finally {
    sharedWallBwMat.delete()
  }
}
