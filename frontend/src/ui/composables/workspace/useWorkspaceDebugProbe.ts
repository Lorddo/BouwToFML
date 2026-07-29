import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ExtractionOutput } from '@/core/extraction'
import type { ResultViewTab, TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import { flattenLayersFromOutput } from '@/cv/debug/flatten-output-layers'
import {
  formatProbeClipboardText,
  probeLayersAtPoint,
  probeLayersInRegion,
  type ProbePoint,
  type ProbeRegion,
  type ProbeResult,
} from '@/cv/debug/probe-at-point'
import { probeFaceAtPoint, probeFacesInRegion, type ProbeFaceSource } from '@/cv/debug/probe-faces'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { prepareOpeningPipeDual } from '@/cv/walls/rooms/opening-pipe-dual'
import { detachEnclosedChildrenForOpeningSeeds } from '@/cv/walls/rooms/opening-seed-detach'
import {
  effectiveClassification,
  resolveFloorDual,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'
import { extractComponentsFromLabelsData } from '@/cv/walls/rooms/room-raster'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import type { WorkspaceFlowStep } from './constants'

export type DebugProbeMode = 'point' | 'region'

function normalizeLabelsData(data: SerializedRoomClassifyState['labelsData']): Int32Array {
  return data instanceof Int32Array ? data : new Int32Array(data as ArrayLike<number>)
}

function faceSourceFromState(
  state: SerializedRoomClassifyState,
  classificationByLabel?: Map<number, RoomRasterClass>,
  labelsOverride?: Int32Array,
  parentMapOverride?: Map<number, number>,
): ProbeFaceSource {
  const classification =
    classificationByLabel ?? (new Map(state.classificationByLabel) as Map<number, RoomRasterClass>)
  const labelsData = labelsOverride ?? normalizeLabelsData(state.labelsData)
  const parentMap = parentMapOverride ?? new Map(state.parentMap)
  const components = extractComponentsFromLabelsData(labelsData, state.width, state.height)
  const detached = detachEnclosedChildrenForOpeningSeeds({
    parentMap,
    classificationByLabel: classification,
    components,
    imageWidth: state.width,
    imageHeight: state.height,
  })
  return {
    width: state.width,
    height: state.height,
    labelsData,
    parentMap: detached.parentMap,
    classificationByLabel: detached.classificationByLabel,
    classificationGroupBy: state.classificationGroupBy ?? 'component',
  }
}

type DualFaceSources = {
  wallInk: ProbeFaceSource
  openingWhite: ProbeFaceSource | null
}

/**
 * Live cache eerst (review/overrides), anders gedeelde muren-state op tabOutputs.
 * Dual via FaceDualSpace (white + ink geoms per FaceID).
 */
function buildDualFaceSources(params: {
  roomRasterCache: RoomRasterCache | null | undefined
  tabOutputs: TabDetectionOutputs | null | undefined
}): DualFaceSources | null {
  const cache = params.roomRasterCache
  const state = cache?.state?.labelsData
    ? cache.state
    : params.tabOutputs?.walls?.meta?.roomClassifyState
  if (!state?.labelsData || !state.width || !state.height) return null

  const classification =
    cache?.state?.labelsData && cache.state.labelsData.length === state.labelsData.length
      ? effectiveClassification(cache)
      : (new Map(state.classificationByLabel) as Map<number, RoomRasterClass>)

  try {
    const canResolveDual =
      (cache &&
        cache.state.labelsData.length === state.labelsData.length &&
        cache.state.rawLabelsData) ||
      !!state.rawLabelsData
    if (!canResolveDual) {
      return {
        wallInk: faceSourceFromState(state, classification),
        openingWhite: null,
      }
    }
    const dual = resolveFloorDual({
      state,
      cache,
      classificationByLabel: classification,
      faceOverrides: cache?.faceOverrides,
    })
    const wallInk = faceSourceFromState(
      state,
      dual.ink.classificationByLabel,
      dual.ink.labelsData,
      dual.ink.parentMap,
    )
    // Opening-wit: zelfde bootstrap als deur/raam pipeline (detach + white rebind).
    const { pipeDual } = prepareOpeningPipeDual(dual)
    const openingWhite: ProbeFaceSource = {
      width: pipeDual.white.width,
      height: pipeDual.white.height,
      labelsData: pipeDual.white.labelsData,
      parentMap: pipeDual.white.parentMap,
      classificationByLabel: pipeDual.white.classificationByLabel,
      classificationGroupBy: state.classificationGroupBy ?? 'component',
    }
    return { wallInk, openingWhite }
  } catch {
    return {
      wallInk: faceSourceFromState(state, classification),
      openingWhite: null,
    }
  }
}

function attachFaces(result: ProbeResult, sources: DualFaceSources | null): ProbeResult {
  if (!sources) {
    return {
      ...result,
      faces: [],
      wallInkFaces: [],
      openingWhiteFaces: [],
      faceSourceMissing: true,
    }
  }
  if (result.kind === 'point') {
    const wallHit = probeFaceAtPoint(sources.wallInk, result.point)
    const whiteHit = sources.openingWhite
      ? probeFaceAtPoint(sources.openingWhite, result.point)
      : null
    const wallInkFaces = wallHit ? [wallHit] : []
    const openingWhiteFaces = whiteHit ? [whiteHit] : []
    return {
      ...result,
      faces: wallInkFaces,
      wallInkFaces,
      openingWhiteFaces,
      faceSourceMissing: false,
    }
  }
  if (!result.region) {
    return {
      ...result,
      faces: [],
      wallInkFaces: [],
      openingWhiteFaces: [],
      faceSourceMissing: false,
    }
  }
  const wallInkFaces = probeFacesInRegion(sources.wallInk, result.region)
  const openingWhiteFaces = sources.openingWhite
    ? probeFacesInRegion(sources.openingWhite, result.region)
    : []
  return {
    ...result,
    faces: wallInkFaces,
    wallInkFaces,
    openingWhiteFaces,
    faceSourceMissing: false,
  }
}

export function useWorkspaceDebugProbeFromContext(ctx: {
  flowStep: Ref<WorkspaceFlowStep>
  resultTab: Ref<ResultViewTab>
  templateTab: Ref<TemplateTab>
  imageName: Ref<string | null>
  imageSrc: Ref<string | null>
  originalImageEl: Ref<HTMLImageElement | null>
  activePipelineOutput: ComputedRef<ExtractionOutput | null>
  tabOutputs: Ref<TabDetectionOutputs>
  roomRasterCache: Ref<RoomRasterCache | null>
}) {
  const planSize = computed(() => {
    const img = ctx.originalImageEl.value
    if (img?.naturalWidth && img.naturalHeight) {
      return { width: img.naturalWidth, height: img.naturalHeight }
    }
    const output = ctx.activePipelineOutput.value
    if (output?.roomWallMaskRle) {
      return {
        width: output.roomWallMaskRle.width,
        height: output.roomWallMaskRle.height,
      }
    }
    return null
  })

  const probeCanvasAvailable = computed(() => {
    if (!ctx.imageSrc.value) return false
    if (ctx.flowStep.value === 'result' && ctx.resultTab.value === 'vector') return false
    if (ctx.flowStep.value === 'templates' && ctx.templateTab.value === 'ocr') return false
    return true
  })

  return useWorkspaceDebugProbe({
    flowStep: ctx.flowStep,
    imageName: ctx.imageName,
    planSize,
    activePipelineOutput: ctx.activePipelineOutput,
    tabOutputs: ctx.tabOutputs,
    roomRasterCache: ctx.roomRasterCache,
    probeCanvasAvailable,
  })
}

export function useWorkspaceDebugProbe(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  imageName: Ref<string | null>
  planSize: ComputedRef<{ width: number; height: number } | null>
  activePipelineOutput: ComputedRef<ExtractionOutput | null>
  tabOutputs: Ref<TabDetectionOutputs>
  roomRasterCache: Ref<RoomRasterCache | null>
  probeCanvasAvailable: ComputedRef<boolean>
}) {
  const probeEnabled = ref(false)
  const probeMode = ref<DebugProbeMode>('region')
  const lastResult = ref<ProbeResult | null>(null)
  const clipboardStatus = ref<'idle' | 'copied' | 'error'>('idle')
  let clipboardResetTimer: ReturnType<typeof setTimeout> | null = null

  const probeVisible = computed(
    () => deps.flowStep.value === 'templates' || deps.flowStep.value === 'result',
  )

  const probeActive = computed(
    () => probeVisible.value && probeEnabled.value && deps.probeCanvasAvailable.value,
  )

  watch(probeVisible, (visible) => {
    if (!visible) probeEnabled.value = false
  })

  watch(deps.probeCanvasAvailable, (available) => {
    if (!available) probeEnabled.value = false
  })

  function resolveDualFaceSources(): DualFaceSources | null {
    return buildDualFaceSources({
      roomRasterCache: deps.roomRasterCache.value,
      tabOutputs: deps.tabOutputs.value,
    })
  }

  function toggleProbe() {
    if (!probeVisible.value) return
    probeEnabled.value = !probeEnabled.value
    if (!probeEnabled.value) {
      lastResult.value = null
    }
  }

  function setProbeMode(mode: DebugProbeMode) {
    probeMode.value = mode
  }

  function analyzePoint(point: ProbePoint): ProbeResult {
    const layers = flattenLayersFromOutput(deps.activePipelineOutput.value)
    const base = probeLayersAtPoint(layers, {
      x: Math.round(point.x),
      y: Math.round(point.y),
    })
    const result = attachFaces(base, resolveDualFaceSources())
    lastResult.value = result
    return result
  }

  function analyzeRegion(region: ProbeRegion): ProbeResult {
    const x = Math.min(region.x, region.x + region.width)
    const y = Math.min(region.y, region.y + region.height)
    const width = Math.abs(region.width)
    const height = Math.abs(region.height)
    const layers = flattenLayersFromOutput(deps.activePipelineOutput.value)
    const base = probeLayersInRegion(layers, {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    })
    const result = attachFaces(base, resolveDualFaceSources())
    lastResult.value = result
    return result
  }

  function onProbeSample(sample: {
    kind: 'point' | 'region'
    point: ProbePoint
    region?: ProbeRegion
  }) {
    if (sample.kind === 'point' || probeMode.value === 'point') {
      analyzePoint(sample.point)
    } else if (sample.region) {
      analyzeRegion(sample.region)
    } else {
      analyzePoint(sample.point)
    }
    void copyProbeToClipboard()
  }

  async function copyProbeToClipboard(): Promise<boolean> {
    if (!lastResult.value) return false
    const text = formatProbeClipboardText({
      imageName: deps.imageName.value,
      planSize: deps.planSize.value,
      flowStep: deps.flowStep.value === 'templates' ? 'Detectie (stap 3)' : 'Resultaat (stap 4)',
      result: lastResult.value,
    })
    try {
      await navigator.clipboard.writeText(text)
      clipboardStatus.value = 'copied'
      if (clipboardResetTimer) clearTimeout(clipboardResetTimer)
      clipboardResetTimer = setTimeout(() => {
        clipboardStatus.value = 'idle'
      }, 2500)
      return true
    } catch {
      clipboardStatus.value = 'error'
      return false
    }
  }

  return {
    probeEnabled,
    probeMode,
    probeVisible,
    probeActive,
    probeCanvasAvailable: deps.probeCanvasAvailable,
    lastResult,
    clipboardStatus,
    toggleProbe,
    setProbeMode,
    onProbeSample,
    analyzePoint,
    analyzeRegion,
    copyProbeToClipboard,
  }
}
