import type { OpenCV } from '../loadOpenCV'
import { detectLineSegments } from './lineDetect'

export type { BaselineResult } from './lineDetect'

/**
 * Compat wrapper voor oudere callsites die Hough-only verwachten.
 */
export function detectBaseline(cv: OpenCV, gray: OpenCV['Mat']) {
  return detectLineSegments(cv, gray, 'hough')
}
