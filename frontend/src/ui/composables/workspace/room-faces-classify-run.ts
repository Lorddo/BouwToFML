import type { ExtractionOutput } from '@/core/extraction'
import type { PreprocessConfig } from '@/platform/image'
import type { WallJunctionStrategy } from '@/core/extraction/types'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { SelectionRect } from '@/platform/selection'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import {
  applySerializedFaceOverrides,
  invalidateFaceDualSpace,
  rebuildFaceBBoxIndex,
  serializeFaceOverrides,
  serializePinnedRoots,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'
import {
  runRoomRecalculateLocal,
  type RoomRecalculateLocalResult,
} from '@/cv/walls/rooms/room-recalculate-local'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import type { RoomPhase } from './useWorkspaceRoomFaces'
import { isWallsClassifyOutput, isWallsOutputFinalized } from './room-faces-cache-sync'

export function normalizeClassifyState(
  state: SerializedRoomClassifyState,
): SerializedRoomClassifyState {
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
  }
}

function buildRecalculateTabOutput(
  previous: ExtractionOutput | null | undefined,
  result: RoomRecalculateLocalResult,
  referenceWallThicknessPx: number | null,
  wallStyle: PreprocessConfig['wallStyle'] | undefined,
  elapsedMs: number,
): ExtractionOutput {
  return {
    candidates: previous?.candidates ?? [],
    segments: previous?.segments ?? [],
    masks: previous?.masks ?? [],
    meta: {
      ...(previous?.meta ?? {}),
      extractorId: 'geometry-lbe',
      elapsedMs,
      wallJunctionStrategy: 'room_first',
      roomPipelinePhase: 'recalculate',
      roomClassifyState: result.roomClassifyState,
      roomFaceCount: result.mergedFaceCount,
      roomSurfaceCount: result.surfaceCount,
      roomWallCount: result.wallCount,
      roomUnknownCount: result.unknownCount,
      referenceWallThicknessPx: referenceWallThicknessPx ?? undefined,
      wallStyle,
    },
  }
}

export function resolveReferenceWallRect(
  rects: SelectionRect[],
  selectedRectId: string | null,
): SelectionRect | null {
  const wallRects = rects.filter((rect) => rect.type === 'wall')
  if (wallRects.length === 0) return null
  const selected = wallRects.find((rect) => rect.id === selectedRectId)
  if (selected) return selected
  return wallRects[wallRects.length - 1] ?? null
}

export function shouldAutoClassify(ctx: {
  roomPhase: RoomPhase
  wallsOutput: ExtractionOutput | null | undefined
  flowStep: string
  templateTab: string
  profileConfirmed: boolean
}): boolean {
  if (
    ctx.roomPhase === 'done' ||
    ctx.roomPhase === 'review' ||
    ctx.roomPhase === 'awaiting_reference'
  ) {
    return false
  }
  if (isWallsOutputFinalized(ctx.wallsOutput)) return false
  if (isWallsClassifyOutput(ctx.wallsOutput)) return false
  return (
    ctx.flowStep === 'templates' &&
    ctx.templateTab === 'walls' &&
    ctx.profileConfirmed &&
    ctx.roomPhase !== 'classifying' &&
    ctx.roomPhase !== 'recalculating' &&
    ctx.roomPhase !== 'finalizing'
  )
}

export function ingestRecalculateOutput(
  output: ExtractionOutput | null,
  cache: RoomRasterCache,
): RoomRasterCache | null {
  const state = output?.meta?.roomClassifyState
  if (!state) return null
  cache.state = normalizeClassifyState(state)
  applySerializedFaceOverrides(cache, state.faceOverrides, state.pinnedRoots)
  invalidateFaceDualSpace(cache)
  rebuildFaceBBoxIndex(cache)
  return {
    ...cache,
    faceOverrides: new Map(cache.faceOverrides),
    pinnedRoots: new Set(cache.pinnedRoots),
    faceBBox: cache.faceBBox,
  }
}

