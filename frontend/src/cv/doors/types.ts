import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'

export type DoorResolvedKind = 'single' | 'double_wide' | 'sliding' | 'passage' | 'closet45'

export interface DoorSwingRefBand {
  aspectRef: number
  swingWpx: number
  swingHpx: number
  areaPx: number
  /** Lange as / swingSpan (genormaliseerd bij ref-build). */
  wallRatio?: number
  /** Korte as / swingSpan (genormaliseerd bij ref-build). */
  depthRatio?: number
  /** Filled area / swingSpan² (genormaliseerd bij ref-build). */
  areaSpan2Ratio?: number
  /** Vaste kozijn-opslag in px (links+rechts), additief op kandidaatmaat. */
  framingPx?: number
  /** Referentie boog-span in px uit sector-face (max AABB); zelfde methode als kandidaat. */
  swingSpanPx?: number
  /**
   * Gemeten booghoek tussen openingsas en blad-as op de referentie (graden).
   * Stuurt as-scheiding bij kandidaat-scharnier (30°-kast vs 90°-standaard).
   */
  swingAngleDeg?: number
  /**
   * Schaalfactor van boog-span naar deurblad: bladeRefPx / swingSpanRefPx.
   * Totale kandidaatbreedte = geschaald clear-blad + vaste framingPx (fallback),
   * of clear-(overhang−framing)×scale + vaste framing (overhang-pad).
   */
  ratioBlade?: number
  /** Totale referentiebreedte (kozijn-tot-kozijn) in px. */
  totalRefPx?: number
  /** Referentie deurbladbreedte (totalRefPx - framingPx) in px. */
  bladeRefPx?: number
  /**
   * Afstand boog-scharnier → kozijn-buitenrand in vrije-tip-richting (openingsas).
   * Pivot hoeft niet op het kozijn te liggen. Clear-deel schaalt; framing niet.
   */
  overhangAlongPx?: number
  /**
   * Afstand boog-scharnier → kozijn-buitenrand tegengesteld aan vrije tip.
   * Samen met overhangAlongPx = kozijn-tot-kozijn.
   */
  overhangOppositePx?: number
  /** Clear overhang vrije-tip-kant / swingSpan (framing eruit). */
  clearOverhangAlongRatio?: number
  /** Clear overhang tegenoverliggende kant / swingSpan (framing eruit). */
  clearOverhangOppositeRatio?: number
  /** Vaste kozijnbreedte aan de vrije-tip-kant (px; niet meeschalen met deurmaat). */
  framingAlongPx?: number
  /** Vaste kozijnbreedte aan de tegenoverliggende kant (px; niet meeschalen). */
  framingOppositePx?: number
  /** Door-template (stap 1). */
  fmlRefId?: string
  /** Afgeleid uit template/categorie voor latere FML-keuze. */
  kind?: DoorResolvedKind
}

export interface DoorSwingHypothesis {
  id: string
  faceIds: number[]
  /** Bridge/window kozijn-faces gekoppeld aan deze deur (sticky class doorframe). */
  doorframeFaceIds?: number[]
  unionBBox: { x: number; y: number; width: number; height: number }
  /** Som van de gevulde px van de volledige hypothese (over alle faceIds). */
  filledAreaPx: number
  score: number
  source: 'single' | 'cluster' | 'angle_rescue'
  matchedRefIndex: number
}

export interface DoorSwingFilterStats {
  rootCount: number
  seedCount: number
  singleAccepted: number
  clusterAccepted: number
  skippedOutsideSeedCount: number
  skippedOutOfBandCount: number
}

export type DoorSwingDiagnosticStatus =
  | 'accepted_single'
  | 'accepted_cluster'
  | 'rejected_outside_or_wall'
  | 'rejected_out_of_band_or_aspect'
  | 'rejected_cluster_no_match'

export interface DoorSwingRootDiagnostic {
  root: number
  className: RoomRasterClass
  areaPx: number
  bbox: { x: number; y: number; width: number; height: number }
  status: DoorSwingDiagnosticStatus
  matchedRefIndex: number | null
  score: number | null
}

export interface DoorSizeBandPx {
  /**
   * Absolute opening/muur-as band (mm→px), bv. 350–1200mm.
   * Alleen deze as gebruikt DOOR_MIN/MAX_MM — de diepte-as komt uit de deur-ref.
   */
  wallMinPx: number
  wallMaxPx: number
}


