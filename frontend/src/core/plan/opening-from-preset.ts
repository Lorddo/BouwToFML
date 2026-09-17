import type { Opening } from './types'
import type { OpeningFrameCm } from './opening-display-geom'
import { isFramelessOpeningKind } from './opening-display-geom'
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
  /** Instance-kozijn; weggelaten bij passage/boog. */
  frame?: OpeningFrameCm
}): Opening {
  const preset =
    args.type === 'door'
      ? resolveDoorAddPreset(coerceDoorAddSubtype(args.doorSubtype))
      : resolveWindowAddPreset(coerceWindowAddSubtype(args.windowSubtype))
  const frameless = isFramelessOpeningKind(preset.kind)
  return {
    id: crypto.randomUUID(),
    kind: preset.kind,
    type: args.type,
    t: Math.max(0, Math.min(1, args.t)),
    width: args.widthCm,
    z: args.sillZCm,
    z_height: args.heightCm,
    mirrored: args.type === 'door' ? [0, 0] : undefined,
    ...(frameless || !args.frame
      ? {}
      : {
          frame: {
            leftCm: Math.max(0, args.frame.leftCm),
            rightCm: Math.max(0, args.frame.rightCm),
            topCm: Math.max(0, args.frame.topCm),
            bottomCm: Math.max(0, args.frame.bottomCm),
          },
        }),
  }
}
