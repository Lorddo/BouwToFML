import { foldBovenlichtOnWall } from './bovenlicht'
import { wallLengthCm } from './fml-wall-geom'
import type {
  DrawingMeta,
  Floor,
  FloorArea,
  FloorDesign,
  FloorDesignSource,
  FloorDimension,
  FloorItem,
  FloorLabel,
  FloorLine,
  FloorLineType,
  FloorPlan,
  FloorPlanSource,
  FloorSource,
  FloorSurface,
  FmlExtras,
  ImportResult,
  ImportWarning,
  Opening,
  OpeningType,
  Point2D,
  Wall,
} from './types'
import { WINDOW_REFIDS } from './types'
import { UNLABELED_AREA_COLOR, isValidRoomTagHex, resolveRoomType } from './roomtype-catalog'

interface RawPoint {
  x?: number
  y?: number
  z?: number
  [key: string]: unknown
}

interface RawOpening {
  refid?: string
  t?: number
  width?: number
  type?: string
  mirrored?: [number, number]
  z?: number
  z_height?: number
  guid?: string
  materials?: Record<string, { type: string; value: string }>
  [key: string]: unknown
}

interface RawWall {
  guid?: string
  a?: RawPoint
  b?: RawPoint
  c?: RawPoint | null
  thickness?: number
  balance?: number
  openings?: RawOpening[]
  [key: string]: unknown
}

interface RawDrawing {
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  url?: string
  alpha?: number
  visible?: boolean
  [key: string]: unknown
}

interface RawItem {
  refid?: string
  x?: number
  y?: number
  z?: number
  width?: number
  height?: number
  z_height?: number
  rotation?: number
  mirrored?: [number, number]
  guid?: string
  name?: string
  [key: string]: unknown
}

interface RawArea {
  guid?: string
  id?: string | number
  poly?: RawPoint[]
  role?: number
  name?: string
  customName?: string
  color?: string
  showAreaLabel?: boolean
  showSurfaceArea?: boolean
  name_x?: number
  name_y?: number
  isCutout?: boolean
  pattern?: number
  [key: string]: unknown
}

interface RawLabel {
  x?: number
  y?: number
  text?: string
  fontFamily?: string
  fontSize?: number
  letterSpacing?: number
  fontColor?: string
  backgroundColor?: string
  backgroundAlpha?: number
  align?: string
  rotation?: number
  outline?: boolean
  bold?: boolean
  italic?: boolean
  guid?: string
  [key: string]: unknown
}

interface RawLine {
  a?: RawPoint
  b?: RawPoint
  type?: string
  color?: number | string
  thickness?: number
  guid?: string
  [key: string]: unknown
}

interface RawDimension {
  type?: string
  a?: RawPoint
  b?: RawPoint
  guid?: string
  [key: string]: unknown
}

interface RawDesign {
  name?: string
  walls?: RawWall[]
  items?: RawItem[]
  areas?: RawArea[]
  surfaces?: RawArea[]
  labels?: RawLabel[]
  lines?: RawLine[]
  dimensions?: RawDimension[]
  id?: number | string
  settings?: Record<string, unknown>
  cameras?: unknown[]
  annotations?: unknown[]
  [key: string]: unknown
}

interface RawFloor {
  name?: string
  level?: number
  height?: number
  drawing?: RawDrawing
  designs?: RawDesign[]
  id?: number | string
  project_id?: number | string
  created_at?: string
  updated_at?: string
  cameras?: unknown[]
  [key: string]: unknown
}

interface RawFmlV3 {
  name?: string
  id?: number | string
  public?: boolean
  features?: unknown[]
  settings?: Record<string, unknown>
  floors?: RawFloor[]
  [key: string]: unknown
}

const OPENING_KNOWN = new Set([
  'refid',
  't',
  'width',
  'type',
  'mirrored',
  'z',
  'z_height',
  'guid',
  'materials',
])

const WALL_KNOWN = new Set(['guid', 'a', 'b', 'c', 'thickness', 'balance', 'openings'])

const ITEM_KNOWN = new Set([
  'refid',
  'x',
  'y',
  'z',
  'width',
  'height',
  'z_height',
  'rotation',
  'mirrored',
  'guid',
  'name',
])

const AREA_KNOWN = new Set([
  'guid',
  'id',
  'poly',
  'role',
  'name',
  'customName',
  'color',
  'showAreaLabel',
  'showSurfaceArea',
  'name_x',
  'name_y',
  'isCutout',
  'pattern',
])

const LABEL_KNOWN = new Set([
  'x',
  'y',
  'text',
  'fontFamily',
  'fontSize',
  'letterSpacing',
  'fontColor',
  'backgroundColor',
  'backgroundAlpha',
  'align',
  'rotation',
  'outline',
  'bold',
  'italic',
  'guid',
])

