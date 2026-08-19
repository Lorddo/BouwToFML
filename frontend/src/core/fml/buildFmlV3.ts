import { tally } from '@/core/diagnostics'
import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  buildBovenlichtOpening,
  resolveBovenlichtGapCm,
  resolveBovenlichtHeightCm,
  resolveDoorBovenlicht,
  resolveWindowBovenlicht,
} from './bovenlicht'
import { ensureDesignsSynced } from './design-sync'
import type {
  DrawingMeta,
  Floor,
  FloorArea,
  FloorDesign,
  FloorDimension,
  FloorItem,
  FloorLabel,
  FloorLine,
  FloorPlan,
  FloorSurface,
  Opening,
  Wall,
} from './types'
import { CONCEPT_DOOR_REFID, CONCEPT_WINDOW_REFID } from './types'
import { resolveRoomType, UNLABELED_AREA_COLOR } from './roomtype-catalog'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from './extraction-to-plan-types'
import { wallElevationAtT } from './wall-endpoint-height'

export type BovenlichtDefaultResolver = boolean | ((floor: Floor, floorIndex: number) => boolean)
export type BovenlichtCmResolver = number | ((floor: Floor, floorIndex: number) => number)

export interface BuildFmlV3Options {
  name?: string
  /**
   * Project-/vloerdefault: bovenlicht op deuren zonder per-deur override.
   * Boolean = zelfde default voor alle verdiepingen; functie = per floor.
   */
  bovenlichtDefault?: BovenlichtDefaultResolver
  /**
   * Project-/vloerdefault: bovenlicht op ramen zonder per-raam override.
   * Boolean = zelfde default voor alle verdiepingen; functie = per floor.
   */
  windowBovenlichtDefault?: BovenlichtDefaultResolver
  /** Glashoogte bovenlicht (cm); default fabriek 40. */
  bovenlichtHeightCm?: BovenlichtCmResolver
  /** Afstand boven opening / dorpel-offset (cm); default fabriek 10. */
  bovenlichtGapCm?: BovenlichtCmResolver
  /**
   * Product-gate: alle areas (en surfaces) exporteren met deze fill-kleur
   * i.p.v. per-instantie kleur (bijv. fabrieks-Woonkamer tot tagging is goedgekeurd).
   */
  forceAreaFillColor?: string
}

/**
 * Bouwt een Floorplanner v3 (persistent JSON) string.
 * Met plan.source: ids/settings/drawing/extras behouden.
 * Zonder source: hardcoded envelope (workspace/E2E).
 */

const WHITE = { type: 'color', value: '#ffffff' }

const DEFAULT_PROJECT_SETTINGS = {
  wallSectionHeight: 150,
  wallThickness: 10,
  wallOuterThickness: 30,
  useMetric: true,
  showGrid: true,
  showDims: true,
  showShortDims: false,
  showAreaDims: false,
  generateOuterDimension: false,
  dimensionMode: 'interior',
  showDropShadows: false,
  showObjects: true,
  showFixtures: true,
  showItemOutline: false,
  showObjectColour: false,
  showStructuralColour: true,
  showFloorsBelow: false,
  showObjects3D: true,
  showObjectMono: false,
  showLights: false,
  showLabels: true,
  areaLabelOutline: false,
  areaLabelLetterSpacing: 7,
  dimLineLabelHorizontal: false,
  exportLabels3D: false,
  showShadows3D: true,
  exportOrtho3D: false,
  visuals: 'BWC',
  showTexts: true,
  arrowHeadType: 'arrow',
  showNorthArrow: false,
  northArrowRotation: 0,
  northArrowKind: 1,
  blueprintMode: false,
} as const

const DEFAULT_DESIGN_SETTINGS = {
  engineAutoDims: false,
  areaLabelMultiplier: 1,
  scaleMultiplierDimensions: 1.5,
  scaleMultiplierComments: 1,
  dimLineLabelHorizontal: false,
  showCeilings3D: true,
  minWallLength: 4,
} as const

function openingMaterials(opening: Opening): Record<string, { type: string; value: string }> {
  if (opening.materials) return opening.materials
  if (opening.type === 'window') {
    return {
      FP_FRAME_OUT: WHITE,
      FP_FRAME_IN: WHITE,
    }
  }
  return {
    FP_DOOR: WHITE,
    FP_DOORFRAME: WHITE,
  }
}

function shortGuid(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
}

function openingGuid(opening: Opening): string {
  return opening.guid ?? shortGuid()
}

