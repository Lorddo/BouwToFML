import type { RasterRoomComponent } from './room-raster'

export interface RasterBBox {
  x: number
  y: number
  width: number
  height: number
}

export type CardinalDirection = 'left' | 'right' | 'top' | 'bottom'
export type ChildSizeTier = 'micro' | 'small'

/** Micro: max bbox-zijde ≤ 3% tekening. Klein: >3% t/m 10%. */
export const MICRO_TIER_MAX_PCT = 0.03
export const SMALL_TIER_MAX_PCT = 0.1

export interface MergeEnclosedFacesOptions {
  /** Label per pixel (0 = zwarte inkt). */
  labelAt: (x: number, y: number) => number
}

function bboxMaxSide(bbox: RasterBBox): number {
  return Math.max(bbox.width, bbox.height)
}

export function bboxMaxSidePct(bbox: RasterBBox, shortSide: number): number {
  if (shortSide <= 0) return 1
  return bboxMaxSide(bbox) / shortSide
}

export function classifyChildTier(
  component: RasterRoomComponent,
  shortSide: number,
): ChildSizeTier | null {
  const pct = bboxMaxSidePct(component.bbox, shortSide)
  if (pct <= MICRO_TIER_MAX_PCT) return 'micro'
  if (pct <= SMALL_TIER_MAX_PCT) return 'small'
  return null
}

/** @deprecated Gebruik classifyChildTier — behouden voor tests. */
export function resolveMaxChildBboxPx(imageWidth: number, imageHeight: number): number {
  const shortSide = Math.min(imageWidth, imageHeight)
  return Math.round(shortSide * SMALL_TIER_MAX_PCT)
}

/** Veiligheidslimiet ray-march — volstaat om elke muurdikte in de tekening te passeren. */
function resolveMaxNeighborMarchPx(imageWidth: number, imageHeight: number): number {
  return Math.max(imageWidth, imageHeight)
}