export type DoorSwingStage = 'stage1' | 'stage2'

export type DoorFillRejectionReason = 'too_full' | 'too_empty' | 'missing_ref'

export interface DoorFillRejection {
  hypothesis: DoorSwingHypothesis
  candidateFill: number
  refFill: number | null
  minAllowedFill: number | null
  maxAllowedFill: number | null
  reason: DoorFillRejectionReason
}

export interface DoorFillFilterStats {
  minRatio: number
  maxRatio: number
  acceptedCount: number
  rejectedTooFull: number
  rejectedTooEmpty: number
  rejectedMissingRef: number
}

export interface DoorFillFilterResult {
  accepted: DoorSwingHypothesis[]
  rejected: DoorFillRejection[]
  stats: DoorFillFilterStats
}

export interface ResolvedDoorCandidate {
  id: string
  source: DoorSwingHypothesis['source']
  score: number
  matchedRefIndex: number
  faceIds: number[]
  /** Kozijn-faces (bridge + enrich) voor L11 Path A. */
  doorframeFaceIds?: number[]
  bbox: { x: number; y: number; width: number; height: number }
  centroidPx: { x: number; y: number }
  /** Hinge/assen komen pas in L12 (na wall-bind + straighten). */
  swingSpanPx: number
  framingPx: number
  /** Geschaalde overhang boog-scharnier → vrije openingsrand. */
  overhangAlongPx: number
  /** Geschaalde overhang boog-scharnier → tegenoverliggende openingsrand. */
  overhangOppositePx: number
  /** Geschaalde kozijnbreedte vrije-tip-kant. */
  framingAlongPx: number
  /** Geschaalde kozijnbreedte tegenoverliggende kant. */
  framingOppositePx: number
  ratioBlade: number
  widthPx: number
  widthCm: number
  fmlRefId: string
  kind: DoorResolvedKind
}

export type DoorOpeningAxis = 'h' | 'v'

export interface DoorHingeAxis {
  a: { x: number; y: number }
  b: { x: number; y: number }
  angleDeg: number
  supportLength: number
}

export interface BoundDoor {
  doorId: string
  segmentIndex: number
  junctionAId?: string
  junctionBId?: string
  t: number
  openingAxis: DoorOpeningAxis
  outwardSign: -1 | 1
  contactScore: number
  secondaryContactScore: number
  snappedBBox: { x: number; y: number; width: number; height: number }
  /**
   * Path A: deurblad (doorframe-unie) geprojecteerd op het muursegment.
   * L12: FML = deze clear-uiteinden + REF framingAlong/Opposite; display = clear blad.
   */
  doorframeClearOpening?: {
    startPx: { x: number; y: number }
    endPx: { x: number; y: number }
  }
}

/**
 * FML-contract = L12 openings (+ L14 voor ramen), niet L11 BoundDoor.
 * Overlay-velden (display*, hinge, leaf/arc) blijven voor UI.
 */
export interface OrientedDoor {
  doorId: string
  segmentIndex: number
  junctionAId?: string
  junctionBId?: string
  t: number
  openingAxis: DoorOpeningAxis
  outwardSign: -1 | 1
  kind: DoorResolvedKind
  fmlRefId: string
  mirrored: [number, number]
  snappedBBox: { x: number; y: number; width: number; height: number }
  hingePx: { x: number; y: number }
  axes: [DoorHingeAxis, DoorHingeAxis]
  swingAngleDeg: number
  /**
   * Kozijn-tot-kozijn span — bron voor FML width/`t` (buitenkant → buitenkant).
   */
  openingStartPx: { x: number; y: number }
  openingEndPx: { x: number; y: number }
  /**
   * Clear blad voor L12-overlay (boog om geometrisch hinge; kozijnen zichtbaar).
   * Niet gebruiken voor FML-export-span.
   */
  displayStartPx: { x: number; y: number }
  displayEndPx: { x: number; y: number }
  /** Kozijnbreedte vrije-tip-kant (px) — FML-viewer swing-inset. */
  framingAlongPx: number
  /** Kozijnbreedte scharnier-kant (px) — FML-viewer swing-inset. */
  framingOppositePx: number
  leafLines: number[][]
  arcPoints: number[][]
  arrowPoints: number[][]
}
