export interface Point2D {
  x: number
  y: number
}

/** Onbekende Floorplanner-keys die we roundtripten zonder te typen. */
export type PlanExtras = Record<string, unknown>

export type OpeningType = 'door' | 'window'

export type { OpeningKind } from './opening-kind-catalog'
export type { FixtureAssetKind } from './fixture-kind-catalog'

export interface Opening {
  /** Stabiele exemplaar-ID (UUID). FML-export schrijft dit als `guid`. */
  id: string
  /** Domein-soort (`door.single`, `window.triple`, …). Geen Floorplanner-hash. */
  kind: import('./opening-kind-catalog').OpeningKind
  t: number
  width: number
  type: OpeningType
  mirrored?: [number, number]
  z?: number
  z_height?: number
  materials?: Record<string, { type: string; value: string }>
  /** Floorplanner-objectlabel; geen eigen UI, wel roundtrip. */
  name?: string
  showLabel?: boolean
  name_x?: number
  name_y?: number
  /**
   * Bovenlicht-override (`.plg`). `null`/`undefined` = erf vloerdefault (deur/raam apart).
   * FML-export synthetiseert een sibling-raam en wist de flags op de ouder.
   */
  bovenlicht?: boolean | null
  /**
   * Glashoogte van het bovenlicht (cm). `null`/`undefined` = erf vloerdefault.
   */
  bovenlichtHeightCm?: number | null
  /**
   * Dorpel-gap boven de opening (cm). `null`/`undefined` = erf vloerdefault.
   */
  bovenlichtGapCm?: number | null
  /**
   * @deprecated FML-viewer leest boog-inset uit opening-kind-catalog (`swingInsetCm`).
   * Velden blijven optioneel voor oude in-memory plans; worden genegeerd bij render.
   */
  swingHingeInsetCm?: number
  /** @deprecated Zie swingHingeInsetCm. */
  swingFreeInsetCm?: number
  /**
   * Display-kozijn in het FML-gat (`opening.frame`).
   * Alle vier verplicht wanneer gezet.
   */
  frame?: { leftCm: number; rightCm: number; topCm: number; bottomCm: number }
  /** Overige opening-keys. Geen `fmlRefid` — unmapped FML krijgt catalogus-default + ImportWarning. */
  extras?: PlanExtras
}

export interface Wall {
  id: string
  a: Point2D
  b: Point2D
  thickness: number
  balance?: number
  c?: Point2D | null
  openings: Opening[]
  /**
   * Endpoint elevations (was `extras.az` / `extras.bz`).
   * FML roundtrip via `plg/fml-adapter/wall-elevation`.
   */
  elevation?: {
    a: { z: number; h: number }
    b: { z: number; h: number }
  }
  /** Nok (`ridge`) of dakkapel-U (`dormer`, alleen `.plg`). FML schrijft `extras.ridge` alleen bij ridge. */
  role?: import('../plg/extension-types').WallRole
  /**
   * Session-only stempel-eigendom (was `extras.stampOwned`).
   * Niet serialiseren naar FML/`.plg`.
   */
  stampOwned?: boolean
  /** Overige muur-keys (decor/groupMarkerConfig/…). */
  extras?: PlanExtras
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
  /**
   * Display-only: Konva scaleX −1 om bitmap-midden.
   * Niet naar FML (Floorplanner kent geen flip); `.plg` en de editor wel.
   */
  flipX?: boolean
  /** Overige drawing-keys (id/depth/…). */
  extras?: PlanExtras
}

/** Design-item (keuken/sanitair/installaties). */
export interface FloorItem {
  /** Stabiele exemplaar-ID (UUID). FML-export schrijft dit als `guid`. */
  id: string
  /** Domein-soort (`toilet`, `countertop`, …). Geen Floorplanner-hash. */
  kind: import('./fixture-kind-catalog').FixtureAssetKind
  x: number
  y: number
  z?: number
  width: number
  height: number
  z_height?: number
  rotation?: number
  mirrored?: [number, number]
  /**
   * Gekoppeld dakvlak (GUID van `FloorSurface` in het Dak-design).
   * Gezet bij plaatsen/slepen op een dakvlak, of via «Muren aan dak».
   */
  roofSurfaceId?: string
  /**
   * Helling van het dakraam in graden (0 = plat). Alleen `skylight`.
   * Bij dakvlak-snap uit het schild; FML heeft geen veld (lossy).
   */
  pitchDeg?: number
  name?: string
  showLabel?: boolean
  name_x?: number
  name_y?: number
  /**
   * Display-kozijn in het dakraam-gat (`item.frame`). Alleen `skylight`.
   * Alle vier verplicht wanneer gezet. FML kent geen kozijn.
   */
  frame?: { leftCm: number; rightCm: number; topCm: number; bottomCm: number }
  /** Overige item-keys. Geen `fmlRefid` — unmapped FML krijgt catalogus-default + ImportWarning. */
  extras?: PlanExtras
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
  /**
   * Dakbekleding-offset t.o.v. de onderkant van het schild (cm).
   * Positief = dikkere bekleding (1,50 m-lijn naar de nok); negatief = ruimer
   * (clamp ≥ −dakdikte, tot in de dakplaat).
   */
  liningCm?: number
  /** Overige area-keys (ceiling/roomstyle_id/texture/…). */
  extras?: PlanExtras
}

