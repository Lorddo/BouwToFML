import type { Opening } from './types'
import {
  resolveDoorAddPreset,
  resolveWindowAddPreset,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from './opening-add-presets'

export function buildOpeningFromPreset(args: {
  type: 'door' | 'window'
  doorSubtype: DoorAddSubtype
  windowSubtype: WindowAddSubtype
  widthCm: number
  heightCm: number
  sillZCm: number
  t: number
}): Opening {
  const preset =
    args.type === 'door'
      ? resolveDoorAddPreset(args.doorSubtype)
      : resolveWindowAddPreset(args.windowSubtype)
  return {
    type: args.type,
    refid: preset.refid,
    t: Math.max(0, Math.min(1, args.t)),
    width: args.widthCm,
    z: args.type === 'door' ? 0 : args.sillZCm,
    z_height: args.heightCm,
    mirrored: args.type === 'door' ? [0, 0] : undefined,
    guid: crypto.randomUUID(),
  }
}
