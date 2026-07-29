import type { RasterRoomComponent } from './room-raster'
import { resolveMergedLabel } from './room-raster-merge'
import { countClassificationStats } from './room-ink-classify-effective'
import {
  resolveClassificationKey,
  type RoomClassificationGroupBy,
  type RoomRasterClass,
} from './room-ink-classify-mapping'

/** Named constants — waarden 1:1 t.o.v. pre-split inline literals. */
export const ROOM_INK_CLASSIFY_TUNING = {
  /** Default ink-coverage → wall. */
  inkCoverageThreshold: 0.8,
  inkCoverageClampMin: 0.5,
  inkCoverageClampMax: 0.95,
  /** B/W ink black test (`reference < threshold`) and kept-mask (`mask >= threshold`). */
  bwInkThreshold: 128,
  /** Default reference when pixel missing. */
  missingReferenceWhite: 255,
  /** Prior outside overlap → keep outside on connected pocket split. */
  exteriorPriorOutsideRatio: 0.5,
} as const

export interface RoomRootInkStats {
  pixelCount: number
  blackPixelCount: number
  touchesBorder: boolean
  inkCoverageRatio: number
}

function clampThreshold(threshold: number | undefined): number {
  const { inkCoverageThreshold, inkCoverageClampMin, inkCoverageClampMax } =
    ROOM_INK_CLASSIFY_TUNING
  if (threshold == null || Number.isNaN(threshold)) return inkCoverageThreshold
  return Math.min(inkCoverageClampMax, Math.max(inkCoverageClampMin, threshold))
}

function buildRootTouchMap(
  components: RasterRoomComponent[],
  parentMap: Map<number, number>,
  groupBy: RoomClassificationGroupBy,
): Map<number, boolean> {
  const mergedTouchMap = new Map<number, boolean>()
  for (const component of components) {
    const merged = resolveMergedLabel(component.label, parentMap)
    const existing = mergedTouchMap.get(merged)
    mergedTouchMap.set(
      merged,
      existing === undefined ? component.touchesBorder : existing || component.touchesBorder,
    )
  }

  const rootTouchMap = new Map<number, boolean>()
  for (const component of components) {
    const key =
      groupBy === 'component' ? component.label : resolveMergedLabel(component.label, parentMap)
    const merged = resolveMergedLabel(component.label, parentMap)
    const touchesBorder =
      groupBy === 'component'
        ? component.touchesBorder || (mergedTouchMap.get(merged) ?? false)
        : (mergedTouchMap.get(key) ?? false)
    rootTouchMap.set(key, touchesBorder)
  }
  return rootTouchMap
}

export function classifyFacesByInkCoverage(params: {
  labelsData: Int32Array
  referenceData: Uint8Array
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  threshold?: number
  /** Manual review: per connected component; pipeline default: merged parent. */
  groupBy?: RoomClassificationGroupBy
}): {
  classificationByLabel: Map<number, RoomRasterClass>
  rootStats: Map<number, RoomRootInkStats>
  wallCount: number
  surfaceCount: number
  unknownCount: number
  threshold: number
} {
  const threshold = clampThreshold(params.threshold)
  const groupBy = params.groupBy ?? 'merged'
  const rootTouchMap = buildRootTouchMap(params.components, params.parentMap, groupBy)
  const statsByRoot = new Map<number, RoomRootInkStats>()
  const { bwInkThreshold, missingReferenceWhite } = ROOM_INK_CLASSIFY_TUNING

  for (let idx = 0; idx < params.labelsData.length; idx += 1) {
    const label = params.labelsData[idx] ?? 0
    if (label <= 0) continue
    const root = resolveClassificationKey(label, params.parentMap, groupBy)
    const prev =
      statsByRoot.get(root) ??
      ({
        pixelCount: 0,
        blackPixelCount: 0,
        touchesBorder: rootTouchMap.get(root) ?? false,
        inkCoverageRatio: 0,
      } satisfies RoomRootInkStats)
    prev.pixelCount += 1
    if ((params.referenceData[idx] ?? missingReferenceWhite) < bwInkThreshold) {
      prev.blackPixelCount += 1
    }
    statsByRoot.set(root, prev)
  }

  const classificationByLabel = new Map<number, RoomRasterClass>()
  let wallCount = 0
  let surfaceCount = 0
  for (const [root, stats] of statsByRoot.entries()) {
    let classification: RoomRasterClass
    const ratio = stats.blackPixelCount / Math.max(1, stats.pixelCount)
    stats.inkCoverageRatio = ratio
    if (stats.touchesBorder) {
      classification = 'outside'
    } else {
      classification = ratio >= threshold ? 'wall' : 'surface'
    }
    classificationByLabel.set(root, classification)
    if (classification === 'wall') wallCount += 1
    if (classification === 'surface') surfaceCount += 1
  }

  return {
    classificationByLabel,
    rootStats: statsByRoot,
    wallCount,
    surfaceCount,
    unknownCount: 0,
    threshold,
  }
}

