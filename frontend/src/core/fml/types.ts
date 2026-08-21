export interface Point2D {
  x: number
  y: number
}

/** Onbekende Floorplanner-keys die we roundtripten zonder te typen. */
export type FmlExtras = Record<string, unknown>

export type OpeningType = 'door' | 'window'

export interface Opening {
  refid: string
  t: number
  width: number
  type: OpeningType
  mirrored?: [number, number]
  z?: number
  z_height?: number
  guid?: string
  materials?: Record<string, { type: string; value: string }>
  /**
   * Session-only: bovenlicht bij FML-export (niet in viewer) voor deur of raam.
   * `null`/`undefined` = erf vloerdefault (deur/raam apart); `true`/`false` = force.
   */
  bovenlicht?: boolean | null
  /**
   * Session-only glashoogte van het gesynthetiseerde bovenlicht (cm).
   * `null`/`undefined` = erf vloerdefault; gezet = force.
   */
  bovenlichtHeightCm?: number | null
  /**
   * Session-only dorpel-gap boven de opening (cm).
   * `null`/`undefined` = erf vloerdefault; gezet = force.
   */
  bovenlichtGapCm?: number | null
  /**
   * @deprecated FML-viewer leest boog-inset uit opening-refid-catalog (`swingInsetCm`).
   * Velden blijven optioneel voor oude in-memory plans; worden genegeerd bij render.
   */
  swingHingeInsetCm?: number
  /** @deprecated Zie swingHingeInsetCm. */
  swingFreeInsetCm?: number
  /** Overige opening-keys (niet getypt). */
  extras?: FmlExtras
}

export interface Wall {
  id: string
  a: Point2D
  b: Point2D
  thickness: number
  balance?: number
  c?: Point2D | null
  openings: Opening[]
  /** Overige muur-keys (az/bz/decor/groupMarkerConfig/…). */
  extras?: FmlExtras
}

export interface DrawingMeta {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  url?: string
  alpha?: number
  visible?: boolean
  /** Overige drawing-keys (id/depth/…). */
  extras?: FmlExtras
}

/** Floorplanner design-item (keuken/sanitair/installaties). Alleen display bij import. */
export interface FloorItem {
  refid: string
  x: number
  y: number
  z?: number
  width: number
  height: number
  z_height?: number
  rotation?: number
  mirrored?: [number, number]
  guid?: string
  name?: string
  /** Overige item-keys (materials/rotation_x/light/…). */
  extras?: FmlExtras
}

/** Gesloten binnenruimte (Floorplanner `areas[]`). */
export interface FloorArea {
  id: string
  poly: Point2D[]
  role?: number
  name?: string
  customName?: string
  color: string
  showAreaLabel: boolean
  showSurfaceArea?: boolean
  name_x?: number
  name_y?: number
  /** Overige area-keys (ceiling/roomstyle_id/texture/…). */
  extras?: FmlExtras
}

/** Handmatige polygoon boven areas (Floorplanner `surfaces[]`). */
export interface FloorSurface {
  id: string
  poly: Array<Point2D & { z?: number }>
  role?: number
  name?: string
  customName?: string
  color: string
  showAreaLabel: boolean
  showSurfaceArea?: boolean
  name_x?: number
  name_y?: number
  isCutout?: boolean
  pattern?: number
  /** Overige surface-keys (isRoof/transparency/…). */
  extras?: FmlExtras
}

export type FloorLineType = 'solid_line' | 'dashed_line' | 'dotted_line' | 'dashdotted_line'

export const FLOOR_LINE_TYPES: readonly FloorLineType[] = [
  'solid_line',
  'dashed_line',
  'dotted_line',
  'dashdotted_line',
] as const

/** Tekstlabel op de plattegrond (Floorplanner `labels[]`). */
export interface FloorLabel {
  id: string
  x: number
  y: number
  text: string
  fontFamily: string
  fontSize: number
  letterSpacing: number
  fontColor: string
  backgroundColor: string
  backgroundAlpha?: number
  align: 'left' | 'center' | 'right'
  rotation: number
  outline?: boolean
  bold?: boolean
  italic?: boolean
  extras?: FmlExtras
}

/** Notatielijn (Floorplanner `lines[]`). color kan number (0) of hex zijn. */
export interface FloorLine {
  id: string
  a: Point2D
  b: Point2D
  type: FloorLineType
  color: number | string
  thickness: number
  extras?: FmlExtras
}

/** Maatlijn (Floorplanner `dimensions[]`) — alleen bewaren/tonen. */
export interface FloorDimension {
  id: string
  type: 'custom_dimension'
  a: Point2D
  b: Point2D
  extras?: FmlExtras
}

/** Design-meta die we roundtripten zonder te bewerken. */
export interface FloorDesignSource {
  id?: number | string
  settings?: FmlExtras
  cameras?: unknown[]
  annotations?: unknown[]
  leftover?: FmlExtras
}

