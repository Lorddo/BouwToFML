/**
 * Display-kozijn: zit in opening.width / z_height (FML-gat krimpt niet).
 * Catalogus + optioneel `opening.frame`; niet uit detectie-framingPx.
 * Dakraam gebruikt hetzelfde typed veld op `item.frame`.
 */
import type { FloorItem, Opening } from './types'
import type { OpeningCatalogInfo, OpeningFrameCm } from './opening-refid-catalog'
import { defaultOpeningFrame, resolveOpeningKind } from './opening-kind-catalog'

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

function readFrameRaw(raw: unknown): OpeningFrameCm | null {
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

/**
 * Instance `opening.frame` wint; anders catalogus (kind-default).
 * Geen extras-fallback — kozijn leeft alleen op het typed veld.
 */
export function resolveOpeningFrame(
  opening: Pick<Opening, 'frame'> | null | undefined,
  catalog: Pick<OpeningCatalogInfo, 'frame'>,
): OpeningFrameCm {
  const typed = opening ? readFrameRaw(opening.frame) : null
  return typed ?? catalog.frame
}

/** Effectief frame voor UI/glyph: instance of kind-catalogus. */
export function effectiveOpeningFrame(
  opening: Pick<Opening, 'kind' | 'frame'> | null | undefined,
): OpeningFrameCm {
  const catalog = resolveOpeningKind(opening?.kind)
  return resolveOpeningFrame(opening, catalog)
}

/** True als dit kind geen kozijnbanden toont (passage/boog). */
export function isFramelessOpeningKind(kind: string | undefined | null): boolean {
  const glyph = resolveOpeningKind(kind).glyph
  return glyph === 'passage' || glyph === 'archway'
}

/** Clamp + normaliseer voor schrijven naar opening.frame. */
export function normalizeOpeningFrame(frame: OpeningFrameCm): OpeningFrameCm {
  return {
    leftCm: Math.max(0, Math.round(frame.leftCm)),
    rightCm: Math.max(0, Math.round(frame.rightCm)),
    topCm: Math.max(0, Math.round(frame.topCm)),
    bottomCm: Math.max(0, Math.round(frame.bottomCm)),
  }
}

/**
 * Bouw een frame-patch: merge één of meer kanten over de huidige effectieve waarden,
 * clamp tegen gat-maten, schrijf altijd alle vier.
 */
export function buildOpeningFramePatch(
  opening: Pick<Opening, 'kind' | 'frame' | 'width' | 'z_height' | 'type'>,
  partial: Partial<OpeningFrameCm>,
): OpeningFrameCm {
  const base = effectiveOpeningFrame(opening)
  const merged: OpeningFrameCm = {
    leftCm: partial.leftCm ?? base.leftCm,
    rightCm: partial.rightCm ?? base.rightCm,
    topCm: partial.topCm ?? base.topCm,
    bottomCm: partial.bottomCm ?? base.bottomCm,
  }
  const width = Math.max(1, opening.width)
  const height =
    typeof opening.z_height === 'number' && Number.isFinite(opening.z_height)
      ? Math.max(1, opening.z_height)
      : 220
  const inset = insetOpeningRect({ width, height }, merged)
  return normalizeOpeningFrame(inset.frame)
}

/** Raam-default (5 cm rondom) — dakraam heeft geen eigen kind-catalogus. */
export function defaultSkylightFrame(): OpeningFrameCm {
  return defaultOpeningFrame('window', 'single')
}

/** Instance `item.frame` wint; anders raam-default. */
export function effectiveSkylightFrame(
  item: Pick<FloorItem, 'frame'> | null | undefined,
): OpeningFrameCm {
  return resolveOpeningFrame(item, { frame: defaultSkylightFrame() })
}

/** Merge + clamp tegen footprint (width × height). */
export function buildSkylightFramePatch(
  item: Pick<FloorItem, 'frame' | 'width' | 'height'>,
  partial: Partial<OpeningFrameCm>,
): OpeningFrameCm {
  const base = effectiveSkylightFrame(item)
  const merged: OpeningFrameCm = {
    leftCm: partial.leftCm ?? base.leftCm,
    rightCm: partial.rightCm ?? base.rightCm,
    topCm: partial.topCm ?? base.topCm,
    bottomCm: partial.bottomCm ?? base.bottomCm,
  }
  const inset = insetOpeningRect(
    { width: Math.max(1, item.width), height: Math.max(1, item.height) },
    merged,
  )
  return normalizeOpeningFrame(inset.frame)
}
