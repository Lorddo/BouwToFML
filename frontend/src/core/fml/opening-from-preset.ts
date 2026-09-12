import type { Opening } from './types'
import {
  coerceDoorAddSubtype,
  coerceWindowAddSubtype,
  resolveDoorAddPreset,
  resolveWindowAddPreset,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from './opening-add-presets'

export function buildOpeningFromPreset(args: {
  type: 'door' | 'window'
  doorSubtype: DoorAddSubtype | string
  windowSubtype: WindowAddSubtype | string
  widthCm: number
  heightCm: number
  sillZCm: number
  t: number
}): Opening {
  const preset =
    args.type === 'door'
      ? resolveDoorAddPreset(coerceDoorAddSubtype(args.doorSubtype))
      : resolveWindowAddPreset(coerceWindowAddSubtype(args.windowSubtype))
  return {
    id: crypto.randomUUID(),
    kind: preset.kind,
    type: args.type,
    t: Math.max(0, Math.min(1, args.t)),
    width: args.widthCm,
    z: args.sillZCm,
    z_height: args.heightCm,
    mirrored: args.type === 'door' ? [0, 0] : undefined,
  }
}
