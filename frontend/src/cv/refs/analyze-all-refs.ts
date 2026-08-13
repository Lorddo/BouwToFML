import type { OpenCV } from '@/cv/loadOpenCV'
import type { PreprocessConfig } from '@/core/extraction/types'
import { buildWallLayerBwMat, grayMatFromBwBytes } from './ref-crop-bw'
import { analyzeOpeningRef } from './opening-ref-analyze'
import { analyzeWallRef } from './wall-ref-analyze'
import type { OpeningRefProfile, ReferenceAnalysisReport, RefRect, WallRefProfile } from './types'

export type AnalyzeRefsInputRect = RefRect & {
  type: 'wall' | 'door' | 'window'
  wallThicknessBand?: 'min' | 'mid' | 'max'
}

function pickPrimaryWall(walls: WallRefProfile[]): WallRefProfile | null {
  if (walls.length === 0) return null
  const maxTagged = [...walls].reverse().find((w) => w.wallThicknessBand === 'max')
  return maxTagged ?? walls[walls.length - 1]
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
  const wallRects = params.rects.filter((r) => r.type === 'wall')
  const openingRects = params.rects.filter((r) => r.type === 'door' || r.type === 'window')

  const sharedWallBwMat = params.baseBw
    ? grayMatFromBwBytes(params.cv, params.baseBw.data, params.baseBw.width, params.baseBw.height)
    : buildWallLayerBwMat({
        cv: params.cv,
        image: params.image,
        preprocess: params.preprocess,
        eraserMask: params.eraserMask,
      })
  try {
    const walls: WallRefProfile[] = []
    for (const wallRect of wallRects) {
      const profile = await analyzeWallRef({
        cv: params.cv,
        image: params.image,
        rect: wallRect,
        preprocess: params.preprocess,
        eraserMask: params.eraserMask,
        sharedWallBwMat,
      })
      walls.push(
        wallRect.wallThicknessBand
          ? { ...profile, wallThicknessBand: wallRect.wallThicknessBand }
          : profile,
      )
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
      wall: pickPrimaryWall(walls),
      walls,
      openings,
    }
  } finally {
    sharedWallBwMat.delete()
  }
}
