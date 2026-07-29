import type { CanvasLike } from '@/cv/port/canvasEnv'
import type { OpenCV } from '@/cv/loadOpenCV'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import { yieldToMain } from '@/platform/image/workImage'
import type { RoomClassifyResult } from '../strategies/room-first'
import { collectAffectedFaceLabels, pruneStaleLabelMaps } from './room-ink-affected-faces'
import {
  applyFaceClassificationOverrides,
  buildEffectiveComponentClassification,
  classifyFaceLabelsSubset,
  countClassificationStats,
  renderClassifiedFaceMask,
  type RoomRasterClass,
} from './room-ink-classify'
import {
  applySymmetricInkDiff,
  computeDiffPatchBounds,
  computeInkDiffMask,
  expandDiffBounds,
} from './room-ink-symmetric'
import { extractComponentsFromLabelsData } from './room-raster'
import { countDistinctMergedFaces } from './room-raster-merge'
import { resolveInkOnStoredTopology } from './room-refine-topology'
import { normalizeLabelsArray } from './room-labels-array'
import { patchTopologyLabelsInDiffRegion } from './room-topology-patch'

/** Review-overlay — per component klikken en overrides. */
const ROOM_MANUAL_CLASSIFICATION_GROUP_BY = 'component' as const

function resolveInkProcessMarginPx(referenceWallThicknessPx?: number): number {
  if (referenceWallThicknessPx && referenceWallThicknessPx > 0) {
    return Math.max(32, Math.round(referenceWallThicknessPx * 2))
  }
  return 32
}

/** Kleinere marge voor lokale topologie-patch (carve/fill/patch-bounds). */
function resolveInkPatchMarginPx(referenceWallThicknessPx?: number): number {
  if (referenceWallThicknessPx && referenceWallThicknessPx > 0) {
    return Math.max(8, Math.round(referenceWallThicknessPx))
  }
  return 8
}

function buildFrozenClassification(params: {
  components: ReturnType<typeof extractComponentsFromLabelsData>
  classificationByLabel: Map<number, RoomRasterClass>
  faceOverrides: Map<number, RoomRasterClass>
  priorParentMap: Map<number, number>
  affectedLabels: ReadonlySet<number>
}): Map<number, RoomRasterClass> {
  const effective = buildEffectiveComponentClassification({
    components: params.components,
    classificationByLabel: params.classificationByLabel,
    faceOverrides: params.faceOverrides,
    priorParentMap: params.priorParentMap,
  })
  const frozen = new Map<number, RoomRasterClass>()
  for (const [label, cls] of effective.entries()) {
    if (!params.affectedLabels.has(label)) {
      frozen.set(label, cls)
    }
  }
  return frozen
}

function stripAffectedPins(params: {
  affectedLabels: ReadonlySet<number>
  faceOverrides: Map<number, RoomRasterClass>
  pinnedRoots: Set<number>
}): void {
  for (const label of params.affectedLabels) {
    const cls = params.faceOverrides.get(label)
    // Opening-pins overleven Inkt verwerken — deur/raam draaien alleen opnieuw bij reclassify.
    if (cls === 'door' || cls === 'window' || cls === 'doorframe') continue
    params.faceOverrides.delete(label)
    params.pinnedRoots.delete(label)
  }
}

/** Buiten/rand-edits vereisen volledige ink-BFS — regionale resolve mist verre border-seeds. */
export function needsFullInkResolveForEdits(params: {
  components: ReturnType<typeof extractComponentsFromLabelsData>
  affectedLabels: ReadonlySet<number>
  effectiveClass: Map<number, RoomRasterClass>
  priorEffectiveClass: Map<number, RoomRasterClass>
  diffBounds: { x0: number; y0: number; x1: number; y1: number } | null
  width: number
  height: number
  borderMarginPx: number
}): boolean {
  const componentByLabel = new Map(params.components.map((c) => [c.label, c]))
  for (const label of params.affectedLabels) {
    const component = componentByLabel.get(label)
    if (component?.touchesBorder) return true
    if (params.effectiveClass.get(label) === 'outside') return true
    if (params.priorEffectiveClass.get(label) === 'outside') return true
  }
  if (!params.diffBounds) return false
  const m = Math.max(0, Math.round(params.borderMarginPx))
  const b = params.diffBounds
  return b.x0 <= m || b.y0 <= m || b.x1 >= params.width - 1 - m || b.y1 >= params.height - 1 - m
}

