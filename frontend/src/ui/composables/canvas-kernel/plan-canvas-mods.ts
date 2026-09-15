/** Touch-toggle OR keyboard modifiers. */

export function isSettingsMod(
  event: { ctrlKey?: boolean; metaKey?: boolean },
  toggled: boolean,
): boolean {
  return toggled || event.ctrlKey === true || event.metaKey === true
}

export function isAxisLock(event: { shiftKey?: boolean }, toggled: boolean): boolean {
  return toggled || event.shiftKey === true
}

/** Desktop: altijd verplaatsen. Touch-rail: alleen als Move aan staat. */
export function wantsRelocate(touchNav: boolean, moveMod: boolean): boolean {
  return !touchNav || moveMod
}

/**
 * Precise relocate (typ maat / 2e klik): desktop Shift+klik, touch-rail Move.
 * Tweede klik / typ maat heeft geen activator nodig.
 * Geldt voor muur-slide, knoop en opening (deur/raam).
 */
export function wantsClickMove(args: {
  touchNav: boolean
  moveMod: boolean
  shiftKey: boolean
}): boolean {
  if (args.touchNav) return args.moveMod
  return args.shiftKey || args.moveMod
}

export type RelocatePointerIntent = 'precise' | 'drag' | 'select'

/** @deprecated Alias — gebruik RelocatePointerIntent. */
export type WallPointerIntent = RelocatePointerIntent

/** Desktop: click-drag of Shift+precise. Touch: alleen Precise via Move; anders selecteren. */
export function resolveRelocatePointerIntent(args: {
  touchNav: boolean
  moveMod: boolean
  shiftKey: boolean
}): RelocatePointerIntent {
  if (wantsClickMove(args)) return 'precise'
  if (wantsRelocate(args.touchNav, args.moveMod)) return 'drag'
  return 'select'
}