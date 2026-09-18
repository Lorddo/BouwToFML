import { RAIL_BAY_CM } from '../fixture-place-defaults'
import {
  effectiveSkylightFrame,
  insetOpeningRect,
  type OpeningFrameCm,
} from '../opening-display-geom'
import { emptyShape, type FixtureSymbolShape } from './types'

function railStripLayout(widthCm: number, heightCm: number) {
  const w = Math.max(0.8, widthCm)
  const h = Math.max(0.8, heightCm)
  const alongW = w >= h
  const along = alongW ? w : h
  const across = alongW ? h : w
  const nBays = Math.max(1, Math.round(along / RAIL_BAY_CM))
  const post = Math.min(2.8, Math.max(1.2, along * 0.04))
  const halfA = along / 2
  const halfC = across / 2
  const posts: number[][] = []
  for (let i = 0; i <= nBays; i += 1) {
    const alongPos = -halfA + (i / nBays) * along
    const origin = alongPos - (i === 0 ? 0 : i === nBays ? post : post / 2)
    if (alongW) posts.push([origin, -halfC, post, across])
    else posts.push([-halfC, origin, across, post])
  }
  return { w, h, alongW, along, across, nBays, post, halfA, halfC, posts }
}

export function glassWall(widthCm: number, heightCm: number): FixtureSymbolShape {
  const w = Math.max(0.8, widthCm)
  const h = Math.max(0.8, heightCm)
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    stroke: '#38bdf8',
    fill: '#e0f2fe',
    strokeWidth: 1.4,
    overWalls: true,
  })
}

export function doorbell(w: number, h: number): FixtureSymbolShape {
  const r = Math.min(w, h) * 0.28
  const cy = -h * 0.08
  const ringR = r * 0.72
  const ringCy = cy + r + ringR * 0.85
  const topR = r * 0.22
  const topCy = cy - r - topR * 0.35
  return emptyShape({
    circles: [
      [0, topCy, topR],
      [0, cy, r],
      [0, ringCy, ringR],
    ],
    polylines: [[0, cy - r, 0, ringCy + ringR]],
    stroke: '#0f172a',
    fill: 'transparent',
    circleFill: 'transparent',
    strokeWidth: 1.6,
    overWalls: true,
  })
}

export function entranceArrow(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  // Punt langs lokale +X — Floorplanner-rotatie zet die as op de deurrichting.
  return emptyShape({
    fillPolygons: [[hw, 0, -hw, hh, -hw, -hh]],
    stroke: '#0f172a',
    fill: '#0f172a',
    overWalls: true,
  })
}

export function northCross(w: number, h: number): FixtureSymbolShape {
  const hh = h / 2
  const headH = h * 0.26
  const headW = w * 0.7
  const apexY = -hh
  const baseY = -hh + headH
  const r = Math.min(w, h) * 0.2
  const cy = baseY + r * 1.08
  const shaftW = w * 0.12
  const shaftTop = cy + r * 0.92
  const shaftBot = hh * 0.92
  const nT = cy - r * 0.48
  const nB = cy + r * 0.48
  const nL = -r * 0.38
  const nR = r * 0.38
  return emptyShape({
    fillPolygons: [[0, apexY, headW / 2, baseY, -headW / 2, baseY]],
    rects: [[-shaftW / 2, shaftTop, shaftW, shaftBot - shaftTop]],
    circles: [[0, cy, r]],
    polylines: [
      [nL, nB, nL, nT],
      [nL, nT, nR, nB],
      [nR, nB, nR, nT],
    ],
    stroke: '#0f172a',
    fill: '#0f172a',
    circleFill: 'transparent',
    strokeWidth: 1.6,
    overWalls: true,
  })
}

export function fuseBox(w: number, h: number): FixtureSymbolShape {
  const r = Math.min(w, h) * 0.28
  const switchY = -h / 2 + r * 0.15
  const span = w * 0.28
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles: [
      [-span, switchY, r],
      [0, switchY, r],
      [span, switchY, r],
    ],
    stroke: '#0f172a',
    fill: '#1e293b',
    circleFill: '#cbd5e1',
    cornerRadius: Math.min(w, h) * 0.18,
    overWalls: false,
  })
}

