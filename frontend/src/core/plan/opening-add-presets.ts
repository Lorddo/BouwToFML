import type { OpeningKind } from './opening-kind-catalog'
import { resolveOpeningKind } from './opening-kind-catalog'
import type { OpeningType } from './types'
import { openingKindFromFmlRefid } from '../plg/fml-adapter/opening-fml-refids'

/** Volgorde = deur-dropdown (plattegrond + aanzicht). */
export const DOOR_ADD_SUBTYPES = [
  'standard',
  'flush',
  'half_glass',
  'closet',
  'passage',
  'archway',
  'round',
  'french_balcony',
  'balcony',
  'double',
  'double_standard',
  'double_solid',
  'bifold',
  'bifold_double',
  'pocket',
  'sliding_single',
  'sliding',
  'elevator',
  'garage',
] as const

/** Volgorde = raam-dropdown (plattegrond + aanzicht). */
export const WINDOW_ADD_SUBTYPES = [
  'single',
  'grid',
  'double',
  'triple',
  'round',
  'half_round',
  'triangle',
  'blind',
] as const

export type DoorAddSubtype = (typeof DOOR_ADD_SUBTYPES)[number]
export type WindowAddSubtype = (typeof WINDOW_ADD_SUBTYPES)[number]
/** Dropdown-waarde: deur- of raam-subtype. */
export type OpeningSubtypeDraft = DoorAddSubtype | WindowAddSubtype

export interface OpeningAddPreset {
  type: OpeningType
  kind: OpeningKind
  defaultWidthCm: number
}

const DOOR_ADD_PRESETS: Record<DoorAddSubtype, OpeningAddPreset> = {
  standard: { type: 'door', kind: 'door.single', defaultWidthCm: 90 },
  flush: { type: 'door', kind: 'door.flush', defaultWidthCm: 90 },
  half_glass: { type: 'door', kind: 'door.half_glass', defaultWidthCm: 90 },
  closet: { type: 'door', kind: 'door.closet', defaultWidthCm: 80 },
  passage: { type: 'door', kind: 'door.passage', defaultWidthCm: 90 },
  archway: { type: 'door', kind: 'door.archway', defaultWidthCm: 90 },
  round: { type: 'door', kind: 'door.round', defaultWidthCm: 180 },
  french_balcony: { type: 'door', kind: 'door.french_balcony', defaultWidthCm: 90 },
  balcony: { type: 'door', kind: 'door.balcony', defaultWidthCm: 90 },
  double: { type: 'door', kind: 'door.double', defaultWidthCm: 140 },
  double_standard: { type: 'door', kind: 'door.double_standard', defaultWidthCm: 140 },
  double_solid: { type: 'door', kind: 'door.double_solid', defaultWidthCm: 140 },
  bifold: { type: 'door', kind: 'door.bifold', defaultWidthCm: 160 },
  bifold_double: { type: 'door', kind: 'door.bifold_double', defaultWidthCm: 240 },
  pocket: { type: 'door', kind: 'door.pocket', defaultWidthCm: 100 },
  sliding_single: { type: 'door', kind: 'door.sliding_single', defaultWidthCm: 180 },
  sliding: { type: 'door', kind: 'door.sliding', defaultWidthCm: 180 },
  elevator: { type: 'door', kind: 'door.elevator', defaultWidthCm: 90 },
  garage: { type: 'door', kind: 'door.garage', defaultWidthCm: 240 },
}

const WINDOW_ADD_PRESETS: Record<WindowAddSubtype, OpeningAddPreset> = {
  single: { type: 'window', kind: 'window.single', defaultWidthCm: 100 },
  grid: { type: 'window', kind: 'window.grid', defaultWidthCm: 100 },
  double: { type: 'window', kind: 'window.double', defaultWidthCm: 150 },
  triple: { type: 'window', kind: 'window.triple', defaultWidthCm: 200 },
  round: { type: 'window', kind: 'window.round', defaultWidthCm: 98 },
  half_round: { type: 'window', kind: 'window.half_round', defaultWidthCm: 98 },
  triangle: { type: 'window', kind: 'window.triangle', defaultWidthCm: 110 },
  blind: { type: 'window', kind: 'window.blind', defaultWidthCm: 110 },
}

