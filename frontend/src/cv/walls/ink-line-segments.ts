import type { OpenCV } from '@/cv/loadOpenCV'
import { simplifyRawInkSegments } from '@/cv/port/lineDetect'
import { traceRawInkVectors } from '@/cv/port/rawInkVectors'
import type { Segment } from '@/cv/port/wallGraph'

export interface InkLineSegments {
  rawInk: Segment[]
  simplifiedInk: Segment[]
}

/**
 * Zet B/W inkt om naar vereenvoudigde as-gealigneerde lijnsegmenten.
 * Deze helper is de gedeelde bron voor line-first en preprocess vector-cache.
 */
export function extractInkLineSegments(cv: OpenCV, mat: OpenCV['Mat']): InkLineSegments {
  const rawInk = traceRawInkVectors(cv, mat)
  const simplifiedInk = simplifyRawInkSegments(mat, rawInk)
  return { rawInk, simplifiedInk }
}