const LINE_KNOWN = new Set(['a', 'b', 'type', 'color', 'thickness', 'guid'])

const DIMENSION_KNOWN = new Set(['type', 'a', 'b', 'guid'])

const DRAWING_KNOWN = new Set(['x', 'y', 'width', 'height', 'rotation', 'url', 'alpha', 'visible'])

const DESIGN_KNOWN = new Set([
  'name',
  'walls',
  'items',
  'areas',
  'surfaces',
  'labels',
  'lines',
  'dimensions',
  'id',
  'settings',
  'cameras',
  'annotations',
])

const FLOOR_KNOWN = new Set([
  'name',
  'level',
  'height',
  'drawing',
  'designs',
  'id',
  'project_id',
  'created_at',
  'updated_at',
  'cameras',
])

const PROJECT_KNOWN = new Set(['name', 'id', 'public', 'features', 'settings', 'floors'])

function pickExtras(raw: Record<string, unknown>, known: Set<string>): FmlExtras | undefined {
  const extras: FmlExtras = {}
  let has = false
  for (const [key, value] of Object.entries(raw)) {
    if (known.has(key)) continue
    extras[key] = value
    has = true
  }
  return has ? extras : undefined
}

function point(p: RawPoint | undefined): Point2D {
  return { x: p?.x ?? 0, y: p?.y ?? 0 }
}

function shortGuid(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
}

function resolveOpeningType(raw: RawOpening): OpeningType {
  if (raw.type === 'window') return 'window'
  if (raw.type === 'door') return 'door'
  if (raw.refid && WINDOW_REFIDS.has(raw.refid)) return 'window'
  return 'door'
}

function parseOpening(raw: RawOpening): Opening {
  return {
    refid: raw.refid ?? '',
    t: raw.t ?? 0,
    width: raw.width ?? 0,
    type: resolveOpeningType(raw),
    mirrored: raw.mirrored,
    z: raw.z,
    z_height: raw.z_height,
    guid: raw.guid,
    materials: raw.materials,
    extras: pickExtras(raw, OPENING_KNOWN),
  }
}

function parseWall(raw: RawWall, warnings: ImportWarning[], floorName: string): Wall {
  if (raw.c != null && raw.c.x != null && raw.c.y != null) {
    warnings.push({
      message: 'Gebogen muur (c-punt) — V1 ondersteunt alleen rechte centerlines',
      floorName,
      wallId: raw.guid,
    })
  }

  const a = point(raw.a)
  const b = point(raw.b)
  const openings = foldBovenlichtOnWall(
    (raw.openings ?? []).map(parseOpening),
    wallLengthCm({ a, b }),
  )
  return {
    id: raw.guid ?? `${raw.a?.x ?? 0},${raw.a?.y ?? 0}-${raw.b?.x ?? 0},${raw.b?.y ?? 0}`,
    a,
    b,
    // ESC:X-25 (F)
    thickness: raw.thickness ?? 10,
    balance: raw.balance,
    c: raw.c ? point(raw.c) : null,
    openings,
    extras: pickExtras(raw, WALL_KNOWN),
  }
}

function parseItem(raw: RawItem): FloorItem {
  return {
    refid: raw.refid ?? '',
    x: raw.x ?? 0,
    y: raw.y ?? 0,
    z: raw.z,
    width: raw.width ?? 0,
    height: raw.height ?? 0,
    z_height: raw.z_height,
    rotation: raw.rotation,
    mirrored: raw.mirrored,
    guid: raw.guid,
    name: raw.name,
    extras: pickExtras(raw, ITEM_KNOWN),
  }
}

function parsePoly(raw: RawPoint[] | undefined): Point2D[] {
  return (raw ?? []).map((p) => point(p))
}

function parseAreaColor(raw: RawArea): string {
  if (isValidRoomTagHex(raw.color)) return raw.color!.trim().toUpperCase()
  if (raw.role != null) {
    const rt = resolveRoomType(raw.role)
    if (rt) return rt.color
  }
  return UNLABELED_AREA_COLOR
}

function parseArea(raw: RawArea, index: number): FloorArea | null {
  const poly = parsePoly(raw.poly)
  if (poly.length < 3) return null
  const id =
    (typeof raw.guid === 'string' && raw.guid.trim()) ||
    (raw.id != null ? String(raw.id) : '') ||
    `area-${index}-${shortGuid()}`
  return {
    id,
    poly,
    role: typeof raw.role === 'number' && Number.isFinite(raw.role) ? raw.role : undefined,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    customName: typeof raw.customName === 'string' ? raw.customName : undefined,
    color: parseAreaColor(raw),
    showAreaLabel: raw.showAreaLabel !== false,
    showSurfaceArea: raw.showSurfaceArea === true ? true : undefined,
    name_x: typeof raw.name_x === 'number' ? raw.name_x : undefined,
    name_y: typeof raw.name_y === 'number' ? raw.name_y : undefined,
    extras: pickExtras(raw, AREA_KNOWN),
  }
}

