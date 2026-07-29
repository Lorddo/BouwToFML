export interface Point2D {
  x: number
  y: number
}

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
   * @deprecated FML-viewer leest boog-inset uit opening-refid-catalog (`swingInsetCm`).
   * Velden blijven optioneel voor oude in-memory plans; worden genegeerd bij render.
   */
  swingHingeInsetCm?: number
  /** @deprecated Zie swingHingeInsetCm. */
  swingFreeInsetCm?: number
}

export interface Wall {
  id: string
  a: Point2D
  b: Point2D
  thickness: number
  balance?: number
  c?: Point2D | null
  openings: Opening[]
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
}

export interface Floor {
  name: string
  level: number
  height: number
  walls: Wall[]
  items?: FloorItem[]
  drawing?: DrawingMeta
}

export interface FloorPlan {
  name: string
  floors: Floor[]
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
 * Dubbele openslaande deur — niet handmatig in de ref-UI;
 * algoritmisch gekozen t.o.v. standaard-deur referenties.
 */
export const DOUBLE_WIDE_DOOR_REFID = '5ae0ee3c682e32c8c7ac15a6136d692df5737b22'
/** Schuifpui met 2 schuivende delen. */
export const SLIDING_DOUBLE_DOOR_REFID = '1cdb4e6092e998630e7881667f2ddedafa3b0eb9'
/** Schuifpui met 1 schuivend deel. */
export const SLIDING_SINGLE_DOOR_REFID = 'd2785cc45c9c0ec86644135d22fa9ac9c49bcad6'
/** Pocketdeur (1 schuifpijl). */
export const POCKET_DOOR_REFID = '216'
/**
 * Garagedeur — kandidaat uit Benedendorpsweg (188 cm bij Garage-ruimtes).
 * Visuele FP-check via editor-plaatsen + FML-export nog open.
 */
export const GARAGE_DOOR_REFID = '9c1479d9dfc482859aea10b9dd67f5e7773fff6d'
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
