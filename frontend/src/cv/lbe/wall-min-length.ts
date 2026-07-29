import type { WallRenderStyle } from '@/core/extraction/geometric-signature'

/** Vaste min-lengte per muurstijl — onafhankelijk van selectievak-grootte. */
export function wallMinLengthPxForRenderStyle(style: WallRenderStyle): number {
  if (style === 'details') return 20
  return 5
}
