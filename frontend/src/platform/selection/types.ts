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
   * Export-dikteband (min/mid/max) voor muur-LBE.
   * Alleen relevant voor `wall`; pipeline schaalt naar max-equivalent.
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
