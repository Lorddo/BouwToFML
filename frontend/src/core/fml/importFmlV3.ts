import type {
  DrawingMeta,
  Floor,
  FloorItem,
  FloorPlan,
  ImportResult,
  ImportWarning,
  Opening,
  OpeningType,
  Point2D,
  Wall,
} from './types'
import { WINDOW_REFIDS } from './types'

interface RawPoint {
  x?: number
  y?: number
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
}

interface RawWall {
  guid?: string
  a?: RawPoint
  b?: RawPoint
  c?: RawPoint | null
  thickness?: number
  balance?: number
  openings?: RawOpening[]
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
}

interface RawDesign {
  name?: string
  walls?: RawWall[]
  items?: RawItem[]
}

interface RawFloor {
  name?: string
  level?: number
  height?: number
  drawing?: RawDrawing
  designs?: RawDesign[]
}

interface RawFmlV3 {
  name?: string
  floors?: RawFloor[]
}

function point(p: RawPoint | undefined): Point2D {
  return { x: p?.x ?? 0, y: p?.y ?? 0 }
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

  return {
    id: raw.guid ?? `${raw.a?.x ?? 0},${raw.a?.y ?? 0}-${raw.b?.x ?? 0},${raw.b?.y ?? 0}`,
    a: point(raw.a),
    b: point(raw.b),
    thickness: raw.thickness ?? 10,
    balance: raw.balance,
    c: raw.c ? point(raw.c) : null,
    openings: (raw.openings ?? []).map(parseOpening),
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
  }
}

function parseFloor(raw: RawFloor, warnings: ImportWarning[]): Floor {
  const floorName = raw.name ?? 'Onbekend'
  const design = raw.designs?.[0]
  const walls = (design?.walls ?? []).map((w) => parseWall(w, warnings, floorName))
  const items = (design?.items ?? []).map(parseItem)

  return {
    name: floorName,
    level: raw.level ?? 0,
    height: raw.height ?? 280,
    walls,
    items: items.length > 0 ? items : undefined,
    drawing: parseDrawing(raw.drawing),
  }
}

export function importFmlV3(json: string | object): ImportResult {
  const warnings: ImportWarning[] = []
  const raw: RawFmlV3 = typeof json === 'string' ? JSON.parse(json) : json

  const plan: FloorPlan = {
    name: raw.name ?? 'Onbekend',
    floors: (raw.floors ?? []).map((f) => parseFloor(f, warnings)),
  }

  return { plan, warnings }
}
