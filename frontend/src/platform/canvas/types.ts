import type { ElementClass } from '@/core/extraction/types'

export interface OverlayRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DetectionOverlay extends OverlayRect {
  kind: ElementClass
  confidence?: number
}

export interface OcrTextOverlay extends OverlayRect {
  text: string
  confidence: number
  /** Stabiele sleutel voor handmatige verwijdering (sidebar / shift-klik). */
  key: string
}

export interface GapOverlay extends OverlayRect {
  color?: string
}

export interface SegmentOverlay {
  a: { x: number; y: number }
  b: { x: number; y: number }
  color?: string
  dashed?: boolean
}

export type JunctionOverlayKind = 'I' | 'L' | 'T' | 'X'

export interface JunctionOverlay {
  x: number
  y: number
  kind: JunctionOverlayKind
}

export interface WallMatchOverlay extends OverlayRect {
  color: string
  /** OpenCV-detectie = gestreept; LBE = effen (via aparte laag). */
  dashed?: boolean
}
