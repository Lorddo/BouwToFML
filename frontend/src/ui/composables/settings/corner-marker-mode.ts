/** Hoekmarkers: uit, alleen exacte 90° (elke oriëntatie), of alleen niet-haakse binnenhoeken. */
export type CornerMarkerMode = 'off' | 'square' | 'skew'

export const CORNER_MARKER_MODES: readonly CornerMarkerMode[] = ['off', 'square', 'skew'] as const

/** Klantvoorkeur: waarschuwing op hoeken die niet exact 90° zijn. */
export const DEFAULT_CORNER_MARKER_MODE: CornerMarkerMode = 'skew'

export function normalizeCornerMarkerMode(raw: unknown): CornerMarkerMode {
  return raw === 'off' || raw === 'square' || raw === 'skew' ? raw : DEFAULT_CORNER_MARKER_MODE
}
