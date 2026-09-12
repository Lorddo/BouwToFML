import type { PlgScaleInputUnit, PlgUnitSystem } from '@/core/plg/plg-document'

/** Invoereenheid voor schaalliniaal + FML typen (kamer/muur/move). Intern FML = cm. */
export type ScaleInputUnit = PlgScaleInputUnit

export const SCALE_INPUT_UNITS: readonly ScaleInputUnit[] = ['mm', 'cm', 'm', 'ft-in'] as const

export const DEFAULT_SCALE_INPUT_UNIT: ScaleInputUnit = 'mm'

/** Exacte inch (ISO). */
export const CM_PER_INCH = 2.54
export const MM_PER_INCH = 25.4
export const INCHES_PER_FOOT = 12
export const FT_IN_DENOMINATOR = 32

export type UnitSystem = PlgUnitSystem

export const UNIT_SYSTEMS: readonly UnitSystem[] = ['metric', 'imperial'] as const
export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'metric'

/** Architectuur-delen na afronding op 1/32". */
export type FeetInchParts = {
  sign: 1 | -1
  feet: number
  wholeInches: number
  numerator: number
  denominator: number
}

const MM_PER_UNIT: Record<Exclude<ScaleInputUnit, 'ft-in'>, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
}

export function normalizeScaleInputUnit(raw: unknown): ScaleInputUnit {
  return raw === 'mm' || raw === 'cm' || raw === 'm' || raw === 'ft-in'
    ? raw
    : DEFAULT_SCALE_INPUT_UNIT
}

export function normalizeUnitSystem(raw: unknown): UnitSystem {
  return raw === 'metric' || raw === 'imperial' ? raw : DEFAULT_UNIT_SYSTEM
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = y
    y = x % y
    x = t
  }
  return x || 1
}

/** Canoniek mm → getal in de gekozen invoereenheid (ft-in = totale inches). */
export function mmToScaleInput(mm: number, unit: ScaleInputUnit): number {
  if (!Number.isFinite(mm)) return 0
  if (unit === 'ft-in') return mm / MM_PER_INCH
  return mm / MM_PER_UNIT[unit]
}

/** Getypte waarde in invoereenheid → canoniek mm (ft-in = totale inches). */
export function scaleInputToMm(value: number, unit: ScaleInputUnit): number {
  if (!Number.isFinite(value)) return 0
  if (unit === 'ft-in') return value * MM_PER_INCH
  return value * MM_PER_UNIT[unit]
}

/** Canoniek cm (FML) → getal in de gekozen invoereenheid (ft-in = totale inches). */
export function cmToScaleInput(cm: number, unit: ScaleInputUnit): number {
  return mmToScaleInput(cm * 10, unit)
}

/** Getypte waarde → canoniek cm (ft-in = totale inches). */
export function scaleInputToCm(value: number, unit: ScaleInputUnit): number {
  return scaleInputToMm(value, unit) / 10
}

/** HTML number-input step per eenheid. */
export function scaleInputStep(unit: ScaleInputUnit): number | 'any' {
  if (unit === 'm') return 0.001
  if (unit === 'cm') return 0.1
  if (unit === 'ft-in') return 1 / FT_IN_DENOMINATOR
  return 1
}

/** Weergave-decimalen: m tot mm, cm tot 0,1, mm heel. ft-in gebruikt 1/32 (geen decimalen). */
export function scaleInputDecimals(unit: ScaleInputUnit): number {
  if (unit === 'm') return 3
  if (unit === 'cm') return 1
  if (unit === 'ft-in') return 0
  return 0
}

