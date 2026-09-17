/**
 * Getypte `.plg`-extensies (Fase A).
 * Schemakeys zijn schoon (`frame`, `slices`, `role`).
 * Defaults = huidige impliciete FML-/accessor-gedrag (code wint op het plan).
 */
import type { DrawingMeta, Point2D } from '../plan/types'

export type { DrawingMeta, Point2D }

/** Muur-eind elevatie (`extras.az` / `extras.bz`). `h` = absolute top-Z. */
export interface WallElevation {
  z: number
  h: number
}

/**
 * Default wanneer az/bz ontbreekt bij FML-export (`buildFmlV3` serializeWall).
 * Let op: `parseEndpoint3D` gebruikt bij ontbrekende `h` juist `z + floorHeight`.
 */
export function defaultWallElevation(floorHeightCm: number): WallElevation {
  return { z: 0, h: floorHeightCm }
}

/** Beide muur-einden (`wall.elevation`; was extras.az + extras.bz). */
export interface WallEndpointElevations {
  a: WallElevation
  b: WallElevation
}

/**
 * Display-kozijn per opening (`opening.frame`) of dakraam (`item.frame`).
 * Alle vier verplicht — zelfde contract als `OpeningFrameCm`.
 */
export interface OpeningFrame {
  leftCm: number
  rightCm: number
  topCm: number
  bottomCm: number
}

/** Gevelgroep (nu `settings.facadeGroups`). */
export interface FacadeGroup {
  id: string
  code: string
  name: string
  wallIds: string[]
  /** Floorplanner `groupMarkerConfig.groupId` (stamp: stampGroupId). */
  nativeId?: number
  /** Floorplanner `groupMarker` timestamp. */
  groupMarker?: number
}

/** Vaste editor-slots; `name` in `.plg` is Engels, UI vertaalt op id. */
export const DEFAULT_FACADE_GROUP_IDS = ['front', 'back', 'left', 'right'] as const

export type DefaultFacadeGroupId = (typeof DEFAULT_FACADE_GROUP_IDS)[number]

/** Canonical English names stored in `.plg`. */
export const DEFAULT_FACADE_GROUP_NAMES: Record<DefaultFacadeGroupId, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
}

export function isDefaultFacadeGroupId(id: string): id is DefaultFacadeGroupId {
  return (DEFAULT_FACADE_GROUP_IDS as readonly string[]).includes(id)
}

/** Zaaivoorraad in user-settings (id + naam, geen leden). */
export type FacadeGroupPreset = Pick<FacadeGroup, 'id' | 'name'>

export const MAX_FACADE_GROUP_PRESETS = 12

export function createDefaultFacadeGroups(): FacadeGroup[] {
  return DEFAULT_FACADE_GROUP_IDS.map((id) => ({
    id,
    code: id,
    name: DEFAULT_FACADE_GROUP_NAMES[id],
    wallIds: [],
  }))
}

export function createDefaultFacadeGroupPresets(): FacadeGroupPreset[] {
  return DEFAULT_FACADE_GROUP_IDS.map((id) => ({
    id,
    name: DEFAULT_FACADE_GROUP_NAMES[id],
  }))
}

/** Nok-id-lijst + weergavedikte (nu `settings.ridgeWalls`). */
export interface RidgeModel {
  wallIds: string[]
  displayWidthCm: number
}

export const DEFAULT_RIDGE_DISPLAY_WIDTH_CM = 10

/** Dakvlak-id-lijst (nu `settings.roofPlanes`). */
export interface RoofPlaneModel {
  surfaceIds: string[]
}

/** Eén vloerplaat in de gevel-stack (nu `settings.floorStack.floors[]`). */
export interface FloorStackEntry {
  level: number
  thicknessCm: number
  /** Default onderkant-Z voor nieuwe nokken op deze floor; ontbreekt → floor.height. */
  ridgeZCm?: number
}

/** Project-brede vloerplaat + nok (nu `settings.floorStack`). */
export interface FloorStack {
  nokThicknessCm: number
  floors: FloorStackEntry[]
}

export const DEFAULT_NOK_THICKNESS_CM = 30
export const DEFAULT_FLOOR_THICKNESS_CM = 20

/**
 * Dak-bundle op `plan.roof` (nu settings ridgeWalls + roofPlanes + floorStack).
 * FML-adapter projecteert terug naar die settings-keys.
 */
export interface PlanRoof {
  ridge: RidgeModel
  planes: RoofPlaneModel
  stack: FloorStack
  /**
   * Optionele clear-height override per floor-index (polylijn/ring).
   * Leeg in de 1,50-lijn-bouw; later lijn-editor. FML-export lossy/weglaten.
   */
  clearHeightOverride?: Record<string, Array<Array<{ x: number; y: number }>>>
}

/** Per-gevelgroep aanzicht-onderlegger (nu `settings.elevationViews[]`). */
export interface ElevationView {
  facadeGroupId: string
  drawing?: DrawingMeta
}

/** Vaste H/V-zijde of mee met de gevel (nu `settings.elevationProjection`). */
export type ElevationProjection = 'architect' | 'projective'

export const DEFAULT_ELEVATION_PROJECTION: ElevationProjection = 'architect'

/** Aanzichten-bundle op `plan.elevations` (nu settings elevationViews + elevationProjection). */
export interface PlanElevations {
  projection: ElevationProjection
  views: ElevationView[]
}

/** Maatlijn-slicer op een design (`design.slices`). */
export interface PlanSlice {
  m: Point2D
  p: Point2D
}

/** Herkomst van een dakvlak-surface (`surface.origin`). */
export type SurfaceOrigin = 'generated' | 'manual'

/** Dakvlak-soort: hoofddak of dakkapel (kind van een ouder-vlak). */
export type RoofKind = 'plane' | 'dormer'

/** Muurrol (nok: `extras.ridge === true` → typed `wall.role`). Dakkapel-U: alleen `.plg`. */
export type WallRole = 'ridge' | 'dormer'

/** Design-rol (`design.role`). */
export type DesignRole = 'ridge'