function serializeOpening(op: Opening): Record<string, unknown> {
  return {
    ...(op.extras ?? {}),
    refid: op.refid || (op.type === 'window' ? CONCEPT_WINDOW_REFID : CONCEPT_DOOR_REFID),
    t: op.t,
    type: op.type,
    width: op.width,
    // ESC:X-17 (E)
    z_height:
      op.z_height ??
      (op.type === 'window' ? DEFAULT_FML_WINDOW_HEIGHT_CM : DEFAULT_FML_DOOR_HEIGHT_CM),
    z: op.z ?? (op.type === 'window' ? DEFAULT_FML_WINDOW_SILL_Z_CM : 0),
    mirrored: op.mirrored ?? [0, 0],
    materials: openingMaterials(op),
    guid: openingGuid(op),
  }
}

function resolveBovenlichtOn(op: Opening, doorDefault: boolean, windowDefault: boolean): boolean {
  if (op.type === 'door') return resolveDoorBovenlicht(op, doorDefault)
  if (op.type === 'window') return resolveWindowBovenlicht(op, windowDefault)
  return false
}

function expandOpeningsForExport(
  wall: Wall,
  floorHeightFallbackCm: number,
  doorBovenlichtDefault: boolean,
  windowBovenlichtDefault: boolean,
  bovenlichtHeightCm: number,
  bovenlichtGapCm: number,
): Opening[] {
  const out: Opening[] = []
  for (const op of wall.openings) {
    out.push(op)
    if (!resolveBovenlichtOn(op, doorBovenlichtDefault, windowBovenlichtDefault)) continue
    const sourceGuid = openingGuid(op)
    const wallTopCm = wallElevationAtT(wall, op.t, floorHeightFallbackCm).h
    const bovenlicht = buildBovenlichtOpening(op, {
      floorHeightCm: wallTopCm,
      sourceGuid,
      heightCm: resolveBovenlichtHeightCm(op, bovenlichtHeightCm),
      gapCm: resolveBovenlichtGapCm(op, bovenlichtGapCm),
    })
    if (bovenlicht) out.push(bovenlicht)
  }
  return out
}

function resolveDefaultOption(
  option: BovenlichtDefaultResolver | undefined,
  floor: Floor,
  floorIndex: number,
): boolean {
  if (typeof option === 'function') return option(floor, floorIndex) === true
  return option === true
}

function resolveCmOption(
  option: BovenlichtCmResolver | undefined,
  floor: Floor,
  floorIndex: number,
  fallback: number,
): number {
  if (typeof option === 'function') {
    const value = option(floor, floorIndex)
    return Number.isFinite(value) ? value : fallback
  }
  if (typeof option === 'number' && Number.isFinite(option)) return option
  return fallback
}

function resolveAreaName(area: Pick<FloorArea, 'role' | 'name'>): string | undefined {
  if (area.role != null) {
    const rt = resolveRoomType(area.role)
    if (rt) return rt.name
  }
  const name = area.name?.trim()
  return name || undefined
}

function serializeArea(area: FloorArea, forceFillColor?: string): Record<string, unknown> {
  const name = resolveAreaName(area)
  const out: Record<string, unknown> = {
    ...(area.extras ?? {}),
    guid: area.id,
    poly: area.poly.map((p) => ({ x: p.x, y: p.y })),
    color: forceFillColor ?? area.color ?? UNLABELED_AREA_COLOR,
    showAreaLabel: area.showAreaLabel !== false,
  }
  if (area.role != null) out.role = area.role
  if (name) out.name = name
  if (area.customName?.trim()) out.customName = area.customName.trim()
  if (area.showSurfaceArea === true) out.showSurfaceArea = true
  if (area.name_x != null) out.name_x = area.name_x
  if (area.name_y != null) out.name_y = area.name_y
  if (out.roomstyle_id == null) out.roomstyle_id = ''
  return out
}

function serializeSurface(surface: FloorSurface, forceFillColor?: string): Record<string, unknown> {
  const name = resolveAreaName(surface)
  const out: Record<string, unknown> = {
    ...(surface.extras ?? {}),
    guid: surface.id,
    poly: surface.poly.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
    color: forceFillColor ?? surface.color ?? UNLABELED_AREA_COLOR,
    showAreaLabel: surface.showAreaLabel !== false,
  }
  if (surface.role != null) out.role = surface.role
  if (name) out.name = name
  if (surface.customName?.trim()) out.customName = surface.customName.trim()
  if (surface.showSurfaceArea === true) out.showSurfaceArea = true
  if (surface.name_x != null) out.name_x = surface.name_x
  if (surface.name_y != null) out.name_y = surface.name_y
  if (surface.isCutout === true) out.isCutout = true
  if (surface.pattern != null) out.pattern = surface.pattern
  if (out.roomstyle_id == null) out.roomstyle_id = ''
  return out
}

