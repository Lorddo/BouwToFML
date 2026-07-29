export type WindowAxelOrientation = 'horizontal' | 'vertical'

/**
 * Size-band genormaliseerd op `axisBandHeightPx` tijdens ref-build.
 * 1.0 = even groot als de as-band; consumers schalen met lokale hyp-band.
 * (Zelfde patroon als deur `ratioBlade`: ratios in de ref, geen absolute px-overdracht.)
 */
export interface WindowSizeRange2d {
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

export interface WindowAxelRefBand {
  refIndex: number
  stripCount: number
  stripHeightsPx: number[]
  targetStripHeightPx: number
  /** Genormaliseerd op as-band: targetStripHeightPx / axisBandHeightPx. */
  targetStripHeightRatio?: number
  axisBandHeightPx: number
  orientation: WindowAxelOrientation
  /**
   * Hartlijn-stripcount over hele REF-hoogte (top+midden+bottom).
   * Kozijnen L/R uitgesloten. Stage-3 cluster → N strip_stack leden; Stage 4 merget tot 1.
   */
  fullStripCount: number
  fullStripHeightsPx: number[]
  /** Framing W×H / axisBandHeightPx (± marge), ink-geom; null zonder kozijnen. */
  framingSizeRange: WindowSizeRange2d | null
  /**
   * Top-rail W×H / axisBandHeightPx (± marge), ink-geom wanneer dual beschikbaar.
   * Null als REF geen echte top-rail buiten de as-band heeft.
   */
  topRailRange: WindowSizeRange2d | null
  /** Bottom-rail — zelfde contract als `topRailRange`. */
  bottomRailRange: WindowSizeRange2d | null
  /**
   * Absolute top/bottom-rail dikte (px) in **opening-wit** — Stage-3 stack-recruit.
   * Per kant onafhankelijk: alleen gezet bij echte rail buiten de as-band (asymmetrisch OK).
   * Nooit ink van as-glas.
   */
  topRailHeightPx?: number | null
  bottomRailHeightPx?: number | null
  /**
   * Absolute top/bottom-rail dikte (px) in **wall-ink** — dual-aanbod voor framing-maat.
   * Per kant onafhankelijk; null zonder dual of zonder echte rail aan die kant.
   */
  topRailHeightInkPx?: number | null
  bottomRailHeightInkPx?: number | null
}

export interface WindowAxelHypothesis {
  id: string
  matchedRefIndex: number
  /** Orientatie waarmee Stage 1 deze hyp matchte — Stage 2/3/4 volgen deze, niet de ref-tekenrichting. */
  orientation: WindowAxelOrientation
  faceIds: number[]
  unionBBox: { x: number; y: number; width: number; height: number }
  axisSpanPx: number
  score: number
}

export type WindowAxelStage = 'stage1' | 'stage2' | 'stage3'

export type WindowAxelRejectReason =
  | 'strip_count_mismatch'
  | 'strip_height_mismatch'
  | 'strip_height_spread'
  | 'axis_span_spread'
  | 'invalid_axis_span'

export interface WindowAxelRejection {
  refIndex: number
  orientation: WindowAxelOrientation
  faceIds: number[]
  unionBBox: { x: number; y: number; width: number; height: number }
  reason: WindowAxelRejectReason
  expectedStripCount: number
  actualStripCount: number
  expectedStripHeightPx: number
  actualStripHeightsPx: number[]
  axisSpanPx: number
}

export interface WindowAxelRefMatchStats {
  refIndex: number
  effectiveTargetStripHeightPx: number
  candidateRoots: number
  clusterCount: number
  acceptedCount: number
  rejectedCount: number
  rejectedByReason: Partial<Record<WindowAxelRejectReason, number>>
}

export interface WindowAxelFilterStats {
  refBandCount: number
  candidateRootCount: number
  acceptedCount: number
  rejectedCount: number
  byRef: WindowAxelRefMatchStats[]
}

export interface WindowAxelFilterResult {
  hypotheses: WindowAxelHypothesis[]
  rejections: WindowAxelRejection[]
  stats: WindowAxelFilterStats
}

export type WindowDoorArcRejectionReason =
  'shares_door_arc_face' | 'adjacent_to_door_arc' | 'aligned_with_rejected_arc_band'

export interface WindowDoorArcRejection {
  hypothesis: WindowAxelHypothesis
  reason: WindowDoorArcRejectionReason
}

export interface WindowDoorArcFilterStats {
  acceptedCount: number
  rejectedShare: number
  rejectedAdjacent: number
  rejectedDirectional: number
}

export interface WindowDoorArcFilterResult {
  /** Hypotheses die geen deurboog-contact hebben → verder als window. */
  kept: WindowAxelHypothesis[]
  /**
   * Hypotheses naast/op deurboog → doorframe-pad (niet droppen).
   * Reason blijft voor stats/debug.
   */
  doorframeCandidates: WindowDoorArcRejection[]
  stats: WindowDoorArcFilterStats
}

export type WindowEvidenceKind = 'framing' | 'strip_stack'

export type WindowEvidenceRejectReason =
  | 'no_evidence'
  | 'strip_stack_count'
  | 'strip_stack_gap'
  | 'framing_band'
  | 'framing_size'
  | 'framing_sides'

export interface WindowEvidenceAcceptance {
  hypothesis: WindowAxelHypothesis
  evidence: WindowEvidenceKind
  evidenceFaceIds: number[]
}

export interface WindowEvidenceRejection {
  hypothesis: WindowAxelHypothesis
  reason: WindowEvidenceRejectReason
}

export interface WindowEvidenceFilterStats {
  acceptedCount: number
  acceptedByFraming: number
  acceptedByStripStack: number
  rejectedNoEvidence: number
  /** Hyps die strip_stack faalden en daarna via framing doorgingen. */
  stripStackFailedBeforeFraming: number
}

export interface WindowEvidenceFilterResult {
  kept: WindowAxelHypothesis[]
  accepted: WindowEvidenceAcceptance[]
  rejected: WindowEvidenceRejection[]
  stats: WindowEvidenceFilterStats
}

export interface ResolvedWindowCandidate {
  id: string
  sourceHypothesisId: string
  matchedRefIndex: number
  orientation: WindowAxelOrientation
  evidence: WindowEvidenceKind
  faceIds: number[]
  evidenceFaceIds: number[]
  bbox: { x: number; y: number; width: number; height: number }
  centroidPx: { x: number; y: number }
  widthPx: number
  widthCm: number
  /**
   * Perp-span t.o.v. openingsas — DevPanel / window-face-report (D/O).
   * Geen L14/FML-input (FML gebruikt default z_height).
   */
  heightPx: number
  /** Zie heightPx — D/O, niet FML. */
  heightCm: number
  score: number
}

export type WindowOpeningAxis = 'h' | 'v'

/** L14: Stage-4 raam gekoppeld aan L10-segment (geen snap; bbox blijft image-space). */
export interface BoundWindow {
  windowId: string
  segmentIndex: number
  t: number
  openingAxis: WindowOpeningAxis
  /** = Stage-4 bbox (geen shift). */
  openingBBox: { x: number; y: number; width: number; height: number }
  openingStartPx: { x: number; y: number }
  openingEndPx: { x: number; y: number }
  widthPx: number
  widthCm: number
  fmlRefId: string
  evidence: WindowEvidenceKind
  faceIds: number[]
}

export type WindowBindRejectReason = 'junction_in_window' | 'no_segment'

export interface WindowBindRejection {
  candidate: ResolvedWindowCandidate
  reason: WindowBindRejectReason
}

export interface WindowWallBindResult {
  bound: BoundWindow[]
  rejected: WindowBindRejection[]
}
