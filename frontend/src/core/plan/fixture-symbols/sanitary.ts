import { emptyShape, FILL, type FixtureSymbolShape } from './types'

export function toiletWallHung(w: number, h: number): FixtureSymbolShape {
  const backY = -h / 2
  const bowlRy = h * 0.47
  const bowlCy = backY + h * 0.06 + bowlRy
  return emptyShape({
    ellipses: [[0, bowlCy, w * 0.48, bowlRy]],
    polylines: [[-w * 0.38, backY, w * 0.38, backY]],
    overWalls: false,
  })
}

/** ISO waskuip: trapezium (boven breder) + golvende waterlijn. */
function washTubPolylines(cx: number, cy: number, tw: number, th: number): number[][] {
  const topW = tw
  const botW = tw * 0.58
  const topY = cy - th * 0.38
  const botY = cy + th * 0.42
  const bucket = [
    cx - topW / 2,
    topY,
    cx + topW / 2,
    topY,
    cx + botW / 2,
    botY,
    cx - botW / 2,
    botY,
    cx - topW / 2,
    topY,
  ]
  const waveY = topY + th * 0.16
  const waveHalf = topW * 0.34
  const amp = th * 0.075
  const wave: number[] = []
  const n = 10
  for (let i = 0; i <= n; i += 1) {
    const t = i / n
    wave.push(cx - waveHalf + t * waveHalf * 2, waveY + Math.sin(t * Math.PI * 2) * amp)
  }
  return [bucket, wave]
}

function squareOutline(cx: number, cy: number, size: number): number[] {
  const h = size / 2
  return [cx - h, cy - h, cx + h, cy - h, cx + h, cy + h, cx - h, cy + h, cx - h, cy - h]
}

export function washingMachine(w: number, h: number): FixtureSymbolShape {
  const s = Math.min(w, h)
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines: washTubPolylines(0, 0, s * 0.62, s * 0.55),
    fill: FILL,
    overWalls: false,
  })
}

export function dryer(w: number, h: number): FixtureSymbolShape {
  const s = Math.min(w, h)
  const inner = s * 0.52
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines: [squareOutline(0, 0, inner)],
    circles: [[0, 0, inner * 0.28]],
    circleFill: 'transparent',
    fill: FILL,
    overWalls: false,
  })
}

/** Was-droog: kuip boven, droger (vierkant+cirkel) onder — zelfde ISO-iconen. */
export function washerDryer(w: number, h: number): FixtureSymbolShape {
  const s = Math.min(w, h)
  const tubY = -h * 0.22
  const dryY = h * 0.2
  const inner = s * 0.34
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines: [...washTubPolylines(0, tubY, s * 0.5, s * 0.32), squareOutline(0, dryY, inner)],
    circles: [[0, dryY, inner * 0.28]],
    circleFill: 'transparent',
    fill: FILL,
    overWalls: false,
  })
}

function stadiumPoly(
  cx: number,
  cy: number,
  halfStraight: number,
  r: number,
  samples = 12,
): number[] {
  const pts: number[] = []
  for (let i = 0; i <= samples; i += 1) {
    const a = -Math.PI / 2 + (i / samples) * Math.PI
    pts.push(cx + halfStraight + r * Math.cos(a), cy + r * Math.sin(a))
  }
  for (let i = 0; i <= samples; i += 1) {
    const a = Math.PI / 2 + (i / samples) * Math.PI
    pts.push(cx - halfStraight + r * Math.cos(a), cy + r * Math.sin(a))
  }
  pts.push(pts[0] ?? 0, pts[1] ?? 0)
  return pts
}

/**
 * Losstaand bad: stadium (rechte zijden + ronde koppen), kraan op lokale −Y
 * (FML rot 90 zet die zijde tegen de rechtermuur).
 */
/** Vierkant bad: rechthoekige kuip, kraan op lokale +X (rechter kopse kant). */
export function bathtubSquare(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  const inset = Math.min(w, h) * 0.12
  const faucetBand = Math.min(w, h) * 0.16
  const faucetX = hw - faucetBand * 0.45
  const spoutR = Math.min(w, h) * 0.045
  const knobR = spoutR * 0.72
  const knobSpan = Math.min(w, h) * 0.09
  return emptyShape({
    rects: [[-hw, -hh, w, h]],
    polylines: [
      [
        -hw + inset,
        -hh + inset,
        hw - inset,
        -hh + inset,
        hw - inset,
        hh - inset,
        -hw + inset,
        hh - inset,
        -hw + inset,
        -hh + inset,
      ],
    ],
    circles: [
      [faucetX, 0, spoutR],
      [faucetX, -knobSpan, knobR],
      [faucetX, knobSpan, knobR],
    ],
    fill: '#f8fafc',
    circleFill: 'transparent',
    overWalls: false,
  })
}

