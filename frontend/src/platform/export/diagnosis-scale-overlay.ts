import type { HScaleState } from '@/platform/calibration'
import { SCALE_AXIS_MISMATCH_WARN_PCT } from '@/platform/calibration'
import { escapeHtml } from './examples-report-html-utils'

/** Live H/V schaallinialen (zelfde coords als de stap-1 onderlegger). */
export type DiagnosisScaleOverlay = {
  state: HScaleState
  distanceMmX: number
  distanceMmY: number
  pxDistanceX: number
  pxDistanceY: number
  pxPerMmX: number
  pxPerMmY: number
  confirmed: boolean
  axisMismatchPct: number
}

const COLOR_H = '#0ea5e9'
const COLOR_H_HANDLE = '#0284c7'
const COLOR_V = '#f59e0b'
const COLOR_V_HANDLE = '#d97706'

function fmtMm(mm: number): string {
  if (!Number.isFinite(mm)) return '—'
  return Number.isInteger(mm) ? `${mm} mm` : `${mm.toFixed(1)} mm`
}

function fmtPx(px: number): string {
  if (!Number.isFinite(px)) return '—'
  return `${px.toFixed(1)} px`
}

function fmtCoord(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function formatScaleAxisLabel(axis: 'H' | 'V', mm: number, px: number): string {
  return `${axis} ${fmtMm(mm)} · ${fmtPx(px)}`
}

export function formatScaleMismatch(pct: number): string | null {
  if (!(pct >= SCALE_AXIS_MISMATCH_WARN_PCT)) return null
  if (pct >= 100) return `${(pct / 100 + 1).toFixed(1)}×`
  return `${pct.toFixed(1)}%`
}

/**
 * SVG overlay in beeldpixels — zelfde H (cyaan) / V (amber) als FloorplanScaleOverlayLayer.
 */
export function buildScaleRulerSvg(
  overlay: DiagnosisScaleOverlay,
  width: number,
  height: number,
): string {
  if (!(width > 0) || !(height > 0)) return ''
  const { state } = overlay
  const minDim = Math.min(width, height)
  const handleR = Math.max(20, Math.round(minDim * 0.012))
  const fontSize = Math.max(32, Math.round(minDim * 0.022))
  const strokeHalo = Math.max(8, Math.round(fontSize * 0.22))

  const hLabel = escapeHtml(formatScaleAxisLabel('H', overlay.distanceMmX, overlay.pxDistanceX))
  const vLabel = escapeHtml(formatScaleAxisLabel('V', overlay.distanceMmY, overlay.pxDistanceY))

  const hx = (state.xLeft + state.xRight) / 2
  const hy = Math.max(fontSize * 1.15, Math.min(height - 8, state.xGuideY - fontSize * 0.7))
  const vx = Math.max(8, Math.min(width - 8, state.yGuideX + handleR + fontSize * 0.35))
  const vy = (state.yTop + state.yBottom) / 2

  const textHalo = `stroke="#fff" stroke-width="${strokeHalo}" paint-order="stroke fill" fill="#0f172a"`

  return `<svg class="scale-overlay" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <line x1="${fmtCoord(state.xLeft)}" y1="0" x2="${fmtCoord(state.xLeft)}" y2="${height}" stroke="${COLOR_H}" stroke-width="3" vector-effect="non-scaling-stroke" />
  <line x1="${fmtCoord(state.xRight)}" y1="0" x2="${fmtCoord(state.xRight)}" y2="${height}" stroke="${COLOR_H}" stroke-width="3" vector-effect="non-scaling-stroke" />
  <line x1="${fmtCoord(state.xLeft)}" y1="${fmtCoord(state.xGuideY)}" x2="${fmtCoord(state.xRight)}" y2="${fmtCoord(state.xGuideY)}" stroke="${COLOR_H}" stroke-width="4" vector-effect="non-scaling-stroke" />
  <line x1="0" y1="${fmtCoord(state.yTop)}" x2="${width}" y2="${fmtCoord(state.yTop)}" stroke="${COLOR_V}" stroke-width="3" vector-effect="non-scaling-stroke" />
  <line x1="0" y1="${fmtCoord(state.yBottom)}" x2="${width}" y2="${fmtCoord(state.yBottom)}" stroke="${COLOR_V}" stroke-width="3" vector-effect="non-scaling-stroke" />
  <line x1="${fmtCoord(state.yGuideX)}" y1="${fmtCoord(state.yTop)}" x2="${fmtCoord(state.yGuideX)}" y2="${fmtCoord(state.yBottom)}" stroke="${COLOR_V}" stroke-width="4" vector-effect="non-scaling-stroke" />
  <circle cx="${fmtCoord(state.xLeft)}" cy="${fmtCoord(state.xGuideY)}" r="${handleR}" fill="${COLOR_H_HANDLE}" />
  <circle cx="${fmtCoord(state.xRight)}" cy="${fmtCoord(state.xGuideY)}" r="${handleR}" fill="${COLOR_H_HANDLE}" />
  <circle cx="${fmtCoord(state.yGuideX)}" cy="${fmtCoord(state.yTop)}" r="${handleR}" fill="${COLOR_V_HANDLE}" />
  <circle cx="${fmtCoord(state.yGuideX)}" cy="${fmtCoord(state.yBottom)}" r="${handleR}" fill="${COLOR_V_HANDLE}" />
  <text x="${fmtCoord(hx)}" y="${fmtCoord(hy)}" text-anchor="middle" font-size="${fontSize}" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700" ${textHalo}>${hLabel}</text>
  <text x="${fmtCoord(vx)}" y="${fmtCoord(vy)}" text-anchor="start" dominant-baseline="middle" font-size="${fontSize}" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700" ${textHalo}>${vLabel}</text>
</svg>`
}