function serializeLabel(label: FloorLabel): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...(label.extras ?? {}),
    x: label.x,
    y: label.y,
    text: label.text,
    fontFamily: label.fontFamily,
    fontSize: label.fontSize,
    letterSpacing: label.letterSpacing,
    fontColor: label.fontColor,
    backgroundColor: label.backgroundColor,
    align: label.align,
    rotation: label.rotation,
  }
  if (label.backgroundAlpha != null) out.backgroundAlpha = label.backgroundAlpha
  if (label.outline === true) out.outline = true
  if (label.bold === true) out.bold = true
  if (label.italic === true) out.italic = true
  return out
}

function serializeLine(line: FloorLine): Record<string, unknown> {
  return {
    ...(line.extras ?? {}),
    type: line.type,
    color: line.color,
    thickness: line.thickness,
    a: { x: line.a.x, y: line.a.y },
    b: { x: line.b.x, y: line.b.y },
  }
}

function serializeDimension(dim: FloorDimension): Record<string, unknown> {
  return {
    ...(dim.extras ?? {}),
    type: dim.type,
    a: { x: dim.a.x, y: dim.a.y },
    b: { x: dim.b.x, y: dim.b.y },
  }
}

function serializeItem(item: FloorItem): Record<string, unknown> {
  return {
    ...(item.extras ?? {}),
    refid: item.refid,
    x: item.x,
    y: item.y,
    z: item.z ?? 0,
    width: item.width,
    height: item.height,
    z_height: item.z_height,
    rotation: item.rotation ?? 0,
    mirrored: item.mirrored ?? [0, 0],
    guid: item.guid ?? shortGuid(),
    ...(item.name ? { name: item.name } : {}),
  }
}

function serializeWall(
  wall: Wall,
  floor: Floor,
  floorIndex: number,
  options: BuildFmlV3Options,
  hasSource: boolean,
): Record<string, unknown> {
  const extras = wall.extras ?? {}
  const az = extras.az != null ? extras.az : { z: 0, h: floor.height }
  const bz = extras.bz != null ? extras.bz : { z: 0, h: floor.height }
  const decor =
    extras.decor != null ? extras.decor : { left: null, right: null, top: null, outline: 0 }
  const groupMarkerConfig =
    extras.groupMarkerConfig != null ? extras.groupMarkerConfig : { locked: false }

  const restExtras = { ...extras }
  delete restExtras.az
  delete restExtras.bz
  delete restExtras.decor
  delete restExtras.groupMarkerConfig

  if (!hasSource) {
    // ESC:X-16 (E) — volle floor.height zonder bron-extras
    void restExtras
  }

  return {
    ...restExtras,
    guid: wall.id,
    a: { x: wall.a.x, y: wall.a.y },
    b: { x: wall.b.x, y: wall.b.y },
    c: wall.c ?? null,
    az,
    bz,
    thickness: wall.thickness,
    // ESC:X-01 (E)
    balance: wall.balance ?? 0.5,
    groupMarkerConfig,
    decor,
    openings: expandOpeningsForExport(
      wall,
      floor.height,
      resolveDefaultOption(options.bovenlichtDefault, floor, floorIndex),
      resolveDefaultOption(options.windowBovenlichtDefault, floor, floorIndex),
      resolveCmOption(options.bovenlichtHeightCm, floor, floorIndex, BOVENLICHT_HEIGHT_CM),
      resolveCmOption(options.bovenlichtGapCm, floor, floorIndex, BOVENLICHT_GAP_CM),
    ).map(serializeOpening),
  }
}

function serializeDrawing(drawing: DrawingMeta | undefined): Record<string, unknown> | undefined {
  if (!drawing) return undefined
  return {
    ...(drawing.extras ?? {}),
    x: drawing.x,
    y: drawing.y,
    width: drawing.width,
    height: drawing.height,
    rotation: drawing.rotation,
    ...(drawing.url != null ? { url: drawing.url } : {}),
    ...(drawing.alpha != null ? { alpha: drawing.alpha } : {}),
    ...(drawing.visible != null ? { visible: drawing.visible } : {}),
  }
}