/** Autoclass alleen voor geraakte labels; frozen labels blijven exact behouden. */
export function classifyFaceLabelsSubset(params: {
  labelsData: Int32Array
  referenceData: Uint8Array
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  width: number
  height: number
  threshold?: number
  groupBy?: RoomClassificationGroupBy
  affectedLabels: ReadonlySet<number>
  frozenClassification: Map<number, RoomRasterClass>
  priorLabels?: Int32Array
  priorEffectiveClass?: Map<number, RoomRasterClass>
}): {
  classificationByLabel: Map<number, RoomRasterClass>
  wallCount: number
  surfaceCount: number
  unknownCount: number
  threshold: number
} {
  const threshold = clampThreshold(params.threshold)
  const groupBy = params.groupBy ?? 'merged'
  const affected = params.affectedLabels
  if (affected.size === 0) {
    const stats = countClassificationStats(params.frozenClassification)
    return {
      classificationByLabel: new Map(params.frozenClassification),
      wallCount: stats.wallCount,
      surfaceCount: stats.surfaceCount,
      unknownCount: stats.unknownCount,
      threshold,
    }
  }

  const rootTouchMap = buildRootTouchMap(params.components, params.parentMap, groupBy)
  const statsByRoot = new Map<number, RoomRootInkStats>()
  const componentByLabel = new Map(params.components.map((c) => [c.label, c]))
  const { width, height } = params
  const { bwInkThreshold, missingReferenceWhite } = ROOM_INK_CLASSIFY_TUNING

  for (const label of affected) {
    const component = componentByLabel.get(label)
    if (!component) continue
    const { x: bx, y: by, width: bw, height: bh } = component.bbox
    for (let py = by; py < by + bh && py < height; py += 1) {
      const rowOffset = py * width
      for (let px = bx; px < bx + bw; px += 1) {
        const idx = rowOffset + px
        if (idx < 0 || idx >= params.labelsData.length) continue
        if ((params.labelsData[idx] ?? 0) !== label) continue
        const root = resolveClassificationKey(label, params.parentMap, groupBy)
        const prev =
          statsByRoot.get(root) ??
          ({
            pixelCount: 0,
            blackPixelCount: 0,
            touchesBorder: rootTouchMap.get(root) ?? false,
            inkCoverageRatio: 0,
          } satisfies RoomRootInkStats)
        prev.pixelCount += 1
        if ((params.referenceData[idx] ?? missingReferenceWhite) < bwInkThreshold) {
          prev.blackPixelCount += 1
        }
        statsByRoot.set(root, prev)
      }
    }
  }

  const classificationByLabel = new Map(params.frozenClassification)
  for (const label of affected) {
    const root = resolveClassificationKey(label, params.parentMap, groupBy)
    const stats = statsByRoot.get(root)
    const component = componentByLabel.get(label)
    let classification: RoomRasterClass
    if (!stats || !component) {
      classification = 'unknown'
    } else {
      const ratio = stats.blackPixelCount / Math.max(1, stats.pixelCount)
      stats.inkCoverageRatio = ratio
      if (stats.touchesBorder) {
        classification = 'outside'
      } else {
        classification = ratio >= threshold ? 'wall' : 'surface'
      }
      classification = resolveExteriorClassForAffectedLabel({
        label,
        component,
        autoclass: classification,
        labelsData: params.labelsData,
        width,
        height,
        componentsByLabel: componentByLabel,
        frozenClassification: params.frozenClassification,
        priorLabels: params.priorLabels,
        priorEffectiveClass: params.priorEffectiveClass,
      })
    }
    classificationByLabel.set(label, classification)
  }

  const stats = countClassificationStats(classificationByLabel)
  return {
    classificationByLabel,
    wallCount: stats.wallCount,
    surfaceCount: stats.surfaceCount,
    unknownCount: stats.unknownCount,
    threshold,
  }
}

const CARDINAL_DX = [0, 1, 0, -1] as const
const CARDINAL_DY = [-1, 0, 1, 0] as const

/**
 * Heeft dit face-label nog een pad naar buiten via witte buiten-vlakken?
 * Muur-inkt (label 0) blokkeert — afgesloten pockets zijn niet verbonden.
 */
function isFaceConnectedToExterior(params: {
  label: number
  labelsData: Int32Array
  width: number
  height: number
  componentsByLabel: Map<number, RasterRoomComponent>
  exteriorClassByLabel: Map<number, RoomRasterClass>
}): boolean {
  const { label, labelsData, width, height, componentsByLabel, exteriorClassByLabel } = params
  const startComponent = componentsByLabel.get(label)
  if (startComponent?.touchesBorder) return true

  const isExteriorLabel = (faceLabel: number) => {
    if (faceLabel <= 0) return false
    const component = componentsByLabel.get(faceLabel)
    if (component?.touchesBorder) return true
    return exteriorClassByLabel.get(faceLabel) === 'outside'
  }

  const visited = new Uint8Array(labelsData.length)
  const queue: number[] = []

  for (let i = 0; i < labelsData.length; i += 1) {
    if (labelsData[i] !== label) continue
    visited[i] = 1
    queue.push(i)
  }

  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]!
    const cx = idx % width
    const cy = (idx / width) | 0

    for (let d = 0; d < 4; d += 1) {
      const nx = cx + CARDINAL_DX[d]!
      const ny = cy + CARDINAL_DY[d]!
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nidx = ny * width + nx
      const neighborLabel = labelsData[nidx] ?? 0
      if (neighborLabel <= 0 || visited[nidx]) continue
      if (!isExteriorLabel(neighborLabel)) continue
      const neighborComponent = componentsByLabel.get(neighborLabel)
      if (neighborComponent?.touchesBorder) return true
      visited[nidx] = 1
      queue.push(nidx)
    }
  }

  return false
}

