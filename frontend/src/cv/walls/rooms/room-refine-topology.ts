import type { RasterRoomComponent } from './room-raster'
import { extractComponentsFromLabelsData } from './room-raster'
import { buildEnclosedFaceParentMap, countDistinctMergedFaces } from './room-raster-merge'
import { resolveInkBetweenFaces, resolveInkBetweenFacesInRegion } from './room-ink-resolve'
import type { InkDiffBounds } from './room-ink-symmetric'
import {
  applyFaceClassificationOverrides,
  buildEffectiveComponentClassification,
  buildInkEaterLabelClassFromEffective,
  extendInkEaterClassAfterMerge,
  type RoomRasterClass,
} from './room-ink-classify'
import { demoteExteriorPocketFaces } from './room-exterior-pocket'
import { claimWallishAfterInherit } from './face-parent-claim'

export interface RoomTopologyRefineResult {
  labelsData: Int32Array
  parentMap: Map<number, number>
  mergedFaceCount: number
  inkResolveStats: { assignedPx: number; unresolvedPx: number }
  /** Overrides + structurele wall-erfenis na merge (voor masker/finalize). */
  effectiveFaceOverrides: Map<number, RoomRasterClass>
}

/**
 * Post-manual review: ruwe faces → eaters uit overrides → ink-resolve → micro/small-merge → ink-resolve.
 * Geen classifyFacesByInkCoverage — handmatige classificatie blijft leidend.
 */
export function runRoomTopologyRefinePass(params: {
  components: RasterRoomComponent[]
  rawLabelsData: Int32Array
  width: number
  height: number
  classificationByLabel: Map<number, RoomRasterClass>
  faceOverrides: Map<number, RoomRasterClass>
  priorParentMap: Map<number, number>
  referenceWallThicknessPx?: number
}): RoomTopologyRefineResult {
  const {
    components,
    rawLabelsData,
    width,
    height,
    classificationByLabel,
    faceOverrides,
    priorParentMap,
    referenceWallThicknessPx,
  } = params

  const effectiveClass = buildEffectiveComponentClassification({
    components,
    classificationByLabel,
    faceOverrides,
    priorParentMap,
  })

  const resolvePass = (labelsData: Int32Array, labelClass: ReadonlyMap<number, RoomRasterClass>) =>
    resolveInkBetweenFaces({
      labelsData,
      components,
      width,
      height,
      labelClass,
      referenceWallThicknessPx,
    })

  let labelClass = buildInkEaterLabelClassFromEffective(components, effectiveClass)

  const pass1 = resolvePass(rawLabelsData, labelClass)
  const labelAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0
    return pass1.labelsData[y * width + x] ?? 0
  }
  const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })

  labelClass = extendInkEaterClassAfterMerge({
    components,
    parentMap,
    labelClass,
    faceOverrides,
    effectiveClass,
  })

  // ESC:W-03 (A)
  const pass2 = resolvePass(rawLabelsData, labelClass)

  // Wallish children → individuele roots (geen nieuwe parent-hiërarchie).
  const wallish = claimWallishAfterInherit({
    classificationByLabel,
    parentMap,
    faceOverrides,
  })

  return {
    labelsData: pass2.labelsData,
    parentMap: wallish.parentMap,
    mergedFaceCount: countDistinctMergedFaces(components, wallish.parentMap),
    inkResolveStats: {
      assignedPx: pass2.assignedPx,
      unresolvedPx: pass2.unresolvedPx,
    },
    effectiveFaceOverrides: wallish.inheritanceOverrides,
  }
}

export function applyTopologyRefineToClassification(params: {
  classificationByLabel: Map<number, RoomRasterClass>
  faceOverrides: Map<number, RoomRasterClass>
  refine: RoomTopologyRefineResult
}): Map<number, RoomRasterClass> {
  return applyFaceClassificationOverrides(
    params.classificationByLabel,
    params.refine.effectiveFaceOverrides,
  )
}

/** Inkt-resolve op ruwe topologie (label 0 = inkt) met wall-booster uit effectieve classificatie. */
export function resolveInkFromRawTopology(params: {
  rawLabelsData: Int32Array
  components: RasterRoomComponent[]
  width: number
  height: number
  classificationByLabel: Map<number, RoomRasterClass>
  referenceWallThicknessPx?: number
}): {
  labelsData: Int32Array
  parentMap: Map<number, number>
  inkResolveStats: { assignedPx: number; unresolvedPx: number }
} {
  const {
    rawLabelsData,
    components,
    width,
    height,
    classificationByLabel,
    referenceWallThicknessPx,
  } = params
  const labelClass = buildInkEaterLabelClassFromEffective(components, classificationByLabel)
  const resolved = resolveInkBetweenFaces({
    labelsData: rawLabelsData,
    components,
    width,
    height,
    labelClass,
    referenceWallThicknessPx,
  })
  const labelAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0
    return resolved.labelsData[y * width + x] ?? 0
  }
  const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })
  return {
    labelsData: resolved.labelsData,
    parentMap,
    inkResolveStats: {
      assignedPx: resolved.assignedPx,
      unresolvedPx: resolved.unresolvedPx,
    },
  }
}

