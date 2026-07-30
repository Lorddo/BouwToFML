import type { GeomPrefer, SpacePrefer } from '@/cv/walls/rooms/face-dual-space'

/**
 * Dual-space preferenties voor deur-detectie (stap 3) + REF-build (stap 2).
 * Floor: FaceDualSpace; refs: RefFaceDualSpace — zelfde GeomPrefer-semantiek.
 *
 * Stage-1 cluster-brug = ink: opening-wit CC’s raken elkaar niet (inkt ertussen);
 * clustering loopt wit–inkt–wit via wall-ink adjacency (zelfde idee als ramen).
 */
export const DOOR_SPACE_POLICY = {
  // ESC:D-01 (C)
  /** Stage 1 seed/maat (bbox/area/aspect) */
  stage1Measure: 'white' as const satisfies GeomPrefer,
  // ESC:D-02 (C)
  /** Stage 1 clustering adjacency (ink-brug; niet white-direct) */
  stage1ClusterBridge: 'ink' as const,
  // ESC:D-03 (C)
  /**
   * Wall-rescue merge/extract: post-ink wall-components in de pipe-merge.
   * Match zelf: zie `wallRescueMatchSpaces` (Either ink|white).
   */
  wallRescueMeasure: 'ink' as const satisfies GeomPrefer,
  // ESC:D-04 (C)
  /**
   * Wall-rescue Stage-1 match: probeer ink én white; accept als één past.
   * Volgorde = preferentie bij beide OK (ink eerst → regressie-stabiel).
   */
  wallRescueMatchSpaces: ['ink', 'white'] as const satisfies readonly SpacePrefer[],
  // ESC:D-05 (C)
  /** Wall-fill kandidaten area/bbox */
  wallFillMeasure: 'ink' as const satisfies GeomPrefer,
  // ESC:D-06 (C)
  /** Room/wall-surround: ink-adjacency (geen white/rays) */
  surroundLabels: 'ink' as const,
  // ESC:D-06 (C)
  /** Wall-touch gate: ink-adjacency (ná surround + angle-rescue) */
  wallTouchLabels: 'ink' as const,
  // ESC:D-06 (C)
  /** Bridge “tussen twee muren” labels */
  bridgeBetweenWalls: 'ink' as const,
  /** Resolve centroid / face paint (hinge pas in L12 op white) */
  resolvePaint: 'ink' as const,
  /** Overlay paint labels */
  overlayPaint: 'ink' as const,
  // ESC:D-07 (C)
  /** REF swing-sector face */
  refSwingMeasure: 'white' as const satisfies GeomPrefer,
  // ESC:D-07 (C)
  /** REF framing / blade sizing */
  refFramingMeasure: 'ink' as const satisfies GeomPrefer,
  // ESC:D-08 (C)
  /**
   * Stage-2 angle-rescue: height-gate Either ink|white; hinge/hoek altijd op
   * white wanneer beschikbaar (ink-fallback alleen zonder white-geom).
   */
  angleRescueMeasurePrefer: 'white' as const satisfies SpacePrefer,
} as const

export type DoorSpacePolicy = typeof DOOR_SPACE_POLICY
