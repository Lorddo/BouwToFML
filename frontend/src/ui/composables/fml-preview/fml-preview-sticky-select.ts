/** Huidige FML-selectie blijft binnen één soort tot de gebruiker leeg/area klikt. */

export type FmlStickySelectKind = 'wall' | 'opening' | 'item' | 'annotation' | 'area'

export function resolveFmlStickySelectKind(state: {
  hasWall: boolean
  hasJunction: boolean
  hasOpening: boolean
  hasItem: boolean
  hasAnnotation: boolean
  hasArea: boolean
}): FmlStickySelectKind | null {
  if (state.hasWall || state.hasJunction) return 'wall'
  if (state.hasOpening) return 'opening'
  if (state.hasItem) return 'item'
  if (state.hasAnnotation) return 'annotation'
  if (state.hasArea) return 'area'
  return null
}

/** False = deze hit negeren; leeg/area blijft de enige manier om van soort te wisselen. */
export function allowsFmlStickyHit(
  sticky: FmlStickySelectKind | null,
  hit: FmlStickySelectKind,
): boolean {
  return sticky == null || sticky === hit
}
