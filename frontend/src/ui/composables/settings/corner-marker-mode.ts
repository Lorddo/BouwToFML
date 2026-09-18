/** Hoekmarkers: uit, alleen ~90° (elke oriëntatie, slack 0,005°), of alleen niet-haakse binnenhoeken. */
export type CornerMarkerMode = 'off' | 'square' | 'skew'

export const CORNER_MARKER_MODES: readonly CornerMarkerMode[] = ['off', 'square', 'skew'] as const

/** Klantvoorkeur: waarschuwing op hoeken die meer dan 0,005° van 90° afwijken. */
export const DEFAULT_CORNER_MARKER_MODE: CornerMarkerMode = 'skew'

export function normalizeCornerMarkerMode(raw: unknown): CornerMarkerMode {
  return raw === 'off' || raw === 'square' || raw === 'skew' ? raw : DEFAULT_CORNER_MARKER_MODE
}
