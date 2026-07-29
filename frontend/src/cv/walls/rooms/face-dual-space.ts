import { buildLabelAdjacency } from './label-adjacency'
import type { RoomRasterClass } from './room-ink-classify'
import { buildOpeningWhiteSpace, type OpeningWhiteSpace } from './opening-white-space'
import { extractComponentsFromLabelsData, type RasterRoomComponent } from './room-raster'
import { buildEnclosedFaceParentMap, resolveMergedLabel } from './room-raster-merge'
import type { SerializedRoomClassifyState } from '../strategies/room-first'

/** Preferentie bij geom-lookup over opening-wit vs wall-ink. */
export type GeomPrefer = 'white' | 'ink' | 'whiteThenInk' | 'inkThenWhite'

/** Strikte single-space select (geen fallthrough); zie `FaceDualSpace.space`. */
export type SpacePrefer = 'white' | 'ink'

/**
 * Shared prefer-fallthrough voor floor + REF geom-lookup.
 * Builders / maps blijven apart; alleen de white|ink-keuze is gedeeld.
 */
export function pickGeomByPrefer<T>(
  white: T | undefined,
  ink: T | undefined,
  prefer: GeomPrefer,
): T | undefined {
  switch (prefer) {
    case 'white':
      return white
    case 'ink':
      return ink
    case 'whiteThenInk':
      return white ?? ink
    case 'inkThenWhite':
      return ink ?? white
  }
}

export type FaceBBox = { x: number; y: number; width: number; height: number }

export type FaceGeom = {
  id: number
  bbox: FaceBBox
  areaPx: number
  className: RoomRasterClass
}

export type FaceSpaceKind = 'opening-white' | 'wall-ink'

export type FaceSpace = {
  kind: FaceSpaceKind
  labelsData: Int32Array
  width: number
  height: number
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  adjacency: Map<number, Set<number>>
  byId: Map<number, FaceGeom>
}

export type FaceDualSpace = {
  white: FaceSpace
  ink: FaceSpace
  geom(id: number, prefer: GeomPrefer): FaceGeom | undefined
  unionBBox(ids: Iterable<number>, prefer: GeomPrefer): FaceBBox | null
  /** Pure white|ink; throw op fallthrough prefers (`whiteThenInk` / `inkThenWhite`). */
  space(prefer: SpacePrefer): FaceSpace
}

export function unionFaceBBox(a: FaceBBox, b: FaceBBox): FaceBBox {
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x + a.width, b.x + b.width)
  const maxY = Math.max(a.y + a.height, b.y + b.height)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function buildById(params: {
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
}): Map<number, FaceGeom> {
  const byId = new Map<number, FaceGeom>()
  for (const component of params.components) {
    if (!(component.label > 0)) continue
    const root = resolveMergedLabel(component.label, params.parentMap)
    if (!(root > 0)) continue
    const className =
      params.classificationByLabel.get(component.label) ??
      params.classificationByLabel.get(root) ??
      'surface'
    const existing = byId.get(root)
    if (!existing) {
      byId.set(root, {
        id: root,
        bbox: { ...component.bbox },
        areaPx: component.areaPx,
        className,
      })
      continue
    }
    byId.set(root, {
      id: root,
      bbox: unionFaceBBox(existing.bbox, component.bbox),
      areaPx: existing.areaPx + component.areaPx,
      className: existing.className,
    })
  }
  return byId
}

function buildInkFaceSpace(params: {
  labelsData: Int32Array
  width: number
  height: number
  classificationByLabel: Map<number, RoomRasterClass>
  parentMap?: Map<number, number>
}): FaceSpace {
  const components = extractComponentsFromLabelsData(params.labelsData, params.width, params.height)
  const labelAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= params.width || y >= params.height) return 0
    return params.labelsData[y * params.width + x] ?? 0
  }
  const parentMap =
    params.parentMap ??
    buildEnclosedFaceParentMap(components, params.width, params.height, { labelAt })
  const classificationByLabel = new Map(params.classificationByLabel)
  for (const component of components) {
    if (!classificationByLabel.has(component.label)) {
      const root = resolveMergedLabel(component.label, parentMap)
      classificationByLabel.set(
        component.label,
        classificationByLabel.get(root) ?? (component.touchesBorder ? 'outside' : 'surface'),
      )
    }
  }
  const adjacency = buildLabelAdjacency({
    labelsData: params.labelsData,
    width: params.width,
    height: params.height,
    parentMap,
  })
  return {
    kind: 'wall-ink',
    labelsData: params.labelsData,
    width: params.width,
    height: params.height,
    components,
    parentMap,
    classificationByLabel,
    adjacency,
    byId: buildById({ components, parentMap, classificationByLabel }),
  }
}

