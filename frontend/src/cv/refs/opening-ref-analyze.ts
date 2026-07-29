import type { OpenCV } from '@/cv/loadOpenCV'
import type { PreprocessConfig } from '@/core/extraction/types'
import { runOpeningRefPipeline } from './ref-pipeline'
import type { OpeningRefProfile, RefRect } from './types'

export async function analyzeOpeningRef(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement
  rect: RefRect
  kind: 'door' | 'window'
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  sharedWallBwMat?: OpenCV['Mat']
}): Promise<OpeningRefProfile> {
  return runOpeningRefPipeline(params)
}