/** Één Floorplanner-design op een verdieping. */
export interface FloorDesign {
  name: string
  walls: Wall[]
  items?: FloorItem[]
  areas?: FloorArea[]
  surfaces?: FloorSurface[]
  labels?: FloorLabel[]
  lines?: FloorLine[]
  dimensions?: FloorDimension[]
  source?: FloorDesignSource
}

/** Project-meta uit bron-FML. */
export interface FloorPlanSource {
  id?: number | string
  public?: boolean
  features?: unknown[]
  settings?: FmlExtras
  leftover?: FmlExtras
}

/** Floor-meta uit bron-FML. */
export interface FloorSource {
  id?: number | string
  project_id?: number | string
  created_at?: string
  updated_at?: string
  cameras?: unknown[]
  leftover?: FmlExtras
}

export interface Floor {
  name: string
  level: number
  height: number
  /** Actief design (plat voor editor/canvas). */
  walls: Wall[]
  items?: FloorItem[]
  areas?: FloorArea[]
  surfaces?: FloorSurface[]
  labels?: FloorLabel[]
  lines?: FloorLine[]
  dimensions?: FloorDimension[]
  drawing?: DrawingMeta
  /** Alle designs; actief is ook plat op walls/items/…. */
  designs?: FloorDesign[]
  activeDesignIndex?: number
  source?: FloorSource
}

export interface FloorPlan {
  name: string
  floors: Floor[]
  source?: FloorPlanSource
}

export interface FloorStats {
  wallCount: number
  doorCount: number
  windowCount: number
}

export interface ImportWarning {
  message: string
  floorName?: string
  wallId?: string
}

export interface ImportResult {
  plan: FloorPlan
  warnings: ImportWarning[]
}

export const WINDOW_REFIDS = new Set([
  'b88cd3f479455fbf57205a91c613c02b7e6dc2df',
  'bbf86e131112adca8869e9970229a71d7ff3fc28',
  'e3296a727699a3fc70e70dfec4ab715ed368ef63',
  '14980facdeef5985d186e6767ee5300a1845abbc',
  '65d378c39d0183c82927e4ed7f8be6b224cf1df8',
  '6da47b0a60330d19716d716046ec6c72c19d2cdb',
])

/** Standaard enkele deur (90° draaicirkel) — default bij deur-referenties. */
export const CONCEPT_DOOR_REFID = '0434246537840a3326e305dbe7b9c355743e6e93'
/** Kastdeur (45°) — handmatig kiesbaar per deur-referentie. */
export const CLOSET_DOOR_REFID = 'd34e31c31ba6e6bd4e0d67096ec1b31e9035c7d9'
/**
 * Dubbele deur (glas) — X-10 twin-merge en editor-preset `double`.
 * Niet in stap-2 ref-UI; algoritmisch of handmatig in FML-editor.
 */
export const DOUBLE_WIDE_DOOR_REFID = '5ae0ee3c682e32c8c7ac15a6136d692df5737b22'
/** Schuifpui met 2 schuivende delen. */
export const SLIDING_DOUBLE_DOOR_REFID = '1cdb4e6092e998630e7881667f2ddedafa3b0eb9'
/** Schuifpui met 1 schuivend deel. */
export const SLIDING_SINGLE_DOOR_REFID = 'd2785cc45c9c0ec86644135d22fa9ac9c49bcad6'
/** Pocketdeur (1 schuifpijl). */
export const POCKET_DOOR_REFID = '216'
/**
 * Dubbele deur (vol / dicht) — editor-preset `double_solid`.
 * Was eerder foutief als garagedeur gelabeld; garagedeur-REFID volgt later.
 */
export const DOUBLE_SOLID_DOOR_REFID = '9c1479d9dfc482859aea10b9dd67f5e7773fff6d'
/** @lintignore — gebruikt door buildFmlV3 (nog niet in UI) */
export const CONCEPT_WINDOW_REFID = 'b88cd3f479455fbf57205a91c613c02b7e6dc2df'
export const WINDOW_DOUBLE_REFID = 'bbf86e131112adca8869e9970229a71d7ff3fc28'
export const WINDOW_TRIPLE_REFID = 'e3296a727699a3fc70e70dfec4ab715ed368ef63'
export const WINDOW_ROUND_REFID = '6da47b0a60330d19716d716046ec6c72c19d2cdb'
export const WINDOW_HALF_ROUND_REFID = '65d378c39d0183c82927e4ed7f8be6b224cf1df8'

/** Keuzes in stap-1 deur-referentie Template ID dropdown. */
export const DOOR_FML_TEMPLATE_OPTIONS = [
  { refid: CONCEPT_DOOR_REFID, label: 'Standaard deur' },
  { refid: CLOSET_DOOR_REFID, label: 'Kastdeur' },
] as const

export type DoorFmlTemplateRefId = (typeof DOOR_FML_TEMPLATE_OPTIONS)[number]['refid']

export function resolveDoorFmlTemplateRefId(
  refid: string | undefined | null,
): DoorFmlTemplateRefId {
  if (refid === CLOSET_DOOR_REFID) return CLOSET_DOOR_REFID
  return CONCEPT_DOOR_REFID
}