function buildWhiteFaceSpace(openingWhite: OpeningWhiteSpace): FaceSpace {
  const adjacency = buildLabelAdjacency({
    labelsData: openingWhite.labelsData,
    width: openingWhite.width,
    height: openingWhite.height,
    parentMap: openingWhite.parentMap,
  })
  return {
    kind: 'opening-white',
    labelsData: openingWhite.labelsData,
    width: openingWhite.width,
    height: openingWhite.height,
    components: openingWhite.components,
    parentMap: openingWhite.parentMap,
    classificationByLabel: openingWhite.classificationByLabel,
    adjacency,
    byId: buildById({
      components: openingWhite.components,
      parentMap: openingWhite.parentMap,
      classificationByLabel: openingWhite.classificationByLabel,
    }),
  }
}

function pickGeom(
  white: FaceSpace,
  ink: FaceSpace,
  id: number,
  prefer: GeomPrefer,
): FaceGeom | undefined {
  return pickGeomByPrefer(white.byId.get(id), ink.byId.get(id), prefer)
}

export type BuildFaceDualSpaceParams = {
  rawLabelsData: Int32Array
  labelsData: Int32Array
  width: number
  height: number
  classificationByLabel: Map<number, RoomRasterClass>
  priorParentMap?: Map<number, number>
  faceOverrides?: Map<number, RoomRasterClass>
  /** Optioneel: post-ink parentMap (anders opnieuw uit ink components). */
  inkParentMap?: Map<number, number>
}

/**
 * Eén dual-view: opening-wit (raw) + wall-ink (post-ink labels).
 * Hard-fail als raw of ink labels ontbreken — caller moet beide hebben na classify.
 */
export function buildFaceDualSpace(params: BuildFaceDualSpaceParams): FaceDualSpace {
  if (!params.rawLabelsData || params.rawLabelsData.length === 0) {
    throw new Error('FaceDualSpace: rawLabelsData ontbreekt (opening-wit vereist)')
  }
  if (!params.labelsData || params.labelsData.length === 0) {
    throw new Error('FaceDualSpace: labelsData ontbreekt (wall-ink vereist)')
  }
  if (params.rawLabelsData.length !== params.width * params.height) {
    throw new Error('FaceDualSpace: rawLabelsData lengte komt niet overeen met width×height')
  }
  if (params.labelsData.length !== params.width * params.height) {
    throw new Error('FaceDualSpace: labelsData lengte komt niet overeen met width×height')
  }

  const openingWhite = buildOpeningWhiteSpace({
    rawLabelsData: params.rawLabelsData,
    width: params.width,
    height: params.height,
    classificationByLabel: params.classificationByLabel,
    priorParentMap: params.priorParentMap,
    faceOverrides: params.faceOverrides,
  })
  const white = buildWhiteFaceSpace(openingWhite)
  const ink = buildInkFaceSpace({
    labelsData: params.labelsData,
    width: params.width,
    height: params.height,
    classificationByLabel: applyOverridesToClassMap(
      params.classificationByLabel,
      params.faceOverrides,
    ),
    parentMap: params.inkParentMap,
  })

  return assembleFaceDualSpace(white, ink)
}

/** Compose een FaceDualSpace uit bestaande white/ink FaceSpaces (zelfde geom/unionBBox-contract). */
export function assembleFaceDualSpace(white: FaceSpace, ink: FaceSpace): FaceDualSpace {
  return {
    white,
    ink,
    geom(id, prefer) {
      return pickGeom(white, ink, id, prefer)
    },
    unionBBox(ids, prefer) {
      let merged: FaceBBox | null = null
      for (const id of ids) {
        if (!(id > 0)) continue
        const g = pickGeom(white, ink, id, prefer)
        if (!g) continue
        merged = merged ? unionFaceBBox(merged, g.bbox) : { ...g.bbox }
      }
      return merged
    },
    space(prefer) {
      switch (prefer) {
        case 'white':
          return white
        case 'ink':
          return ink
        default:
          throw new Error(
            `FaceDualSpace.space: unsupported prefer "${String(prefer)}" (verwacht "white"|"ink")`,
          )
      }
    },
  }
}