function parseSurface(raw: RawArea, index: number): FloorSurface | null {
  const poly = (raw.poly ?? []).map((p) => ({
    x: p.x ?? 0,
    y: p.y ?? 0,
    z: typeof p.z === 'number' ? p.z : 0,
  }))
  if (poly.length < 3) return null
  const id =
    (typeof raw.guid === 'string' && raw.guid.trim()) ||
    (raw.id != null ? String(raw.id) : '') ||
    `surface-${index}-${shortGuid()}`
  return {
    id,
    poly,
    role: typeof raw.role === 'number' && Number.isFinite(raw.role) ? raw.role : undefined,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    customName: typeof raw.customName === 'string' ? raw.customName : undefined,
    color: parseAreaColor(raw),
    showAreaLabel: raw.showAreaLabel !== false,
    showSurfaceArea: raw.showSurfaceArea === true ? true : undefined,
    name_x: typeof raw.name_x === 'number' ? raw.name_x : undefined,
    name_y: typeof raw.name_y === 'number' ? raw.name_y : undefined,
    isCutout: raw.isCutout === true ? true : undefined,
    pattern: typeof raw.pattern === 'number' ? raw.pattern : undefined,
    extras: pickExtras(raw, AREA_KNOWN),
  }
}

function parseLabelAlign(raw: string | undefined): FloorLabel['align'] {
  if (raw === 'center' || raw === 'right' || raw === 'left') return raw
  return 'left'
}

function parseLabel(raw: RawLabel, index: number): FloorLabel {
  const id = (typeof raw.guid === 'string' && raw.guid.trim()) || `label-${index}-${shortGuid()}`
  return {
    id,
    x: raw.x ?? 0,
    y: raw.y ?? 0,
    text: typeof raw.text === 'string' ? raw.text : '',
    fontFamily: typeof raw.fontFamily === 'string' ? raw.fontFamily : 'arial',
    fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : 16,
    letterSpacing: typeof raw.letterSpacing === 'number' ? raw.letterSpacing : 0,
    fontColor: typeof raw.fontColor === 'string' ? raw.fontColor : '#000000',
    backgroundColor: typeof raw.backgroundColor === 'string' ? raw.backgroundColor : '#f4f8f4',
    backgroundAlpha: typeof raw.backgroundAlpha === 'number' ? raw.backgroundAlpha : undefined,
    align: parseLabelAlign(raw.align),
    rotation: typeof raw.rotation === 'number' ? raw.rotation : 0,
    outline: raw.outline === true ? true : undefined,
    bold: raw.bold === true ? true : undefined,
    italic: raw.italic === true ? true : undefined,
    extras: pickExtras(raw, LABEL_KNOWN),
  }
}

function parseLineType(raw: string | undefined): FloorLineType {
  if (
    raw === 'dashed_line' ||
    raw === 'dotted_line' ||
    raw === 'dashdotted_line' ||
    raw === 'solid_line'
  ) {
    return raw
  }
  return 'solid_line'
}

function parseLine(raw: RawLine, index: number): FloorLine {
  const id = (typeof raw.guid === 'string' && raw.guid.trim()) || `line-${index}-${shortGuid()}`
  return {
    id,
    a: point(raw.a),
    b: point(raw.b),
    type: parseLineType(raw.type),
    color: raw.color ?? 0,
    thickness: typeof raw.thickness === 'number' ? raw.thickness : 2,
    extras: pickExtras(raw, LINE_KNOWN),
  }
}

function parseDimension(raw: RawDimension, index: number): FloorDimension {
  const id = (typeof raw.guid === 'string' && raw.guid.trim()) || `dim-${index}-${shortGuid()}`
  return {
    id,
    type: 'custom_dimension',
    a: point(raw.a),
    b: point(raw.b),
    extras: pickExtras(raw, DIMENSION_KNOWN),
  }
}

function parseDrawing(raw: RawDrawing | undefined): DrawingMeta | undefined {
  if (!raw) return undefined
  return {
    x: raw.x ?? 0,
    y: raw.y ?? 0,
    width: raw.width ?? 0,
    height: raw.height ?? 0,
    rotation: raw.rotation ?? 0,
    url: raw.url,
    alpha: raw.alpha,
    visible: raw.visible,
    extras: pickExtras(raw, DRAWING_KNOWN),
  }
}