export async function recalculateFaces(ctx: {
  referenceWallThicknessPx: number | null
  roomRasterCache: RoomRasterCache | null
  wallsOutput: ExtractionOutput | null | undefined
  tabOutputs: TabDetectionOutputs
  preprocess: PreprocessConfig
  preprocessMaskArgs: () => PreprocessMaskInput
  ensureOpenCv: () => Promise<void>
  ensureWallBwReady?: () => Promise<boolean>
  getEffectiveWallBwBytes?: () => Uint8Array | null
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  ensureScaleInitialized: (img: HTMLImageElement | HTMLCanvasElement) => void
  setStatus?: (message: string) => void
  restoreCacheFromOutput: (output: ExtractionOutput | null | undefined) => RoomRasterCache | null
}): Promise<{
  success: boolean
  nextCache: RoomRasterCache | null
  nextTabOutputs: TabDetectionOutputs | null
}> {
  if (!ctx.referenceWallThicknessPx || ctx.referenceWallThicknessPx <= 0) {
    ctx.setStatus?.('Meet eerst een referentie muur via Autoclassificeer.')
    return { success: false, nextCache: null, nextTabOutputs: null }
  }

  const cache =
    ctx.roomRasterCache ?? ctx.restoreCacheFromOutput(ctx.wallsOutput)
  if (!cache) {
    ctx.setStatus?.('Geen classificatie-state — eerst autoclassificeren.')
    return { success: false, nextCache: null, nextTabOutputs: null }
  }

  ctx.setStatus?.('Inktwijzigingen verwerken…')
  const started = performance.now()
  await ctx.ensureOpenCv()
  const cv = await waitForOpenCV()
  await ctx.ensureWallBwReady?.()
  const img = await ctx.getImageEl()
  ctx.ensureScaleInitialized(img)
  const precomposedWallBw = ctx.getEffectiveWallBwBytes?.()
  if (!precomposedWallBw) {
    throw new Error('Geen muur-B/W beschikbaar voor inkt verwerken.')
  }

  const result = await runRoomRecalculateLocal({
    cv,
    image: img,
    precomposedWallBw,
    preprocess: ctx.preprocess,
    eraserMask: ctx.preprocessMaskArgs().eraserMask ?? undefined,
    wallStyle: ctx.preprocess.wallStyle,
    referenceWallThicknessPx: ctx.referenceWallThicknessPx ?? undefined,
    roomClassifyState: normalizeClassifyState(cache.state),
    faceOverrides: serializeFaceOverrides(cache),
    pinnedRoots: serializePinnedRoots(cache),
  })

  const recalculateOutput = buildRecalculateTabOutput(
    ctx.wallsOutput,
    result,
    ctx.referenceWallThicknessPx,
    ctx.preprocess.wallStyle,
    performance.now() - started,
  )
  const nextTabOutputs = { ...ctx.tabOutputs, walls: recalculateOutput }
  const nextCache = ingestRecalculateOutput(recalculateOutput, cache)
  return { success: !!nextCache, nextCache, nextTabOutputs }
}

export interface ClassifyRunDeps {
  templateTab: string
  referenceWallThicknessPx: number | null
  setRoomPhase: (phase: RoomPhase) => void
  syncDetectionComplete: () => void
  setStatus?: (message: string) => void
  onExtractTargets: (
    targets: { walls?: boolean; wallJunctionStrategy?: WallJunctionStrategy },
    options?: {
      requireExamples?: boolean
      phase?: 'classify' | 'recalculate' | 'finalize' | 'full'
      roomClassifyState?: SerializedRoomClassifyState
      faceOverrides?: Array<[number, RoomRasterClass]>
      pinnedRoots?: number[]
      referenceWallMeasureRect?: { x: number; y: number; width: number; height: number }
    },
  ) => Promise<boolean>
  ingestClassifyOutput: (output: ExtractionOutput | null) => Promise<boolean>
  getWallsOutput: () => ExtractionOutput | null | undefined
}

/**
 * Core classify-phase runner. Returns a deduplicating promise wrapper
 * that prevents concurrent classify runs.
 */
export function createClassifyRunner(deps: ClassifyRunDeps) {
  let classifyRun: Promise<boolean> | null = null

  async function runClassifyPhase(
    force: boolean,
    shouldAutoClassifyFn: () => boolean,
    setClassifyingInFlight: (v: boolean) => void,
    clearPreview: () => void,
    referenceWallMeasureRect?: { x: number; y: number; width: number; height: number },
  ): Promise<boolean> {
    if (classifyRun) return classifyRun
    if (!force && !shouldAutoClassifyFn()) return false
    if (deps.templateTab !== 'walls') return false
    if (
      !referenceWallMeasureRect &&
      (!deps.referenceWallThicknessPx || deps.referenceWallThicknessPx <= 0)
    ) {
      deps.setRoomPhase('awaiting_reference')
      deps.syncDetectionComplete()
      return false
    }

    classifyRun = (async () => {
      setClassifyingInFlight(true)
      deps.setRoomPhase('classifying')
      clearPreview()
      deps.setStatus?.('Muurclassificatie uitvoeren…')
      try {
        const ok = await deps.onExtractTargets(
          { walls: true, wallJunctionStrategy: 'room_first' },
          { phase: 'classify', referenceWallMeasureRect },
        )
        if (!ok) {
          deps.setRoomPhase('idle')
          deps.syncDetectionComplete()
          return false
        }
        deps.setStatus?.('Classificatie klaar — kleuren opbouwen…')
        return deps.ingestClassifyOutput(deps.getWallsOutput() ?? null)
      } finally {
        setClassifyingInFlight(false)
      }
    })()

    try {
      return await classifyRun
    } finally {
      classifyRun = null
    }
  }

  return { runClassifyPhase }
}
