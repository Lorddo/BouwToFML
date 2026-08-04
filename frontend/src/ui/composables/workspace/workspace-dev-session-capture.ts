import type { Ref } from 'vue'
import type { OcrTextCandidate } from '@/core/extraction'
import { resolveDoorFmlTemplateRefId } from '@/core/fml/types'
import type { PreprocessConfig } from '@/platform/image'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { DrawingProfileId } from '@/platform/profile'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'
import type { ResultViewTab, TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { TemplateTab, PreprocessPanelLayer } from '@/cv/preprocess/layer-preprocess'
import type { RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import {
  captureDevWorkspaceSession,
  type DevWorkspaceSession,
  type DevOpeningReferenceRect,
  type DevWallReferenceRect,
} from '@/platform/dev-workspace'
import type { WorkspaceFlowStep } from './constants'
import type { RoomPhase } from './useWorkspaceRoomFaces'
import type { DevRoomPhase } from '@/platform/dev-workspace/types'

export type WorkspaceDevSessionCaptureDeps = {
  imageName: Ref<string | null>
  originalImageEl: Ref<HTMLImageElement | null>
  preprocess: Ref<PreprocessConfig>
  drawingProfileId: Ref<DrawingProfileId>
  wallPipelineVersion: Ref<WallPipelineVersion>
  scale: ReturnType<typeof useHScaleCalibration>
  eraserMask: Ref<Uint8Array | null>
  eraserTouched: Ref<boolean>
  ocrMask: Ref<Uint8Array | null>
  ocrMaskedRegions: Ref<OcrTextCandidate[]>
  serializeInkOverlay: () => number[] | null
  serializeWallStamp: () => import('./useWallStamp').WallStampSerialized | null
  flowStep: Ref<WorkspaceFlowStep>
  templateTab: Ref<TemplateTab>
  preprocessTab: Ref<PreprocessPanelLayer>
  resultTab: Ref<ResultViewTab>
  profileConfirmed: Ref<boolean>
  tabOutputs: Ref<TabDetectionOutputs>
  roomPhase: Ref<RoomPhase>
  wallsDetectionComplete: Ref<boolean>
  getRoomRasterCache: () => RoomRasterCache | null
  serializeFaceOverrides: () => Array<[number, RoomRasterClass]>
  serializePinnedRoots: () => number[]
  referenceWallThicknessPx: Ref<number | null>
  rects: Ref<Array<{ type: string; x: number; y: number; width: number; height: number }>>
  roomInkCoverageThreshold: Ref<number>
}

export function resolveReferenceWallRect(
  rects: Array<{ type: string; x: number; y: number; width: number; height: number }>,
): DevWallReferenceRect | undefined {
  const wallRects = rects.filter((rect) => rect.type === 'wall')
  const last = wallRects[wallRects.length - 1]
  if (!last) return undefined
  return { x: last.x, y: last.y, width: last.width, height: last.height }
}

export function resolveOpeningRects(
  rects: Array<{
    type: string
    x: number
    y: number
    width: number
    height: number
    fmlRefId?: string
  }>,
): DevOpeningReferenceRect[] {
  return rects
    .filter(
      (
        rect,
      ): rect is {
        type: 'door' | 'window'
        x: number
        y: number
        width: number
        height: number
        fmlRefId?: string
      } => rect.type === 'door' || rect.type === 'window',
    )
    .map((rect) => ({
      type: rect.type,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      ...(rect.type === 'door' ? { fmlRefId: resolveDoorFmlTemplateRefId(rect.fmlRefId) } : {}),
    }))
}

export function serializeLiveRoomClassifyState(
  cache: RoomRasterCache,
): SerializedRoomClassifyState {
  const state = cache.state
  return {
    ...state,
    labelsData:
      state.labelsData instanceof Int32Array ? state.labelsData : new Int32Array(state.labelsData),
    rawLabelsData: state.rawLabelsData
      ? state.rawLabelsData instanceof Int32Array
        ? state.rawLabelsData
        : new Int32Array(state.rawLabelsData)
      : undefined,
    baselineWallBwData: state.baselineWallBwData
      ? state.baselineWallBwData instanceof Uint8Array
        ? state.baselineWallBwData
        : new Uint8Array(state.baselineWallBwData)
      : undefined,
    parentMap: [...state.parentMap],
    classificationByLabel: [...state.classificationByLabel],
    faceOverrides: [...cache.faceOverrides.entries()],
    pinnedRoots: [...cache.pinnedRoots],
  }
}

/** UI `recalculating` bestaat niet in session-schema; map naar classifying. */
function toDevRoomPhase(phase: RoomPhase): DevRoomPhase {
  return phase === 'recalculating' ? 'classifying' : phase
}

export function createWorkspaceDevSessionCapture(deps: WorkspaceDevSessionCaptureDeps) {
  function captureCurrentSession(
    label?: string,
    options?: { forceExactRestore?: boolean },
  ): DevWorkspaceSession {
    const img = deps.originalImageEl.value
    if (!img?.complete || img.naturalWidth <= 0) {
      throw new Error('Laad eerst een tekening.')
    }
    return captureDevWorkspaceSession({
      label,
      targetFlowStep: deps.flowStep.value,
      templateTab: deps.templateTab.value,
      preprocessTab: deps.preprocessTab.value,
      resultTab: deps.resultTab.value,
      profileConfirmed: deps.profileConfirmed.value,
      wallPipelineVersion: deps.wallPipelineVersion.value,
      imageName: deps.imageName.value ?? 'workspace.png',
      originalImageEl: img,
      preprocess: deps.preprocess.value,
      drawingProfileId: deps.drawingProfileId.value,
      scale: {
        state: deps.scale.state.value,
        distanceMmX: deps.scale.distanceMmX.value,
        distanceMmY: deps.scale.distanceMmY.value,
        confirmed: deps.scale.confirmed.value,
        confirmedPixelsPerMillimeterX: deps.scale.confirmedPixelsPerMillimeterX.value,
        confirmedPixelsPerMillimeterY: deps.scale.confirmedPixelsPerMillimeterY.value,
      },
      eraserMask: deps.eraserMask.value,
      eraserTouched: deps.eraserTouched.value,
      ocrMask: deps.ocrMask.value,
      ocrMaskedRegions: deps.ocrMaskedRegions.value,
      ocrApplied: deps.ocrMaskedRegions.value.length > 0,
      tabOutputs: deps.tabOutputs.value,
      roomPhase: toDevRoomPhase(deps.roomPhase.value),
      wallsDetectionComplete: deps.wallsDetectionComplete.value,
      faceOverrides: deps.serializeFaceOverrides(),
      pinnedRoots: deps.serializePinnedRoots(),
      referenceWallThicknessPx: deps.referenceWallThicknessPx.value,
      referenceWallRect: resolveReferenceWallRect(deps.rects.value),
      openingRects: resolveOpeningRects(deps.rects.value),
      roomInkCoverageThreshold: deps.roomInkCoverageThreshold.value,
      liveRoomClassifyState: (() => {
        const cache = deps.getRoomRasterCache()
        return cache ? serializeLiveRoomClassifyState(cache) : undefined
      })(),
      inkOverlayRle: deps.serializeInkOverlay() ?? undefined,
      wallStamp: deps.serializeWallStamp() ?? undefined,
      forceExactRestore: options?.forceExactRestore === true,
    })
  }

  return { captureCurrentSession }
}