/**
 * Verwerk inkt v2: topologie bijwerken op diff, alleen geraakte faces opnieuw autoclassificeren.
 * Ongeraakte vlakken (incl. handmatige overrides) blijven exact behouden.
 * Gepinde `door` / `window` / `doorframe` blijven ook in de impactzone —
 * opening-detectie draait niet opnieuw bij Inkt verwerken.
 */
export async function runInkProcessAfterEdits(params: {
  cv: OpenCV
  /** Muur-B/W na preprocess + toolbar-gum/inkt. */
  mat: OpenCV['Mat']
  classify: RoomClassifyResult
  faceOverrides: Map<number, RoomRasterClass>
  pinnedRoots?: Set<number>
  referenceWallThicknessPx?: number
  /** Otsu-referentie op huidig muur-B/W — herbouwd door caller. */
  referenceData: Uint8Array
  roomReferenceCanvas?: CanvasLike
  /** Preview-mask wordt daarna opnieuw opgebouwd in UI — skip zware full-canvas render. */
  skipClassifiedMask?: boolean
}): Promise<
  RoomClassifyResult & {
    refinedFaceOverrides: Map<number, RoomRasterClass>
    refinedPinnedRoots: Set<number>
  }
> {
  const { mat, classify, referenceData, referenceWallThicknessPx } = params
  const faceOverrides = new Map(params.faceOverrides)
  const pinnedRoots = new Set(params.pinnedRoots ?? [])
  const width = classify.width
  const height = classify.height
  const priorParentMap = classify.parentMap
  const classificationByLabel = new Map(classify.classificationByLabel)
  const threshold = classify.threshold

  let rawLabelsData = normalizeLabelsArray(classify.rawLabelsData)
  const priorLabels = new Int32Array(rawLabelsData)
  const priorLabelsData = normalizeLabelsArray(classify.labelsData)
  const priorComponents =
    classify.components.length > 0
      ? classify.components
      : extractComponentsFromLabelsData(priorLabels, width, height)
  const priorEffectiveClass = buildEffectiveComponentClassification({
    components: priorComponents,
    classificationByLabel,
    faceOverrides,
    priorParentMap,
  })

  const currentWallBwData = new Uint8Array(mat.data as Uint8Array)
  const baselineWallBwData =
    classify.baselineWallBwData && classify.baselineWallBwData.length === currentWallBwData.length
      ? classify.baselineWallBwData
      : currentWallBwData

  const diffMask = computeInkDiffMask(baselineWallBwData, currentWallBwData)
  const impactMarginPx = resolveInkProcessMarginPx(referenceWallThicknessPx)
  const patchMarginPx = resolveInkPatchMarginPx(referenceWallThicknessPx)
  const diffBounds = computeDiffPatchBounds({
    diffMask,
    width,
    height,
    marginPx: patchMarginPx,
  })

  if (diffBounds) {
    reportPipelineProgress('Inktwijzigingen verwerken…')
    const symmetric = applySymmetricInkDiff({
      rawLabelsData,
      oldWallBwData: baselineWallBwData,
      newWallBwData: currentWallBwData,
      width,
      height,
      bounds: diffBounds,
    })
    rawLabelsData = symmetric.rawLabelsData

    await yieldToMain()
    reportPipelineProgress('Vlakken lokaal bijwerken…')
    const patched = patchTopologyLabelsInDiffRegion({
      rawLabelsData,
      newWallBwData: currentWallBwData,
      width,
      height,
      bounds: diffBounds,
    })
    rawLabelsData = patched.rawLabelsData
  }

  await yieldToMain()
  const components = extractComponentsFromLabelsData(rawLabelsData, width, height)
  pruneStaleLabelMaps({
    labelsData: rawLabelsData,
    classificationByLabel,
    faceOverrides,
    pinnedRoots,
  })

  const affectedLabels =
    diffBounds != null
      ? collectAffectedFaceLabels({
          labelsData: rawLabelsData,
          priorLabels,
          diffMask,
          marginPx: impactMarginPx,
          width,
          height,
        })
      : new Set<number>()

  if (affectedLabels.size > 0) {
    reportPipelineProgress('Geraakte vlakken classificeren…')
    const frozenClassification = buildFrozenClassification({
      components,
      classificationByLabel,
      faceOverrides,
      priorParentMap,
      affectedLabels,
    })
    stripAffectedPins({ affectedLabels, faceOverrides, pinnedRoots })

    const subset = classifyFaceLabelsSubset({
      labelsData: rawLabelsData,
      referenceData,
      components,
      parentMap: priorParentMap,
      width,
      height,
      threshold,
      groupBy: ROOM_MANUAL_CLASSIFICATION_GROUP_BY,
      affectedLabels,
      frozenClassification,
      priorLabels,
      priorEffectiveClass,
    })

    for (const [label, cls] of subset.classificationByLabel.entries()) {
      classificationByLabel.set(label, cls)
    }
  }

  await yieldToMain()
  const effective = buildEffectiveComponentClassification({
    components,
    classificationByLabel,
    faceOverrides,
    priorParentMap,
  })
  const inkResolveBounds =
    diffBounds != null ? expandDiffBounds(diffBounds, impactMarginPx, width, height) : undefined
  const useRegionalInkResolve =
    inkResolveBounds != null &&
    !needsFullInkResolveForEdits({
      components,
      affectedLabels,
      effectiveClass: effective,
      priorEffectiveClass,
      diffBounds,
      width,
      height,
      borderMarginPx: impactMarginPx,
    })
  const resolved = resolveInkOnStoredTopology({
    rawLabelsData,
    components,
    width,
    height,
    classificationByLabel: effective,
    referenceWallThicknessPx,
    priorLabelsData: useRegionalInkResolve ? priorLabelsData : undefined,
    regionBounds: useRegionalInkResolve ? inkResolveBounds : undefined,
    regionMarginPx: 0,
  })

  const refinedFaceOverrides = faceOverrides
  const refinedPinnedRoots = pinnedRoots
  const effectiveClassification = applyFaceClassificationOverrides(
    classificationByLabel,
    refinedFaceOverrides,
  )
  const stats = countClassificationStats(effectiveClassification)
  const classifiedMaskCanvas = params.skipClassifiedMask
    ? classify.classifiedMaskCanvas
    : renderClassifiedFaceMask({
        width,
        height,
        labelsData: resolved.labelsData,
        parentMap: priorParentMap,
        classificationByLabel: effectiveClassification,
        groupBy: ROOM_MANUAL_CLASSIFICATION_GROUP_BY,
      })

  return {
    width,
    height,
    rawLabelsData,
    labelsData: resolved.labelsData,
    parentMap: priorParentMap,
    components,
    classificationByLabel,
    classificationGroupBy: ROOM_MANUAL_CLASSIFICATION_GROUP_BY,
    classifiedMaskCanvas,
    roomReferenceCanvas: params.roomReferenceCanvas ?? classify.roomReferenceCanvas,
    threshold,
    mergedFaceCount: countDistinctMergedFaces(components, priorParentMap),
    wallCount: stats.wallCount,
    surfaceCount: stats.surfaceCount,
    unknownCount: stats.unknownCount,
    inkResolveStats: resolved.inkResolveStats,
    baselineWallBwData: currentWallBwData,
    refinedFaceOverrides,
    refinedPinnedRoots,
  }
}
