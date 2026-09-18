import type { FloorPlan } from '@/core/plan/types'
import type { ThicknessBand } from '@/core/plan/wall-thickness-tiers'
import type { HScaleState } from '@/platform/calibration'
import type { DimensionVis } from '@/core/plan/plan-dimension-vis'
import type { PlanKind } from './plan-capabilities'

/**
 * Props accepted by `PlanCanvas.vue`.
 *
 * Extracted so consumers (host views, test harnesses) can reference the
 * surface without importing the SFC itself.
 */
export interface PlanCanvasHostProps {
  plan: FloorPlan | null
  floorIndex?: number

  // ── Underlay / calibration ──
  underlaySrc?: string | null
  underlayWidthPx?: number
  underlayHeightPx?: number
  /** 0–1; 0 = uit. */
  underlayOpacity?: number
  /** 0–1; FML-geometrie opacity. */
  contentOpacity?: number
  cmOrigin?: { x: number; y: number } | null
  pxPerMmX?: number
  pxPerMmY?: number
  /** Onderlegger-rotatie in graden (FML drawing); default 0. */
  rotationDeg?: number
  /** Display-only X-flip van de onderlegger. */
  flipX?: boolean
  /** Sidebar: onderlegger verslepen. */
  underlayMoveMode?: boolean

  // ── Thickness pick ──
  thicknessPickTier?: ThicknessBand | null
  thicknessPresetCms?: number[]

  // ── Bovenlicht defaults ──
  bovenlichtDefault?: boolean
  windowBovenlichtDefault?: boolean
  bovenlichtHeightCm?: number
  bovenlichtGapCm?: number
  /** true = flags+groen; false = losse ramen. Default true. */
  bovenlichtPacked?: boolean

  // ── Session defaults ──
  defaultDoorHeightCm?: number
  defaultWindowHeightCm?: number
  defaultWindowSillZCm?: number

  // ── Capability / mode ──
  setPlanNulpuntImageCm?: (point: { x: number; y: number } | null) => void
  /** Capability preset — only host ingress for area/annotation/inspect/touch. */
  kind: PlanKind
  /** FML-id → #RRGGBB statusfill. */
  inspectColors?: Record<string, string>
  /** Kamer-/surface-benaming + FML draw_label. Default true.
   * false = geen Konva.Text (maatlijnen blijven).
   */
  labelsVisible?: boolean
  /** Workspace: Herschalen-modus (H/V-linialen). Viewer uit. */
  rescaleMode?: boolean
  rescaleState?: HScaleState | null
  /** Face-snap op muren. Alleen herschalen; onderlegger-schaal blijft vrij. Default aan. */
  rescaleSnapToWalls?: boolean
  /** Viewer: chrome (header/floor-rail) verborgen. */
  canvasFullscreen?: boolean
  /** Exclusieve maatlijn-weergave (session). Alleen editor toont slicer/manual mutate. */
  dimensionVis?: DimensionVis
  /** Dak-tab: uitslag van de actieve floor (nok + dakvlakken). */
  dakMode?: boolean
  /** Editor-sessie undo (gedeeld met Gevels). Converter laat dit weg. */
  sessionUndo?: import('@/ui/composables/editor/editor-session-undo').EditorSessionUndoApi
}
