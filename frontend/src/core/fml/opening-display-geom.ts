/**
 * Display-kozijn: zit in opening.width / z_height (FML-gat krimpt niet).
 * Catalogus + optioneel extras.btfFrame; niet uit detectie-framingPx.
 */
import type { Opening } from './types'
import type { OpeningCatalogInfo, OpeningFrameCm } from './opening-refid-catalog'

export const BTF_FRAME_EXTRA = 'btfFrame'
export const OPENING_FRAME_MIN_INNER_CM = 1

export type { OpeningFrameCm }

export function clampFramePair(
  aCm: number,
  bCm: number,
  totalCm: number,
  minInnerCm = OPENING_FRAME_MIN_INNER_CM,
): [number, number] {
  const a = Math.max(0, aCm)
  const b = Math.max(0, bCm)
  if (!(totalCm > 0)) return [0, 0]
  if (totalCm <= minInnerCm) return [0, 0]
  const inner = totalCm - a - b
  if (inner >= minInnerCm) return [a, b]
  const sum = a + b
  if (sum <= 1e-6) return [0, 0]
  const scale = (totalCm - minInnerCm) / sum
  return [a * scale, b * scale]
}

export function insetOpeningRect(
  outer: { width: number; height: number },
  frame: OpeningFrameCm,
): { frame: OpeningFrameCm; inner: { width: number; height: number } } {
  const [leftCm, rightCm] = clampFramePair(frame.leftCm, frame.rightCm, outer.width)
  const [topCm, bottomCm] = clampFramePair(frame.topCm, frame.bottomCm, outer.height)
  return {
    frame: { leftCm, rightCm, topCm, bottomCm },
    inner: {
      width: Math.max(0, outer.width - leftCm - rightCm),
      height: Math.max(0, outer.height - topCm - bottomCm),
    },
  }
}

function readBtfFrame(raw: unknown): OpeningFrameCm | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const pick = (key: string): number | null => {
    const value = rec[key]
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null
  }
  const leftCm = pick('leftCm')
  const rightCm = pick('rightCm')
  const topCm = pick('topCm')
  const bottomCm = pick('bottomCm')
  if (leftCm == null && rightCm == null && topCm == null && bottomCm == null) return null
  return {
    leftCm: leftCm ?? 0,
    rightCm: rightCm ?? 0,
    topCm: topCm ?? 0,
    bottomCm: bottomCm ?? 0,
  }
}

/** Instance extras.btfFrame wint; anders catalogus (kind-default al ingevuld). */
export function resolveOpeningFrame(
  opening: Pick<Opening, 'extras'> | null | undefined,
  catalog: Pick<OpeningCatalogInfo, 'frame'>,
): OpeningFrameCm {
  const override = readBtfFrame(opening?.extras?.[BTF_FRAME_EXTRA])
  return override ?? catalog.frame
}
