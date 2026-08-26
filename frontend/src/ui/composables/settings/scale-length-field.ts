/**
 * Shared parse/clamp for length fields that display via scaleInputUnit
 * but store cm-float. Unit switch never rewrites stored cm — only typing does.
 */

import {
  CM_PER_INCH,
  formatScaleInputValue,
  parseScaleInput,
  type ScaleInputUnit,
  type UnitSystem,
} from './scale-input-unit'

/** Stepper: metric = 1 cm; imperial = 1/16 inch. */
export const SCALE_LENGTH_STEP_METRIC_CM = 1
export const SCALE_LENGTH_STEP_IMPERIAL_IN = 1 / 16

/**
 * Pause before apply on confirm-heavy length fields (floor height / overwrite-all).
 * Toolbelt selected-object fields keep their own 700 ms draft-commit.
 */
export const SCALE_LENGTH_COMMIT_DEBOUNCE_MS = 1000

type ScaleLengthCommitGate = {
  schedule: (cm: number) => void
  flush: () => void
  cancel: () => void
  peek: () => number | null
  dispose: () => void
}

/** Coalesce typing / −/+ into one emit after pause; flush on blur/Enter. */
export function createScaleLengthCommitGate(
  emit: (cm: number) => void,
  delayMs: () => number,
): ScaleLengthCommitGate {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: number | null = null

  function clearTimer(): void {
    if (timer == null) return
    clearTimeout(timer)
    timer = null
  }

  function fire(): void {
    if (pending == null) return
    const cm = pending
    pending = null
    clearTimer()
    emit(cm)
  }

  return {
    schedule(cm: number) {
      pending = cm
      const delay = delayMs()
      if (!(delay > 0)) {
        fire()
        return
      }
      clearTimer()
      timer = setTimeout(fire, delay)
    },
    flush() {
      fire()
    },
    cancel() {
      clearTimer()
      pending = null
    },
    peek() {
      return pending
    },
    dispose() {
      clearTimer()
      pending = null
    },
  }
}

export type ScaleLengthClampOptions = {
  /** Inclusive minimum in cm. Omit = no lower bound. */
  minCm?: number
  /** Inclusive maximum in cm. Omit = no upper bound. */
  maxCm?: number
  /** When false (default), ≤0 is rejected unless allowZero is true. */
  allowZero?: boolean
  /** When true, negative lengths are kept (after clamp). Default rejects negatives. */
  allowNegative?: boolean
}

/**
 * Parse typed length → cm, then clamp.
 * Invalid / empty → null (caller keeps previous cm; unit switch never calls this).
 */
export function parseAndClampScaleLengthCm(
  raw: string,
  unit: ScaleInputUnit,
  opts: ScaleLengthClampOptions = {},
): number | null {
  const parsed = parseScaleInput(raw, unit)
  if (parsed == null || !Number.isFinite(parsed)) return null
  if (!opts.allowNegative && parsed < 0) return null
  if (!opts.allowZero && !opts.allowNegative && parsed <= 0) return null
  if (opts.allowZero && parsed < 0 && !opts.allowNegative) return null

  let cm = parsed
  if (opts.minCm != null && Number.isFinite(opts.minCm)) cm = Math.max(opts.minCm, cm)
  if (opts.maxCm != null && Number.isFinite(opts.maxCm)) cm = Math.min(opts.maxCm, cm)
  return cm
}

/** Display string for an idle length field (no suffix). */
export function formatScaleLengthField(cm: number, unit: ScaleInputUnit): string {
  return formatScaleInputValue(cm, unit)
}

/** Stored-cm delta for −/+ / pijltjes (settings `unitSystem`, niet display-unit). */
export function scaleLengthStepCm(unitSystem: UnitSystem): number {
  return unitSystem === 'imperial'
    ? CM_PER_INCH * SCALE_LENGTH_STEP_IMPERIAL_IN
    : SCALE_LENGTH_STEP_METRIC_CM
}

function clampScaleLengthCm(cm: number, opts: ScaleLengthClampOptions): number {
  let next = cm
  if (!opts.allowNegative && next < 0) next = 0
  if (!opts.allowZero && !opts.allowNegative && next <= 0) next = opts.minCm ?? 1
  if (opts.minCm != null && Number.isFinite(opts.minCm)) next = Math.max(opts.minCm, next)
  if (opts.maxCm != null && Number.isFinite(opts.maxCm)) next = Math.min(opts.maxCm, next)
  return next
}

/** −/+ : huidige cm ± stap, daarna dezelfde clamp als typen. */
export function stepScaleLengthCm(
  cm: number,
  unitSystem: UnitSystem,
  direction: 1 | -1,
  opts: ScaleLengthClampOptions = {},
): number {
  const base = Number.isFinite(cm) ? cm : 0
  return clampScaleLengthCm(base + direction * scaleLengthStepCm(unitSystem), opts)
}