/** cm → feet/inch-delen, afgerond op 1/32". */
export function cmToFeetInchParts(cm: number): FeetInchParts {
  if (!Number.isFinite(cm) || cm === 0) {
    return { sign: 1, feet: 0, wholeInches: 0, numerator: 0, denominator: 1 }
  }
  const sign: 1 | -1 = cm < 0 ? -1 : 1
  const totalInches = Math.abs(cm) / CM_PER_INCH
  const thirtySeconds = Math.round(totalInches * FT_IN_DENOMINATOR)
  const feet = Math.floor(thirtySeconds / (INCHES_PER_FOOT * FT_IN_DENOMINATOR))
  const rem = thirtySeconds - feet * INCHES_PER_FOOT * FT_IN_DENOMINATOR
  const wholeInches = Math.floor(rem / FT_IN_DENOMINATOR)
  let numerator = rem % FT_IN_DENOMINATOR
  let denominator = FT_IN_DENOMINATOR
  if (numerator === 0) {
    return { sign, feet, wholeInches, numerator: 0, denominator: 1 }
  }
  const g = gcd(numerator, denominator)
  numerator /= g
  denominator /= g
  return { sign, feet, wholeInches, numerator, denominator }
}

/** Feet/inch-delen → cm. */
export function feetInchPartsToCm(parts: FeetInchParts): number {
  const inches =
    parts.feet * INCHES_PER_FOOT +
    parts.wholeInches +
    (parts.denominator > 0 ? parts.numerator / parts.denominator : 0)
  return parts.sign * inches * CM_PER_INCH
}

/** Architectuurstring: `5'`, `6 5/32"`, `5' 6 5/32"`, `0"`. */
export function formatFeetInch(cm: number): string {
  const parts = cmToFeetInchParts(cm)
  const prefix = parts.sign < 0 ? '-' : ''
  const { feet, wholeInches, numerator, denominator } = parts
  if (feet === 0 && wholeInches === 0 && numerator === 0) return `${prefix}0"`

  const frac = numerator > 0 ? `${numerator}/${denominator}` : ''
  if (feet === 0) {
    if (wholeInches === 0) return `${prefix}${frac}"`
    if (!frac) return `${prefix}${wholeInches}"`
    return `${prefix}${wholeInches} ${frac}"`
  }
  if (wholeInches === 0 && !frac) return `${prefix}${feet}'`
  if (wholeInches === 0) return `${prefix}${feet}' ${frac}"`
  if (!frac) return `${prefix}${feet}' ${wholeInches}"`
  return `${prefix}${feet}' ${wholeInches} ${frac}"`
}

/** cm → getal of architectuurstring (trailing zeros weg bij metric). */
export function formatScaleInputValue(cm: number, unit: ScaleInputUnit): string {
  if (!Number.isFinite(cm)) return unit === 'ft-in' ? '0"' : '0'
  if (unit === 'ft-in') return formatFeetInch(cm)
  const value = cmToScaleInput(cm, unit)
  const decimals = scaleInputDecimals(unit)
  const factor = 10 ** decimals
  const rounded = Math.round(value * factor) / factor
  return String(rounded)
}

/** Canvas-label: metric met eenheid; ft-in = architectuurstring zonder suffix. */
export function formatScaleInputLabel(cm: number, unit: ScaleInputUnit): string {
  if (unit === 'ft-in') return formatScaleInputValue(cm, unit)
  return `${formatScaleInputValue(cm, unit)} ${unit}`
}

