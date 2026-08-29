import type { ElementClass } from '@/core/extraction/types'
import type { GeometricSignature } from '@/core/extraction/geometric-signature'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'

export type { ElementClass }

export interface SelectionRect {
  id: string
  type: ElementClass
  x: number
  y: number
  width: number
  height: number
  signature?: GeometricSignature
  /**
   * Floorplanner opening-refid voor FML-export.
   * Alleen relevant voor `door` (standaard/kastdeur); ramen/dubbele deuren algoritmisch.
   */
  fmlRefId?: string
  /**
   * Catalogus-cm voor muur-LBE. Pipeline schaalt px × (maxCm / refCm).
   * Alleen relevant voor `wall`.
   */
  wallThicknessCm?: number
  /**
   * Legacy sessie-tag. Nieuwe rects schrijven hem niet; restore mag hem negeren.
   */
  wallThicknessBand?: FmlThicknessBand
}

export const SELECTION_COLORS: Record<ElementClass, string> = {
  wall: '#2563eb',
  door: '#ea580c',
  window: '#7c3aed',
  stair: '#0891b2',
  column: '#64748b',
  sanitary: '#db2777',
  furniture: '#a16207',
  electrical: '#ca8a04',
}
