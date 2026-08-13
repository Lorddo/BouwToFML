import { ref, watch, type ComputedRef, type Ref } from 'vue'
import {
  getRunJournal,
  noteRollback,
  noteSwallowedError,
  resetRunJournal,
} from '@/core/diagnostics'
import type { GeometricSignature } from '@/core/extraction/geometric-signature'
import type { ElementClass } from '@/core/extraction/types'
import type { WallJunctionStrategy } from '@/core/extraction/types'
import type { PreprocessConfig } from '@/platform/image'
import {
  applyDetectionPreset,
  defaultRoomInkThresholdForProfile,
  detectionPresetForProfile,
  storeProfileId,
  type DrawingProfileId,
} from '@/platform/profile'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import type { SelectionRect } from '@/platform/selection'
import {
  enforceWallRefLimit,
  resolveReferenceWallThicknessDetail,
  resolveStyleWallRect,
  resolveWallThicknessBand,
  type WallRefThicknessMeasure,
} from '@/platform/selection/wall-thickness-ref'
import type { FmlWallThicknessLimits } from '@/core/fml/fml-wall-thickness-limits'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import {
  emptyTabOutputs,
  tabFromDetectTargets,
  type TabDetectionOutputs,
} from '@/cv/pipeline/merge-tab-outputs'
import {
  detectTargetsForTab,
  elementClassToDetectionLayer,
  isFinalizeTabOutput,
  isGeometryDetectionLayer,
} from '@/cv/workspace/layer-flow'
import {
  attachPreprocessVectorCacheToOutput,
  type PreprocessVectorCache,
} from '@/cv/preprocess/preprocess-vector-cache'
import { formatCvError } from '@/cv/formatCvError'
import { measureReferenceWallThicknessPx } from '@/cv/walls/measure-reference-wall'
import { classifyWallRefStyleFromBw } from '@/cv/refs/classify-wall-ref-style'
import type { GapsInkMode } from '@/cv/gaps'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { tGlobal } from '@/ui/i18n'
import type { useExtraction } from '../useExtraction'
import type { useOpenCvLoader } from '../useOpenCvLoader'
import type { WorkspaceFlowStep } from './constants'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'

const ROOM_INK_THRESHOLD_MIN = 0.5
const ROOM_INK_THRESHOLD_MAX = 0.95
const REFERENCE_DRAW_TYPES: ReadonlyArray<'wall' | 'door' | 'window'> = ['wall', 'door', 'window']

function clampRoomInkThreshold(value: number, fallback: number): number {
  if (Number.isNaN(value)) return fallback
  return Math.min(ROOM_INK_THRESHOLD_MAX, Math.max(ROOM_INK_THRESHOLD_MIN, value))
}

