import { extractComponentsFromLabelsData, type RasterRoomComponent } from './room-raster'
import { resolveMergedLabel, type RasterBBox } from './room-raster-merge'
import type { InkDiffBounds } from './room-ink-symmetric'

/** Persistente white/ink face-bboxes voor classify hot path (geen FaceDualSpace). */
export type FaceBBoxIndex = {
  white: RasterRoomComponent[]
  ink: RasterRoomComponent[]
  whiteByLabel: Map<number, RasterRoomComponent>
  inkByLabel: Map<number, RasterRoomComponent>
}

export type FaceBBoxSource = 'white' | 'ink'

function byLabelMap(components: RasterRoomComponent[]): Map<number, RasterRoomComponent> {
  const map = new Map<number, RasterRoomComponent>()
  for (const component of components) {
    map.set(component.label, component)
  }
  return map
}

function emptySide(): { list: RasterRoomComponent[]; byLabel: Map<number, RasterRoomComponent> } {
  return { list: [], byLabel: new Map() }
}

function extractSide(
  labelsData: Int32Array | undefined,
  width: number,
  height: number,
): { list: RasterRoomComponent[]; byLabel: Map<number, RasterRoomComponent> } {
  if (!labelsData || labelsData.length === 0 || width < 1 || height < 1) {
    return emptySide()
  }
  const list = extractComponentsFromLabelsData(labelsData, width, height)
  return { list, byLabel: byLabelMap(list) }
}

/** Bouw beide sides uit raw + resolved label buffers. */
export function buildFaceBBoxIndex(params: {
  rawLabelsData?: Int32Array
  labelsData: Int32Array
  width: number
  height: number
}): FaceBBoxIndex {
  const white = extractSide(params.rawLabelsData ?? params.labelsData, params.width, params.height)
  const ink = extractSide(params.labelsData, params.width, params.height)
  return {
    white: white.list,
    ink: ink.list,
    whiteByLabel: white.byLabel,
    inkByLabel: ink.byLabel,
  }
}

export function rebuildFaceBBoxInk(
  index: FaceBBoxIndex,
  labelsData: Int32Array,
  width: number,
  height: number,
): FaceBBoxIndex {
  const ink = extractSide(labelsData, width, height)
  return {
    ...index,
    ink: ink.list,
    inkByLabel: ink.byLabel,
  }
}

function sideOf(index: FaceBBoxIndex, source: FaceBBoxSource): {
  list: RasterRoomComponent[]
  byLabel: Map<number, RasterRoomComponent>
} {
  return source === 'white'
    ? { list: index.white, byLabel: index.whiteByLabel }
    : { list: index.ink, byLabel: index.inkByLabel }
}

/**
 * Unie van face-bboxes voor dirty/resolve-rects.
 * Root-aware: unie van alle components die naar dezelfde merged root resolven
 * (zelfde semantiek als dual.geom / byId).
 */
export function unionLabelsBBox(
  index: FaceBBoxIndex,
  labels: Iterable<number>,
  params: {
    source: FaceBBoxSource
    width: number
    height: number
    marginPx?: number
    parentMap?: Map<number, number>
  },
): InkDiffBounds | null {
  const wanted = [...labels].filter((id) => id > 0)
  if (wanted.length === 0) return null

  const { list, byLabel } = sideOf(index, params.source)
  const parentMap = params.parentMap ?? new Map<number, number>()
  const marginPx = params.marginPx ?? 0

  const roots = new Set<number>()
  for (const label of wanted) {
    roots.add(resolveMergedLabel(label, parentMap))
  }

  let x0 = Number.POSITIVE_INFINITY
  let y0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY

  const addBBox = (bbox: RasterBBox) => {
    x0 = Math.min(x0, bbox.x)
    y0 = Math.min(y0, bbox.y)
    x1 = Math.max(x1, bbox.x + bbox.width - 1)
    y1 = Math.max(y1, bbox.y + bbox.height - 1)
  }

  for (const component of list) {
    const root = resolveMergedLabel(component.label, parentMap)
    if (!roots.has(root)) continue
    addBBox(component.bbox)
  }

  // Fallback: directe byLabel lookup als list-iteratie niets vond (lege side).
  if (!Number.isFinite(x0)) {
    for (const label of wanted) {
      const direct = byLabel.get(label)
      if (direct) addBBox(direct.bbox)
    }
  }

  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
    return null
  }

  return {
    x0: Math.max(0, x0 - marginPx),
    y0: Math.max(0, y0 - marginPx),
    x1: Math.min(params.width - 1, x1 + marginPx),
    y1: Math.min(params.height - 1, y1 + marginPx),
  }
}
