import type { SegmentRecord } from './examples-report-types'

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatJson(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2))
}

function segmentsSvgOverlay(
  segments: SegmentRecord[],
  width: number,
  height: number,
  stroke: string,
  dashed = false,
): string {
  if (segments.length === 0) return ''
  const dash = dashed ? ' stroke-dasharray="6 4"' : ''
  const lines = segments
    .map(
      (seg) =>
        `<line x1="${seg.a.x}" y1="${seg.a.y}" x2="${seg.b.x}" y2="${seg.b.y}" stroke="${stroke}" stroke-width="2"${dash} />`,
    )
    .join('')
  return `<svg class="overlay-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`
}

export function layeredFigure(
  underlayPng: string | undefined,
  overlayPng: string | undefined,
  caption: string,
  maxWidth = 360,
): string {
  if (!overlayPng) return ''
  if (!underlayPng) {
    return `<figure><img src="${overlayPng}" alt="${escapeHtml(caption)}" /><figcaption>${escapeHtml(caption)}</figcaption></figure>`
  }
  return `<figure class="overlay-figure">
    <div class="overlay-wrap" style="max-width:${maxWidth}px">
      <img src="${underlayPng}" alt="B/W onderlegger" />
      <img src="${overlayPng}" alt="${escapeHtml(caption)}" class="overlay-mask" />
    </div>
    <figcaption>${escapeHtml(caption)}</figcaption>
  </figure>`
}

export function variantOverlayFigure(
  basePng: string | undefined,
  segments: SegmentRecord[],
  width: number,
  height: number,
  stroke: string,
  caption: string,
  dashed = false,
): string {
  if (!basePng) return ''
  const overlay = segmentsSvgOverlay(segments, width, height, stroke, dashed)
  const maxW = Math.min(width, 720)
  return `<figure class="overlay-figure">
    <div class="overlay-wrap" style="max-width:${maxW}px;aspect-ratio:${width} / ${height}">
      <img src="${basePng}" alt="onderlegger" width="${width}" height="${height}" />
      ${overlay}
    </div>
    <figcaption>${escapeHtml(caption)}</figcaption>
  </figure>`
}
