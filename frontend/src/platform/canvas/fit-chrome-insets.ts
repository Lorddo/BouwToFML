/** Minimale ademruimte rond de tekening, ook zonder floating chrome. */
export const FIT_CONTENT_PAD = 24
/** Extra ruimte tussen chrome-rand en tekening. */
export const FIT_CHROME_GAP = 8

export type FitInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

export type FitChromeSide = 'top' | 'right' | 'bottom' | 'left'

export function emptyFitInsets(pad = FIT_CONTENT_PAD): FitInsets {
  return { top: pad, right: pad, bottom: pad, left: pad }
}

function isShownChrome(el: HTMLElement): boolean {
  if (el.hidden) return false
  const style = getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function parseFitChromeSide(value: string | null): FitChromeSide | null {
  if (value === 'top' || value === 'right' || value === 'bottom' || value === 'left') return value
  return null
}

/**
 * Host waarin floating canvas-chrome staat (topbar / toolbelt / mod-rail).
 * Workspace-toolbelt hangt naast `.canvas-wrap` in `.canvas-main`.
 */
export function resolveFitChromeHost(from: HTMLElement | null): HTMLElement | null {
  if (!from) return null
  return from.closest('.canvas-main') ?? from.closest('.fml-preview-wrap, .canvas-wrap') ?? from
}

/**
 * Meet `[data-fit-chrome=top|right|bottom|left]` t.o.v. de host.
 * Corner-widgets zonder attribuut tellen niet mee.
 */
export function measureFitChromeInsets(
  host: HTMLElement | null,
  pad = FIT_CONTENT_PAD,
  gap = FIT_CHROME_GAP,
): FitInsets {
  const insets = emptyFitInsets(pad)
  if (!host) return insets
  const hostRect = host.getBoundingClientRect()
  if (hostRect.width < 1 || hostRect.height < 1) return insets

  for (const node of host.querySelectorAll('[data-fit-chrome]')) {
    if (!(node instanceof HTMLElement)) continue
    const side = parseFitChromeSide(node.getAttribute('data-fit-chrome'))
    if (!side || !isShownChrome(node)) continue
    const rect = node.getBoundingClientRect()
    if (side === 'top') insets.top = Math.max(insets.top, rect.bottom - hostRect.top + gap)
    if (side === 'bottom') insets.bottom = Math.max(insets.bottom, hostRect.bottom - rect.top + gap)
    if (side === 'left') insets.left = Math.max(insets.left, rect.right - hostRect.left + gap)
    if (side === 'right') insets.right = Math.max(insets.right, hostRect.right - rect.left + gap)
  }
  return insets
}

/** Schaal + offset zodat content in de inset-rechthoek past en daar centreert. */
export function layoutInFitInsets(
  stageW: number,
  stageH: number,
  contentW: number,
  contentH: number,
  insets: FitInsets,
): { scale: number; x: number; y: number } {
  const availW = Math.max(1, stageW - insets.left - insets.right)
  const availH = Math.max(1, stageH - insets.top - insets.bottom)
  const scale = Math.min(availW / Math.max(1, contentW), availH / Math.max(1, contentH))
  return {
    scale,
    x: insets.left + (availW - contentW * scale) / 2,
    y: insets.top + (availH - contentH * scale) / 2,
  }
}
