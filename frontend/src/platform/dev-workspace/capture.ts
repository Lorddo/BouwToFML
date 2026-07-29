import { normalizeStoredPreprocess } from '@/cv/preprocess/layer-preprocess'
import type {
  DevSessionCaptureInput,
  DevWorkspaceRoomSnapshot,
  DevWorkspaceSessionV2,
} from './types'
import { DEV_WORKSPACE_SESSION_VERSION, resolveWallsReplayPhase } from './types'
import { encodeMaskBase64, maskHasInk } from './mask-codec'
import { imageElementToPngDataUrl } from './image-capture'
import { clonePlain } from './clone-plain'
import { toStorableDevSession } from './storable'
import { cloneTabOutputsForSnapshot, enrichWallsOutputWithFaceState } from './tab-outputs-serialize'

function buildRoomSnapshot(input: DevSessionCaptureInput): DevWorkspaceRoomSnapshot {
  const snapshot: DevWorkspaceRoomSnapshot = {}
  if (input.referenceWallThicknessPx != null && input.referenceWallThicknessPx > 0) {
    snapshot.referenceWallThicknessPx = input.referenceWallThicknessPx
  }
  if (input.referenceWallRect) {
    snapshot.referenceWallRect = { ...input.referenceWallRect }
  }
  if (input.openingRects && input.openingRects.length > 0) {
    snapshot.openingRects = input.openingRects.map((rect) => ({ ...rect }))
  }
  if (input.roomInkCoverageThreshold != null) {
    snapshot.roomInkCoverageThreshold = input.roomInkCoverageThreshold
  }
  if (input.faceOverrides && input.faceOverrides.length > 0) {
    snapshot.faceOverrides = [...input.faceOverrides]
  }
  if (input.pinnedRoots && input.pinnedRoots.length > 0) {
    snapshot.pinnedRoots = [...input.pinnedRoots]
  }
  return snapshot
}

function buildTabOutputsSnapshot(input: DevSessionCaptureInput) {
  const enriched = enrichWallsOutputWithFaceState(
    input.tabOutputs,
    input.faceOverrides,
    input.pinnedRoots,
    input.liveRoomClassifyState,
  )
  return cloneTabOutputsForSnapshot(enriched)
}

export function captureDevWorkspaceSession(input: DevSessionCaptureInput): DevWorkspaceSessionV2 {
  if (input.targetFlowStep !== 'input' && (!input.scale.confirmed || !input.scale.state)) {
    throw new Error('Bevestig eerst de schaal voordat je een snapshot opneemt.')
  }
  if (!input.originalImageEl.complete || input.originalImageEl.naturalWidth <= 0) {
    throw new Error('Afbeelding is nog niet geladen.')
  }

  const width = input.originalImageEl.naturalWidth
  const height = input.originalImageEl.naturalHeight
  const pixelCount = width * height

  let eraserMaskBase64: string | undefined
  if (input.eraserMask && input.eraserMask.length === pixelCount && maskHasInk(input.eraserMask)) {
    eraserMaskBase64 = encodeMaskBase64(input.eraserMask)
  }

  let ocrMaskBase64: string | undefined
  if (input.ocrMask && input.ocrMask.length === pixelCount && maskHasInk(input.ocrMask)) {
    ocrMaskBase64 = encodeMaskBase64(input.ocrMask)
  }

  const restoreMode = input.targetFlowStep === 'result' ? 'replay' : 'exact'
  const flow = {
    targetFlowStep: input.targetFlowStep,
    templateTab: input.templateTab,
    preprocessTab: input.preprocessTab,
    resultTab: input.resultTab,
    profileConfirmed: input.profileConfirmed,
    restoreMode,
    wallPipelineVersion: input.wallPipelineVersion,
  } satisfies DevWorkspaceSessionV2['flow']

  let detectionExact: DevWorkspaceSessionV2['detectionExact']
  let detectionReplay: DevWorkspaceSessionV2['detectionReplay']

  if (restoreMode === 'exact' && input.targetFlowStep === 'templates') {
    detectionExact = {
      ...buildRoomSnapshot(input),
      tabOutputs: buildTabOutputsSnapshot(input),
      roomPhase: input.roomPhase,
      wallsDetectionComplete: input.wallsDetectionComplete,
    }
  }

  if (restoreMode === 'replay') {
    detectionReplay = {
      ...buildRoomSnapshot(input),
      ocrApplied: input.ocrApplied,
      wallsPhase: resolveWallsReplayPhase(input),
    }
  }

  return toStorableDevSession({
    schemaVersion: DEV_WORKSPACE_SESSION_VERSION,
    createdAt: new Date().toISOString(),
    label: input.label,
    imageName: input.imageName,
    imageWidth: width,
    imageHeight: height,
    workingImagePng: input.workingImagePng ?? imageElementToPngDataUrl(input.originalImageEl),
    preprocess: normalizeStoredPreprocess(clonePlain(input.preprocess)),
    drawingProfileId: input.drawingProfileId,
    scale: {
      state: input.scale.state ? { ...input.scale.state } : undefined,
      distanceMmX: input.scale.distanceMmX,
      distanceMmY: input.scale.distanceMmY,
      confirmed: input.scale.confirmed,
      ...(input.scale.confirmedPixelsPerMillimeterX != null
        ? { confirmedPixelsPerMillimeterX: input.scale.confirmedPixelsPerMillimeterX }
        : {}),
      ...(input.scale.confirmedPixelsPerMillimeterY != null
        ? { confirmedPixelsPerMillimeterY: input.scale.confirmedPixelsPerMillimeterY }
        : {}),
    },
    eraserTouched: input.eraserTouched,
    eraserMaskBase64,
    ocrMaskBase64,
    ocrMaskedRegions:
      input.ocrMaskedRegions.length > 0
        ? input.ocrMaskedRegions.map((region) => ({ ...region }))
        : undefined,
    ...(input.inkOverlayRle && input.inkOverlayRle.length > 0
      ? { inkOverlayRle: input.inkOverlayRle }
      : {}),
    ...(input.referenceWallThicknessPx != null && input.referenceWallThicknessPx > 0
      ? { referenceWallThicknessPx: input.referenceWallThicknessPx }
      : {}),
    ...(input.referenceWallRect ? { referenceWallRect: { ...input.referenceWallRect } } : {}),
    ...(input.openingRects && input.openingRects.length > 0
      ? { openingRects: input.openingRects.map((rect) => ({ ...rect })) }
      : {}),
    flow,
    detectionExact,
    detectionReplay,
  })
}