function parseMetricNumber(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase().replace(',', '.')
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/**
 * Parse architectuur / inch-string → cm.
 * Accepteert: `5' 6 5/32"`, `5'6"`, `5'`, `6 5/32"`, `66.5"`, `66.5`, minteken.
 */
export function parseFeetInchToCm(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(',', '.')
  if (!s) return null
  let sign: 1 | -1 = 1
  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1).trim()
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim()
  }
  if (!s) return null
  // Strip trailing unit words / quotes for easier matching
  s = s
    .replace(/\s*(?:inches|inch|in)\s*$/i, '')
    .replace(/"$/, '')
    .trim()
  if (!s) return null

  let totalInches: number
  if (s.includes("'")) {
    // feet' [whole] [num/den]   OR   feet' num/den
    const m =
      /^(\d+)\s*'\s*(?:(\d+(?:\.\d+)?)\s+(?:(\d+)\s*\/\s*(\d+))?|(\d+(?:\.\d+)?)|(\d+)\s*\/\s*(\d+))?\s*$/.exec(
        s,
      )
    if (!m) return null
    const feet = Number(m[1])
    if (!Number.isFinite(feet)) return null
    totalInches = feet * INCHES_PER_FOOT
    if (m[2] !== undefined) {
      // `5' 6` or `5' 6 5/32`
      const whole = Number(m[2])
      if (!Number.isFinite(whole)) return null
      totalInches += whole
      if (m[3] !== undefined && m[4] !== undefined) {
        const num = Number(m[3])
        const den = Number(m[4])
        if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
        totalInches += num / den
      }
    } else if (m[5] !== undefined) {
      // `5' 6` or `5'6.5`
      const whole = Number(m[5])
      if (!Number.isFinite(whole)) return null
      totalInches += whole
    } else if (m[6] !== undefined && m[7] !== undefined) {
      // `5' 5/32`
      const num = Number(m[6])
      const den = Number(m[7])
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
      totalInches += num / den
    }
  } else {
    // inches only: `66.5`, `6 5/32`, `5/32`
    const fracOnly = /^(\d+)\s*\/\s*(\d+)\s*$/.exec(s)
    if (fracOnly) {
      const num = Number(fracOnly[1])
      const den = Number(fracOnly[2])
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
      totalInches = num / den
    } else {
      const withFrac = /^(\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)\s*$/.exec(s)
      if (withFrac) {
        const whole = Number(withFrac[1])
        const num = Number(withFrac[2])
        const den = Number(withFrac[3])
        if (
          !Number.isFinite(whole) ||
          !Number.isFinite(num) ||
          !Number.isFinite(den) ||
          den === 0
        ) {
          return null
        }
        totalInches = whole + num / den
      } else {
        const plain = /^(\d+(?:\.\d+)?)\s*$/.exec(s)
        if (!plain) return null
        const n = Number(plain[1])
        if (!Number.isFinite(n)) return null
        totalInches = n
      }
    }
  }

  return sign * totalInches * CM_PER_INCH
}

/**
 * Parse ruwe invoer → cm.
 * Expliciete markering wint van `defaultUnit`:
 * - `3000mm` / `300cm` / `3m` → metric
 * - `1' 5"` / `66"` / `5/32"` / `…in` → feet-inch
 * - bare getal → `defaultUnit` (bij ft-in = inches)
 */
export function parseScaleInput(raw: string, defaultUnit: ScaleInputUnit): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized = trimmed.toLowerCase().replace(',', '.')

  const metric = /^(-?\d+(?:\.\d+)?)\s*(mm|cm|m)$/.exec(normalized)
  if (metric) {
    const value = Number(metric[1])
    if (!Number.isFinite(value)) return null
    return scaleInputToCm(value, metric[2] as 'mm' | 'cm' | 'm')
  }

  if (looksLikeFeetInchInput(trimmed) || defaultUnit === 'ft-in') {
    return parseFeetInchToCm(trimmed)
  }

  const value = parseMetricNumber(trimmed)
  if (value === null) return null
  return scaleInputToCm(value, defaultUnit)
}

/** Of de string duidelijk feet/inch is (onafhankelijk van settings-default). */
export function looksLikeFeetInchInput(raw: string): boolean {
  const s = raw.trim().toLowerCase()
  if (!s) return false
  if (s.includes("'") || s.includes('"')) return true
  return /(?:in|inch|inches)\s*$/.test(s.replace(/"$/, ''))
}

/** Positieve lengte → mm (schaalliniaal). Ongeldig / ≤0 → null. */
export function parseScaleInputToMm(raw: string, defaultUnit: ScaleInputUnit): number | null {
  const cm = parseScaleInput(raw, defaultUnit)
  if (cm === null || !Number.isFinite(cm) || cm <= 0) return null
  return cm * 10
}
