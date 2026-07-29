import { ref, watch, type ComputedRef, type Ref } from 'vue'
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
      status.value = 'Profiel aangepast — genereer detectie opnieuw per tab.'
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

  function clearTemplateTypeRects() {
    const cls = deps.templateElementClass.value
    if (!cls) return
    deps.clearRectsByType(cls)
    if (cls === 'wall') {
      clearWallOutputs()
      deps.referenceWallThicknessPx.value = null
    } else {
      const tabKey = elementClassToDetectionLayer(cls)
      deps.tabOutputs.value = { ...deps.tabOutputs.value, [tabKey]: null }
    }
    deps.pruneSignaturePreview()
  }

  function keepSingleWallRect(): SelectionRect | null {
    const wallRects = deps.rects.value.filter((rect) => rect.type === 'wall')
    const keep = wallRects[wallRects.length - 1] ?? null
    if (keep) {
      for (const rect of wallRects) {
        if (rect.id === keep.id) continue
        deps.removeRect(rect.id)
      }
      deps.selectRect(null)
    }
    return keep
  }

  async function measureWallReferenceThickness(rect: SelectionRect): Promise<number | null> {
    measuringReferenceWall.value = true
    try {
      if (!deps.cvLoader.ready.value) {
        await deps.cvLoader.ensureOpenCv()
        if (!deps.cvLoader.ready.value) {
          throw new Error(deps.cvLoader.error.value ?? 'OpenCV kon niet geladen worden.')
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
        deps.setLocalError('Muur-B/W niet beschikbaar voor diktemeting.')
        deps.referenceWallThicknessPx.value = null
        return null
      }
      const thickness = measureReferenceWallThicknessPx({
        cv,
        baseBw,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      })
      deps.referenceWallThicknessPx.value = thickness
      try {
        const style = classifyWallRefStyleFromBw({
          bw: baseBw.data,
          width: baseBw.width,
          height: baseBw.height,
          rect: {
            id: rect.id,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        })
        deps.applyAutoGapsInkMode?.(style.gapsInkMode)
        if (thickness != null) {
          status.value = `Muurdikte ${thickness}px · ${style.renderStyle} (${style.faceCount} faces)`
        }
      } catch {
        /* stijl optioneel — dikte blijft leidend */
      }
      if (thickness == null) {
        deps.setLocalError(
          'Kon muurdikte niet meten in het referentievak. Teken opnieuw over een duidelijke muur.',
        )
      } else {
        deps.setLocalError(null)
        if (!status.value.startsWith('Muurdikte')) {
          status.value = `Muurdikte gemeten: ${thickness}px`
        }
      }
      return thickness
    } catch (e) {
      deps.referenceWallThicknessPx.value = null
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
      const keep = keepSingleWallRect()
      deps.referenceWallThicknessPx.value = null
      clearWallOutputs()
      deps.onRoomPipelineReset?.()
      deps.clearGapsInkModeManual?.()
      if (keep) {
        deps.onReferenceWallRectReady?.()
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
    try {
      if (!deps.cvLoader.ready.value) {
        await deps.cvLoader.ensureOpenCv()
        if (!deps.cvLoader.ready.value) {
          throw new Error(deps.cvLoader.error.value ?? 'OpenCV kon niet geladen worden.')
        }
      }
      const img = await deps.getImageEl()
      deps.ensureScaleInitialized(img)
      if (!deps.scaleConfirmed.value) {
        throw new Error('Bevestig eerst de schaal met ✓ voordat je detectie start.')
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
        status.value = 'Beeld voorbereiden voor classificatie…'
      }
      const requiresExamples = options?.requireExamples === true
      const allRects = deps.rects.value.map((rect) => ({
        ...rect,
        signature: rect.signature ?? deps.signaturePreview.value[rect.id],
      }))
      const runRects = requiresExamples ? examplesForTargets(targets, allRects) : []
      if (requiresExamples && runRects.length === 0) {
        deps.setLocalError('Teken minstens één voorbeeldvak voor muur.')
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
        throw new Error(
          'Detectie-pipeline niet geladen (noop). Herstart de app — worker moet geometry-lbe registreren.',
        )
      }
      lastOutput.value = outputWithVectorDebug
      const tabKey = tabFromDetectTargets(targets)
      if (tabKey && isGeometryDetectionLayer(tabKey)) {
        const previous = deps.tabOutputs.value[tabKey]
        const isFinalize = options?.phase === 'finalize'
        if (isFinalize && !isFinalizeTabOutput(outputWithVectorDebug)) {
          if (previous) {
            deps.tabOutputs.value = { ...deps.tabOutputs.value, [tabKey]: previous }
          }
          throw new Error(
            'Afronden detectie mislukt — classificatie is behouden. Probeer opnieuw of herlaad de pagina.',
          )
        }
        deps.tabOutputs.value = { ...deps.tabOutputs.value, [tabKey]: outputWithVectorDebug }
      }
      return true
    } catch (e) {
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
