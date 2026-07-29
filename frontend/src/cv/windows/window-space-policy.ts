import type { GeomPrefer } from '@/cv/walls/rooms/face-dual-space'

/**
 * Dual-space preferenties voor raam-detectie (stap 3) + REF-build (stap 2).
 * Floor: FaceDualSpace; refs: RefFaceDualSpace — zelfde GeomPrefer-semantiek.
 */
export const WINDOW_SPACE_POLICY = {
  /** Stage 1 strip-hoogte / span / score */
  stage1Measure: 'white' as const satisfies GeomPrefer,
  /** Stage 1 clustering wit–inkt–wit */
  stage1ClusterBridge: 'ink' as const,
  /** Stage 2 deurboog / doorframe adjacency */
  stage2DoorArc: 'ink' as const,
  /** Stage 3 strip_stack leden */
  stage3StackMembers: 'white' as const,
  /** Stage 3 strip_stack bruggen */
  stage3StackBridge: 'ink' as const,
  /** Stage 3 framing: OR white-pad of ink-pad (bewust) */
  stage3Framing: 'either' as const,
  /** Stage 4 glas-bbox */
  stage4GlassBBox: 'whiteThenInk' as const satisfies GeomPrefer,
  /** Stage 4 kozijn/evidence-bbox */
  stage4FrameBBox: 'inkThenWhite' as const satisfies GeomPrefer,
  /** Overlay paint labels */
  overlayPaint: 'ink' as const,
  /** REF strip / targetStripHeight */
  refStripMeasure: 'white' as const satisfies GeomPrefer,
  /**
   * REF framing / kozijn ranges = ink.
   * Rails: presence + `*HeightPx` = white buiten as-band (top/bottom onafhankelijk);
   * `*HeightInkPx` / rail ranges = ink wanneer dual (per kant).
   */
  refFramingMeasure: 'ink' as const satisfies GeomPrefer,
} as const
