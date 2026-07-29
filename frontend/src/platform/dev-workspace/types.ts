import type { ExtractionOutput } from '@/core/extraction'
import type { OcrTextCandidate, PreprocessConfig } from '@/core/extraction/types'
import type { HScaleState } from '@/platform/calibration'
import type { DrawingProfileId } from '@/platform/profile'
import type { ResultViewTab, TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'

export type DevRoomPhase = 'idle' | 'awaiting_reference' | 'classifying' | 'review' | 'finalizing' | 'done'

export const DEV_WORKSPACE_SESSION_VERSION = 2 as const

export type DevWorkspaceSessionVersion = 1 | typeof DEV_WORKSPACE_SESSION_VERSION

export type DevWorkspaceRestoreMode = 'exact' | 'replay'

export type DevWallsReplayPhase = 'none' | 'classify' | 'finalize'

/** Gedeelde basis — onderlegger + voorbewerking (stap 1+2). */
export interface DevWorkspaceSessionBase {
  createdAt: string
  label?: string
  imageName: string
  imageWidth: number
  imageHeight: number
  /**
   * Exacte werkpixels na stap 1 (`originalImageEl`).
   * Resolutiebeleid: native upload, alleen upscale als max-edge < 3000px (`buildOptimizationBase`).
   */
  workingImagePng: string
  preprocess: PreprocessConfig
  drawingProfileId: DrawingProfileId
  scale: {
    state?: HScaleState
    distanceMmX: number
    distanceMmY: number
    confirmed: boolean
    /** Vastgelegde px/mm na bevestigen (o.a. na stap-1 upscale); linialen kunnen verouderd zijn. */
    confirmedPixelsPerMillimeterX?: number
    confirmedPixelsPerMillimeterY?: number
  }
  eraserTouched: boolean
  eraserMaskBase64?: string
  ocrMaskBase64?: string
  ocrMaskedRegions?: OcrTextCandidate[]
  /** Inkt-overlay RLE (codes NONE/BLACK/WHITE). */
  inkOverlayRle?: number[]
  /** Stap-1 referentievakken (muur + deur/raam) — ook buiten detectie-snapshots. */
  referenceWallThicknessPx?: number
  referenceWallRect?: DevWallReferenceRect
  openingRects?: DevOpeningReferenceRect[]
}

/** Snapshot van stap 1+2 — herstelt equivalente pipeline-input bij stap 3 (legacy v1). */
export interface DevWorkspaceSessionV1 extends DevWorkspaceSessionBase {
  schemaVersion: 1
  scale: {
    state: HScaleState
    distanceMmX: number
    distanceMmY: number
    confirmed: boolean
  }
}

export interface DevWorkspaceFlowSnapshot {
  targetFlowStep: WorkspaceFlowStep
  templateTab?: TemplateTab
  preprocessTab?: import('@/cv/preprocess/layer-preprocess').PreprocessPanelLayer
  resultTab?: ResultViewTab
  restoreMode: DevWorkspaceRestoreMode
  profileConfirmed: boolean
  wallPipelineVersion?: WallPipelineVersion
}

export interface DevWallReferenceRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DevOpeningReferenceRect {
  type: 'door' | 'window'
  x: number
  y: number
  width: number
  height: number
  /** Alleen voor deuren: Floorplanner template-refid (standaard/kastdeur). */
  fmlRefId?: string
}

export interface DevWorkspaceRoomSnapshot {
  referenceWallThicknessPx?: number
  referenceWallRect?: DevWallReferenceRect
  /** Deur-/raamreferentievakken van stap 1. */
  openingRects?: DevOpeningReferenceRect[]
  roomInkCoverageThreshold?: number
  faceOverrides?: Array<[number, RoomRasterClass]>
  pinnedRoots?: number[]
}

export interface DevWorkspaceDetectionExact extends DevWorkspaceRoomSnapshot {
  tabOutputs: TabDetectionOutputs
  roomPhase: DevRoomPhase
  wallsDetectionComplete: boolean
}

export interface DevWorkspaceDetectionReplay extends DevWorkspaceRoomSnapshot {
  ocrApplied: boolean
  wallsPhase: DevWallsReplayPhase
}

export interface DevWorkspaceSessionV2 extends DevWorkspaceSessionBase {
  schemaVersion: typeof DEV_WORKSPACE_SESSION_VERSION
  flow: DevWorkspaceFlowSnapshot
  /** Exacte detectie-output — alleen bij restoreMode exact op stap 3. */
  detectionExact?: DevWorkspaceDetectionExact
  /** Detectie-inputs om opnieuw te draaien — bij restoreMode replay (stap 4). */
  detectionReplay?: DevWorkspaceDetectionReplay
}

export type DevWorkspaceSession = DevWorkspaceSessionV1 | DevWorkspaceSessionV2

export interface DevSessionCaptureInput {
  label?: string
  targetFlowStep: WorkspaceFlowStep
  templateTab: TemplateTab
  preprocessTab: import('@/cv/preprocess/layer-preprocess').PreprocessPanelLayer
  resultTab: ResultViewTab
  profileConfirmed: boolean
  wallPipelineVersion: WallPipelineVersion
  imageName: string
  originalImageEl: HTMLImageElement
  preprocess: PreprocessConfig
  drawingProfileId: DrawingProfileId
  scale: {
    state: HScaleState | null
    distanceMmX: number
    distanceMmY: number
    confirmed: boolean
    confirmedPixelsPerMillimeterX?: number | null
    confirmedPixelsPerMillimeterY?: number | null
  }
  eraserMask: Uint8Array | null
  eraserTouched: boolean
  ocrMask: Uint8Array | null
  ocrMaskedRegions: OcrTextCandidate[]
  ocrApplied: boolean
  tabOutputs: TabDetectionOutputs
  roomPhase: DevRoomPhase
  wallsDetectionComplete: boolean
  faceOverrides?: Array<[number, RoomRasterClass]>
  pinnedRoots?: number[]
  referenceWallThicknessPx?: number | null
  referenceWallRect?: DevWallReferenceRect
  openingRects?: DevOpeningReferenceRect[]
  roomInkCoverageThreshold?: number
  liveRoomClassifyState?: SerializedRoomClassifyState
  /** Override werk-PNG (tests / exact pixels); default = snapshot van originalImageEl. */
  workingImagePng?: string
  /** Inkt-overlay RLE (NONE/BLACK/WHITE codes) — niet gebakken in kleur-onderlegger. */
  inkOverlayRle?: number[]
}

/** Bepaal walls-replay-fase uit huidige UI/pipeline-staat. */
export function resolveWallsReplayPhase(input: {
  tabOutputs: TabDetectionOutputs
  roomPhase: DevRoomPhase
  wallsDetectionComplete: boolean
}): DevWallsReplayPhase {
  const walls = input.tabOutputs.walls as ExtractionOutput | null | undefined
  const pipelinePhase = walls?.meta?.roomPipelinePhase
  if (pipelinePhase === 'finalize' || pipelinePhase === 'full' || input.wallsDetectionComplete) {
    return 'finalize'
  }
  if (
    pipelinePhase === 'classify' ||
    input.roomPhase === 'review' ||
    input.roomPhase === 'classifying' ||
    input.roomPhase === 'finalizing'
  ) {
    return 'classify'
  }
  return 'none'
}
