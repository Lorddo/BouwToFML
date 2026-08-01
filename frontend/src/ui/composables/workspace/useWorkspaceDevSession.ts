import { computed, ref, watch, nextTick, type Ref } from 'vue'
import type { OcrTextCandidate } from '@/core/extraction'
import type { PreprocessConfig } from '@/platform/image'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { useWorkspaceScale } from './useWorkspaceScale'
import {
  flowStepLabel,
  isDevWorkspaceSession,
  isSessionV2,
  listDevSessions,
  loadLastDevSession,
  loadDevSessionById,
  resolveDevSessionStorageId,
  resolveRestoreMode,
  resolveTargetFlowStep,
  saveDevSession,
  type DevWorkspaceSession,
  type DevOpeningReferenceRect,
  type DevWallReferenceRect,
} from '@/platform/dev-workspace'
import type { DrawingProfileId } from '@/platform/profile'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'
import type { ResultViewTab, TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { TemplateTab, PreprocessPanelLayer } from '@/cv/preprocess/layer-preprocess'
import type { RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { WorkspaceFlowStep } from './constants'
import type { RoomPhase } from './useWorkspaceRoomFaces'
import { createWorkspaceDevSessionCapture } from './workspace-dev-session-capture'
import { createWorkspaceDevSessionRestoreBase } from './workspace-dev-session-restore-base'
import { createWorkspaceDevSessionRestoreDetection } from './workspace-dev-session-restore-detection'
import { createWorkspaceDevSessionRestoreFlow } from './workspace-dev-session-restore-flow'

interface DevSessionOption {
  id: string
  imageName: string
  label: string
}

export type UseWorkspaceDevSessionDeps = {
  imageName: Ref<string | null>
  setImageSource: (src: string, name: string) => void
  originalImageEl: Ref<HTMLImageElement | null>
  preprocess: Ref<PreprocessConfig>
  drawingProfileId: Ref<DrawingProfileId>
  wallPipelineVersion: Ref<WallPipelineVersion>
  scale: ReturnType<typeof useHScaleCalibration>
  scaleUi: Pick<
    ReturnType<typeof useWorkspaceScale>,
    'resetScaleFull' | 'restoreFromSessionSnapshot'
  >
  eraserMask: Ref<Uint8Array | null>
  eraserTouched: Ref<boolean>
  ocrMask: Ref<Uint8Array | null>
  ocrMaskedRegions: Ref<OcrTextCandidate[]>
  resetInkEdit: () => void
  serializeInkOverlay: () => number[] | null
  hydrateInkOverlay: (runs: number[] | null | undefined, width: number, height: number) => void
  rebuildBaseWallBw: (options?: { force?: boolean }) => Promise<boolean>
  composeWallBwPublish: () => Promise<void>
  hydrateMaskState: (args: {
    width: number
    height: number
    eraserMaskBytes?: Uint8Array
    eraserTouched: boolean
    ocrMaskBytes?: Uint8Array
    ocrMaskedRegions?: OcrTextCandidate[]
  }) => void
  loadExactWorkingImage: (dataUrl: string) => Promise<HTMLImageElement>
  prepareExactImageSrcLoad: () => void
  flowStep: Ref<WorkspaceFlowStep>
  templateTab: Ref<TemplateTab>
  preprocessTab: Ref<PreprocessPanelLayer>
  resultTab: Ref<ResultViewTab>
  profileConfirmed: Ref<boolean>
  tabOutputs: Ref<TabDetectionOutputs>
  roomPhase: Ref<RoomPhase>
  wallsDetectionComplete: Ref<boolean>
  getRoomRasterCache: () => RoomRasterCache | null
  refreshClassificationPreview?: () => Promise<void> | void
  clearWorkspaceForSession: () => void
  refreshMaskedWorkingImage: () => void
  refreshAllDetectionUnderlays: () => Promise<void>
  ensureVectorCacheIfNeeded: () => Promise<void>
  clearPreprocessPreview: () => void
  syncFromTabOutputs: () => Promise<void>
  runOcrScan: () => Promise<void>
  restoreOcrFromRegions: (regions: OcrTextCandidate[]) => void
  autoClassifyWalls: (force?: boolean) => Promise<boolean>
  finalizeWallDetection: () => Promise<boolean>
  onEnterResultStep: () => Promise<void>
  serializeFaceOverrides: () => Array<[number, RoomRasterClass]>
  serializePinnedRoots: () => number[]
  referenceWallThicknessPx: Ref<number | null>
  rects: Ref<Array<{ type: string; x: number; y: number; width: number; height: number }>>
  restoreWallReferenceRect: (rect: DevWallReferenceRect) => void
  restoreOpeningReferenceRects: (rects: DevOpeningReferenceRect[]) => void
  roomInkCoverageThreshold: Ref<number>
  setRoomInkCoverageThreshold: (value: number) => void
  devSessionRestoring: Ref<boolean>
  setLocalError: (message: string | null) => void
  /** Tijdens exact-restore: Stage-2 niet laten racen vóór expliciete re-run. */
  markAutoDoorPassApplied: () => void
  /** Tijdens exact-restore: Stage-3/4 niet laten racen vóór expliciete re-run. */
  markAutoWindowPassApplied: () => void
  /** Na restore: Stage-2 opnieuw toestaan. */
  resetAutoDoorPassGate: () => void
  /** Deuren Stage-2 direct draaien (niet via debounce-race). */
  refreshDoorSwingOverlay: () => Promise<void>
  /** Ramen Stage-3/4 opnieuw toestaan. */
  invalidateAutoWindowPass: () => void
  /** Ramen Stage-3/4 direct draaien. */
  refreshWindowOverlay: () => Promise<void>
  snapResolvedDoorsToWalls: () => void | Promise<void>
}

export function useWorkspaceDevSession(deps: UseWorkspaceDevSessionDeps) {
  const capture = createWorkspaceDevSessionCapture(deps)
  const restoreBase = createWorkspaceDevSessionRestoreBase(deps)
  const restoreDetection = createWorkspaceDevSessionRestoreDetection(deps)
  const restoreFlow = createWorkspaceDevSessionRestoreFlow(deps, restoreBase, restoreDetection)

  const devSessionBusy = ref(false)
  const devSessionMessage = ref<string | null>(null)
  const devSessionOptions = ref<DevSessionOption[]>([])
  const selectedDevSessionId = ref<string | null>(null)
  const hasStoredDevSession = computed(() => devSessionOptions.value.length > 0)

  function currentProjectSessionId(): string | null {
    const imageName = deps.imageName.value?.trim()
    if (!imageName) return null
    return devSessionOptions.value.find((entry) => entry.imageName.trim() === imageName)?.id ?? null
  }

  async function refreshDevSessionOptions(preferSessionId?: string | null): Promise<void> {
    const rows = await listDevSessions<unknown>()
    const validRows = rows.filter((row): row is { id: string; session: DevWorkspaceSession } =>
      isDevWorkspaceSession(row.session),
    )
    if (validRows.length === 0) {
      const legacy = await loadLastDevSession<unknown>()
      if (isDevWorkspaceSession(legacy)) {
        validRows.push({ id: 'legacy:last', session: legacy })
      }
    }
    validRows.sort((a, b) => {
      const ta = Date.parse(a.session.createdAt || '')
      const tb = Date.parse(b.session.createdAt || '')
      return Number.isNaN(tb) || Number.isNaN(ta) ? 0 : tb - ta
    })

    devSessionOptions.value = validRows.map(({ id, session }) => {
      const createdAt = Number.isNaN(Date.parse(session.createdAt))
        ? session.createdAt
        : new Date(session.createdAt).toLocaleString('nl-NL', {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
      return {
        id,
        imageName: session.imageName,
        label: `${session.imageName} (${session.imageWidth}×${session.imageHeight}) — ${createdAt}`,
      }
    })

    const availableIds = new Set(devSessionOptions.value.map((entry) => entry.id))
    const currentSessionId = currentProjectSessionId()
    const desiredId =
      (preferSessionId && availableIds.has(preferSessionId) && preferSessionId) ||
      (currentSessionId && availableIds.has(currentSessionId) && currentSessionId) ||
      (selectedDevSessionId.value &&
        availableIds.has(selectedDevSessionId.value) &&
        selectedDevSessionId.value) ||
      devSessionOptions.value[0]?.id ||
      null
    selectedDevSessionId.value = desiredId
  }

  void refreshDevSessionOptions()

  watch(
    () => deps.imageName.value,
    () => {
      void refreshDevSessionOptions()
    },
  )

  async function recordDevSession(label?: string): Promise<void> {
    devSessionBusy.value = true
    devSessionMessage.value = null
    deps.setLocalError(null)
    try {
      const session = capture.captureCurrentSession(label)
      const rows = await listDevSessions<unknown>()
      const existingRows = rows.filter((row): row is { id: string; session: DevWorkspaceSession } =>
        isDevWorkspaceSession(row.session),
      )
      const storageId = resolveDevSessionStorageId(existingRows, session.imageName)
      await saveDevSession(storageId, session)
      await refreshDevSessionOptions(storageId)
      const stepLabel = flowStepLabel(resolveTargetFlowStep(session))
      const modeHint =
        isSessionV2(session) && session.flow.restoreMode === 'replay' ? ' (replay bij herstel)' : ''
      devSessionMessage.value = `Snapshot opgeslagen voor ${session.imageName} op ${stepLabel}${modeHint} (${session.imageWidth}×${session.imageHeight}).`
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      deps.setLocalError(message)
      devSessionMessage.value = message
      throw e
    } finally {
      devSessionBusy.value = false
    }
  }

  async function restoreDevSession(): Promise<void> {
    devSessionBusy.value = true
    devSessionMessage.value = null
    deps.setLocalError(null)
    deps.devSessionRestoring.value = true
    try {
      const selectedId = selectedDevSessionId.value
      if (!selectedId) {
        throw new Error('Geen snapshot geselecteerd. Neem eerst een snapshot op.')
      }
      const session = await loadDevSessionById<DevWorkspaceSession>(selectedId)
      if (!isDevWorkspaceSession(session)) {
        throw new Error('Geselecteerde snapshot is niet beschikbaar. Kies een andere snapshot.')
      }
      await restoreFlow.restoreSession(session)
      const target = resolveTargetFlowStep(session)
      const mode = resolveRestoreMode(session)
      const modeHint = mode === 'replay' ? ' — detectie opnieuw gedraaid' : ''
      const openingsHint =
        mode === 'exact' &&
        isSessionV2(session) &&
        (session.detectionExact?.roomPhase === 'review' ||
          session.detectionExact?.roomPhase === 'done')
          ? ' — deuren+ramen opnieuw'
          : ''
      devSessionMessage.value = `Hersteld: ${session.imageName} → ${flowStepLabel(target)}${modeHint}${openingsHint} (${session.imageWidth}×${session.imageHeight}).`
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      deps.setLocalError(message)
      devSessionMessage.value = message
      throw e
    } finally {
      await nextTick()
      deps.devSessionRestoring.value = false
      devSessionBusy.value = false
    }
  }

  function selectDevSession(sessionId: string | null): void {
    selectedDevSessionId.value = sessionId
  }

  return {
    devSessionBusy,
    devSessionMessage,
    hasStoredDevSession,
    devSessionOptions,
    selectedDevSessionId,
    selectDevSession,
    recordDevSession,
    restoreDevSession,
  }
}
