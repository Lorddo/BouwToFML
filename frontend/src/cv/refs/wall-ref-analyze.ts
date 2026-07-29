import type { OpenCV } from '@/cv/loadOpenCV'
import type { PreprocessConfig } from '@/core/extraction/types'
import { runWallRefPipeline } from './ref-pipeline'
import type { RefRect, WallRefProfile } from './types'

export async function analyzeWallRef(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement
  rect: RefRect
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  sharedWallBwMat?: OpenCV['Mat']
}): Promise<WallRefProfile> {
  return runWallRefPipeline(params)
}
