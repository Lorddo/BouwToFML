/**
 * Shared constants for L10/FML semantic wall conversion.
 * Values must stay identical across merge, semantic build, and extractionToPlan.
 */

/** Snap radius (px) when rebuilding junction graph from FML source / semantic segments. */
export const SEMANTIC_JUNCTION_EPS_PX = 8

/** Placeholder confidence on segments derived from the semantic graph (no detector score). */
export const SEMANTIC_SEGMENT_CONFIDENCE = 0.9
