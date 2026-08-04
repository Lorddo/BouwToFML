/** Invoereenheid voor de schaalliniaal (stap 1). Intern blijft alles mm. */
export type ScaleInputUnit = 'mm' | 'cm' | 'm'

export const SCALE_INPUT_UNITS: readonly ScaleInputUnit[] = ['mm', 'cm', 'm'] as const

export const DEFAULT_SCALE_INPUT_UNIT: ScaleInputUnit = 'mm'

const MM_PER_UNIT: Record<ScaleInputUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
}

export function normalizeScaleInputUnit(raw: unknown): ScaleInputUnit {
  return raw === 'mm' || raw === 'cm' || raw === 'm' ? raw : DEFAULT_SCALE_INPUT_UNIT
}

/** Canoniek mm → getal in de gekozen invoereenheid. */
export function mmToScaleInput(mm: number, unit: ScaleInputUnit): number {
  if (!Number.isFinite(mm)) return 0
  return mm / MM_PER_UNIT[unit]
}

/** Getypte waarde in invoereenheid → canoniek mm. */
export function scaleInputToMm(value: number, unit: ScaleInputUnit): number {
  if (!Number.isFinite(value)) return 0
  return value * MM_PER_UNIT[unit]
}

/** HTML number-input step per eenheid (decimalen voor m/cm). */
export function scaleInputStep(unit: ScaleInputUnit): number | 'any' {
  if (unit === 'm') return 0.001
  if (unit === 'cm') return 0.1
  return 1
}
