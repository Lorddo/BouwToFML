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
