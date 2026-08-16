import type { FixtureAssetKind } from './fixture-refid-catalog'

export interface FixtureSymbolShape {
  /** Gefillde rechthoeken [x, y, w, h] in lokale cm (origine = item-midden). */
  rects: number[][]
  /** Ellipsen [cx, cy, rx, ry]. */
  ellipses: number[][]
  /** Circles [cx, cy, r]. */
  circles: number[][]
  /** Polyline-punten [x0,y0,x1,y1,...]. */
  polylines: number[][]
  /** Pijl-polylines (eigen stroke); leeg = geen. */
  arrowPolylines?: number[][]
  stroke: string
  fill: string
  /** Override voor circles (spil, schoorsteen-opening). */
  circleFill?: string
  /** Schermpixels; caller deelt door cm→stage-schaal. */
  strokeWidth?: number
  arrowStrokeWidth?: number
  /** Schermpixels dash-array; caller deelt door cm→stage-schaal. */
  dash?: number[]
  /**
   * true = boven muurfill (dak/gevel-symbolen).
   * false = onder muurfill zodat flush-meubels niet door de muur steken.
   */
  overWalls: boolean
}

const STROKE = '#475569'
const FILL = '#e2e8f0'

function emptyShape(
  partial: Partial<FixtureSymbolShape> & Pick<FixtureSymbolShape, 'overWalls'>,
): FixtureSymbolShape {
  return {
    rects: [],
    ellipses: [],
    circles: [],
    polylines: [],
    arrowPolylines: [],
    stroke: STROKE,
    fill: FILL,
    ...partial,
  }
}

/** Meubels tegen een flush-muur (balance=0) overlappen de muurdikte — muren tekenen we eroverheen. */
function isFurnitureKind(kind: FixtureAssetKind): boolean {
  return (
    kind === 'countertop' ||
    kind === 'toilet' ||
    kind === 'sink_small' ||
    kind === 'sink_large' ||
    kind === 'shower_head' ||
    kind === 'stair_winder_180' ||
    kind === 'roof_eave'
  )
}

/** Straal vanuit (ox,oy) tot de binnenrand van de item-bbox (Y omlaag). */
function rayToRect(
  ox: number,
  oy: number,
  ang: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): { x: number; y: number } {
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  let t = 1e6
  if (dx > 1e-9) t = Math.min(t, (maxX - ox) / dx)
  if (dx < -1e-9) t = Math.min(t, (minX - ox) / dx)
  if (dy > 1e-9) t = Math.min(t, (maxY - oy) / dy)
  if (dy < -1e-9) t = Math.min(t, (minY - oy) / dy)
  return { x: ox + dx * t, y: oy + dy * t }
}

function stairWinder180(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  const inset = Math.min(w, h) * 0.03
  const minX = -hw + inset
  const maxX = hw
  const minY = -hh + inset
  const maxY = hh - inset
  /**
   * Lokale asset-ruimte (rot=0, mirrored=[0,0]):
   * spil op de lange +X-rand (onzichtbaar), treden stralen daarvandaan over −X.
   * Mooiland rot=180 + mirrored[1]=1 ⇒ X-spiegel: spil links, brede treden rechts.
   */
  const newelX = hw
  const newelY = 0
  const polylines: number[][] = []

  const winderN = 12
  const aStart = -Math.PI / 2 - 0.1
  const aEnd = -1.5 * Math.PI + 0.1
  for (let i = 0; i <= winderN; i += 1) {
    const a = aStart + (i / winderN) * (aEnd - aStart)
    const outer = rayToRect(newelX, newelY, a, minX, maxX, minY, maxY)
    polylines.push([newelX, newelY, outer.x, outer.y])
  }

  const longX = -hw * 0.34
  const yBottom = hh * 0.46
  const yTop = -hh * 0.46
  const short = Math.min(w * 0.28, hw * 0.55)
  const tipX = longX + short
  const head = Math.min(w, h) * 0.055
  const arrowPolylines = [
    [0, yBottom, longX, yBottom, longX, yTop, tipX, yTop],
    [tipX - head, yTop - head, tipX, yTop, tipX - head, yTop + head],
  ]

  return emptyShape({
    rects: [[-hw, -hh, w, h]],
    polylines,
    arrowPolylines,
    stroke: '#334155',
    fill: '#f1f5f9',
    strokeWidth: 0.55,
    arrowStrokeWidth: 1.15,
    overWalls: false,
  })
}

