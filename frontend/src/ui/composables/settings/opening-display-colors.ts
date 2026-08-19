/** Preview-kleuren deuren / ramen / bovenlicht (zelfde fabriekstint als detectie-faces). */
export const FACTORY_OPENING_COLORS = {
  door: '#f59e0b',
  window: '#06b6d4',
  bovenlicht: '#16a34a',
} as const

export type OpeningDisplayColorKey = keyof typeof FACTORY_OPENING_COLORS

export type OpeningDisplayColors = {
  door: string
  window: string
  bovenlicht: string
}

const HEX6 = /^#([0-9a-fA-F]{6})$/
const HEX3 = /^#([0-9a-fA-F]{3})$/

export function normalizeHexColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const value = raw.trim()
  const six = HEX6.exec(value)
  if (six) return `#${six[1].toLowerCase()}`
  const three = HEX3.exec(value)
  if (three) {
    const [r, g, b] = three[1].toLowerCase()
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return fallback
}

export function createFactoryOpeningDisplayColors(): OpeningDisplayColors {
  return { ...FACTORY_OPENING_COLORS }
}

export function normalizeOpeningDisplayColors(raw: unknown): OpeningDisplayColors {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    door: normalizeHexColor(src.door, FACTORY_OPENING_COLORS.door),
    window: normalizeHexColor(src.window, FACTORY_OPENING_COLORS.window),
    bovenlicht: normalizeHexColor(src.bovenlicht, FACTORY_OPENING_COLORS.bovenlicht),
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c)))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/** Donkere lijnkleur bij de gap-fill. */
export function openingStrokeFromFill(fillHex: string, factor = 0.68): string {
  const [r, g, b] = hexToRgb(normalizeHexColor(fillHex, FACTORY_OPENING_COLORS.door))
  return rgbToHex(r * factor, g * factor, b * factor)
}