export function bathtub(w: number, h: number): FixtureSymbolShape {
  const faucetBand = Math.min(w, h) * 0.2
  const bodyH = h - faucetBand
  const r = bodyH / 2
  const halfStraight = Math.max(0, w / 2 - r)
  const cy = -h / 2 + faucetBand + r
  const innerScale = 0.72
  const innerR = r * innerScale
  const innerStraight = halfStraight * innerScale
  const faucetY = -h / 2 + faucetBand * 0.45
  const spoutR = Math.min(w, h) * 0.045
  const knobR = spoutR * 0.72
  const knobSpan = Math.min(w, h) * 0.09
  return emptyShape({
    fillPolygons: [stadiumPoly(0, cy, halfStraight, r)],
    polylines: [stadiumPoly(0, cy, halfStraight, r), stadiumPoly(0, cy, innerStraight, innerR)],
    circles: [
      [0, faucetY, spoutR],
      [-knobSpan, faucetY, knobR],
      [knobSpan, faucetY, knobR],
    ],
    fill: '#f8fafc',
    circleFill: 'transparent',
    overWalls: false,
  })
}

/**
 * Dubbele wastafel: blad + twee kommen. Wandzijde = lokale −Y
 * (FML rot 180 zet die rand op de muur onderin de badkamer).
 */
export function sinkDouble(w: number, h: number): FixtureSymbolShape {
  const wallY = -h / 2
  const basinR = Math.min(w * 0.14, h * 0.32)
  const span = w * 0.22
  const basinY = h * 0.06
  const faucetR = Math.min(w, h) * 0.055
  const faucetY = wallY + faucetR * 1.35
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles: [
      [-span, basinY, basinR],
      [span, basinY, basinR],
      [-span, faucetY, faucetR],
      [span, faucetY, faucetR],
    ],
    fill: '#f1f5f9',
    circleFill: 'transparent',
    overWalls: false,
  })
}

export function sinkVanity(w: number, h: number): FixtureSymbolShape {
  const wallY = -h / 2
  const roomY = h / 2
  const basinRx = w * 0.28
  const basinRy = h * 0.28
  const basinCy = roomY - basinRy - h * 0.06
  const faucetR = Math.min(w, h) * 0.07
  const faucetY = wallY + faucetR * 1.4
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    ellipses: [[0, basinCy, basinRx, basinRy]],
    circles: [[0, faucetY, faucetR]],
    fill: '#f8fafc',
    circleFill: 'transparent',
    stroke: '#334155',
    overWalls: false,
  })
}

export function toilet(w: number, h: number): FixtureSymbolShape {
  const tankH = h * 0.24
  const bowlRy = (h - tankH) / 2
  const bowlCy = -h / 2 + tankH + bowlRy
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, tankH]],
    ellipses: [[0, bowlCy, w * 0.48, bowlRy]],
    overWalls: false,
  })
}

export function sinkSmall(w: number, h: number): FixtureSymbolShape {
  // Halve cirkel, platte kant op lokale −Y-bbox (muur). Kom tot +Y zodat er geen spleet is.
  const flatY = -h / 2
  const rx = w * 0.48
  const ry = h
  const faucetR = Math.min(w, h) * 0.08
  const points: number[] = [-rx, flatY]
  const samples = 16
  for (let i = 0; i <= samples; i += 1) {
    const a = (i / samples) * Math.PI
    points.push(rx * Math.cos(a), flatY + ry * Math.sin(a))
  }
  points.push(-rx, flatY)
  return emptyShape({
    circles: [[0, flatY + faucetR, faucetR]],
    polylines: [points],
    overWalls: false,
  })
}

export function showerHead(w: number, h: number): FixtureSymbolShape {
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

export function sinkLarge(w: number, h: number): FixtureSymbolShape {
  // Plat vlak + kraan aan lokale −Y (bovenkant); kom naar +Y.
  const inset = Math.min(w, h) * 0.1
  const faucetSpace = Math.min(w, h) * 0.22
  const faucetR = Math.min(w, h) * 0.055
  const faucetY = -h / 2 + faucetSpace * 0.42
  const basinY = -h / 2 + faucetSpace
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles: [[0, faucetY, faucetR]],
    polylines: [
      [
        -w / 2 + inset,
        h / 2 - inset,
        w / 2 - inset,
        h / 2 - inset,
        w / 2 - inset,
        basinY,
        -w / 2 + inset,
        basinY,
        -w / 2 + inset,
        h / 2 - inset,
      ],
    ],
    fill: '#f1f5f9',
    overWalls: false,
  })
}
