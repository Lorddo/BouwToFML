import {
  CLOSET_DOOR_REFID,
  CONCEPT_DOOR_REFID,
  CONCEPT_WINDOW_REFID,
  DOUBLE_WIDE_DOOR_REFID,
  GARAGE_DOOR_REFID,
  POCKET_DOOR_REFID,
  SLIDING_DOUBLE_DOOR_REFID,
  SLIDING_SINGLE_DOOR_REFID,
  WINDOW_DOUBLE_REFID,
  WINDOW_HALF_ROUND_REFID,
  WINDOW_ROUND_REFID,
  WINDOW_TRIPLE_REFID,
  type OpeningType,
} from './types'

export type DoorAddSubtype =
  | 'standard'
  | 'closet'
  | 'double'
  | 'pocket'
  | 'sliding_single'
  | 'sliding'
  | 'garage'

export type WindowAddSubtype = 'single' | 'double' | 'triple' | 'round' | 'half_round'

export interface OpeningAddPreset {
  type: OpeningType
  refid: string
  defaultWidthCm: number
}

const DOOR_ADD_PRESETS: Record<DoorAddSubtype, OpeningAddPreset> = {
  standard: { type: 'door', refid: CONCEPT_DOOR_REFID, defaultWidthCm: 90 },
  closet: { type: 'door', refid: CLOSET_DOOR_REFID, defaultWidthCm: 80 },
  double: { type: 'door', refid: DOUBLE_WIDE_DOOR_REFID, defaultWidthCm: 140 },
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
}

export function resolveDoorAddPreset(subtype: DoorAddSubtype): OpeningAddPreset {
  return DOOR_ADD_PRESETS[subtype]
}

export function resolveWindowAddPreset(subtype: WindowAddSubtype): OpeningAddPreset {
  return WINDOW_ADD_PRESETS[subtype]
}

export function resolveDoorSubtypeFromRefid(refid: string | undefined): DoorAddSubtype {
  if (!refid) return 'standard'
  for (const [subtype, preset] of Object.entries(DOOR_ADD_PRESETS) as [DoorAddSubtype, OpeningAddPreset][]) {
    if (preset.refid === refid) return subtype
  }
  return 'standard'
}

export function resolveWindowSubtypeFromRefid(refid: string | undefined): WindowAddSubtype {
  if (!refid) return 'single'
  for (const [subtype, preset] of Object.entries(WINDOW_ADD_PRESETS) as [
    WindowAddSubtype,
    OpeningAddPreset,
  ][]) {
    if (preset.refid === refid) return subtype
  }
  return 'single'
}