function serializeDesign(
  design: FloorDesign,
  floor: Floor,
  floorIndex: number,
  designIndex: number,
  options: BuildFmlV3Options,
  hasSource: boolean,
  fallbackProjectId: number,
): Record<string, unknown> {
  const source = design.source
  const out: Record<string, unknown> = {
    ...(source?.leftover ?? {}),
    id: source?.id ?? 1 + floorIndex * 100 + designIndex,
    name: design.name || floor.name,
    lines: (design.lines ?? []).map(serializeLine),
    dimensions: (design.dimensions ?? []).map(serializeDimension),
    labels: (design.labels ?? []).map(serializeLabel),
    // ESC:X-14 (E)
    areas: (design.areas ?? []).map((a) => serializeArea(a, options.forceAreaFillColor)),
    surfaces: (design.surfaces ?? []).map((s) => serializeSurface(s, options.forceAreaFillColor)),
    items: (design.items ?? []).map(serializeItem),
    annotations: source?.annotations ?? [],
    cameras: source?.cameras ?? [],
    walls: design.walls.map((wall) => serializeWall(wall, floor, floorIndex, options, hasSource)),
    settings: source?.settings ?? { ...DEFAULT_DESIGN_SETTINGS },
  }
  void fallbackProjectId
  return out
}

export function buildFmlV3(plan: FloorPlan, options: BuildFmlV3Options = {}): string {
  const hasSource = plan.source != null
  if (!hasSource) {
    // ESC:X-13 (E) — vaste project/floor/design-id's + timestamps
    tally('X-13', 'hardcoded_metadata')
    // ESC:X-15 (E) — hardcoded project-settings
    tally('X-15', 'hardcoded_settings')
  }
  // ESC:X-14 (E) — areas/surfaces/labels/dimensions altijd arrays
  tally('X-14', 'empty_collections')
  for (const floor of plan.floors) {
    if (!hasSource) {
      // ESC:X-16 (E)
      tally('X-16', 'full_height')
    }
    for (const wall of floor.walls) {
      for (const op of wall.openings) {
        if (op.z_height == null)
          tally('X-17', op.type === 'window' ? 'window_default' : 'door_default')
      }
    }
  }

  const fallbackProjectId = typeof plan.source?.id === 'number' ? plan.source.id : 900000001
  const wallHeightCm = plan.floors[0]?.height ?? DEFAULT_FML_WALL_HEIGHT_CM

  const syncedFloors = plan.floors.map((floor) => ensureDesignsSynced(floor))

  const projectSettings = hasSource
    ? {
        ...(plan.source?.settings ?? {}),
        wallHeight:
          typeof plan.source?.settings?.wallHeight === 'number'
            ? plan.source.settings.wallHeight
            : wallHeightCm,
      }
    : {
        wallHeight: wallHeightCm,
        ...DEFAULT_PROJECT_SETTINGS,
      }

  const output: Record<string, unknown> = {
    ...(plan.source?.leftover ?? {}),
    id: plan.source?.id ?? fallbackProjectId,
    name: options.name ?? plan.name,
    public: plan.source?.public ?? false,
    features: plan.source?.features ?? [],
    settings: projectSettings,
    floors: syncedFloors.map((floor, floorIndex) => {
      const designs = floor.designs ?? [
        {
          name: floor.name,
          walls: floor.walls,
          items: floor.items,
          areas: floor.areas,
          surfaces: floor.surfaces,
          labels: floor.labels,
          lines: floor.lines,
          dimensions: floor.dimensions,
        },
      ]
      const floorOut: Record<string, unknown> = {
        ...(floor.source?.leftover ?? {}),
        id: floor.source?.id ?? fallbackProjectId + 10 + floorIndex,
        project_id: floor.source?.project_id ?? fallbackProjectId,
        name: floor.name,
        level: floor.level,
        created_at: floor.source?.created_at ?? '2026-01-01T00:00:00.000Z',
        updated_at: floor.source?.updated_at ?? '2026-01-01T00:00:00.000Z',
        height: floor.height,
        cameras: floor.source?.cameras ?? [],
        designs: designs.map((design, designIndex) =>
          serializeDesign(
            design,
            floor,
            floorIndex,
            designIndex,
            options,
            hasSource,
            fallbackProjectId,
          ),
        ),
      }
      const drawing = serializeDrawing(floor.drawing)
      if (drawing) floorOut.drawing = drawing
      return floorOut
    }),
  }

  return JSON.stringify(output, null, 2)
}