/** Handmatige polygoon boven areas (Floorplanner `surfaces[]`). */
export interface FloorSurface {
  id: string
  /** Voor dakvlakken is `z` de onderkant van de dakplaat (plafond), t.o.v. vloer-Z 0. */
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
  isRoof?: boolean
  pattern?: number
  /** Dakvlak-herkomst (`.plg`); FML-adapter schrijft `extras.plgOrigin`. */
  origin?: import('../plg/extension-types').SurfaceOrigin
  /** Hoofddak of dakkapel (`.plg`); default `'plane'`. */
  roofKind?: import('../plg/extension-types').RoofKind
  /** Ouder-dakvlak GUID — alleen bij `roofKind: 'dormer'`. */
  roofParentId?: string
  /** Overige surface-keys (transparency/…). */
  extras?: PlanExtras
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
  extras?: PlanExtras
}

/** Notatielijn (Floorplanner `lines[]`). color kan number (0) of hex zijn. */
export interface FloorLine {
  id: string
  a: Point2D
  b: Point2D
  type: FloorLineType
  color: number | string
  thickness: number
  extras?: PlanExtras
}

/** Maatlijn (Floorplanner `dimensions[]`) — alleen bewaren/tonen. */
export interface FloorDimension {
  id: string
  type: 'custom_dimension'
  a: Point2D
  b: Point2D
  extras?: PlanExtras
}

/** Design-meta die we roundtripten zonder te bewerken. */
export interface FloorDesignSource {
  id?: number | string
  settings?: PlanExtras
  cameras?: unknown[]
  annotations?: unknown[]
  leftover?: PlanExtras
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
  /** Maatlijn-slicers (`design.slices`). */
  slices?: Array<{ m: Point2D; p: Point2D }>
  /** Autogen-maatlijnen (was `settings.engineAutoDims`). */
  autoDimensions?: boolean
  /** Dak-design (`.plg`); FML-adapter schrijft `settings.plgRole`. */
  role?: import('../plg/extension-types').DesignRole
  source?: FloorDesignSource
}

/** Project-meta uit bron-FML. */
export interface FloorPlanSource {
  id?: number | string
  public?: boolean
  features?: unknown[]
  settings?: PlanExtras
  leftover?: PlanExtras
}

/** Floor-meta uit bron-FML. */
export interface FloorSource {
  id?: number | string
  project_id?: number | string
  created_at?: string
  updated_at?: string
  cameras?: unknown[]
  leftover?: PlanExtras
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
  /**
   * Defaults voor nieuwe deuren/ramen/kozijnen op deze verdieping.
   * Verdiepingshoogte = `height`. FML schrijft dit veld niet.
   */
  defaults?: import('./floor-defaults').FloorDefaults
}

/** Eigen plan-settings (niet Floorplanner-passthrough). */
export interface FloorPlanSettings {
  /** Packed bovenlicht (default true). Was `source.settings.bovenlichtPacked`. */
  bovenlichtPacked?: boolean
  /**
   * @deprecated Legacy project-kozijnmaten; `readPlg` promoveert naar `floor.defaults`.
   */
  openingFrameDefaults?: {
    door: { leftCm: number; rightCm: number; topCm: number; bottomCm: number }
    window: { leftCm: number; rightCm: number; topCm: number; bottomCm: number }
  }
}

export interface FloorPlan {
  name: string
  floors: Floor[]
  source?: FloorPlanSource
  /** Eigen settings (`.plg`); FML-adapter spiegelt bekende keys naar `source.settings`. */
  settings?: FloorPlanSettings
  /**
   * Gevelgroepen (`.plg` / in-sessie). FML-adapter projecteert naar
   * `settings.facadeGroups`; niet dual-schrijven naar settings.
   */
  facadeGroups?: import('../plg/extension-types').FacadeGroup[]
  /**
   * Nok + dakvlakken + vloerstack (`.plg` / in-sessie).
   * FML-adapter projecteert naar ridgeWalls / roofPlanes / floorStack;
   * floorStack blijft FML-export-gestript.
   */
  roof?: import('../plg/extension-types').PlanRoof
  /**
   * Aanzicht-onderleggers + projectie (`.plg` / in-sessie).
   * FML-adapter zet tijdelijk elevationViews/Projection; export stript ze.
   */
  elevations?: import('../plg/extension-types').PlanElevations
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

/** Keuzes in stap-1 deur-referentie Template ID dropdown (domein-kinds). */
export const DOOR_TEMPLATE_KIND_OPTIONS = [
  { kind: 'door.single' as const, label: 'Standaard deur' },
  { kind: 'door.closet' as const, label: 'Kastdeur' },
] as const

export type DoorTemplateKind = (typeof DOOR_TEMPLATE_KIND_OPTIONS)[number]['kind']

export function resolveDoorTemplateKind(
  kind: string | undefined | null,
): DoorTemplateKind {
  if (kind === 'door.closet') return 'door.closet'
  return 'door.single'
}
