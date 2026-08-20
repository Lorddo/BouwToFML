import type { Floor, FloorPlan } from '@/core/fml/types'
import type { UnderlayOriginLayout } from '@/core/fml/translate-floor-plan'
import type { DevWorkspaceSession } from '@/platform/dev-workspace'
import type { PdfUnderlaySource } from '@/platform/upload'

/** Flow steps shared by project blobs and workspace UI (no CV import). */
export type WorkspaceFlowStep = 'project' | 'input' | 'preprocess' | 'templates' | 'result'

export type FloorStatus = 'empty' | 'input' | 'preprocess' | 'templates' | 'result'

export type ProjectMeta = {
  id: string
  name: string
  address: string
}

/** FML-hoogtes/diktes per verdieping (geen aparte project-laag). */
export type ProjectFmlDefaults = {
  wallHeightCm: number
  doorHeightCm: number
  windowHeightCm: number
  windowSillZCm: number
  /** Bovenlicht op alle deuren (per-deur override via Opening.bovenlicht). */
  bovenlichtDefault: boolean
  /** Bovenlicht op alle ramen (per-raam override via Opening.bovenlicht). */
  windowBovenlichtDefault: boolean
  /** Glashoogte gesynthetiseerd bovenlicht (cm). */
  bovenlichtHeightCm: number
  /** Afstand tussen bovenzijde opening en onderkant bovenlicht (cm) — bepaalt de dorpel. */
  bovenlichtGapCm: number
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
  defaults: ProjectFmlDefaults
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
  fmlNulpuntImageCm?: { x: number; y: number } | null
  /**
   * FML-oriëntatie t.o.v. canonieke generate (spiegel + 90°).
   * Overleeft regenerate: opnieuw toepassen ná nulpunt.
   */
  fmlOrient?: FloorOrientPersist | null
  /**
   * Laatste bevestigde bronscan + schaal van deze verdieping (vóór crop).
   * Gebruikt door «Onderlegger overnemen» als donor; overschrijft bij elke schaal-bevestiging.
   */
  sourceUnderlay?: ProjectSourceUnderlay | null
  /**
   * Runtime-only PDF bytes for ROI re-render at input commit.
   * Never written to IndexedDB (`persistBlob` omits this field).
   */
  pdfUnderlaySource?: PdfUnderlaySource | null
}

export type ProjectSourceUnderlay = {
  src: string
  name: string
  /** Schaal-snapshot van de bronscan (vóór per-floor crop). */
  scale?: DevWorkspaceSession['scale']
}

export type ProjectState = {
  meta: ProjectMeta
  sourceUnderlay: ProjectSourceUnderlay | null
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