function parseDesignSource(raw: RawDesign): FloorDesignSource | undefined {
  const leftover = pickExtras(raw, DESIGN_KNOWN)
  const source: FloorDesignSource = {}
  let has = false
  if (raw.id != null) {
    source.id = raw.id
    has = true
  }
  if (raw.settings && typeof raw.settings === 'object') {
    source.settings = raw.settings
    has = true
  }
  if (Array.isArray(raw.cameras)) {
    source.cameras = raw.cameras
    has = true
  }
  if (Array.isArray(raw.annotations)) {
    source.annotations = raw.annotations
    has = true
  }
  if (leftover) {
    source.leftover = leftover
    has = true
  }
  return has ? source : undefined
}

function parseDesign(
  raw: RawDesign,
  warnings: ImportWarning[],
  floorName: string,
  designIndex: number,
): FloorDesign {
  const walls = (raw.walls ?? []).map((w) => parseWall(w, warnings, floorName))
  const items = (raw.items ?? []).map(parseItem)
  const areas = (raw.areas ?? [])
    .map((a, i) => parseArea(a, i))
    .filter((a): a is FloorArea => a != null)
  const surfaces = (raw.surfaces ?? [])
    .map((s, i) => parseSurface(s, i))
    .filter((s): s is FloorSurface => s != null)
  const labels = (raw.labels ?? []).map((l, i) => parseLabel(l, i))
  const lines = (raw.lines ?? []).map((l, i) => parseLine(l, i))
  const dimensions = (raw.dimensions ?? []).map((d, i) => parseDimension(d, i))

  return {
    name: raw.name ?? (designIndex === 0 ? floorName : `Design ${designIndex + 1}`),
    walls,
    items: items.length > 0 ? items : undefined,
    areas: areas.length > 0 ? areas : undefined,
    surfaces: surfaces.length > 0 ? surfaces : undefined,
    labels: labels.length > 0 ? labels : undefined,
    lines: lines.length > 0 ? lines : undefined,
    dimensions: dimensions.length > 0 ? dimensions : undefined,
    source: parseDesignSource(raw),
  }
}

function parseFloorSource(raw: RawFloor): FloorSource | undefined {
  const leftover = pickExtras(raw, FLOOR_KNOWN)
  const source: FloorSource = {}
  let has = false
  if (raw.id != null) {
    source.id = raw.id
    has = true
  }
  if (raw.project_id != null) {
    source.project_id = raw.project_id
    has = true
  }
  if (typeof raw.created_at === 'string') {
    source.created_at = raw.created_at
    has = true
  }
  if (typeof raw.updated_at === 'string') {
    source.updated_at = raw.updated_at
    has = true
  }
  if (Array.isArray(raw.cameras)) {
    source.cameras = raw.cameras
    has = true
  }
  if (leftover) {
    source.leftover = leftover
    has = true
  }
  return has ? source : undefined
}

function parseFloor(raw: RawFloor, warnings: ImportWarning[]): Floor {
  const floorName = raw.name ?? 'Onbekend'
  const rawDesigns = raw.designs ?? []
  const designs =
    rawDesigns.length > 0
      ? rawDesigns.map((d, i) => parseDesign(d, warnings, floorName, i))
      : [
          {
            name: floorName,
            walls: [],
          },
        ]
  const active = designs[0]

  return {
    name: floorName,
    level: raw.level ?? 0,
    height: raw.height ?? 280,
    walls: active.walls,
    items: active.items,
    areas: active.areas,
    surfaces: active.surfaces,
    labels: active.labels,
    lines: active.lines,
    dimensions: active.dimensions,
    drawing: parseDrawing(raw.drawing),
    designs,
    activeDesignIndex: 0,
    source: parseFloorSource(raw),
  }
}

function parsePlanSource(raw: RawFmlV3): FloorPlanSource | undefined {
  const leftover = pickExtras(raw, PROJECT_KNOWN)
  const source: FloorPlanSource = {}
  let has = false
  if (raw.id != null) {
    source.id = raw.id
    has = true
  }
  if (typeof raw.public === 'boolean') {
    source.public = raw.public
    has = true
  }
  if (Array.isArray(raw.features)) {
    source.features = raw.features
    has = true
  }
  if (raw.settings && typeof raw.settings === 'object') {
    source.settings = raw.settings
    has = true
  }
  if (leftover) {
    source.leftover = leftover
    has = true
  }
  return has ? source : undefined
}

export function importFmlV3(json: string | object): ImportResult {
  const warnings: ImportWarning[] = []
  const raw: RawFmlV3 = typeof json === 'string' ? JSON.parse(json) : json

  const plan: FloorPlan = {
    name: raw.name ?? 'Onbekend',
    floors: (raw.floors ?? []).map((f) => parseFloor(f, warnings)),
    source: parsePlanSource(raw),
  }

  return { plan, warnings }
}
