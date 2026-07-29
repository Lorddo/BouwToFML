import type { RoomRasterClass } from './room-ink-classify'
import { extractComponentsFromLabelsData, type RasterRoomComponent } from './room-raster'
import { buildEnclosedFaceParentMap, resolveMergedLabel } from './room-raster-merge'

/**
 * Opening-wit dual-space: witte CC-geometrie (rawLabels, vóór ink-assign)
 * voor deur/raam Stage 1 — niet de post-ink wall-faces (wit + toegewezen inkt).
 *
 * Wall-ink view blijft `labelsData` + `isWallMaskClass` (L0 / V3 / wall-rescue).
 */

export function isOpeningWhiteClass(cls: RoomRasterClass): boolean {
  return (
    cls === 'surface' ||
    cls === 'outside' ||
    cls === 'unknown' ||
    cls === 'door' ||
    cls === 'window'
    // doorframe bewust uitgesloten — wallish framing, geen Stage-1 opening-wit seed
  )
}

export type OpeningWhiteSpace = {
  /** Pre-ink white CC labels (zelfde buffer als state.rawLabelsData). */
  labelsData: Int32Array
  width: number
  height: number
  /** Alle raw white CC’s (areaPx = wit pixels alleen). */
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  /** Effectieve class per raw label (overrides + classify + border→outside). */
  classificationByLabel: Map<number, RoomRasterClass>
  /** Roots waarvan de class opening-wit is (geen wall). */
  roots: number[]
}

export type BuildOpeningWhiteSpaceParams = {
  rawLabelsData: Int32Array
  width: number
  height: number
  /** Classify uit muren-flow (vaak op post-ink keys; lookup via priorParentMap). */
  classificationByLabel: Map<number, RoomRasterClass>
  /** Optioneel: post-ink parentMap voor class-lookup op gemergde roots. */
  priorParentMap?: Map<number, number>
  faceOverrides?: Map<number, RoomRasterClass>
}

function resolveClassForRawLabel(params: {
  label: number
  touchesBorder: boolean
  classificationByLabel: Map<number, RoomRasterClass>
  priorParentMap: Map<number, number>
  faceOverrides: Map<number, RoomRasterClass>
}): RoomRasterClass {
  const override = params.faceOverrides.get(params.label)
  if (override !== undefined) return override
  if (params.touchesBorder) return 'outside'
  const direct = params.classificationByLabel.get(params.label)
  if (direct !== undefined) return direct
  const priorRoot = resolveMergedLabel(params.label, params.priorParentMap)
  return params.classificationByLabel.get(priorRoot) ?? 'surface'
}

/**
 * Bouw opening-wit view uit rawLabelsData (geen tweede CC op B/W).
 * Fallback: als rawLabels ontbreekt/leeg, zelfde buffer als labelsData doorgeven mag.
 */
export function buildOpeningWhiteSpace(params: BuildOpeningWhiteSpaceParams): OpeningWhiteSpace {
  const {
    rawLabelsData,
    width,
    height,
    classificationByLabel,
    priorParentMap = new Map(),
    faceOverrides = new Map(),
  } = params

  const components = extractComponentsFromLabelsData(rawLabelsData, width, height)
  const labelAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0
    return rawLabelsData[y * width + x] ?? 0
  }
  const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })

  const effectiveClass = new Map<number, RoomRasterClass>()
  for (const component of components) {
    effectiveClass.set(
      component.label,
      resolveClassForRawLabel({
        label: component.label,
        touchesBorder: component.touchesBorder,
        classificationByLabel,
        priorParentMap,
        faceOverrides,
      }),
    )
  }

  const roots: number[] = []
  const seen = new Set<number>()
  for (const component of components) {
    const root = resolveMergedLabel(component.label, parentMap)
    if (seen.has(root)) continue
    seen.add(root)
    const cls = effectiveClass.get(root) ?? effectiveClass.get(component.label) ?? 'surface'
    if (isOpeningWhiteClass(cls)) roots.push(root)
  }
  roots.sort((a, b) => a - b)

  return {
    labelsData: rawLabelsData,
    width,
    height,
    components,
    parentMap,
    classificationByLabel: effectiveClass,
    roots,
  }
}

/**
 * Post-ink wall-faces voor deur wall-rescue / wall-fill (inkt-inclusieve geometrie).
 * Niet gebruiken voor strip-/sector-maat in Stage 1.
 */
export function extractWallInkComponents(params: {
  labelsData: Int32Array
  width: number
  height: number
  classificationByLabel: Map<number, RoomRasterClass>
  parentMap?: Map<number, number>
}): RasterRoomComponent[] {
  const components = extractComponentsFromLabelsData(params.labelsData, params.width, params.height)
  const parentMap = params.parentMap ?? new Map<number, number>()
  return components.filter((component) => {
    const root = resolveMergedLabel(component.label, parentMap)
    const cls =
      params.classificationByLabel.get(component.label) ??
      params.classificationByLabel.get(root) ??
      'surface'
    return cls === 'wall'
  })
}

/** Combineer opening-wit + post-ink wall components (unieke labels; wall wint bij conflict). */
export function mergeOpeningWhiteWithWallInk(params: {
  whiteComponents: readonly RasterRoomComponent[]
  wallInkComponents: readonly RasterRoomComponent[]
}): RasterRoomComponent[] {
  const byLabel = new Map<number, RasterRoomComponent>()
  for (const component of params.whiteComponents) {
    byLabel.set(component.label, component)
  }
  for (const component of params.wallInkComponents) {
    byLabel.set(component.label, component)
  }
  return [...byLabel.values()].sort((a, b) => a.label - b.label)
}
