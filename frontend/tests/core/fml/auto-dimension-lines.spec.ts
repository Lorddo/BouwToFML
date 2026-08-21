import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AUTO_DIM_CHAIN_OFFSET_CM,
  AUTO_DIM_OUTER_EXTRA_CM,
  buildAutoDimensionLines,
  type AutoDimensionLine,
} from '@/core/fml/auto-dimension-lines'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import type { FloorArea, Wall } from '@/core/fml/types'

const KINDERDIJK = resolve(
  __dirname,
  '../../../examples/FML(current)/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam.json.fml',
)

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }, t = 20): Wall {
  return { id, a, b, thickness: t, balance: 0.5, openings: [] }
}

function rectArea(id: string, minX: number, minY: number, maxX: number, maxY: number): FloorArea {
  return {
    id,
    poly: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
    color: '#ccc',
    showAreaLabel: true,
  }
}

/** Rechthoek 400×300 hartlijn, dikte 20 → buiten 420×320, binnen 380×280. */
function rectanglePlan(): { walls: Wall[]; areas: FloorArea[] } {
  return {
    walls: [
      wall('n', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('s', { x: 0, y: 300 }, { x: 400, y: 300 }),
      wall('w', { x: 0, y: 0 }, { x: 0, y: 300 }),
      wall('e', { x: 400, y: 0 }, { x: 400, y: 300 }),
    ],
    areas: [rectArea('room', 10, 10, 390, 290)],
  }
}

function lengthOf(line: AutoDimensionLine): number {
  return Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y)
}

function isVertical(line: AutoDimensionLine): boolean {
  return Math.abs(line.b.x - line.a.x) < 0.5
}

function classify(
  lines: AutoDimensionLine[],
  outer: { minX: number; minY: number; maxX: number; maxY: number },
): Record<'W' | 'E' | 'N' | 'S' | 'outerH' | 'outerV', number[]> {
  const extra = AUTO_DIM_CHAIN_OFFSET_CM + AUTO_DIM_OUTER_EXTRA_CM
  const out: Record<'W' | 'E' | 'N' | 'S' | 'outerH' | 'outerV', number[]> = {
    W: [],
    E: [],
    N: [],
    S: [],
    outerH: [],
    outerV: [],
  }
  for (const line of lines) {
    const len = Math.round(lengthOf(line) * 10) / 10
    if (isVertical(line)) {
      const x = (line.a.x + line.b.x) / 2
      if (Math.abs(x - (outer.minX - extra)) < 1) out.outerV.push(len)
      else if (x < outer.minX) out.W.push(len)
      else out.E.push(len)
    } else {
      const y = (line.a.y + line.b.y) / 2
      if (Math.abs(y - (outer.minY - extra)) < 1) out.outerH.push(len)
      else if (y < outer.minY) out.N.push(len)
      else out.S.push(len)
    }
  }
  return out
}

const RECT_OUTER = { minX: -10, minY: -10, maxX: 410, maxY: 310 }

