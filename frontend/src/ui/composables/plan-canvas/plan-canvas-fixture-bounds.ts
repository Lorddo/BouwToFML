/** Tight local-cm AABB of a fixture symbol (origin = item center). */

export interface FixtureSymbolGeom {
  rects: number[][]
  ellipses: number[][]
  circles: number[][]
  fillPolygons?: number[][]
  polylines: number[][]
  dashPolylines?: number[][]
  arrowPolylines?: number[][]
}

export function fixtureSymbolLocalBounds(symbol: FixtureSymbolGeom): {
  x: number
  y: number
  width: number
  height: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const add = (x: number, y: number): void => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  for (const rect of symbol.rects) {
    add(rect[0], rect[1])
    add(rect[0] + rect[2], rect[1] + rect[3])
  }
  for (const ell of symbol.ellipses) {
    add(ell[0] - ell[2], ell[1] - ell[3])
    add(ell[0] + ell[2], ell[1] + ell[3])
  }
  for (const cir of symbol.circles) {
    add(cir[0] - cir[2], cir[1] - cir[2])
    add(cir[0] + cir[2], cir[1] + cir[2])
  }
  for (const poly of [
    ...(symbol.fillPolygons ?? []),
    ...symbol.polylines,
    ...(symbol.dashPolylines ?? []),
    ...(symbol.arrowPolylines ?? []),
  ]) {
    for (let i = 0; i + 1 < poly.length; i += 2) add(poly[i], poly[i + 1])
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: -4, y: -4, width: 8, height: 8 }
  }
  return { x: minX, y: minY, width: Math.max(0.4, maxX - minX), height: Math.max(0.4, maxY - minY) }
}
