import type { Floor, FloorPlan } from '@/core/fml/types'
import type { DevWorkspaceSession } from '@/platform/dev-workspace'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'

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
  bovenlichtDefault: boolean
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
 * Per-floor workspace snapshot.
 * `session` = DevSession-vorm (image + scale + preprocess + detectie).
 * Lege floor: session null.
 */
export type FloorWorkspaceBlob = {
  session: DevWorkspaceSession | null
  /** Gegenereerde/bewerkte FML-floor na stap 4 (vóór project-merge). */
  generatedFloor: Floor | null
  /**
   * Volledige FML-preview (incl. handmatige editor-wijzigingen) voor exacte floor-switch.
   * Zonder dit zou restore opnieuw genereren en edits kwijtraken.
   */
  previewPlan: FloorPlan | null
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
