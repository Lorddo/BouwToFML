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
  stroke: string
  fill: string
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
  const stroke = '#475569'
  const fill = '#e2e8f0'

  switch (kind) {
    case 'countertop':
      return {
        rects: [[-w / 2, -h / 2, w, h]],
        ellipses: [],
        circles: [],
        polylines: [],
        stroke,
        fill: '#f8fafc',
      }
    case 'toilet': {
      const tankH = h * 0.28
      const bowlRy = h * 0.32
      return {
        rects: [[-w * 0.38, -h / 2, w * 0.76, tankH]],
        ellipses: [[0, -h / 2 + tankH + bowlRy * 0.85, w * 0.32, bowlRy]],
        circles: [],
        polylines: [],
        stroke,
        fill,
      }
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
      return {
        rects: [],
        ellipses: [],
        circles: [[0, flatY, faucetR]],
        polylines: [points],
        stroke,
        fill,
      }
    }
    case 'shower_head': {
      // Lokaal 180° t.o.v. gewenste weergave: Floorplanner-items hebben vaak rotation:180.
      const oldHeadR = Math.min(w, h) * 0.22
      const headR = oldHeadR * 1.3
      const headY = -h * 0.34
      const plateY = h * 0.4
      const plateHalf = oldHeadR
      return {
        rects: [],
        ellipses: [],
        circles: [[0, headY, headR]],
        polylines: [
          [-plateHalf, plateY, plateHalf, plateY],
          [0, plateY, 0, headY + headR],
        ],
        stroke,
        fill,
      }
    }
    case 'sink_large': {
      const inset = Math.min(w, h) * 0.08
      return {
        rects: [[-w / 2 + inset, -h / 2 + inset, w - inset * 2, h - inset * 2]],
        ellipses: [],
        circles: [[0, -h / 2 + inset * 2.2, Math.min(w, h) * 0.05]],
        polylines: [],
        stroke,
        fill: '#f1f5f9',
      }
    }
    case 'boiler': {
      const r = Math.min(w, h) * 0.12
      return {
        rects: [[-w / 2, -h / 2, w, h]],
        ellipses: [],
        circles: [
          [-w * 0.18, 0, r],
          [w * 0.18, 0, r],
        ],
        polylines: [],
        stroke,
        fill,
      }
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
      return {
        rects: [[-w / 2, -h / 2, w, h]],
        ellipses: [],
        circles: [],
        polylines: lines,
        stroke,
        fill,
      }
    }
    default:
      return {
        rects: [[-w / 2, -h / 2, w, h]],
        ellipses: [],
        circles: [],
        polylines: [],
        stroke,
        fill,
      }
  }
}
