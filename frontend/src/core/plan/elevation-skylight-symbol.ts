/**
 * Kozijn-glyph van een dakraam op Gevels. Quad volgt de dakhelling;
 * L/R/boven/onder worden aan de randen in aanzicht-cm gezet.
 */
import {
  clampFramePair,
  effectiveSkylightFrame,
  type OpeningFrameCm,
} from './opening-display-geom'
import type { ElevationGlyphPoly, ElevationOpeningSymbol } from './elevation-opening-symbol'
import type { FloorItem, Point2D } from './types'

export type ElevEdgeSide = 'left' | 'right' | 'top' | 'bottom'

function centroid(points: readonly Point2D[]): Point2D {
  const n = Math.max(1, points.length)
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / n,
    y: points.reduce((sum, p) => sum + p.y, 0) / n,
  }
}

function intersectLines(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): Point2D | null {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x)
  if (Math.abs(d) < 1e-9) return null
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) }
}

function offsetEdge(a: Point2D, b: Point2D, inset: number, inward: Point2D): { a: Point2D; b: Point2D } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9 || inset <= 0) return { a, b }
  let nx = -dy / len
  let ny = dx / len
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  if (nx * (inward.x - mid.x) + ny * (inward.y - mid.y) < 0) {
    nx = -nx
    ny = -ny
  }
  return {
    a: { x: a.x + nx * inset, y: a.y + ny * inset },
    b: { x: b.x + nx * inset, y: b.y + ny * inset },
  }
}

/** Twee meest horizontale randen = boven/onder; rest = links/rechts. */
export function classifyElevQuadEdges(points: readonly Point2D[]): ElevEdgeSide[] {
  const n = points.length
  const scores = points.map((a, i) => {
    const b = points[(i + 1) % n]
    if (!b) return { i, horizScore: 0, mid: a }
    const dx = b.x - a.x
    const dy = b.y - a.y
    const span = Math.abs(dx) + Math.abs(dy)
    return {
      i,
      horizScore: span > 1e-9 ? Math.abs(dx) / span : 0,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    }
  })
  const byHoriz = [...scores].sort((a, b) => b.horizScore - a.horizScore)
  const horizIds = new Set(byHoriz.slice(0, 2).map((s) => s.i))
  const sides: ElevEdgeSide[] = Array.from({ length: n }, () => 'left')
  const horiz = scores.filter((s) => horizIds.has(s.i))
  const vert = scores.filter((s) => !horizIds.has(s.i))
  if (horiz.length >= 2) {
    const top = horiz[0]!.mid.y <= horiz[1]!.mid.y ? horiz[0]! : horiz[1]!
    const bot = top === horiz[0] ? horiz[1]! : horiz[0]!
    sides[top.i] = 'top'
    sides[bot.i] = 'bottom'
  }
  if (vert.length >= 2) {
    const left = vert[0]!.mid.x <= vert[1]!.mid.x ? vert[0]! : vert[1]!
    const right = left === vert[0] ? vert[1]! : vert[0]!
    sides[left.i] = 'left'
    sides[right.i] = 'right'
  }
  return sides
}

function insetBySides(
  points: readonly Point2D[],
  sides: readonly ElevEdgeSide[],
  frame: OpeningFrameCm,
): Point2D[] | null {
  if (points.length < 3) return null
  const center = centroid(points)
  const insetOf = (side: ElevEdgeSide): number => {
    if (side === 'left') return frame.leftCm
    if (side === 'right') return frame.rightCm
    if (side === 'top') return frame.topCm
    return frame.bottomCm
  }
  const offsets = points.map((a, i) => {
    const b = points[(i + 1) % points.length] ?? a
    return offsetEdge(a, b, insetOf(sides[i] ?? 'left'), center)
  })
  const inner: Point2D[] = []
  for (let i = 0; i < offsets.length; i += 1) {
    const prev = offsets[(i + offsets.length - 1) % offsets.length]
    const cur = offsets[i]
    if (!prev || !cur) return null
    const hit = intersectLines(prev.a, prev.b, cur.a, cur.b)
    if (!hit) return null
    inner.push(hit)
  }
  return inner
}

function flatRing(points: readonly Point2D[]): number[] {
  return points.flatMap((p) => [p.x, p.y])
}

function clampFrameToAabb(points: readonly Point2D[], frame: OpeningFrameCm): OpeningFrameCm {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const width = Math.max(0, Math.max(...xs) - Math.min(...xs))
  const height = Math.max(0, Math.max(...ys) - Math.min(...ys))
  const [leftCm, rightCm] = clampFramePair(frame.leftCm, frame.rightCm, width)
  const [topCm, bottomCm] = clampFramePair(frame.topCm, frame.bottomCm, height)
  return { leftCm, rightCm, topCm, bottomCm }
}

/**
 * Kozijnbanden + glas in het geprojecteerde dakraam-quad.
 * L/R schalen met geprojecteerde breedte / plattegrond-breedte (zoals ramen).
 */
export function buildSkylightElevationGlyph(params: {
  points: readonly Point2D[]
  frame?: FloorItem['frame']
  widthCm: number
}): ElevationOpeningSymbol {
  const empty: ElevationOpeningSymbol = {
    polys: [],
    circles: [],
    inner: { x0: 0, y0: 0, x1: 0, y1: 0 },
  }
  const points = params.points
  if (points.length < 3) return empty
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const projW = Math.max(0.1, Math.max(...xs) - Math.min(...xs))
  const worldW = Math.max(0.1, params.widthCm)
  const scaleX = projW / worldW
  const base = effectiveSkylightFrame({ frame: params.frame })
  const scaled: OpeningFrameCm = {
    leftCm: base.leftCm * scaleX,
    rightCm: base.rightCm * scaleX,
    topCm: base.topCm,
    bottomCm: base.bottomCm,
  }
  const frame = clampFrameToAabb(points, scaled)
  const sides = classifyElevQuadEdges(points)
  const innerPts = insetBySides(points, sides, frame)
  const polys: ElevationGlyphPoly[] = []
  if (innerPts && innerPts.length === points.length) {
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      const c = innerPts[(i + 1) % innerPts.length]
      const d = innerPts[i]
      if (!a || !b || !c || !d) continue
      polys.push({
        role: 'frame',
        points: flatRing([a, b, c, d]),
        closed: true,
        fill: true,
      })
    }
    polys.push({
      role: 'glass',
      points: flatRing(innerPts),
      closed: true,
      fill: true,
    })
    const innerXs = innerPts.map((p) => p.x)
    const innerYs = innerPts.map((p) => p.y)
    return {
      polys,
      circles: [],
      inner: {
        x0: Math.min(...innerXs),
        y0: Math.min(...innerYs),
        x1: Math.max(...innerXs),
        y1: Math.max(...innerYs),
      },
    }
  }
  return empty
}
