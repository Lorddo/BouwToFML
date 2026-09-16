import type { Floor, FloorPlan } from '@/core/plan/types'
import type { UnderlayOriginLayout } from '@/core/plan/translate-floor-plan'
import type { PlgFloorDefaults } from '@/core/plg/plg-document'
import type { DevWorkspaceSession } from '@/platform/dev-workspace'
import type { PdfUnderlaySource } from '@/platform/upload'
import type { PdfUnderlayMeta } from './reuse-underlay-pdf'

/** Flow steps shared by project blobs and workspace UI (no CV import). */
export type WorkspaceFlowStep = 'project' | 'input' | 'preprocess' | 'templates' | 'result'

export type FloorStatus = 'empty' | 'input' | 'preprocess' | 'templates' | 'result'

export type ProjectMeta = {
  id: string
  name: string
  address: string
}

/**
 * Floor-/project-defaults: `.plg`-velden plus converter-gate (niet in download).
 */
export type ProjectPlanDefaults = PlgFloorDefaults & {
  thicknessMinCm: number
  thicknessMidCm: number
  thicknessMaxCm: number
  bandMidBoundaryCm: number
  bandMaxBoundaryCm: number
}

export type FloorMeta = {
  id: string
  name: string
  level: number
  status: FloorStatus
  defaults: ProjectPlanDefaults
}

/**
 * Per-floor underlay layout for FML preview (origin + px/mm + optional rot/flip).
 * Canonical type lives in core — project/UI alias for persistence blobs.
 */
export type PreviewUnderlayLayout = UnderlayOriginLayout

/** D4 FML-geometrie t.o.v. canonieke generate (na nulpunt). */
export type FloorOrientPersist = {
  quarterTurnsCw: 0 | 1 | 2 | 3
  flipX: boolean
}

export type FloorWorkspaceBlob = {
  session: DevWorkspaceSession | null
  /** Gegenereerde/bewerkte FML-floor na stap 4 (vóór project-merge). */
  generatedFloor: Floor | null
  /**
   * Volledige FML-preview (incl. handmatige editor-wijzigingen) voor exacte floor-switch.
   * Zonder dit zou restore opnieuw genereren en edits kwijtraken.
   */
  previewPlan: FloorPlan | null
  /**
   * Underlay-layout die bij previewPlan hoort (origin + px/mm bij generate).
   * Nodig bij snelle result-restore zonder extraction/generatedBundle.
   */
  previewUnderlayLayout: PreviewUnderlayLayout | null
  /**
   * Gebruikers-nulpunt in scant-cm (imageCm = FML + layout.origin).
   * Overleeft regenerate: opnieuw toepassen i.p.v. bbox-min origin.
   */
  planNulpuntImageCm?: { x: number; y: number } | null
  /**
   * FML-oriëntatie t.o.v. canonieke generate (spiegel + 90°).
   * Overleeft regenerate: opnieuw toepassen ná nulpunt.
   */
  planOrient?: FloorOrientPersist | null
  /**
   * Laatste bevestigde bronscan + schaal van deze verdieping (vóór crop).
   * Gebruikt door «Onderlegger overnemen» als donor; overschrijft bij elke schaal-bevestiging.
   */
  sourceUnderlay?: ProjectSourceUnderlay | null
  /**
   * Runtime-only PDF bytes for ROI re-render at input commit (live working image).
   * Cleared after crop; never written to IndexedDB (`persistBlob` omits this field).
   */
  pdfUnderlaySource?: PdfUnderlaySource | null
  /**
   * Original PDF page for «Onderlegger overnemen» after the donor already cropped.
   * Survives crop (unlike `pdfUnderlaySource`). In-memory on the blob; project-level copy is persisted.
   */
  sourcePdfUnderlay?: PdfUnderlaySource | null
}

export type ProjectSourceUnderlay = {
  src: string
  name: string
  /** Schaal-snapshot van de bronscan (vóór per-floor crop). */
  scale?: DevWorkspaceSession['scale']
  /** PDF-pagina van deze bronscan (geen bytes — die zitten in `sourcePdfUnderlay`). */
  pdf?: PdfUnderlayMeta | null
}

export type ProjectState = {
  meta: ProjectMeta
  sourceUnderlay: ProjectSourceUnderlay | null
  /**
   * Shared PDF page for reuse/ROI on every floor.
   * Set on PDF upload; cleared on raster upload. Persisted (quota-retry may omit).
   */
  sourcePdfUnderlay?: PdfUnderlaySource | null
  floors: FloorMeta[]
  blobs: Record<string, FloorWorkspaceBlob>
  activeFloorId: string
}

/** Floor-flowstappen (niet stap 0 project). */
export type FloorFlowStep = Exclude<WorkspaceFlowStep, 'project'>

export function isFloorFlowStep(step: WorkspaceFlowStep): step is FloorFlowStep {
  return step !== 'project'
}

export function floorStatusFromFlowStep(step: WorkspaceFlowStep): FloorStatus {
  if (step === 'project') return 'empty'
  return step
}