export function bboxContains(outer: RasterBBox, inner: RasterBBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export function resolveMergedLabel(label: number, parentMap: Map<number, number>): number {
  let current = label
  let next = parentMap.get(current)
  let guard = 0
  while (typeof next === 'number' && next !== current && guard < 1024) {
    current = next
    next = parentMap.get(current)
    guard += 1
  }
  return current
}

function componentByLabel(
  components: RasterRoomComponent[],
  label: number,
): RasterRoomComponent | undefined {
  return components.find((c) => c.label === label)
}

function isMicroComponent(
  label: number,
  componentsByLabel: Map<number, RasterRoomComponent>,
  shortSide: number,
): boolean {
  const c = componentsByLabel.get(label)
  if (!c) return false
  return classifyChildTier(c, shortSide) === 'micro'
}

function samplePointsOnSide(
  bbox: RasterBBox,
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

/** Eerste buur-face via cardinal ray-march; door alle inkt en micro-ketting heen. */
function outwardNeighborFromPoint(params: {
  x: number
  y: number
  dx: number
  dy: number
  /** Faces die bij de query-regio horen — doorheen marcheren (single root of cluster). */
  skipRoots: Set<number>
  labelAt: (x: number, y: number) => number
  imageWidth: number
  imageHeight: number
  maxMarchPx: number
  resolve: (label: number) => number
  componentsByLabel: Map<number, RasterRoomComponent>
  shortSide: number
}): number | null {
  let x = params.x
  let y = params.y
  const { dx, dy } = params
  let marched = 0

  while (marched < params.maxMarchPx) {
    if (x < 0 || y < 0 || x >= params.imageWidth || y >= params.imageHeight) return null

    const raw = params.labelAt(x, y)
    if (raw === 0) {
      x += dx
      y += dy
      marched += 1
      continue
    }

    const hit = params.resolve(raw)
    if (params.skipRoots.has(hit)) {
      x += dx
      y += dy
      marched += 1
      continue
    }

    if (isMicroComponent(hit, params.componentsByLabel, params.shortSide)) {
      const stuckX = x
      const stuckY = y
      let microLabel = hit
      while (marched < params.maxMarchPx) {
        if (x < 0 || y < 0 || x >= params.imageWidth || y >= params.imageHeight) return null
        const innerRaw = params.labelAt(x, y)
        if (innerRaw === 0) {
          x += dx
          y += dy
          marched += 1
          continue
        }
        const inner = params.resolve(innerRaw)
        if (params.skipRoots.has(inner) || inner === microLabel) {
          x += dx
          y += dy
          marched += 1
          continue
        }
        if (isMicroComponent(inner, params.componentsByLabel, params.shortSide)) {
          microLabel = inner
          x += dx
          y += dy
          marched += 1
          continue
        }
        return inner
      }
      if (marched >= params.maxMarchPx) return null
      // Voorkom oneindige lus wanneer micro-ketting niet vooruit komt.
      if (x === stuckX && y === stuckY) {
        x += dx
        y += dy
        marched += 1
      }
      continue
    }

    return hit
  }
  return null
}

function outwardNeighborOnSide(params: {
  child: RasterRoomComponent
  direction: CardinalDirection
  labelAt: (x: number, y: number) => number
  imageWidth: number
  imageHeight: number
  maxMarchPx: number
  resolve: (label: number) => number
  componentsByLabel: Map<number, RasterRoomComponent>
  shortSide: number
  skipRoots: Set<number>
}): number | null {
  const { child, direction, labelAt, imageWidth, imageHeight, maxMarchPx } = params
  const samples = samplePointsOnSide(child.bbox, direction)
  const neighbors: number[] = []

  for (const sample of samples) {
    const neighbor = outwardNeighborFromPoint({
      x: sample.x,
      y: sample.y,
      dx: sample.dx,
      dy: sample.dy,
      skipRoots: params.skipRoots,
      labelAt,
      imageWidth,
      imageHeight,
      maxMarchPx,
      resolve: params.resolve,
      componentsByLabel: params.componentsByLabel,
      shortSide: params.shortSide,
    })
    if (neighbor === null) return null
    neighbors.push(neighbor)
  }

  const first = neighbors[0]
  if (neighbors.some((n) => n !== first)) return null
  return first
}

export function cardinalNeighborRoots(params: {
  child: RasterRoomComponent
  labelAt: (x: number, y: number) => number
  imageWidth: number
  imageHeight: number
  resolve: (label: number) => number
  componentsByLabel: Map<number, RasterRoomComponent>
  /**
   * Extra roots om doorheen te marcheren (bijv. multi-face deur-cluster).
   * Default: alleen de resolved child-root.
   */
  skipRoots?: ReadonlySet<number>
}): Array<number | null> {
  const shortSide = Math.min(params.imageWidth, params.imageHeight)
  const maxMarchPx = resolveMaxNeighborMarchPx(params.imageWidth, params.imageHeight)
  const childRoot = params.resolve(params.child.label)
  const skipRoots = new Set<number>(params.skipRoots ?? [])
  skipRoots.add(childRoot)
  const sides: CardinalDirection[] = ['left', 'right', 'top', 'bottom']
  return sides.map((direction) =>
    outwardNeighborOnSide({
      ...params,
      direction,
      shortSide,
      maxMarchPx,
      skipRoots,
    }),
  )
}

/** Small tier: alle 4 zijden dezelfde buur (door inkt + micro-ketting). */
function uniformCardinalParentLabel(params: {
  child: RasterRoomComponent
  labelAt: (x: number, y: number) => number
  imageWidth: number
  imageHeight: number
  resolve: (label: number) => number
  componentsByLabel: Map<number, RasterRoomComponent>
}): number | null {
  const neighbors = cardinalNeighborRoots(params)
  if (neighbors.some((n) => n === null)) return null
  const [left, right, top, bottom] = neighbors
  if (left !== right || left !== top || left !== bottom) return null
  return left
}

/** Micro tier: minstens 3 van 4 zijden dezelfde buur. */
export function majorityCardinalParentLabel(params: {
  child: RasterRoomComponent
  labelAt: (x: number, y: number) => number
  imageWidth: number
  imageHeight: number
  resolve: (label: number) => number
  componentsByLabel: Map<number, RasterRoomComponent>
}): number | null {
  const neighbors = cardinalNeighborRoots(params)
  const valid = neighbors.filter((n): n is number => n !== null)
  if (valid.length < 3) return null

  const counts = new Map<number, number>()
  for (const n of valid) counts.set(n, (counts.get(n) ?? 0) + 1)
  let bestLabel: number | null = null
  let bestCount = 0
  for (const [label, count] of counts) {
    if (count >= 3 && count > bestCount) {
      bestLabel = label
      bestCount = count
    }
  }
  return bestLabel
}

function resolveParentForChild(params: {
  child: RasterRoomComponent
  tier: ChildSizeTier
  componentsByLabel: Map<number, RasterRoomComponent>
  labelAt: (x: number, y: number) => number
  imageWidth: number
  imageHeight: number
  resolve: (label: number) => number
}): number | null {
  const base = {
    child: params.child,
    labelAt: params.labelAt,
    imageWidth: params.imageWidth,
    imageHeight: params.imageHeight,
    resolve: params.resolve,
    componentsByLabel: params.componentsByLabel,
  }

  if (params.tier === 'small') {
    return uniformCardinalParentLabel(base)
  }

  return majorityCardinalParentLabel(base)
}

function isValidMerge(params: {
  child: RasterRoomComponent
  parentLabel: number
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
}): boolean {
  const { child, parentLabel, components, parentMap } = params
  if (parentLabel === child.label) return false
  const resolvedParentLabel = resolveMergedLabel(parentLabel, parentMap)
  const parent = componentByLabel(components, resolvedParentLabel)
  if (!parent) return false
  // Omsloten vlakken (geen canvas-rand) mogen nooit in een buiten-parent opgenomen worden.
  if (parent.touchesBorder && !child.touchesBorder) return false
  return true
}

/**
 * Tiered merge — cardinal ray-march door micro/small witte CC's:
 * - micro (≤3%): 3/4 zijden dezelfde buur
 * - small (3–10%): 4/4 zijden dezelfde buur
 * Inkt-gaten tussen vlakken zijn al opgelost via resolveInkBetweenFaces vóór deze stap.
 */
export function buildEnclosedFaceParentMap(
  components: RasterRoomComponent[],
  imageWidth: number,
  imageHeight: number,
  options: MergeEnclosedFacesOptions,
): Map<number, number> {
  const shortSide = Math.min(imageWidth, imageHeight)
  const parentMap = new Map<number, number>()
  const resolve = (label: number) => resolveMergedLabel(label, parentMap)
  const componentsByLabel = new Map(components.map((c) => [c.label, c]))

  const candidates = [...components]
    .filter((c) => classifyChildTier(c, shortSide) !== null)
    .sort((a, b) => a.areaPx - b.areaPx)

  for (const child of candidates) {
    const tier = classifyChildTier(child, shortSide)
    if (!tier) continue

    const parentLabel = resolveParentForChild({
      child,
      tier,
      componentsByLabel,
      labelAt: options.labelAt,
      imageWidth,
      imageHeight,
      resolve,
    })
    if (parentLabel === null) continue
    if (!isValidMerge({ child, parentLabel, components, parentMap })) continue

    parentMap.set(child.label, parentLabel)
  }

  return parentMap
}

export function countDistinctMergedFaces(
  components: RasterRoomComponent[],
  parentMap: Map<number, number>,
): number {
  const roots = new Set(components.map((c) => resolveMergedLabel(c.label, parentMap)))
  return roots.size
}

export function countMergedSurfaces(
  components: RasterRoomComponent[],
  parentMap: Map<number, number>,
): number {
  const rootMeta = new Map<number, boolean>()
  for (const c of components) {
    const root = resolveMergedLabel(c.label, parentMap)
    const touchesBorder = rootMeta.get(root)
    rootMeta.set(
      root,
      touchesBorder === undefined ? c.touchesBorder : touchesBorder && c.touchesBorder,
    )
  }
  let count = 0
  for (const [, touchesBorder] of rootMeta) {
    if (!touchesBorder) count += 1
  }
  return count
}
