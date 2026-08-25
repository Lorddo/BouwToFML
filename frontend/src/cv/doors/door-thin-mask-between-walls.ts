import { tally } from '@/core/diagnostics'
import {
  isWallMaskClass,
  resolvePixelClassification,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import {
  classifyChildTier,
  resolveMergedLabel,
  type CardinalDirection,
} from '@/cv/walls/rooms/room-raster-merge'
import { resolveDoorBetweenWallsAxis } from './door-bridge-wall-promote'

/** Klein gap kozijn↔stomp (px). Niet image-breed. */
const STRICT_GAP_SLACK_PX = 8

export type ThinMaskBetweenWallsContext = {
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  components: RasterRoomComponent[]
  classificationByLabel: Map<number, RoomRasterClass>
  classificationGroupBy?: 'merged' | 'component'
  /** Soft max-march ≈ orde muurdikte (niet image-breed). */
  referenceWallThicknessPx: number
}

export type ThinMaskBetweenWallsHyp = {
  faceIds: readonly number[]
  unionBBox: { x: number; y: number; width: number; height: number }
}

function resolveRoots(faceIds: readonly number[], parentMap: Map<number, number>): Set<number> {
  const roots = new Set<number>()
  for (const faceId of faceIds) {
    if (faceId <= 0) continue
    const root = resolveMergedLabel(faceId, parentMap)
    if (root > 0) roots.add(root)
  }
  return roots
}

function softMaxMarchPx(wallRefPx: number): number {
  const ref = Math.max(0, wallRefPx)
  return Math.max(STRICT_GAP_SLACK_PX, Math.round(ref * 1.5))
}

function samplePointsOnSide(
  bbox: { x: number; y: number; width: number; height: number },
  direction: CardinalDirection,
): Array<{ x: number; y: number; dx: number; dy: number }> {
  const { x, y, width, height } = bbox
  const along = [0.25, 0.5, 0.75]
  switch (direction) {
    case 'left':
      return along.map((q) => ({
        x: x - 1,
        y: y + Math.floor(height * q),
        dx: -1,
        dy: 0,
      }))
    case 'right':
      return along.map((q) => ({
        x: x + width,
        y: y + Math.floor(height * q),
        dx: 1,
        dy: 0,
      }))
    case 'top':
      return along.map((q) => ({
        x: x + Math.floor(width * q),
        y: y - 1,
        dx: 0,
        dy: -1,
      }))
    case 'bottom':
      return along.map((q) => ({
        x: x + Math.floor(width * q),
        y: y + height,
        dx: 0,
        dy: 1,
      }))
  }
}

/**
 * Eerste buur buiten skipRoots.
 * `acceptMicroAsHit`: micro/arcering telt als stomp (soft); anders doorheen (strict, D-40-achtig).
 */
function firstNeighborRoot(params: {
  x: number
  y: number
  dx: number
  dy: number
  skipRoots: ReadonlySet<number>
  labelAt: (x: number, y: number) => number
  width: number
  height: number
  resolve: (label: number) => number
  maxMarchPx: number
  acceptMicroAsHit: boolean
  isMicro: (root: number) => boolean
}): number | null {
  let x = params.x
  let y = params.y
  let marched = 0
  while (marched < params.maxMarchPx) {
    if (x < 0 || y < 0 || x >= params.width || y >= params.height) return null
    const raw = params.labelAt(x, y)
    if (raw === 0) {
      x += params.dx
      y += params.dy
      marched += 1
      continue
    }
    const hit = params.resolve(raw)
    if (params.skipRoots.has(hit)) {
      x += params.dx
      y += params.dy
      marched += 1
      continue
    }
    if (!params.acceptMicroAsHit && params.isMicro(hit)) {
      x += params.dx
      y += params.dy
      marched += 1
      continue
    }
    return hit
  }
  return null
}

function sideStumpRoot(params: {
  bbox: { x: number; y: number; width: number; height: number }
  direction: CardinalDirection
  skipRoots: ReadonlySet<number>
  labelAt: (x: number, y: number) => number
  width: number
  height: number
  resolve: (label: number) => number
  maxMarchPx: number
  acceptMicroAsHit: boolean
  isMicro: (root: number) => boolean
  classForRoot: (root: number) => RoomRasterClass | null
}): number | null {
  const samples = samplePointsOnSide(params.bbox, params.direction)
  const wallishHits: number[] = []
  for (const sample of samples) {
    const neighbor = firstNeighborRoot({
      x: sample.x,
      y: sample.y,
      dx: sample.dx,
      dy: sample.dy,
      skipRoots: params.skipRoots,
      labelAt: params.labelAt,
      width: params.width,
      height: params.height,
      resolve: params.resolve,
      maxMarchPx: params.maxMarchPx,
      acceptMicroAsHit: params.acceptMicroAsHit,
      isMicro: params.isMicro,
    })
    if (neighbor == null) continue
    const cls = params.classForRoot(neighbor)
    // wall / window / doorframe — niet surface/meubel/door
    if (cls == null || !isWallMaskClass(cls)) continue
    wallishHits.push(neighbor)
  }
  // Majority (≥2 van 3): één sample mag lekken (mini-uitstolpsel / boog-rand).
  const need = Math.ceil(samples.length / 2)
  if (wallishHits.length < need) return null
  const counts = new Map<number, number>()
  for (const root of wallishHits) {
    counts.set(root, (counts.get(root) ?? 0) + 1)
  }
  let bestRoot: number | null = null
  let bestCount = 0
  for (const [root, count] of counts) {
    if (count > bestCount) {
      bestRoot = root
      bestCount = count
    }
  }
  return bestRoot
}

function axisSidesAreStumps(params: {
  bbox: { x: number; y: number; width: number; height: number }
  axis: 'h' | 'v'
  skipRoots: ReadonlySet<number>
  labelAt: (x: number, y: number) => number
  width: number
  height: number
  resolve: (label: number) => number
  maxMarchPx: number
  acceptMicroAsHit: boolean
  isMicro: (root: number) => boolean
  classForRoot: (root: number) => RoomRasterClass | null
}): boolean {
  const base = {
    bbox: params.bbox,
    skipRoots: params.skipRoots,
    labelAt: params.labelAt,
    width: params.width,
    height: params.height,
    resolve: params.resolve,
    maxMarchPx: params.maxMarchPx,
    acceptMicroAsHit: params.acceptMicroAsHit,
    isMicro: params.isMicro,
    classForRoot: params.classForRoot,
  }
  if (params.axis === 'h') {
    const left = sideStumpRoot({ ...base, direction: 'left' })
    const right = sideStumpRoot({ ...base, direction: 'right' })
    return left != null && right != null && left !== right
  }
  const top = sideStumpRoot({ ...base, direction: 'top' })
  const bottom = sideStumpRoot({ ...base, direction: 'bottom' })
  return top != null && bottom != null && top !== bottom
}

/**
 * Laag-1 keep-poort: zit deze dunne face in een muurgat?
 * As uit **eigen** face-bbox (niet union kozijn+boog van de hyp).
 *
 * 1) Streng: directe cardinale stompen, micro overslaan, max-march klein gap.
 * 2) Soft: micro/arcering als stomp, max-march orde muurdikte.
 * Per zijde: majority (≥2/3 samples wallish) — één lek (boog-uitstolpsel) OK.
 */
// ESC:D-63 (A)
export function isThinHypBetweenWalls(
  hyp: ThinMaskBetweenWallsHyp,
  ctx: ThinMaskBetweenWallsContext,
): boolean {
  const { width, height } = ctx
  if (width < 1 || height < 1) return false
  if (!(hyp.unionBBox.width > 0 && hyp.unionBBox.height > 0)) return false

  const roots = resolveRoots(hyp.faceIds, ctx.parentMap)
  if (roots.size === 0) return false

  const labelAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0
    return ctx.labelsData[y * width + x] ?? 0
  }
  const resolve = (label: number) => resolveMergedLabel(label, ctx.parentMap)
  const componentsByLabel = new Map(ctx.components.map((c) => [c.label, c]))
  const shortSide = Math.min(width, height)
  const isMicro = (root: number): boolean => {
    const c = componentsByLabel.get(root)
    return c != null && classifyChildTier(c, shortSide) === 'micro'
  }

  const classForRoot = (root: number): RoomRasterClass | null => {
    if (root <= 0) return null
    return resolvePixelClassification(
      root,
      ctx.parentMap,
      ctx.classificationByLabel,
      ctx.classificationGroupBy ?? 'component',
    )
  }

  // Alleen face-bbox — nooit union met sibling-boog.
  const bbox = {
    x: hyp.unionBBox.x,
    y: hyp.unionBBox.y,
    width: hyp.unionBBox.width,
    height: hyp.unionBBox.height,
  }
  const axis = resolveDoorBetweenWallsAxis(bbox)
  const skipRoots = roots

  const probe = (maxMarchPx: number, acceptMicroAsHit: boolean): boolean =>
    axisSidesAreStumps({
      bbox,
      axis,
      skipRoots,
      labelAt,
      width,
      height,
      resolve,
      maxMarchPx,
      acceptMicroAsHit,
      isMicro,
      classForRoot,
    })

  if (probe(STRICT_GAP_SLACK_PX, false)) {
    tally('D-63', 'between_walls_strict')
    return true
  }
  const softMarch = softMaxMarchPx(ctx.referenceWallThicknessPx)
  if (probe(softMarch, true)) {
    tally('D-63', 'between_walls_soft')
    return true
  }
  tally('D-63', 'skip_not_between_walls')
  return false
}

/** AABB-overlap (inclusief rand-touch). */
export function thinHypBBoxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}
