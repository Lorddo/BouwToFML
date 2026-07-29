import type { RasterRoomComponent } from './room-raster'
import { isWallMaskClass, type RoomRasterClass } from './room-ink-classify'
import type { InkDiffBounds } from './room-ink-symmetric'

export interface InkResolveResult {
  labelsData: Int32Array
  assignedPx: number
  unresolvedPx: number
}

export interface InkEaterContext {
  inkEaterLabels: ReadonlySet<number>
  labelClass: ReadonlyMap<number, RoomRasterClass>
}

export interface InkEatRadii {
  wallEatMaxPx: number
  outsideEatMaxPx: number
}

const CARDINAL_DX = [0, 1, 0, -1] as const
const CARDINAL_DY = [-1, 0, 1, 0] as const

function clampInkCoverageThreshold(threshold: number | undefined): number {
  if (threshold == null || Number.isNaN(threshold)) return 0.8
  return Math.min(0.95, Math.max(0.5, threshold))
}

/** Muur ~0.5×ref, buiten ~0.15×ref — geschaald op muurdikte (geen vaste clamp). */
export function resolveInkEatRadii(referenceWallThicknessPx?: number): InkEatRadii {
  const thickness = referenceWallThicknessPx ?? 16
  return {
    wallEatMaxPx: Math.max(1, Math.round(thickness * 0.5)),
    outsideEatMaxPx: Math.max(1, Math.round(thickness * 0.15)),
  }
}

/** Muur concurreert met bereik-booster (2.0 = dubbel bereik t.o.v. vloer/buiten). */
export const WALL_INK_REACH_BOOSTER = 2.0
/** Vaste extra px bereik voor muur-faces bovenop booster. */
export const WALL_INK_REACH_BONUS_PX = 2

export interface WallInkReach {
  /** Vermenigvuldiger op muur-bereik (2.0 = dubbel bereik t.o.v. vloer/buiten). */
  reachBooster: number
  /** Extra px bereik: muur concurreert alsof hij zoveel px dichterbij staat (vóór booster). */
  reachBonusPx: number
}

/** Muur-reikwijdte voor ink-resolve — booster 2× + vaste px-bonus. */
export function resolveWallInkReach(_referenceWallThicknessPx?: number): WallInkReach {
  return {
    reachBooster: WALL_INK_REACH_BOOSTER,
    reachBonusPx: WALL_INK_REACH_BONUS_PX,
  }
}

function effectiveInkDistance(
  distPx: number,
  label: number,
  labelClass: ReadonlyMap<number, RoomRasterClass>,
  wallReach: WallInkReach,
): number {
  if (distPx < 0) return Number.POSITIVE_INFINITY
  const cls = labelClass.get(label)
  if (cls == null || !isWallMaskClass(cls)) return distPx
  // bonus = extra bereik in px → trek af vóór booster (lager = dichterbij in BFS)
  const boostedDist = Math.max(0, distPx - wallReach.reachBonusPx)
  return boostedDist / wallReach.reachBooster
}

/** Muur/window > buiten bij gelijke effectieve afstand vanaf face-origin. */
function inkClassRank(label: number, labelClass: ReadonlyMap<number, RoomRasterClass>): number {
  if (label <= 0) return 0
  const cls = labelClass.get(label)
  if (cls != null && isWallMaskClass(cls)) return 3
  if (cls === 'outside') return 2
  return 1
}

function isNearestFaceBetter(
  nextDist: number,
  nextLabel: number,
  curDist: number,
  curLabel: number,
  labelClass: ReadonlyMap<number, RoomRasterClass>,
  wallReach: WallInkReach,
): boolean {
  const nextEff = effectiveInkDistance(nextDist, nextLabel, labelClass, wallReach)
  const curEff = effectiveInkDistance(curDist, curLabel, labelClass, wallReach)
  if (nextEff < curEff) return true
  if (nextEff > curEff) return false

  const nextRank = inkClassRank(nextLabel, labelClass)
  const curRank = inkClassRank(curLabel, labelClass)
  if (nextRank !== curRank) return nextRank > curRank

  if (nextLabel <= 0) return false
  if (curLabel <= 0) return true
  return nextLabel < curLabel
}

/**
 * Preliminary face-klasse vóór volledige classify.
 * Geen adaptive-inkt-dekking op hele face (zou alles muur maken) — alleen rand + inkt op face.
 */