function railing(w: number, h: number): FixtureSymbolShape {
  const alongW = w >= h
  const along = alongW ? w : h
  const across = alongW ? h : w
  const n = Math.max(4, Math.round(along / 14))
  const polylines: number[][] = []
  for (let i = 1; i < n; i += 1) {
    const t = -along / 2 + (i / n) * along
    if (alongW) polylines.push([t, -across / 2, t, across / 2])
    else polylines.push([-across / 2, t, across / 2, t])
  }
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines,
    stroke: '#0f172a',
    fill: 'transparent',
    strokeWidth: 2.2,
    overWalls: true,
  })
}

function chimney(w: number, h: number): FixtureSymbolShape {
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
 * Eenvoudige top-view symbolen voor FML-import (geen place-tool).
 * Coördinaten in cm, gecentreerd op (0,0); caller past rotatie/spiegeling toe.
 */
export function buildFixtureSymbol(
  kind: FixtureAssetKind,
  widthCm: number,
  heightCm: number,
): FixtureSymbolShape {
  const w = Math.max(8, widthCm)
  const h = Math.max(8, heightCm)
  const overWalls = !isFurnitureKind(kind)

  switch (kind) {
    case 'countertop':
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        stroke: STROKE,
        fill: '#f8fafc',
        overWalls: false,
      })
    case 'toilet': {
      const tankH = h * 0.24
      const bowlRy = (h - tankH) / 2
      const bowlCy = -h / 2 + tankH + bowlRy
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, tankH]],
        ellipses: [[0, bowlCy, w * 0.48, bowlRy]],
        overWalls: false,
      })
    }
    case 'sink_small': {
      // Halve cirkel, platte kant boven; iets dieper + kraan op midden van platte zijde.
      const rx = w * 0.42
      const ry = h * 0.52
      const flatY = -ry * 0.2
      const faucetR = Math.min(w, h) * 0.06
      const points: number[] = [-rx, flatY]
      const samples = 16
      for (let i = 0; i <= samples; i += 1) {
        const a = (i / samples) * Math.PI
        points.push(rx * Math.cos(a), flatY + ry * Math.sin(a))
      }
      points.push(-rx, flatY)
      return emptyShape({
        circles: [[0, flatY, faucetR]],
        polylines: [points],
        overWalls: false,
      })
    }
    case 'shower_head': {
      // Wandzijde = lokale +Y (bbox-rand). FML rot/mirror zet die rand op de muur;
      // muurfill dekt overlap, de steel komt visueel tot de binnenkant.
      const headR = Math.min(w, h) * 0.28
      const plateY = h / 2
      const headY = -h / 2 + headR * 1.1
      const plateHalf = w * 0.42
      return emptyShape({
        circles: [[0, headY, headR]],
        polylines: [
          [-plateHalf, plateY, plateHalf, plateY],
          [0, plateY, 0, headY + headR],
        ],
        overWalls: false,
      })
    }
    case 'sink_large': {
      // Volle bbox — geen inset, anders een spleet tot de muur (item-rand ligt al flush).
      const faucetR = Math.min(w, h) * 0.055
      const faucetY = h / 2 - Math.min(w, h) * 0.16
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        circles: [[0, faucetY, faucetR]],
        fill: '#f1f5f9',
        overWalls: false,
      })
    }
    case 'boiler': {
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
    case 'heat_pump': {
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
    case 'stair_winder_180':
      return stairWinder180(w, h)
    case 'canopy':
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        stroke: '#475569',
        fill: '#94a3b8',
        dash: [5, 4],
        strokeWidth: 0.65,
        overWalls: true,
      })
    case 'chimney':
      return chimney(w, h)
    case 'railing':
      return railing(w, h)
    case 'skylight':
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        stroke: '#60a5fa',
        fill: '#dbeafe',
        dash: [8, 5],
        strokeWidth: 1.6,
        overWalls: true,
      })
    case 'roof_eave':
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        stroke: '#94a3b8',
        fill: '#f8fafc',
        overWalls: false,
      })
    case 'hidden':
      return emptyShape({ overWalls: true })
    case 'standpipe': {
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
    default:
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        overWalls,
      })
  }
}
