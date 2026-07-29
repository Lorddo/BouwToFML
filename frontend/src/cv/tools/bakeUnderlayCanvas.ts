import type { PreprocessConfig } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import { matToCanvas } from '@/cv/port/preprocess'
import { rotateMatExpandBounds } from './rotateMat'
import type { CanvasLike } from '@/cv/port/canvasEnv'

export type UnderlayBakeConfig = Pick<PreprocessConfig, 'rotate180' | 'rotationDeg' | 'autoRotationDeg'>

/** Crop/gum zit al in source; hier 180° + handmatige rotatie (stap 1). */
export function bakeUnderlayCanvas(
  cv: OpenCV,
  source: HTMLCanvasElement,
  config: UnderlayBakeConfig,
): CanvasLike {
  let mat = cv.imread(source)

  if (config.rotate180) {
    const rotated = new cv.Mat()
    cv.rotate(mat, rotated, cv.ROTATE_180)
    mat.delete()
    mat = rotated
  }

  const totalRotation = (config.autoRotationDeg ?? 0) + (config.rotationDeg ?? 0)
  mat = rotateMatExpandBounds(cv, mat, totalRotation)

  const canvas = matToCanvas(cv, mat)
  mat.delete()
  return canvas
}