export function railing(
  w: number,
  h: number,
  stroke = '#0f172a',
  strokeWidth = 2.2,
): FixtureSymbolShape {
  const { alongW, along, nBays, halfA, halfC, posts } = railStripLayout(w, h)
  // Zelfde vakken als glashek (~40 cm). Open aan +across: bovenregel + 2 spijlen per vak.
  const polylines: number[][] = alongW
    ? [[-halfA, -halfC, halfA, -halfC]]
    : [[-halfC, -halfA, -halfC, halfA]]
  for (let bay = 0; bay < nBays; bay += 1) {
    const start = -halfA + (bay / nBays) * along
    const span = along / nBays
    for (const frac of [1 / 3, 2 / 3]) {
      const t = start + span * frac
      if (alongW) polylines.push([t, -halfC, t, halfC])
      else polylines.push([-halfC, t, halfC, t])
    }
  }
  return emptyShape({
    rects: posts,
    polylines,
    stroke,
    fill: stroke,
    strokeWidth,
    overWalls: true,
  })
}

export function koof(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  return emptyShape({
    rects: [[-hw, -hh, w, h]],
    polylines: [
      [-hw, -hh, hw, hh],
      [-hw, hh, hw, -hh],
    ],
    stroke: '#0f172a',
    fill: '#f8fafc',
    strokeWidth: 1.4,
    overWalls: true,
  })
}

export function column(w: number, h: number): FixtureSymbolShape {
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    stroke: '#0f172a',
    fill: '#94a3b8',
    strokeWidth: 1.6,
    overWalls: true,
  })
}

export function columnRound(w: number, h: number): FixtureSymbolShape {
  const r = Math.min(w, h) / 2
  return emptyShape({
    circles: [[0, 0, r]],
    stroke: '#0f172a',
    fill: '#94a3b8',
    circleFill: '#94a3b8',
    strokeWidth: 1.6,
    overWalls: true,
  })
}

export function chimney(w: number, h: number): FixtureSymbolShape {
  const r = Math.min(w, h) * 0.22
  const arm = r * 0.72
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles: [[0, 0, r]],
    polylines: [
      [-arm, -arm, arm, arm],
      [-arm, arm, arm, -arm],
    ],
    stroke: '#0f172a',
    fill: '#f8fafc',
    circleFill: 'transparent',
    strokeWidth: 2.6,
    overWalls: true,
  })
}

/**
 * Dakkapel: U van muren, open naar de kamer (lokale −Y).
 * Buitenmuur op lokale +Y (FML rot/mirror zet die rand op de gevel) met 2 ramen.
 */
export function dormer(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  const t = Math.min(Math.max(h * 0.36, 5.5), Math.min(12, h * 0.48))
  const innerLeft = -hw + t
  const innerRight = hw - t
  const innerSpan = Math.max(16, innerRight - innerLeft)
  const sideJamb = Math.min(3, Math.max(1.6, innerSpan * 0.015))
  const centerPier = Math.min(6, Math.max(3, innerSpan * 0.04))
  const winW = Math.max(4, (innerSpan - 2 * sideJamb - centerPier) / 2)
  const outerTop = hh - t
  const xWin0 = innerLeft + sideJamb
  const xPier1 = xWin0 + winW
  const xWin1 = xPier1 + centerPier
  const xPier2 = xWin1 + winW
  const glassY0 = outerTop + t * 0.32
  const glassY1 = outerTop + t * 0.68
  return emptyShape({
    rects: [
      [-hw, -hh, t, h],
      [hw - t, -hh, t, h],
      [innerLeft, outerTop, sideJamb, t],
      [xPier1, outerTop, centerPier, t],
      [xPier2, outerTop, sideJamb, t],
    ],
    polylines: [
      [xWin0, glassY0, xWin0 + winW, glassY0],
      [xWin0, glassY1, xWin0 + winW, glassY1],
      [xWin1, glassY0, xWin1 + winW, glassY0],
      [xWin1, glassY1, xWin1 + winW, glassY1],
    ],
    stroke: '#0f172a',
    fill: '#111827',
    strokeWidth: 0.9,
    overWalls: true,
  })
}