const KIND_TO_DOOR_SUBTYPE: Partial<Record<OpeningKind, DoorAddSubtype>> = {
  'door.single': 'standard',
  'door.flush': 'flush',
  'door.half_glass': 'half_glass',
  'door.closet': 'closet',
  'door.passage': 'passage',
  'door.archway': 'archway',
  'door.round': 'round',
  'door.french_balcony': 'french_balcony',
  'door.balcony': 'balcony',
  'door.double': 'double',
  'door.double_standard': 'double_standard',
  'door.double_solid': 'double_solid',
  'door.bifold': 'bifold',
  'door.bifold_double': 'bifold_double',
  'door.pocket': 'pocket',
  'door.sliding_single': 'sliding_single',
  'door.sliding_single_mirror': 'sliding_single',
  'door.sliding': 'sliding',
  'door.elevator': 'elevator',
  'door.garage': 'garage',
  'door.unmapped': 'standard',
}

const KIND_TO_WINDOW_SUBTYPE: Partial<Record<OpeningKind, WindowAddSubtype>> = {
  'window.single': 'single',
  'window.grid': 'grid',
  'window.double': 'double',
  'window.triple': 'triple',
  'window.round': 'round',
  'window.half_round': 'half_round',
  'window.triangle': 'triangle',
  'window.blind': 'blind',
  'window.unmapped': 'single',
}

export function resolveDoorAddPreset(subtype: DoorAddSubtype): OpeningAddPreset {
  return DOOR_ADD_PRESETS[subtype]
}

export function resolveWindowAddPreset(subtype: WindowAddSubtype): OpeningAddPreset {
  return WINDOW_ADD_PRESETS[subtype]
}

export function coerceDoorAddSubtype(value: string | undefined | null): DoorAddSubtype {
  const raw = (value ?? '').trim()
  if (raw === 'double_balcony') return 'double_standard'
  if ((DOOR_ADD_SUBTYPES as readonly string[]).includes(raw)) return raw as DoorAddSubtype
  return resolveDoorSubtypeFromKind(raw)
}

export function coerceWindowAddSubtype(value: string | undefined | null): WindowAddSubtype {
  const raw = (value ?? '').trim()
  if ((WINDOW_ADD_SUBTYPES as readonly string[]).includes(raw)) return raw as WindowAddSubtype
  return resolveWindowSubtypeFromKind(raw)
}

export function resolveDoorSubtypeFromKind(kind: string | undefined): DoorAddSubtype {
  if (!kind) return 'standard'
  const openingKind = kind.includes('.')
    ? resolveOpeningKind(kind).kind
    : openingKindFromFmlRefid(kind, 'door').kind
  return KIND_TO_DOOR_SUBTYPE[openingKind] ?? 'standard'
}

export function resolveWindowSubtypeFromKind(kind: string | undefined): WindowAddSubtype {
  if (!kind) return 'single'
  const openingKind = kind.includes('.')
    ? resolveOpeningKind(kind).kind
    : openingKindFromFmlRefid(kind, 'window').kind
  return KIND_TO_WINDOW_SUBTYPE[openingKind] ?? 'single'
}

/** @deprecated Gebruik `resolveDoorSubtypeFromKind`. */
export function resolveDoorSubtypeFromRefid(kindOrRefid: string | undefined): DoorAddSubtype {
  return resolveDoorSubtypeFromKind(kindOrRefid)
}

/** @deprecated Gebruik `resolveWindowSubtypeFromKind`. */
export function resolveWindowSubtypeFromRefid(kindOrRefid: string | undefined): WindowAddSubtype {
  return resolveWindowSubtypeFromKind(kindOrRefid)
}

/** Alleen driehoekraam is links/rechts asymmetrisch; andere ramen hebben geen spiegelknop. */
export function isTriangleWindow(type: OpeningType, kind: string | undefined): boolean {
  return type === 'window' && resolveWindowSubtypeFromKind(kind) === 'triangle'
}