/**
 * Na detach (o.a. window pipeline): herbind opening-wit parentMap/class/adjacency + byId;
 * wall-ink blijft ongewijzigd. Zonder dit is cache-dual.white.byId ongeldig voor Stage 1–4.
 */
export function rebindFaceDualWhite(
  dual: FaceDualSpace,
  params: {
    parentMap: Map<number, number>
    classificationByLabel: Map<number, RoomRasterClass>
    adjacency?: Map<number, Set<number>>
  },
): FaceDualSpace {
  const adjacency =
    params.adjacency ??
    buildLabelAdjacency({
      labelsData: dual.white.labelsData,
      width: dual.white.width,
      height: dual.white.height,
      parentMap: params.parentMap,
    })
  const white: FaceSpace = {
    kind: 'opening-white',
    labelsData: dual.white.labelsData,
    width: dual.white.width,
    height: dual.white.height,
    components: dual.white.components,
    parentMap: params.parentMap,
    classificationByLabel: params.classificationByLabel,
    adjacency,
    byId: buildById({
      components: dual.white.components,
      parentMap: params.parentMap,
      classificationByLabel: params.classificationByLabel,
    }),
  }
  return assembleFaceDualSpace(white, dual.ink)
}

/**
 * Lichte FaceSpace uit component-lijsten (tests / synthetische dual zonder volledige raster-labels).
 */
export function buildFaceSpaceFromComponents(params: {
  kind: FaceSpaceKind
  components: RasterRoomComponent[]
  parentMap?: Map<number, number>
  classificationByLabel?: Map<number, RoomRasterClass>
  adjacency?: Map<number, Set<number>>
  width?: number
  height?: number
  labelsData?: Int32Array
}): FaceSpace {
  const parentMap = params.parentMap ?? new Map<number, number>()
  const classificationByLabel = params.classificationByLabel ?? new Map<number, RoomRasterClass>()
  for (const component of params.components) {
    if (!classificationByLabel.has(component.label)) {
      classificationByLabel.set(component.label, 'surface')
    }
  }
  return {
    kind: params.kind,
    labelsData: params.labelsData ?? new Int32Array(1),
    width: params.width ?? 1,
    height: params.height ?? 1,
    components: params.components,
    parentMap,
    classificationByLabel,
    adjacency: params.adjacency ?? new Map(),
    byId: buildById({
      components: params.components,
      parentMap,
      classificationByLabel,
    }),
  }
}

function applyOverridesToClassMap(
  base: Map<number, RoomRasterClass>,
  faceOverrides?: Map<number, RoomRasterClass>,
): Map<number, RoomRasterClass> {
  if (!faceOverrides || faceOverrides.size === 0) return new Map(base)
  const next = new Map(base)
  for (const [id, cls] of faceOverrides) next.set(id, cls)
  return next
}

export function buildFaceDualSpaceFromState(
  state: SerializedRoomClassifyState,
  options?: {
    classificationByLabel?: Map<number, RoomRasterClass>
    faceOverrides?: Map<number, RoomRasterClass>
  },
): FaceDualSpace {
  const rawLabelsData = state.rawLabelsData
  if (!rawLabelsData) {
    throw new Error('FaceDualSpace: state.rawLabelsData ontbreekt')
  }
  const classificationByLabel =
    options?.classificationByLabel ?? new Map(state.classificationByLabel)
  return buildFaceDualSpace({
    rawLabelsData,
    labelsData: state.labelsData,
    width: state.width,
    height: state.height,
    classificationByLabel,
    priorParentMap: new Map(state.parentMap),
    faceOverrides: options?.faceOverrides,
    inkParentMap: new Map(state.parentMap),
  })
}

export function whiteGeom(dual: FaceDualSpace, id: number): FaceGeom | undefined {
  return dual.geom(id, 'white')
}

export function inkGeom(dual: FaceDualSpace, id: number): FaceGeom | undefined {
  return dual.geom(id, 'ink')
}
