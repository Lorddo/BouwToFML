import catalogData from './data/roomtype-catalog.json'

export const UNLABELED_AREA_COLOR = '#ffffff'

export interface RoomTypeEntry {
  role: number
  name: string
  /** Fabriekskleur uit catalogus (niet user-override). */
  color: string
}

interface CatalogJson {
  entries?: Array<{ role?: number; name?: string; color?: string }>
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/
const HEX_LOOSE_RE = /^#?([0-9A-Fa-f]{6})$/

/** FML-kleur: `#RRGGBB` (hoofdletters). Zonder `#` of andere casing wordt genormaliseerd. */
export function parseFmlHex(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null
  const m = HEX_LOOSE_RE.exec(raw.trim())
  return m ? `#${m[1].toUpperCase()}` : null
}

function normalizeHex(raw: string | undefined, fallback: string): string {
  return parseFmlHex(raw) ?? parseFmlHex(fallback) ?? UNLABELED_AREA_COLOR
}

const entries: RoomTypeEntry[] = ((catalogData as CatalogJson).entries ?? [])
  .filter((e) => typeof e.role === 'number' && Number.isFinite(e.role) && e.name?.trim())
  .map((e) => ({
    role: e.role as number,
    name: String(e.name).trim(),
    color: normalizeHex(e.color, UNLABELED_AREA_COLOR),
  }))
  .sort((a, b) => a.role - b.role)

const byRole = new Map(entries.map((e) => [e.role, e]))

export function listRoomTypes(): readonly RoomTypeEntry[] {
  return entries
}

export function resolveRoomType(role: number | undefined | null): RoomTypeEntry | null {
  if (role == null || !Number.isFinite(role)) return null
  return byRole.get(role) ?? null
}

/** Fabriekskleur uit catalogus (geen user-settings). */
export function factoryRoomTypeColor(role: number | undefined | null): string {
  return resolveRoomType(role)?.color ?? UNLABELED_AREA_COLOR
}

/**
 * Effectieve default-kleur: user override wint, anders catalogus.
 * `overrides` = `UserSettingsV1.roomTagColors` (role → #RRGGBB).
 */
export function effectiveRoomTypeColor(
  role: number | undefined | null,
  overrides?: Record<string, string> | null,
): string {
  if (role == null || !Number.isFinite(role)) return UNLABELED_AREA_COLOR
  const key = String(role)
  const override = overrides?.[key]
  if (override && HEX_RE.test(override.trim())) return override.trim().toUpperCase()
  return factoryRoomTypeColor(role)
}

export function displayAreaLabel(area: { name?: string; customName?: string }): string | null {
  const custom = area.customName?.trim()
  if (custom) return custom
  const name = area.name?.trim()
  return name || null
}

export function isValidRoomTagHex(raw: string | undefined | null): boolean {
  return typeof raw === 'string' && HEX_RE.test(raw.trim())
}

/** Alleen geldige hex + bekende roles; gelijke fabriekskleur wegfilteren. */
export function normalizeRoomTagColors(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const role = Number(key)
    if (!Number.isFinite(role) || !byRole.has(role)) continue
    if (typeof value !== 'string' || !HEX_RE.test(value.trim())) continue
    const hex = value.trim().toUpperCase()
    const factory = factoryRoomTypeColor(role)
    if (hex === factory) continue
    out[String(role)] = hex
  }
  return out
}
