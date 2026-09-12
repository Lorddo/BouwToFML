/** Huidige selectie blijft binnen één soort tot leeg klikken — behalve ruimte (niet sticky). */

export type FmlStickySelectKind = 'wall' | 'opening' | 'item' | 'annotation' | 'area' | 'dimension'

export function resolveFmlStickySelectKind(state: {
  hasWall: boolean
  hasJunction: boolean
  hasOpening: boolean
  hasItem: boolean
  hasAnnotation: boolean
  hasDimension?: boolean
}): FmlStickySelectKind | null {
  if (state.hasWall || state.hasJunction) return 'wall'
  if (state.hasOpening) return 'opening'
  if (state.hasItem) return 'item'
  if (state.hasAnnotation) return 'annotation'
  if (state.hasDimension) return 'dimension'
  return null
}

/**
 * False = deze hit negeren.
 * Ruimte is geen lock: deur/raam/muur mogen erdoorheen (hit-test heeft al prioriteit).
 * Muur ↔ opening blijft plakkerig (16 px-halo overlap).
 */
export function allowsFmlStickyHit(
  sticky: FmlStickySelectKind | null,
  hit: FmlStickySelectKind,
): boolean {
  if (sticky == null || sticky === 'area') return true
  return sticky === hit
}

/**
 * True = muur wint van ruimte/dakvlak onder de pointer.
 * Klik op de ruimtenaam blijft bij de ruimte.
 */
export function wallPreemptsAreaHit(wallId: string | null, nameHit: boolean): boolean {
  return wallId != null && !nameHit
}
