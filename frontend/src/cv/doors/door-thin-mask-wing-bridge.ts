import { tally } from '@/core/diagnostics'
import {
  isWallMaskClass,
  resolvePixelClassification,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'

export type WingBridgeMaskContext = {
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  classificationGroupBy?: 'merged' | 'component'
  referenceWallThicknessPx: number
}

/** Minimale area voor “grote” muur-blob (vleugels; micros tellen niet). */
export function resolveWingBridgeMinLargeBlobAreaPx(wallRefPx: number): number {
  const ref = Math.max(1, Math.round(wallRefPx))
  return Math.max(24, ref * 8)
}

/**
 * Gap-slack voor L2: klein gat kozijn↔muur (≪ muurdikte), bijv. 6 px bij ref 54.
 * Alleen dilate vanaf nieuw geschilderde hyp-pixels — geen globale close.
 */
export function resolveWingBridgeGapSlackPx(wallRefPx: number): number {
  const ref = Math.max(1, Math.round(wallRefPx))
  return Math.max(2, Math.min(8, Math.round(ref * 0.15)))
}

/**
 * L0-achtig basis-masker: wallish faces (wall/window/doorframe), géén deuren.
 * Pure labels — geen morph-close (dry-run; close zou zelf gaten dichten).
 */
export function buildBaselineWallMaskWithoutDoors(ctx: WingBridgeMaskContext): Uint8Array {
  const { width, height, labelsData, parentMap, classificationByLabel } = ctx
  const groupBy = ctx.classificationGroupBy ?? 'component'
  const out = new Uint8Array(width * height)
  for (let i = 0; i < out.length; i += 1) {
    const raw = labelsData[i] ?? 0
    if (raw <= 0) continue
    const cls = resolvePixelClassification(raw, parentMap, classificationByLabel, groupBy)
    if (!isWallMaskClass(cls)) continue
    out[i] = 255
  }
  return out
}

/** Zet face-pixels aan in mask (hyp dry-run). */
export function paintFaceIdsOntoWallMask(params: {
  mask: Uint8Array
  faceIds: readonly number[]
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
}): number {
  const roots = new Set<number>()
  for (const id of params.faceIds) {
    if (id <= 0) continue
    const root = resolveMergedLabel(id, params.parentMap)
    if (root > 0) roots.add(root)
  }
  if (roots.size === 0) return 0
  let painted = 0
  const { mask, labelsData, parentMap } = params
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 255) continue
    const raw = labelsData[i] ?? 0
    if (raw <= 0) continue
    const root = resolveMergedLabel(raw, parentMap)
    if (!roots.has(root)) continue
    mask[i] = 255
    painted += 1
  }
  return painted
}

/**
 * Dilate alleen vanaf pixels die nieuw zijn t.o.v. baseline (hyp-brug).
 * Overbrugt micro-gaten naar bestaande muur zonder hele masker te verdikken.
 */
export function dilateNewPaintTowardWalls(params: {
  mask: Uint8Array
  baselineMask: Uint8Array
  width: number
  height: number
  radiusPx: number
}): number {
  const radius = Math.max(0, Math.round(params.radiusPx))
  if (radius <= 0) return 0
  const { mask, baselineMask, width, height } = params
  let frontier: number[] = []
  for (let i = 0; i < mask.length; i += 1) {
    if ((mask[i] ?? 0) === 0) continue
    if ((baselineMask[i] ?? 0) !== 0) continue
    frontier.push(i)
  }
  let added = 0
  for (let step = 0; step < radius; step += 1) {
    if (frontier.length === 0) break
    const next: number[] = []
    for (const idx of frontier) {
      const cx = idx % width
      const cy = (idx - cx) / width
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const nIdx = ny * width + nx
          if ((mask[nIdx] ?? 0) !== 0) continue
          mask[nIdx] = 255
          added += 1
          next.push(nIdx)
        }
      }
    }
    frontier = next
  }
  return added
}

type ComponentStats = {
  labels: Int32Array
  areas: Map<number, number>
  componentCount: number
}