export function buildInkEaterLabels(params: {
  components: RasterRoomComponent[]
  labelsData: Int32Array
  referenceData: Uint8Array
  inkCoverageThreshold?: number
}): InkEaterContext {
  const threshold = clampInkCoverageThreshold(params.inkCoverageThreshold)
  const statsByLabel = new Map<number, { pixelCount: number; blackCount: number }>()

  for (let idx = 0; idx < params.labelsData.length; idx += 1) {
    const label = params.labelsData[idx] ?? 0
    if (label <= 0) continue
    const prev =
      statsByLabel.get(label) ??
      ({
        pixelCount: 0,
        blackCount: 0,
      } as { pixelCount: number; blackCount: number })
    prev.pixelCount += 1
    if ((params.referenceData[idx] ?? 255) < 128) prev.blackCount += 1
    statsByLabel.set(label, prev)
  }

  const inkEaterLabels = new Set<number>()
  const labelClass = new Map<number, RoomRasterClass>()

  for (const component of params.components) {
    const stats = statsByLabel.get(component.label)
    const ratio = stats ? stats.blackCount / Math.max(1, stats.pixelCount) : 0
    const hasInkOnFace = (stats?.blackCount ?? 0) > 0
    if (component.touchesBorder) {
      labelClass.set(component.label, 'outside')
      inkEaterLabels.add(component.label)
      continue
    }
    if (hasInkOnFace || ratio >= threshold) {
      labelClass.set(component.label, 'wall')
      inkEaterLabels.add(component.label)
      continue
    }
    labelClass.set(component.label, 'surface')
  }

  return { inkEaterLabels, labelClass }
}

/**
 * Multi-source BFS vanaf alle face-pixels, alleen door inkt (label 0).
 * Geeft per inkt-pixel het dichtstbijzijnde face-label + Manhattan-afstand vanaf origin.
 * Geen doorvloed via inkt-ketens van één eater — elke face seedt onafhankelijk.
 */
function buildNearestFaceField(params: {
  labelsData: Int32Array
  width: number
  height: number
  labelClass: ReadonlyMap<number, RoomRasterClass>
  wallReach?: WallInkReach
}): { nearestLabel: Int32Array; nearestDist: Int32Array } {
  const { labelsData, width, height, labelClass } = params
  const wallReach = params.wallReach ?? resolveWallInkReach()
  const nearestLabel = new Int32Array(width * height).fill(-1)
  const nearestDist = new Int32Array(width * height).fill(-1)
  const queue: number[] = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x
      const label = labelsData[idx] ?? 0
      if (label <= 0) continue
      nearestLabel[idx] = label
      nearestDist[idx] = 0
      queue.push(idx)
    }
  }

  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]!
    const x = idx % width
    const y = (idx - x) / width
    const curLabel = nearestLabel[idx]!
    const curDist = nearestDist[idx]!

    for (let d = 0; d < 4; d += 1) {
      const nx = x + CARDINAL_DX[d]!
      const ny = y + CARDINAL_DY[d]!
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nidx = ny * width + nx
      if ((labelsData[nidx] ?? 0) > 0) continue

      const nextDist = curDist + 1
      const curNearest = nearestDist[nidx] ?? -1
      if (curNearest === -1) {
        nearestDist[nidx] = nextDist
        nearestLabel[nidx] = curLabel
        queue.push(nidx)
        continue
      }

      if (isNearestFaceBetter(nextDist, curLabel, curNearest, nearestLabel[nidx] ?? -1, labelClass, wallReach)) {
        nearestDist[nidx] = nextDist
        nearestLabel[nidx] = curLabel
        queue.push(nidx)
      }
    }
  }

  return { nearestLabel, nearestDist }
}

/**
 * BFS beperkt tot een regio — voor lokale inkt-edits na review-classify.
 * Seeds: face-pixels in regio + face-halo direct buiten de rand.
 * Nearest-arrays zijn region-sized (+1px pad voor halo), niet full canvas.
 */
function buildNearestFaceFieldInRegion(params: {
  labelsData: Int32Array
  width: number
  height: number
  labelClass: ReadonlyMap<number, RoomRasterClass>
  wallReach?: WallInkReach
  bounds: InkDiffBounds
}): {
  nearestLabel: Int32Array
  nearestDist: Int32Array
  originX: number
  originY: number
  regionW: number
} {
  const { labelsData, width, height, labelClass, bounds } = params
  const wallReach = params.wallReach ?? resolveWallInkReach()

  // +1 pad zodat halo-seeds net buiten de paint-regio in de lokale arrays passen.
  const ox = Math.max(0, bounds.x0 - 1)
  const oy = Math.max(0, bounds.y0 - 1)
  const x1 = Math.min(width - 1, bounds.x1 + 1)
  const y1 = Math.min(height - 1, bounds.y1 + 1)
  const regionW = x1 - ox + 1
  const regionH = y1 - oy + 1
  const nearestLabel = new Int32Array(regionW * regionH).fill(-1)
  const nearestDist = new Int32Array(regionW * regionH).fill(-1)
  const queue: number[] = []

  const insidePaintRegion = (x: number, y: number) =>
    x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1

  const toLocal = (x: number, y: number) => (y - oy) * regionW + (x - ox)

  const seedFace = (x: number, y: number, label: number) => {
    const local = toLocal(x, y)
    if (nearestDist[local] !== -1) return
    nearestLabel[local] = label
    nearestDist[local] = 0
    queue.push(local)
  }

  for (let y = bounds.y0; y <= bounds.y1; y += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      const idx = y * width + x
      const label = labelsData[idx] ?? 0
      if (label > 0) seedFace(x, y, label)
    }
  }

  for (let y = bounds.y0; y <= bounds.y1; y += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      for (let d = 0; d < 4; d += 1) {
        const nx = x + CARDINAL_DX[d]!
        const ny = y + CARDINAL_DY[d]!
        if (insidePaintRegion(nx, ny)) continue
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        // Halo moet binnen pad vallen
        if (nx < ox || ny < oy || nx > x1 || ny > y1) continue
        const nidx = ny * width + nx
        const label = labelsData[nidx] ?? 0
        if (label > 0) seedFace(nx, ny, label)
      }
    }
  }

  let head = 0
  while (head < queue.length) {
    const local = queue[head++]!
    const lx = local % regionW
    const ly = (local - lx) / regionW
    const x = ox + lx
    const y = oy + ly
    const curLabel = nearestLabel[local]!
    const curDist = nearestDist[local]!

    for (let d = 0; d < 4; d += 1) {
      const nx = x + CARDINAL_DX[d]!
      const ny = y + CARDINAL_DY[d]!
      if (!insidePaintRegion(nx, ny)) continue
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nidx = ny * width + nx
      if ((labelsData[nidx] ?? 0) > 0) continue

      const nLocal = toLocal(nx, ny)
      const nextDist = curDist + 1
      const curNearest = nearestDist[nLocal] ?? -1
      if (curNearest === -1) {
        nearestDist[nLocal] = nextDist
        nearestLabel[nLocal] = curLabel
        queue.push(nLocal)
        continue
      }

      if (isNearestFaceBetter(nextDist, curLabel, curNearest, nearestLabel[nLocal] ?? -1, labelClass, wallReach)) {
        nearestDist[nLocal] = nextDist
        nearestLabel[nLocal] = curLabel
        queue.push(nLocal)
      }
    }
  }

  return { nearestLabel, nearestDist, originX: ox, originY: oy, regionW }
}