describe('buildAutoDimensionLines', () => {
  it('rechthoek interior: 4 zijden × 1 segment = binnenmaat', () => {
    const { walls, areas } = rectanglePlan()
    const lines = buildAutoDimensionLines(walls, areas, {
      dimensionMode: 'interior',
      generateOuterDimension: false,
    })
    const sides = classify(lines, RECT_OUTER)
    expect(sides.W).toEqual([280])
    expect(sides.E).toEqual([280])
    expect(sides.N).toEqual([380])
    expect(sides.S).toEqual([380])
    expect(sides.outerH).toEqual([])
    expect(sides.outerV).toEqual([])
  })

  it('rechthoek exterior: 4 zijden × 1 segment = buitenmaat', () => {
    const { walls, areas } = rectanglePlan()
    const lines = buildAutoDimensionLines(walls, areas, {
      dimensionMode: 'exterior',
      generateOuterDimension: false,
    })
    const sides = classify(lines, RECT_OUTER)
    expect(sides.W).toEqual([320])
    expect(sides.E).toEqual([320])
    expect(sides.N).toEqual([420])
    expect(sides.S).toEqual([420])
  })

  it('totaalmaat: extra 1× H + 1× V in dezelfde mode', () => {
    const { walls, areas } = rectanglePlan()
    const interior = buildAutoDimensionLines(walls, areas, {
      dimensionMode: 'interior',
      generateOuterDimension: true,
    })
    const sides = classify(interior, RECT_OUTER)
    expect(sides.outerH).toEqual([380])
    expect(sides.outerV).toEqual([280])
    expect(interior.length).toBe(6)

    const exterior = buildAutoDimensionLines(walls, areas, {
      dimensionMode: 'exterior',
      generateOuterDimension: true,
    })
    const extSides = classify(exterior, RECT_OUTER)
    expect(extSides.outerH).toEqual([420])
    expect(extSides.outerV).toEqual([320])
  })

  it('geen areas / geen muren → geen lijnen', () => {
    const { walls, areas } = rectanglePlan()
    expect(
      buildAutoDimensionLines(walls, [], {
        dimensionMode: 'interior',
        generateOuterDimension: false,
      }),
    ).toEqual([])
    expect(
      buildAutoDimensionLines([], areas, {
        dimensionMode: 'interior',
        generateOuterDimension: false,
      }),
    ).toEqual([])
  })

  it('West ≠ East: per gevelband alleen de areas op die rand, restmaat vult de objectspan', () => {
    const walls = [
      wall('n', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('s', { x: 0, y: 520 }, { x: 400, y: 520 }),
      wall('w', { x: 0, y: 0 }, { x: 0, y: 520 }),
      wall('e', { x: 400, y: 0 }, { x: 400, y: 520 }),
    ]
    const areas = [
      rectArea('west-a', 10, 10, 120, 200),
      rectArea('west-b', 10, 220, 120, 400),
      rectArea('east', 200, 10, 390, 510),
    ]
    const lines = buildAutoDimensionLines(walls, areas, {
      dimensionMode: 'interior',
      generateOuterDimension: false,
    })
    const outer = { minX: -10, minY: -10, maxX: 410, maxY: 530 }
    const sides = classify(lines, outer)
    // West: 190 + 20 (gat) + 180 — geen globale AABB-rest tot de oostkamer
    expect(sides.W.reduce((a, b) => a + b, 0)).toBe(390)
    expect(sides.W.length).toBeGreaterThan(1)
    expect(sides.E).toEqual([500])
    expect(sides.W).not.toEqual(sides.E)
  })

  it('woonkamer op W+E: oost-rand ≠ west-rand (dikte-hoek); west-sleep raakt oost niet', () => {
    const walls = [
      wall('n', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('s', { x: 0, y: 590 }, { x: 400, y: 590 }),
      wall('w', { x: 0, y: 0 }, { x: 0, y: 590 }, 10),
      wall('e', { x: 400, y: 0 }, { x: 400, y: 590 }, 20),
    ]
    const woonkamer: FloorArea = {
      id: 'woon',
      poly: [
        { x: 10, y: 10 },
        { x: 380, y: 15 },
        { x: 380, y: 574 },
        { x: 10, y: 574 },
      ],
      color: '#ccc',
      showAreaLabel: true,
    }
    const lines = buildAutoDimensionLines(walls, [woonkamer], {
      dimensionMode: 'interior',
      generateOuterDimension: false,
    })
    const outer = { minX: -5, minY: -10, maxX: 410, maxY: 600 }
    const sides = classify(lines, outer)
    expect(sides.W).toEqual([564])
    expect(sides.E).toEqual([559])

    const stretched: FloorArea = {
      ...woonkamer,
      poly: [
        { x: 10, y: -80 },
        { x: 380, y: 15 },
        { x: 380, y: 574 },
        { x: 10, y: 574 },
      ],
    }
    const after = buildAutoDimensionLines(walls, [stretched], {
      dimensionMode: 'interior',
      generateOuterDimension: false,
    })
    const afterSides = classify(after, outer)
    expect(afterSides.W).toEqual([654])
    expect(afterSides.E).toEqual([559])
  })

  it('5 cm west-inkeping aan de oostkant komt niet in de west-ketting', () => {
    const walls = [
      wall('n', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('s', { x: 0, y: 590 }, { x: 400, y: 590 }),
      wall('w', { x: 0, y: 0 }, { x: 0, y: 590 }, 10),
      wall('e', { x: 400, y: 0 }, { x: 400, y: 590 }, 20),
    ]
    const area: FloorArea = {
      id: 'woon',
      poly: [
        { x: 10, y: 10 },
        { x: 370, y: 10 },
        { x: 370, y: 15 },
        { x: 380, y: 15 },
        { x: 380, y: 574 },
        { x: 10, y: 574 },
      ],
      color: '#ccc',
      showAreaLabel: true,
    }
    const lines = buildAutoDimensionLines(walls, [area], {
      dimensionMode: 'interior',
      generateOuterDimension: false,
    })
    const outer = { minX: -5, minY: -10, maxX: 410, maxY: 600 }
    const sides = classify(lines, outer)
    expect(sides.W).toEqual([564])
    expect(sides.E).toEqual([559])
    expect(sides.W.some((len) => len > 0 && len < 10)).toBe(false)
  })

  it('1 cm clipper-kink op de oostgevel wordt geen extra tick', () => {
    const walls = [
      wall('n', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('s', { x: 0, y: 590 }, { x: 400, y: 590 }),
      wall('w', { x: 0, y: 0 }, { x: 0, y: 590 }, 10),
      wall('e', { x: 400, y: 0 }, { x: 400, y: 590 }, 20),
    ]
    const area: FloorArea = {
      id: 'woon',
      poly: [
        { x: 10, y: 10 },
        { x: 380, y: 10 },
        { x: 380, y: 300 },
        { x: 381, y: 300 },
        { x: 381, y: 301 },
        { x: 380, y: 301 },
        { x: 380, y: 574 },
        { x: 10, y: 574 },
      ],
      color: '#ccc',
      showAreaLabel: true,
    }
    const lines = buildAutoDimensionLines(walls, [area], {
      dimensionMode: 'interior',
      generateOuterDimension: false,
    })
    const outer = { minX: -5, minY: -10, maxX: 410, maxY: 600 }
    const sides = classify(lines, outer)
    expect(sides.E).toEqual([564])
    expect(sides.E.some((len) => len > 0 && len < 10)).toBe(false)
  })

  it('Kinderdijkstraat: West-ticks ≠ East-ticks (gevelband, geen globale hole-Y)', () => {
    const raw = JSON.parse(readFileSync(KINDERDIJK, 'utf8'))
    const { plan } = importFmlV3(raw)
    const floor = plan.floors[0]
    const lines = buildAutoDimensionLines(floor.walls, floor.areas, {
      dimensionMode: 'interior',
      generateOuterDimension: false,
    })
    const west = lines.filter((l) => isVertical(l) && (l.a.x + l.b.x) / 2 < 0)
    const east = lines.filter((l) => isVertical(l) && (l.a.x + l.b.x) / 2 > 500)
    const westTicks = [
      ...new Set(west.flatMap((l) => [l.a.y, l.b.y].map((n) => Math.round(n * 10) / 10))),
    ].sort((a, b) => a - b)
    const eastTicks = [
      ...new Set(east.flatMap((l) => [l.a.y, l.b.y].map((n) => Math.round(n * 10) / 10))),
    ].sort((a, b) => a - b)
    expect(west.length).toBeGreaterThan(0)
    expect(east.length).toBeGreaterThan(0)
    expect(westTicks).not.toEqual(eastTicks)
  })
})