export function boiler(w: number, h: number): FixtureSymbolShape {
  const r = Math.min(w, h) * 0.12
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles: [
      [-w * 0.18, 0, r],
      [w * 0.18, 0, r],
    ],
    overWalls: true,
  })
}

export function heatPump(w: number, h: number): FixtureSymbolShape {
  const grillTop = -h * 0.42
  const grillBottom = -h * 0.05
  const lines: number[][] = []
  const n = 5
  for (let i = 0; i < n; i += 1) {
    const x = -w * 0.32 + (i / (n - 1)) * w * 0.64
    lines.push([x, grillTop, x, grillBottom])
  }
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines: lines,
    overWalls: true,
  })
}

/** Hawaii-luifel: gestreept doek, geen beton-afdak. */
export function awning(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  const n = Math.max(4, Math.round(w / 16))
  const stripes: number[][] = []
  for (let i = 1; i < n; i += 1) {
    const x = -hw + (i / n) * w
    stripes.push([x, -hh, x, hh])
  }
  return emptyShape({
    rects: [[-hw, -hh, w, h]],
    polylines: stripes,
    stroke: '#b45309',
    fill: '#fde68a',
    strokeWidth: 1.2,
    overWalls: true,
  })
}

export function canopy(w: number, h: number): FixtureSymbolShape {
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    stroke: '#475569',
    fill: '#94a3b8',
    dash: [5, 4],
    strokeWidth: 0.65,
    overWalls: true,
  })
}

export function skylight(w: number, h: number, frame?: OpeningFrameCm): FixtureSymbolShape {
  const resolved = insetOpeningRect({ width: w, height: h }, effectiveSkylightFrame({ frame }))
  const x0 = -w / 2
  const y0 = -h / 2
  const ix0 = x0 + resolved.frame.leftCm
  const iy0 = y0 + resolved.frame.topCm
  const ix1 = ix0 + resolved.inner.width
  const iy1 = iy0 + resolved.inner.height
  const outer: number[] = [x0, y0, x0 + w, y0, x0 + w, y0 + h, x0, y0 + h, x0, y0]
  const inner: number[] = [ix0, iy0, ix1, iy0, ix1, iy1, ix0, iy1, ix0, iy0]
  const hasFrame =
    resolved.frame.leftCm > 0.2 ||
    resolved.frame.rightCm > 0.2 ||
    resolved.frame.topCm > 0.2 ||
    resolved.frame.bottomCm > 0.2
  return emptyShape({
    fillPolygons: [[ix0, iy0, ix1, iy0, ix1, iy1, ix0, iy1]],
    polylines: hasFrame ? [outer, inner] : [outer],
    stroke: '#60a5fa',
    fill: '#dbeafe',
    strokeWidth: 1.6,
    overWalls: true,
  })
}

export function roofEave(w: number, h: number): FixtureSymbolShape {
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    stroke: '#94a3b8',
    fill: '#f8fafc',
    overWalls: false,
  })
}

export function oilBottle(w: number, h: number): FixtureSymbolShape {
  const r = Math.min(w, h) / 2
  return emptyShape({
    circles: [
      [0, 0, r],
      [0, 0, r * 0.55],
    ],
    stroke: '#334155',
    fill: 'transparent',
    circleFill: 'transparent',
    strokeWidth: 1.25,
    overWalls: true,
  })
}

export function hidden(): FixtureSymbolShape {
  return emptyShape({ overWalls: true })
}

export function balustrade(widthCm: number, heightCm: number): FixtureSymbolShape {
  return railing(Math.max(0.8, widthCm), Math.max(0.8, heightCm), '#64748b', 0.95)
}

export function balustradeGlass(widthCm: number, heightCm: number): FixtureSymbolShape {
  const { w, h, posts } = railStripLayout(widthCm, heightCm)
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h], ...posts],
    stroke: '#0e7490',
    fill: '#e0f2fe',
    strokeWidth: 1.2,
    overWalls: true,
  })
}