/**
 * Inkt-resolve in een regio — behoudt prior buiten de regio (sneller bij toolbar-edits).
 * Muteert `priorLabelsData` in-place in de regio (geen full-buffer copy).
 */
export function resolveInkBetweenFacesInRegion(params: {
  labelsData: Int32Array
  priorLabelsData: Int32Array
  width: number
  height: number
  labelClass: ReadonlyMap<number, RoomRasterClass>
  referenceWallThicknessPx?: number
  bounds: InkDiffBounds
}): InkResolveResult {
  const { labelsData, priorLabelsData, width, height, labelClass, bounds } = params
  const wallReach = resolveWallInkReach(params.referenceWallThicknessPx)
  const result = priorLabelsData

  for (let y = bounds.y0; y <= bounds.y1; y += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      const idx = y * width + x
      const raw = labelsData[idx] ?? 0
      if (raw > 0) result[idx] = raw
    }
  }

  const { nearestLabel, originX, originY, regionW } = buildNearestFaceFieldInRegion({
    labelsData,
    width,
    height,
    labelClass,
    wallReach,
    bounds,
  })

  let assignedPx = 0
  let unresolvedPx = 0
  for (let y = bounds.y0; y <= bounds.y1; y += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      const idx = y * width + x
      if ((labelsData[idx] ?? 0) > 0) continue
      const local = (y - originY) * regionW + (x - originX)
      const face = nearestLabel[local] ?? -1
      if (face > 0) {
        result[idx] = face
        assignedPx += 1
      } else if ((result[idx] ?? 0) === 0) {
        unresolvedPx += 1
      }
    }
  }

  return { labelsData: result, assignedPx, unresolvedPx }
}

/**
 * Wijs elke inkt-pixel toe aan het dichtstbijzijnde face (Manhattan-BFS).
 * Alle vlakken eten inkt; muur heeft 2× bereik (booster + px-bonus op effectieve afstand).
 * Bij gelijke effectieve afstand: muur > buiten > vloer.
 */
export function resolveInkBetweenFaces(params: {
  labelsData: Int32Array
  components: RasterRoomComponent[]
  width: number
  height: number
  labelClass: ReadonlyMap<number, RoomRasterClass>
  referenceWallThicknessPx?: number
}): InkResolveResult {
  const { labelsData, width, height, labelClass } = params
  const wallReach = resolveWallInkReach(params.referenceWallThicknessPx)

  const result = new Int32Array(labelsData)
  const { nearestLabel } = buildNearestFaceField({
    labelsData,
    width,
    height,
    labelClass,
    wallReach,
  })

  for (let idx = 0; idx < labelsData.length; idx += 1) {
    const raw = labelsData[idx] ?? 0
    if (raw > 0) {
      result[idx] = raw
      continue
    }

    const face = nearestLabel[idx] ?? -1
    result[idx] = face > 0 ? face : 0
  }

  let assignedPx = 0
  let unresolvedPx = 0
  for (let idx = 0; idx < labelsData.length; idx += 1) {
    if ((labelsData[idx] ?? 0) > 0) continue
    if ((result[idx] ?? 0) > 0) {
      assignedPx += 1
    } else {
      unresolvedPx += 1
    }
  }

  return { labelsData: result, assignedPx, unresolvedPx }
}