export function useWorkspaceDetection(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  templateTab: Ref<TemplateTab>
  templateElementClass: ComputedRef<'wall' | null>
  drawingProfileId: Ref<DrawingProfileId>
  profileConfirmed: Ref<boolean>
  activeDetectionPreset: ComputedRef<ReturnType<typeof detectionPresetForProfile>>
  preprocess: Ref<PreprocessConfig>
  referenceWallThicknessPx: Ref<number | null>
  wallPipelineVersion: Ref<WallPipelineVersion>
  tabOutputs: Ref<TabDetectionOutputs>
  preprocessVectorCache: Ref<PreprocessVectorCache | null>
  rects: Ref<SelectionRect[]>
  signaturePreview: Ref<Record<string, GeometricSignature>>
  activeClass: Ref<ElementClass | null>
  cvLoader: ReturnType<typeof useOpenCvLoader>
  extraction: ReturnType<typeof useExtraction>
  scaleConfirmed: Ref<boolean>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  ensureScaleInitialized: (img: HTMLImageElement | HTMLCanvasElement) => void
  preprocessMaskArgs: () => PreprocessMaskInput
  ensureWallBwReady?: () => Promise<boolean>
  getBaseWallBw?: () => { data: Uint8Array; width: number; height: number } | null
  clearRectsByType: (cls: ElementClass) => void
  removeRect: (id: string) => void
  selectRect: (id: string | null) => void
  updateRectBounds: (
    id: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void
  updateRectFmlRefId: (id: string, fmlRefId: string) => void
  updateRectWallThicknessBand: (id: string, band: FmlThicknessBand) => void
  /** Project/export diktes voor max-equivalent schaal. */
  getWallThicknessLimits: () => FmlWallThicknessLimits
  setWallThicknessCm?: (band: FmlThicknessBand, cm: number) => void
  /** Laatste multi-ref metingen (voor bandgrenzen). */
  wallRefThicknessMeasures: Ref<WallRefThicknessMeasure[]>
  wallThicknessBandBoundariesPx?: Ref<{ midBoundaryPx: number; maxBoundaryPx: number } | null>
  endDraw: () => void
  cancelDraw: () => void
  clearSignatureForRect: (id: string) => void
  pruneSignaturePreview: () => void
  refreshSignaturePreview: () => Promise<void>
  scheduleLivePreprocessPreview: () => void
  refreshAllDetectionUnderlays: () => Promise<void>
  setLocalError: (message: string | null) => void
  onRoomInkThresholdChanged?: () => void
  onRoomPipelineReset?: () => void
  onReferenceWallRectReady?: () => void | Promise<void>
  /** Auto solid/detail uit muur-ref face-count (tenzij handmatig overridden). */
  applyAutoGapsInkMode?: (mode: GapsInkMode) => void
  /** Nieuwe muur-ref: handmatige gaten-override loslaten. */
  clearGapsInkModeManual?: () => void
}) {
  const { running, status, lastOutput, run } = deps.extraction
  const measuringReferenceWall = ref(false)
  const roomInkCoverageThreshold = ref(
    defaultRoomInkThresholdForProfile(deps.drawingProfileId.value),
  )

  watch(
    () => deps.drawingProfileId.value,
    (profileId) => {
      roomInkCoverageThreshold.value = defaultRoomInkThresholdForProfile(profileId)
    },
  )

  function setRoomInkCoverageThreshold(value: number) {
    const fallback = defaultRoomInkThresholdForProfile(deps.drawingProfileId.value)
    roomInkCoverageThreshold.value = clampRoomInkThreshold(value, fallback)
    deps.onRoomInkThresholdChanged?.()
  }

  function onProfileSelected(id: DrawingProfileId) {
    deps.drawingProfileId.value = id
    storeProfileId(id)
    const { preprocess: mergedPreprocess } = applyDetectionPreset(deps.preprocess.value, id)
    deps.preprocess.value = mergedPreprocess
    deps.profileConfirmed.value = true
    deps.tabOutputs.value = emptyTabOutputs()
    deps.onRoomPipelineReset?.()
    if (deps.flowStep.value === 'templates') {
      status.value = tGlobal('templates.status.profileChanged')
      void deps.refreshSignaturePreview()
      void deps.refreshAllDetectionUnderlays()
    }
  }

  function clearWallOutputs() {
    deps.tabOutputs.value = emptyTabOutputs()
  }

  function examplesForTargets(
    targets: { walls?: boolean; wallJunctionStrategy?: WallJunctionStrategy },
    sourceRects: SelectionRect[],
  ) {
    if (!targets.walls) return []
    return sourceRects.filter((rect) => rect.type === 'wall')
  }

  function detectTargetsForTemplateTab(tab: Parameters<typeof detectTargetsForTab>[0]) {
    return detectTargetsForTab(tab)
  }

  function setTemplatePanMode() {
    deps.activeClass.value = null
    deps.selectRect(null)
  }

  function setTemplateDrawMode() {
    const cls = deps.templateElementClass.value
    if (!cls) return
    deps.activeClass.value = cls
  }

  function setReferencePanMode() {
    deps.cancelDraw()
    deps.activeClass.value = null
    deps.selectRect(null)
  }

  function setReferenceDrawMode(type: 'wall' | 'door' | 'window') {
    if (!REFERENCE_DRAW_TYPES.includes(type)) return
    // Opnieuw klikken op de actieve knop = deactiveren (Pan-knop is weg).
    if (deps.activeClass.value === type) {
      setReferencePanMode()
      return
    }
    deps.activeClass.value = type
  }

  function onDoorFmlRefIdChange(id: string, fmlRefId: string) {
    deps.updateRectFmlRefId(id, fmlRefId)
  }

  function onWallThicknessBandChange(id: string, band: FmlThicknessBand) {
    deps.updateRectWallThicknessBand(id, band)
    deps.referenceWallThicknessPx.value = null
    deps.wallRefThicknessMeasures.value = []
    deps.onRoomPipelineReset?.()
  }

  function onWallThicknessCmChange(band: FmlThicknessBand, cm: number) {
    if (!(cm > 0)) return
    deps.setWallThicknessCm?.(band, cm)
    deps.referenceWallThicknessPx.value = null
    deps.wallRefThicknessMeasures.value = []
    deps.onRoomPipelineReset?.()
  }

  function clearTemplateTypeRects() {
    const cls = deps.templateElementClass.value
    if (!cls) return
    deps.clearRectsByType(cls)
    if (cls === 'wall') {
      clearWallOutputs()
      deps.referenceWallThicknessPx.value = null
      deps.wallRefThicknessMeasures.value = []
    } else {
      const tabKey = elementClassToDetectionLayer(cls)
      deps.tabOutputs.value = { ...deps.tabOutputs.value, [tabKey]: null }
    }
    deps.pruneSignaturePreview()
  }

  function enforceWallRefsAfterDraw(): SelectionRect | null {
    const before = deps.rects.value
    const { rects: next, removedIds } = enforceWallRefLimit(before)
    if (removedIds.length > 0 || next.length !== before.length) {
      for (const id of removedIds) {
        deps.clearSignatureForRect(id)
      }
      deps.rects.value = next
    }
    deps.selectRect(null)
    return resolveStyleWallRect(deps.rects.value)
  }

  /**
   * Meet alle muur-refs → max-equivalent `referenceWallThicknessPx`.
   * Optionele `rect` (legacy): genegeerd voor selectie; alle wall-rects worden gemeten.
   */
  async function measureWallReferenceThickness(_rect?: SelectionRect): Promise<number | null> {
    measuringReferenceWall.value = true
    try {
      if (!deps.cvLoader.ready.value) {
        await deps.cvLoader.ensureOpenCv()
        if (!deps.cvLoader.ready.value) {
          throw new Error(deps.cvLoader.error.value ?? tGlobal('common.opencvLoadFailed'))
        }
      }
      const cv = await waitForOpenCV()
      const img = await deps.getImageEl()
      deps.ensureScaleInitialized(img)
      // Prefer canonieke baseBw (ná bake in goToNextStep). Fallback: rebuild indien leeg.
      if (!deps.getBaseWallBw?.()) {
        await deps.ensureWallBwReady?.()
      }
      const baseBw = deps.getBaseWallBw?.()
      if (!baseBw) {
        deps.setLocalError(tGlobal('preprocess.errors.bwUnavailableForMeasure'))
        deps.referenceWallThicknessPx.value = null
        deps.wallRefThicknessMeasures.value = []
        return null
      }

      const wallRects = deps.rects.value.filter((r) => r.type === 'wall')
      if (wallRects.length === 0) {
        deps.setLocalError(tGlobal('preprocess.errors.drawWallRef'))
        deps.referenceWallThicknessPx.value = null
        deps.wallRefThicknessMeasures.value = []
        return null
      }

      const measures: WallRefThicknessMeasure[] = []
      for (const wallRect of wallRects) {
        const thickness = measureReferenceWallThicknessPx({
          cv,
          baseBw,
          rect: {
            x: wallRect.x,
            y: wallRect.y,
            width: wallRect.width,
            height: wallRect.height,
          },
        })
        if (thickness != null && thickness > 0) {
          measures.push({
            band: resolveWallThicknessBand(wallRect),
            thicknessPx: thickness,
            rectId: wallRect.id,
          })
        }
      }

      deps.wallRefThicknessMeasures.value = measures
      const limits = deps.getWallThicknessLimits()
      let referencePx: number | null = null
      try {
        const resolved = resolveReferenceWallThicknessDetail({ measures, limits })
        referencePx = resolved?.referenceWallThicknessPx ?? null
        if (resolved?.usedScaledFallback) {
          status.value = tGlobal('templates.status.thicknessScaledFromBand', {
            px: Math.round(referencePx ?? 0),
            band: resolved.sourceBand,
          })
        }
      } catch (error) {
        deps.setLocalError(formatCvError(error))
        deps.referenceWallThicknessPx.value = null
        return null
      }
      deps.referenceWallThicknessPx.value = referencePx

      const styleRect = resolveStyleWallRect(deps.rects.value)
      try {
        if (styleRect) {
          const style = classifyWallRefStyleFromBw({
            bw: baseBw.data,
            width: baseBw.width,
            height: baseBw.height,
            rect: {
              id: styleRect.id,
              x: styleRect.x,
              y: styleRect.y,
              width: styleRect.width,
              height: styleRect.height,
            },
          })
          deps.applyAutoGapsInkMode?.(style.gapsInkMode)
          if (referencePx != null) {
            status.value = tGlobal('templates.status.thicknessWithStyle', {
              px: Math.round(referencePx),
              style: style.renderStyle,
              faces: style.faceCount,
            })
          }
        }
        // ESC:O-31 (D)
      } catch (error) {
        /* stijl optioneel — dikte blijft leidend */
        noteSwallowedError('O-31', 'useWorkspaceDetection.measureReferenceWall', error, {
          effect: 'muurstijl-classificatie overgeslagen',
        })
      }
      if (referencePx == null || referencePx <= 0) {
        deps.setLocalError(tGlobal('preprocess.errors.measureThicknessFailed'))
      } else {
        deps.setLocalError(null)
        if (!status.value.includes(String(Math.round(referencePx)))) {
          status.value = tGlobal('templates.status.thicknessMeasured', {
            px: Math.round(referencePx),
          })
        }
      }
      return referencePx
    } catch (e) {
      deps.referenceWallThicknessPx.value = null
      deps.wallRefThicknessMeasures.value = []
      deps.setLocalError(formatCvError(e))
      return null
    } finally {
      measuringReferenceWall.value = false
    }
  }

  function onRectUpdate(
    id: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) {
    deps.updateRectBounds(id, bounds)
    const rect = deps.rects.value.find((item) => item.id === id)
    if (rect?.type === 'wall') {
      deps.referenceWallThicknessPx.value = null
      deps.wallRefThicknessMeasures.value = []
      deps.onRoomPipelineReset?.()
      // Dikte pas meten bij afronden stap 2 — niet live bij resize.
    }
    deps.clearSignatureForRect(id)
    void deps.refreshSignaturePreview()
  }

  function onRectDelete(id: string) {
    const rect = deps.rects.value.find((item) => item.id === id)
    deps.clearSignatureForRect(id)
    deps.removeRect(id)
    if (rect?.type === 'wall') {
      deps.referenceWallThicknessPx.value = null
      deps.wallRefThicknessMeasures.value = []
      clearWallOutputs()
      deps.onRoomPipelineReset?.()
    } else if (rect && deps.flowStep.value === 'templates') {
      const tabKey = elementClassToDetectionLayer(rect.type)
      deps.tabOutputs.value = { ...deps.tabOutputs.value, [tabKey]: null }
    }
    void deps.refreshSignaturePreview()
  }

  function onLbeEndDraw() {
    deps.endDraw()
    if (deps.flowStep.value !== 'preprocess') return

    const drawnType = deps.rects.value[deps.rects.value.length - 1]?.type
    if (drawnType === 'wall') {
      const keep = enforceWallRefsAfterDraw()
      deps.referenceWallThicknessPx.value = null
      deps.wallRefThicknessMeasures.value = []
      clearWallOutputs()
      deps.onRoomPipelineReset?.()
      deps.clearGapsInkModeManual?.()
      if (keep) {
        void deps.onReferenceWallRectReady?.()
      }
      return
    }
    // Deur/raam: meerdere vakken, nog geen detectie.
    deps.selectRect(null)
  }

  async function onDetectTemplateTab(): Promise<boolean> {
    return onExtractTargets(detectTargetsForTemplateTab(deps.templateTab.value))
  }

  async function onExtractTargets(
    targets: { walls?: boolean; wallJunctionStrategy?: WallJunctionStrategy },
    options?: {
      requireExamples?: boolean
      phase?: 'classify' | 'recalculate' | 'finalize' | 'full'
      roomClassifyState?: SerializedRoomClassifyState
      faceOverrides?: Array<[number, RoomRasterClass]>
      pinnedRoots?: number[]
      referenceWallMeasureRect?: { x: number; y: number; width: number; height: number }
    },
  ): Promise<boolean> {
    deps.setLocalError(null)
    // Nieuwe top-level actie → nieuw run-journaal. Deur-/raampassen die hierna in watchers
    // lopen tellen mee in dezelfde run.
    resetRunJournal(`detect:${options?.phase ?? 'full'}`)
    try {
      if (!deps.cvLoader.ready.value) {
        await deps.cvLoader.ensureOpenCv()
        if (!deps.cvLoader.ready.value) {
          throw new Error(deps.cvLoader.error.value ?? tGlobal('common.opencvLoadFailed'))
        }
      }
      const img = await deps.getImageEl()
      deps.ensureScaleInitialized(img)
      if (!deps.scaleConfirmed.value) {
        throw new Error(tGlobal('templates.errors.confirmScaleFirst'))
      }
      if (
        options?.phase === 'classify' ||
        options?.phase === 'finalize' ||
        options?.phase === 'full'
      ) {
        await deps.ensureWallBwReady?.()
      }
      if (options?.phase === 'classify') {
        deps.setLocalError(null)
        status.value = tGlobal('templates.status.prepareClassify')
      }
      const requiresExamples = options?.requireExamples === true
      const allRects = deps.rects.value.map((rect) => ({
        ...rect,
        signature: rect.signature ?? deps.signaturePreview.value[rect.id],
      }))
      const runRects = requiresExamples ? examplesForTargets(targets, allRects) : []
      if (requiresExamples && runRects.length === 0) {
        deps.setLocalError(tGlobal('preprocess.errors.drawWallRef'))
        return false
      }
      const output = await run(
        img,
        runRects,
        deps.preprocess.value,
        targets,
        deps.preprocessMaskArgs(),
        {
          roomInkCoverageThreshold: roomInkCoverageThreshold.value,
          wallStyle: deps.preprocess.value.wallStyle,
          referenceWallThicknessPx: deps.referenceWallThicknessPx.value ?? undefined,
          bandBoundariesPx: deps.wallThicknessBandBoundariesPx?.value ?? undefined,
          referenceWallMeasureRect: options?.referenceWallMeasureRect,
          roomPipelinePhase: options?.phase ?? 'full',
          wallPipelineVersion: deps.wallPipelineVersion.value,
          roomClassifyState: options?.roomClassifyState,
          faceOverrides: options?.faceOverrides,
          pinnedRoots: options?.pinnedRoots,
        },
      )
      if (output.meta?.referenceWallThicknessPx && output.meta.referenceWallThicknessPx > 0) {
        deps.referenceWallThicknessPx.value = output.meta.referenceWallThicknessPx
      }
      const outputWithVectorDebug = deps.preprocessVectorCache.value
        ? attachPreprocessVectorCacheToOutput(output, deps.preprocessVectorCache.value)
        : output
      if (outputWithVectorDebug.meta?.extractorId === 'noop') {
        throw new Error(tGlobal('templates.errors.pipelineNotLoaded'))
      }
      lastOutput.value = outputWithVectorDebug
      const tabKey = tabFromDetectTargets(targets)
      if (tabKey && isGeometryDetectionLayer(tabKey)) {
        const previous = deps.tabOutputs.value[tabKey]
        const isFinalize = options?.phase === 'finalize'
        // ESC:O-32 (D)
        if (isFinalize && !isFinalizeTabOutput(outputWithVectorDebug)) {
          noteRollback('O-32', 'useWorkspaceDetection.runDetection', 'finalize-output afgekeurd', {
            tab: tabKey,
            restoredPrevious: !!previous,
          })
          if (previous) {
            deps.tabOutputs.value = { ...deps.tabOutputs.value, [tabKey]: previous }
          }
          throw new Error(tGlobal('templates.errors.finalizeFailed'))
        }
        deps.tabOutputs.value = { ...deps.tabOutputs.value, [tabKey]: outputWithVectorDebug }
      }
      const journal = getRunJournal()
      if (journal.degraded) {
        const swallowed = journal.events.filter((event) => event.kind === 'swallowed_error')
        status.value = tGlobal('templates.status.swallowedErrors', {
          count: swallowed.length,
          where: swallowed[0]?.where ?? 'unknown',
        })
      }
      return true
      // ESC:O-33 (D)
    } catch (e) {
      noteSwallowedError('O-33', 'useWorkspaceDetection.runDetection', e, {
        phase: options?.phase ?? 'detect',
      })
      deps.setLocalError(formatCvError(e))
      return false
    }
  }

  return {
    running,
    status,
    lastOutput,
    measuringReferenceWall,
    onProfileSelected,
    setTemplatePanMode,
    setTemplateDrawMode,
    setReferencePanMode,
    setReferenceDrawMode,
    onDoorFmlRefIdChange,
    onWallThicknessBandChange,
    onWallThicknessCmChange,
    clearTemplateTypeRects,
    measureWallReferenceThickness,
    onRectUpdate,
    onRectDelete,
    onLbeEndDraw,
    onDetectTemplateTab,
    onExtractTargets,
    roomInkCoverageThreshold,
    setRoomInkCoverageThreshold,
  }
}