/**
 * Buitenruimte-splits: erf outside alleen als vlak nog met buiten verbonden is.
 * Topologisch afgesloten pockets (muur-inkt eromheen) → autoclass (surface/wall).
 */
export function resolveExteriorClassForAffectedLabel(params: {
  label: number
  component: RasterRoomComponent
  autoclass: RoomRasterClass
  labelsData: Int32Array
  width: number
  height: number
  componentsByLabel: Map<number, RasterRoomComponent>
  frozenClassification: Map<number, RoomRasterClass>
  priorLabels?: Int32Array
  priorEffectiveClass?: Map<number, RoomRasterClass>
}): RoomRasterClass {
  if (params.component.touchesBorder) return 'outside'

  const exteriorHints = new Map(params.frozenClassification)
  if (params.priorEffectiveClass) {
    for (const [faceLabel, cls] of params.priorEffectiveClass) {
      if (cls === 'outside' && !exteriorHints.has(faceLabel)) {
        exteriorHints.set(faceLabel, 'outside')
      }
    }
  }

  const connected = isFaceConnectedToExterior({
    label: params.label,
    labelsData: params.labelsData,
    width: params.width,
    height: params.height,
    componentsByLabel: params.componentsByLabel,
    exteriorClassByLabel: exteriorHints,
  })

  if (!connected) {
    return params.autoclass
  }

  if (params.autoclass === 'wall') {
    return 'wall'
  }

  const { priorLabels, priorEffectiveClass } = params
  if (priorLabels && priorEffectiveClass && priorEffectiveClass.size > 0) {
    let outsidePriorPx = 0
    let totalPx = 0
    for (let i = 0; i < params.labelsData.length; i += 1) {
      if (params.labelsData[i] !== params.label) continue
      totalPx += 1
      const priorLabel = priorLabels[i] ?? 0
      if (priorLabel > 0 && priorEffectiveClass.get(priorLabel) === 'outside') {
        outsidePriorPx += 1
      }
    }
    if (
      totalPx > 0 &&
      outsidePriorPx / totalPx >= ROOM_INK_CLASSIFY_TUNING.exteriorPriorOutsideRatio
    ) {
      return 'outside'
    }
  }

  return params.autoclass
}

/** Muur-roots zonder overlap met het behouden mask → unknown; rest blijft wall op kept pixels.
 *  Niet actief in finalize; na resolveInkBetweenFaces zijn kept-mask-gaten zeldzaam. */
export function refineWallClassificationByKeptMask(params: {
  classificationByLabel: Map<number, RoomRasterClass>
  labelsData: Int32Array
  parentMap: Map<number, number>
  keptWallMask: Uint8Array
  /** Handmatig gezette roots — niet auto-demoten naar unknown. */
  pinnedRoots?: Set<number>
  groupBy?: RoomClassificationGroupBy
}): {
  classificationByLabel: Map<number, RoomRasterClass>
  wallCount: number
  surfaceCount: number
  unknownCount: number
  demotedWallRootCount: number
} {
  const groupBy = params.groupBy ?? 'merged'
  const keptPxByRoot = new Map<number, number>()
  const totalPxByRoot = new Map<number, number>()
  const { bwInkThreshold } = ROOM_INK_CLASSIFY_TUNING

  for (let idx = 0; idx < params.labelsData.length; idx += 1) {
    const label = params.labelsData[idx] ?? 0
    if (label <= 0) continue
    const root = resolveClassificationKey(label, params.parentMap, groupBy)
    if (params.classificationByLabel.get(root) !== 'wall') continue
    totalPxByRoot.set(root, (totalPxByRoot.get(root) ?? 0) + 1)
    if ((params.keptWallMask[idx] ?? 0) >= bwInkThreshold) {
      keptPxByRoot.set(root, (keptPxByRoot.get(root) ?? 0) + 1)
    }
  }

  const classificationByLabel = new Map(params.classificationByLabel)
  let demotedWallRootCount = 0
  for (const [root, classification] of params.classificationByLabel.entries()) {
    if (classification !== 'wall') continue
    if (params.pinnedRoots?.has(root)) continue
    if ((keptPxByRoot.get(root) ?? 0) > 0) continue
    classificationByLabel.set(root, 'unknown')
    demotedWallRootCount += 1
  }

  const { wallCount, surfaceCount, unknownCount } = countClassificationStats(classificationByLabel)

  return {
    classificationByLabel,
    wallCount,
    surfaceCount,
    unknownCount,
    demotedWallRootCount,
  }
}
