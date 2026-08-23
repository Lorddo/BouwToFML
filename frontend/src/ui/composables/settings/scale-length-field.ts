/**
 * Shared parse/clamp for length fields that display via scaleInputUnit
 * but store cm-float. Unit switch never rewrites stored cm — only typing does.
 */

import { formatScaleInputValue, parseScaleInput, type ScaleInputUnit } from './scale-input-unit'

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
