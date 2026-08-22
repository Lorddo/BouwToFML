import { resolveOpeningCatalog } from './opening-refid-catalog'
import {
  CLOSET_DOOR_REFID,
  CONCEPT_DOOR_REFID,
  CONCEPT_WINDOW_REFID,
  DOUBLE_SOLID_DOOR_REFID,
  DOUBLE_WIDE_DOOR_REFID,
  FRENCH_BALCONY_DOOR_REFID,
  ARCHWAY_DOOR_REFID,
  BIFOLD_DOOR_REFID,
  BIFOLD_DOUBLE_DOOR_REFID,
  GARAGE_DOOR_REFID,
  PASSAGE_DOOR_REFID,
  POCKET_DOOR_REFID,
  SLIDING_DOUBLE_DOOR_REFID,
  SLIDING_SINGLE_DOOR_REFID,
  WINDOW_DOUBLE_REFID,
  WINDOW_BLIND_REFID,
  WINDOW_HALF_ROUND_REFID,
  WINDOW_ROUND_REFID,
  WINDOW_TRIANGLE_REFID,
  WINDOW_TRIPLE_REFID,
  type OpeningType,
} from './types'

/** Volgorde = deur-dropdown (plattegrond + aanzicht). */
export const DOOR_ADD_SUBTYPES = [
  'standard',
  'closet',
  'passage',
  'archway',
  'french_balcony',
  'double',
  'double_solid',
  'bifold',
  'bifold_double',
  'pocket',
  'sliding_single',
  'sliding',
  'garage',
] as const

/** Volgorde = raam-dropdown (plattegrond + aanzicht). */
export const WINDOW_ADD_SUBTYPES = [
  'single',
  'double',
  'triple',
  'round',
  'half_round',
  'triangle',
  'blind',
] as const

export type DoorAddSubtype = (typeof DOOR_ADD_SUBTYPES)[number]
export type WindowAddSubtype = (typeof WINDOW_ADD_SUBTYPES)[number]

export interface OpeningAddPreset {
  type: OpeningType
  refid: string
  defaultWidthCm: number
}

const DOOR_ADD_PRESETS: Record<DoorAddSubtype, OpeningAddPreset> = {
  standard: { type: 'door', refid: CONCEPT_DOOR_REFID, defaultWidthCm: 90 },
  closet: { type: 'door', refid: CLOSET_DOOR_REFID, defaultWidthCm: 80 },
  passage: { type: 'door', refid: PASSAGE_DOOR_REFID, defaultWidthCm: 90 },
  archway: { type: 'door', refid: ARCHWAY_DOOR_REFID, defaultWidthCm: 90 },
  french_balcony: { type: 'door', refid: FRENCH_BALCONY_DOOR_REFID, defaultWidthCm: 90 },
  double: { type: 'door', refid: DOUBLE_WIDE_DOOR_REFID, defaultWidthCm: 140 },
  double_solid: { type: 'door', refid: DOUBLE_SOLID_DOOR_REFID, defaultWidthCm: 140 },
  bifold: { type: 'door', refid: BIFOLD_DOOR_REFID, defaultWidthCm: 160 },
  bifold_double: { type: 'door', refid: BIFOLD_DOUBLE_DOOR_REFID, defaultWidthCm: 240 },
  pocket: { type: 'door', refid: POCKET_DOOR_REFID, defaultWidthCm: 100 },
  sliding_single: { type: 'door', refid: SLIDING_SINGLE_DOOR_REFID, defaultWidthCm: 180 },
  sliding: { type: 'door', refid: SLIDING_DOUBLE_DOOR_REFID, defaultWidthCm: 180 },
  garage: { type: 'door', refid: GARAGE_DOOR_REFID, defaultWidthCm: 240 },
}

const WINDOW_ADD_PRESETS: Record<WindowAddSubtype, OpeningAddPreset> = {
  single: { type: 'window', refid: CONCEPT_WINDOW_REFID, defaultWidthCm: 100 },
  double: { type: 'window', refid: WINDOW_DOUBLE_REFID, defaultWidthCm: 150 },
  triple: { type: 'window', refid: WINDOW_TRIPLE_REFID, defaultWidthCm: 200 },
  round: { type: 'window', refid: WINDOW_ROUND_REFID, defaultWidthCm: 98 },
  half_round: { type: 'window', refid: WINDOW_HALF_ROUND_REFID, defaultWidthCm: 98 },
  triangle: { type: 'window', refid: WINDOW_TRIANGLE_REFID, defaultWidthCm: 110 },
  blind: { type: 'window', refid: WINDOW_BLIND_REFID, defaultWidthCm: 110 },
}

export function resolveDoorAddPreset(subtype: DoorAddSubtype): OpeningAddPreset {
  return DOOR_ADD_PRESETS[subtype]
}

export function resolveWindowAddPreset(subtype: WindowAddSubtype): OpeningAddPreset {
  return WINDOW_ADD_PRESETS[subtype]
}

function doorSubtypeFromCatalog(refid: string): DoorAddSubtype {
  const info = resolveOpeningCatalog(refid, 'door')
  switch (info.kind) {
    case 'closet45':
      return 'closet'
    case 'passage':
      return 'passage'
    case 'archway':
      return 'archway'
    case 'french_balcony':
      return 'french_balcony'
    case 'bifold':
      return 'bifold'
    case 'bifold_double':
      return 'bifold_double'
    case 'double_wide':
      return info.leaf === 'solid' ? 'double_solid' : 'double'
    case 'sliding_pocket':
      return 'pocket'
    case 'sliding_single':
      return 'sliding_single'
    case 'sliding':
      return 'sliding'
    case 'garage':
      return 'garage'
    default:
      return 'standard'
  }
}

function windowSubtypeFromCatalog(refid: string): WindowAddSubtype {
  const info = resolveOpeningCatalog(refid, 'window')
  if (info.kind === 'round') return 'round'
  if (info.kind === 'half_round') return 'half_round'
  if (info.kind === 'triangle') return 'triangle'
  if (info.kind === 'multi') return info.panels === 3 ? 'triple' : 'double'
  return 'single'
}

export function resolveDoorSubtypeFromRefid(refid: string | undefined): DoorAddSubtype {
  if (!refid) return 'standard'
  for (const [subtype, preset] of Object.entries(DOOR_ADD_PRESETS) as [
    DoorAddSubtype,
    OpeningAddPreset,
  ][]) {
    if (preset.refid === refid) return subtype
  }
  return doorSubtypeFromCatalog(refid)
}

export function resolveWindowSubtypeFromRefid(refid: string | undefined): WindowAddSubtype {
  if (!refid) return 'single'
  for (const [subtype, preset] of Object.entries(WINDOW_ADD_PRESETS) as [
    WindowAddSubtype,
    OpeningAddPreset,
  ][]) {
    if (preset.refid === refid) return subtype
  }
  return windowSubtypeFromCatalog(refid)
}

/** Alleen driehoekraam is links/rechts asymmetrisch; andere ramen hebben geen spiegelknop. */
export function isTriangleWindow(type: OpeningType, refid: string | undefined): boolean {
  return type === 'window' && resolveWindowSubtypeFromRefid(refid) === 'triangle'
}