/** 8-connected components op binary mask (255 = foreground). */
export function labelWallMaskComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): ComponentStats {
  const labels = new Int32Array(width * height)
  const areas = new Map<number, number>()
  let nextId = 0
  const stack: number[] = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x
      if ((mask[start] ?? 0) === 0 || labels[start] !== 0) continue
      nextId += 1
      let area = 0
      stack.push(start)
      labels[start] = nextId
      while (stack.length > 0) {
        const idx = stack.pop()!
        area += 1
        const cx = idx % width
        const cy = (idx - cx) / width
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue
            const nx = cx + dx
            const ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const nIdx = ny * width + nx
            if ((mask[nIdx] ?? 0) === 0 || labels[nIdx] !== 0) continue
            labels[nIdx] = nextId
            stack.push(nIdx)
          }
        }
      }
      areas.set(nextId, area)
    }
  }
  return { labels, areas, componentCount: nextId }
}

function seedIndexForComponent(labels: Int32Array, componentId: number): number {
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] === componentId) return i
  }
  return -1
}

/**
 * Laag 2 — vleugel-brug dry-run:
 * Bouw L0 zonder deuren → tel grote wall-blobs → verf één hyp.
 * Worden ≥2 grote blobs via die verf één component? → keep.
 * Groeit maar één blob / uitsteeksel → geen keep.
 */
// ESC:D-63 (A)
export function isThinHypWingBridge(params: {
  baselineMask: Uint8Array
  faceIds: readonly number[]
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  referenceWallThicknessPx: number
}): boolean {
  const { width, height, faceIds } = params
  if (width < 1 || height < 1 || faceIds.length === 0) return false

  const minLarge = resolveWingBridgeMinLargeBlobAreaPx(params.referenceWallThicknessPx)
  const before = labelWallMaskComponents(params.baselineMask, width, height)
  const largeBeforeIds = [...before.areas.entries()]
    .filter(([, area]) => area >= minLarge)
    .map(([id]) => id)
  if (largeBeforeIds.length < 2) {
    tally('D-63', 'wing_bridge_skip_not_two_blobs')
    return false
  }

  const afterMask = params.baselineMask.slice()
  const painted = paintFaceIdsOntoWallMask({
    mask: afterMask,
    faceIds,
    labelsData: params.labelsData,
    width,
    height,
    parentMap: params.parentMap,
  })
  if (painted <= 0) {
    tally('D-63', 'wing_bridge_skip_no_paint')
    return false
  }

  const gapSlack = resolveWingBridgeGapSlackPx(params.referenceWallThicknessPx)
  const slackAdded = dilateNewPaintTowardWalls({
    mask: afterMask,
    baselineMask: params.baselineMask,
    width,
    height,
    radiusPx: gapSlack,
  })
  if (slackAdded > 0) tally('D-63', 'wing_bridge_gap_slack')

  const after = labelWallMaskComponents(afterMask, width, height)

  // After-ids die nieuw geschilderde pixels bevatten (= de brug)
  const bridgeAfterIds = new Set<number>()
  for (let i = 0; i < afterMask.length; i += 1) {
    if ((params.baselineMask[i] ?? 0) !== 0) continue
    if ((afterMask[i] ?? 0) === 0) continue
    const aid = after.labels[i] ?? 0
    if (aid > 0) bridgeAfterIds.add(aid)
  }
  if (bridgeAfterIds.size === 0) {
    // Alle hyp-pixels lagen al in baseline → geen brug
    tally('D-63', 'wing_bridge_skip_no_new_paint')
    return false
  }

  // Hoeveel grote vóór-blobs zitten nu in een brug-component?
  let mergedLargeCount = 0
  for (const blobId of largeBeforeIds) {
    const seed = seedIndexForComponent(before.labels, blobId)
    if (seed < 0) continue
    const aid = after.labels[seed] ?? 0
    if (aid > 0 && bridgeAfterIds.has(aid)) mergedLargeCount += 1
  }

  if (mergedLargeCount >= 2) {
    tally('D-63', 'wing_bridge_keep')
    return true
  }
  // één blob groeit / uitsteeksel
  tally('D-63', 'wing_bridge_skip_no_merge')
  return false
}
