/** Floorplanner objectlabel (`name` + `showLabel` + offset). Geen eigen UI. */

export type ObjectLabelFields = {
  name?: string
  showLabel?: boolean
  name_x?: number
  name_y?: number
}

export const OBJECT_LABEL_KEYS = ['name', 'showLabel', 'name_x', 'name_y'] as const

export function parseObjectLabel(raw: Record<string, unknown>): ObjectLabelFields {
  const out: ObjectLabelFields = {}
  if (typeof raw.name === 'string' && raw.name.length > 0) out.name = raw.name
  if (raw.showLabel === true || raw.showLabel === false) out.showLabel = raw.showLabel
  if (typeof raw.name_x === 'number' && Number.isFinite(raw.name_x)) out.name_x = raw.name_x
  if (typeof raw.name_y === 'number' && Number.isFinite(raw.name_y)) out.name_y = raw.name_y
  return out
}

export function writeObjectLabel(out: Record<string, unknown>, label: ObjectLabelFields): void {
  if (label.name) out.name = label.name
  if (label.showLabel != null) out.showLabel = label.showLabel
  if (label.name_x != null) out.name_x = label.name_x
  if (label.name_y != null) out.name_y = label.name_y
}

export function scaleObjectLabel<T extends ObjectLabelFields>(
  obj: T,
  f: { x: number; y: number },
): T {
  return {
    ...obj,
    name_x: obj.name_x != null ? obj.name_x * f.x : obj.name_x,
    name_y: obj.name_y != null ? obj.name_y * f.y : obj.name_y,
  }
}

export function mirrorObjectLabelX<T extends ObjectLabelFields>(obj: T): T {
  return {
    ...obj,
    name_x: obj.name_x != null ? -obj.name_x : obj.name_x,
  }
}

export function rotateObjectLabel90<T extends ObjectLabelFields>(obj: T, dir: 'cw' | 'ccw'): T {
  const x = obj.name_x
  const y = obj.name_y
  if (x == null && y == null) return obj
  const ox = x ?? 0
  const oy = y ?? 0
  if (dir === 'cw') return { ...obj, name_x: -oy, name_y: ox }
  return { ...obj, name_x: oy, name_y: -ox }
}
