import type { WallRenderStyle } from '@/core/extraction/geometric-signature'
import type { WallRenderStyleInference } from '@/cv/lbe/infer-wall-render-style'
import type { GapsInkMode } from '@/cv/gaps'

/** Inclusief buiten-faces: ≤5 = solid, >5 = details (arcering). */
const WALL_SOLID_MAX_FACE_COUNT = 5

export function classifyWallRenderStyleFromFaceCount(
  faceCount: number,
): WallRenderStyleInference {
  const solid = faceCount <= WALL_SOLID_MAX_FACE_COUNT
  const renderStyle: WallRenderStyle = solid ? 'solid' : 'details'
  const confidence = solid
    ? faceCount <= 0
      ? 0.5
      : Math.min(0.95, 0.7 + (WALL_SOLID_MAX_FACE_COUNT - faceCount) * 0.05)
    : Math.min(0.95, 0.7 + (faceCount - WALL_SOLID_MAX_FACE_COUNT) * 0.03)
  return {
    renderStyle,
    confidence,
    scores: {
      solid: solid ? confidence : Math.max(0.05, 1 - confidence),
      parallel_lines: 0.05,
      details: solid ? Math.max(0.05, 1 - confidence) : confidence,
    },
  }
}

export function wallRenderStyleToGapsInkMode(style: WallRenderStyle): GapsInkMode {
  return style === 'details' ? 'detail' : 'solid'
}
