import {
  emptyShape,
  FILL,
  METAL_FILL,
  METAL_STROKE,
  STROKE,
  type FixtureSymbolShape,
} from './types'

/** 6-punt vriessymbool (sneeuwvlok) in het midden van de koelkast. */
function freezerSnowflake(r: number): number[][] {
  const lines: number[][] = []
  const hook = r * 0.32
  const branchR = r * 0.58
  const branchA = 0.55
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3 - Math.PI / 2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    lines.push([0, 0, x, y])
    const bx = Math.cos(a) * branchR
    const by = Math.sin(a) * branchR
    lines.push([
      bx + Math.cos(a + branchA) * hook,
      by + Math.sin(a + branchA) * hook,
      bx,
      by,
      bx + Math.cos(a - branchA) * hook,
      by + Math.sin(a - branchA) * hook,
    ])
  }
  return lines
}

export function fridge(w: number, h: number): FixtureSymbolShape {
  const r = Math.min(w, h) * 0.28
  /** Deurzijde = lokale +Y (dubbele lijn). `rotation` / `mirrored` zetten die rand op de 3D-deur. */
  const gap = Math.min(w, h) * 0.08
  const y0 = h / 2
  const y1 = h / 2 - gap
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines: [...freezerSnowflake(r), [-w / 2, y0, w / 2, y0], [-w / 2, y1, w / 2, y1]],
    stroke: STROKE,
    fill: FILL,
    overWalls: false,
  })
}

/** Hoge kast: alleen de dubbele deurlijn, zelfde zijde als koelkast (lokale +Y). */
export function cabinetHigh(w: number, h: number): FixtureSymbolShape {
  const gap = Math.min(w, h) * 0.08
  const y0 = h / 2
  const y1 = h / 2 - gap
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines: [
      [-w / 2, y0, w / 2, y0],
      [-w / 2, y1, w / 2, y1],
    ],
    stroke: STROKE,
    fill: FILL,
    overWalls: false,
  })
}

export function kitchenSink(w: number, h: number): FixtureSymbolShape {
  const inset = Math.min(w, h) * 0.1
  const faucetSpace = Math.min(w, h) * 0.26
  const faucetR = Math.min(w, h) * 0.07
  const faucetY = -h / 2 + faucetSpace * 0.42
  const basinY = -h / 2 + faucetSpace
  const spoutLen = Math.min(w, h) * 0.12
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
      [0, faucetY + faucetR, 0, faucetY + faucetR + spoutLen],
    ],
    stroke: METAL_STROKE,
    fill: METAL_FILL,
    circleFill: METAL_FILL,
    overWalls: false,
  })
}

/** Top-view couvert: bord midden, vork links, mes rechts. */
export function dishwasher(w: number, h: number): FixtureSymbolShape {
  const s = Math.min(w, h)
  const plateR = s * 0.2
  const tine = s * 0.038
  const tineTop = -s * 0.22
  const tineJoin = -s * 0.02
  const stemBot = s * 0.22
  const fx = -s * 0.34
  const kx = s * 0.34
  const bladeW = s * 0.028
  const handleW = s * 0.02
  const tipY = -s * 0.22
  const bolsterY = s * 0.02
  const endY = s * 0.22
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles: [
      [0, 0, plateR],
      [0, 0, plateR * 0.45],
    ],
    circleFill: 'transparent',
    polylines: [
      [fx - tine, tineTop, fx - tine, tineJoin],
      [fx, tineTop, fx, stemBot],
      [fx + tine, tineTop, fx + tine, tineJoin],
      [fx - tine, tineJoin, fx + tine, tineJoin],
      [
        kx,
        tipY,
        kx - bladeW,
        tipY + s * 0.07,
        kx - bladeW,
        bolsterY,
        kx - handleW,
        bolsterY,
        kx - handleW,
        endY,
        kx + handleW,
        endY,
        kx + handleW,
        bolsterY,
        kx + bladeW,
        bolsterY,
        kx + bladeW,
        tipY + s * 0.07,
        kx,
        tipY,
      ],
    ],
    fill: FILL,
    overWalls: false,
  })
}

export function cooktop(w: number, h: number): FixtureSymbolShape {
  const rx = w * 0.22
  const ry = h * 0.22
  const r = Math.min(w, h) * 0.14
  const inner = r * 0.52
  const circles: number[][] = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      circles.push([sx * rx, sy * ry, r], [sx * rx, sy * ry, inner])
    }
  }
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles,
    stroke: METAL_STROKE,
    fill: METAL_FILL,
    circleFill: 'transparent',
    overWalls: false,
  })
}

export function countertop(w: number, h: number): FixtureSymbolShape {
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    stroke: STROKE,
    fill: '#f8fafc',
    overWalls: false,
  })
}