/** Inkt-resolve op opgeslagen ruwe topologie — geen micro/small-merge (parentMap blijft uit review). */
export function resolveInkOnStoredTopology(params: {
  rawLabelsData: Int32Array
  components: RasterRoomComponent[]
  width: number
  height: number
  classificationByLabel: Map<number, RoomRasterClass>
  referenceWallThicknessPx?: number
  /** Bij lokale inkt-edits: alleen regio opnieuw resolven. */
  priorLabelsData?: Int32Array
  regionBounds?: InkDiffBounds
  regionMarginPx?: number
}): {
  labelsData: Int32Array
  inkResolveStats: { assignedPx: number; unresolvedPx: number }
} {
  const {
    rawLabelsData,
    components,
    width,
    height,
    classificationByLabel,
    referenceWallThicknessPx,
  } = params
  const labelClass = buildInkEaterLabelClassFromEffective(components, classificationByLabel)

  if (params.priorLabelsData && params.regionBounds) {
    const margin = Math.max(0, Math.round(params.regionMarginPx ?? 0))
    const expanded = {
      x0: Math.max(0, params.regionBounds.x0 - margin),
      y0: Math.max(0, params.regionBounds.y0 - margin),
      x1: Math.min(width - 1, params.regionBounds.x1 + margin),
      y1: Math.min(height - 1, params.regionBounds.y1 + margin),
    }
    const resolved = resolveInkBetweenFacesInRegion({
      labelsData: rawLabelsData,
      priorLabelsData: params.priorLabelsData,
      width,
      height,
      labelClass,
      referenceWallThicknessPx,
      bounds: expanded,
    })
    return {
      labelsData: resolved.labelsData,
      inkResolveStats: {
        assignedPx: resolved.assignedPx,
        unresolvedPx: resolved.unresolvedPx,
      },
    }
  }

  const resolved = resolveInkBetweenFaces({
    labelsData: rawLabelsData,
    components,
    width,
    height,
    labelClass,
    referenceWallThicknessPx,
  })
  return {
    labelsData: resolved.labelsData,
    inkResolveStats: {
      assignedPx: resolved.assignedPx,
      unresolvedPx: resolved.unresolvedPx,
    },
  }
}

/** Finalize: ink-resolve met wall-booster; opgeslagen topologie + parentMap uit review. */
export function prepareRoomFinalizeState(params: {
  classify: {
    width: number
    height: number
    rawLabelsData: Int32Array
    parentMap: Map<number, number>
    components: RasterRoomComponent[]
    classificationByLabel: Map<number, RoomRasterClass>
    inkResolveStats?: { assignedPx: number; unresolvedPx: number }
  }
  faceOverrides: Map<number, RoomRasterClass>
  referenceWallThicknessPx?: number
}): {
  labelsData: Int32Array
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  components: RasterRoomComponent[]
  inkResolveStats: { assignedPx: number; unresolvedPx: number }
} {
  const { classify, faceOverrides, referenceWallThicknessPx } = params
  const { width, height, parentMap: priorParentMap, rawLabelsData } = classify

  const components =
    classify.components.length > 0
      ? classify.components
      : extractComponentsFromLabelsData(rawLabelsData, width, height)

  const resolveInputClass = buildEffectiveComponentClassification({
    components,
    classificationByLabel: classify.classificationByLabel,
    faceOverrides,
    priorParentMap,
  })
  const pocketDemoted = demoteExteriorPocketFaces({
    components,
    rawLabelsData,
    width,
    height,
    classificationByLabel: resolveInputClass,
    parentMap: priorParentMap,
    faceOverrides,
    referenceWallThicknessPx,
  })

  const resolved = resolveInkOnStoredTopology({
    rawLabelsData,
    components,
    width,
    height,
    classificationByLabel: pocketDemoted.classificationByLabel,
    referenceWallThicknessPx,
  })

  const classificationByLabel = pocketDemoted.classificationByLabel

  return {
    labelsData: resolved.labelsData,
    parentMap: priorParentMap,
    classificationByLabel,
    components,
    inkResolveStats: resolved.inkResolveStats,
  }
}
