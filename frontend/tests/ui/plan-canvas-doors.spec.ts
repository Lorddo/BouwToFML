import { describe, expect, it } from 'vitest'
import { type Opening } from '@/core/fml/types'
import { resolveOpeningCatalog } from '@/core/fml/opening-refid-catalog'
import type { PlanGlyph, PlanPolylineGlyph } from '@/core/fml/opening-plan-symbol'
import {
  buildMirrored,
  groupDoorOpeningsOnWall,
  resolveHingeAtStart,
  resolveSwingSign,
  resolveSwingSpanWithinOpening,
} from '@/ui/components/plan-canvas-doors'

function doorOpening(partial: Partial<Opening> & Pick<Opening, 't' | 'width'>): Opening {
  return {
    type: 'door',
    kind: 'door.single',
    mirrored: [0, 1],
    id: 'door-guid',
    ...partial,
  }
}

function byRole(glyphs: PlanGlyph[], role: string): PlanGlyph[] {
  return glyphs.filter((g) => g.role === role)
}

function polylines(glyphs: PlanGlyph[], role: string): PlanPolylineGlyph[] {
  return byRole(glyphs, role).filter((g): g is PlanPolylineGlyph => g.kind === 'polyline')
}

function leafCenterline(leaf: PlanPolylineGlyph): {
  hinge: { x: number; y: number }
  tip: { x: number; y: number }
} {
  const p = leaf.points
  return {
    hinge: { x: (p[0] + p[6]) / 2, y: (p[1] + p[7]) / 2 },
    tip: { x: (p[2] + p[4]) / 2, y: (p[3] + p[5]) / 2 },
  }
}

describe('resolveSwingSpanWithinOpening', () => {
  it('centreert blad altijd: gelijke kozijnen links+rechts (50/50 van totale framing)', () => {
    const swing = resolveSwingSpanWithinOpening({
      startCm: { x: 0, y: 0 },
      endCm: { x: 100, y: 0 },
      wallUnit: { x: 1, y: 0 },
      swingHingeInsetCm: 10,
      swingFreeInsetCm: 10,
    })
    expect(swing.start.x).toBeCloseTo(10, 5)
    expect(swing.end.x).toBeCloseTo(90, 5)
    expect(swing.width).toBeCloseTo(80, 5)
  })

  it('splitst ongelijke ref-insets toch 50/50 voor FML-weergave (geen asymmetrische boog)', () => {
    const swing = resolveSwingSpanWithinOpening({
      startCm: { x: 0, y: 0 },
      endCm: { x: 100, y: 0 },
      wallUnit: { x: 1, y: 0 },
      swingHingeInsetCm: 8,
      swingFreeInsetCm: 16,
    })
    // (8+16)/2 = 12 aan beide kanten
    expect(swing.start.x).toBeCloseTo(12, 5)
    expect(swing.end.x).toBeCloseTo(88, 5)
    expect(swing.width).toBeCloseTo(76, 5)
  })

  it('zonder insets: boog over volle opening', () => {
    const swing = resolveSwingSpanWithinOpening({
      startCm: { x: 0, y: 0 },
      endCm: { x: 90, y: 0 },
      wallUnit: { x: 1, y: 0 },
    })
    expect(swing.start.x).toBeCloseTo(0, 5)
    expect(swing.end.x).toBeCloseTo(90, 5)
  })
})

describe('groupDoorOpeningsOnWall', () => {
  it('renders one display group per door opening (no refid-pair merging)', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 400, y: 0 }, [
      doorOpening({ id: 'left', t: 0.45, width: 90 }),
      doorOpening({ id: 'right', t: 0.55, width: 90 }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].isDouble).toBe(false)
    expect(groups[0].openings).toHaveLength(1)
    expect(polylines(groups[0].glyphs, 'leaf').filter((l) => l.closed)).toHaveLength(1)
    expect(polylines(groups[0].glyphs, 'leaf').filter((l) => !l.closed)).toHaveLength(1)
    expect(byRole(groups[0].glyphs, 'swing')).toHaveLength(1)
  })

  it('renders wide double-leaf doors (double_wide) from a single opening', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 400, y: 0 }, [
      doorOpening({
        kind: 'door.double',
        t: 0.5,
        width: 170,
        mirrored: [0, 1],
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].isDouble).toBe(true)
    const leaves = polylines(groups[0].glyphs, 'leaf')
    expect(leaves.filter((l) => l.closed)).toHaveLength(2)
    expect(leaves.filter((l) => !l.closed)).toHaveLength(2)
    expect(byRole(groups[0].glyphs, 'swing')).toHaveLength(2)
  })

  it('renders sliding doors with divider + two arrows and no swing arc', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 300, y: 0 }, [
      doorOpening({
        kind: 'door.sliding',
        t: 0.5,
        width: 150,
      }),
    ])

    expect(byRole(groups[0].glyphs, 'swing')).toHaveLength(0)
    expect(polylines(groups[0].glyphs, 'leaf')).toHaveLength(2)
    expect(polylines(groups[0].glyphs, 'arrow')).toHaveLength(2)
    // Bladen blijven binnen display-kozijn (default 5 cm L/R → clear 75..225 op opening 75..225? width 150 @ t0.5 → 75..225)
    for (const leaf of polylines(groups[0].glyphs, 'leaf')) {
      const xs = [leaf.points[0], leaf.points[2], leaf.points[4], leaf.points[6]]
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(75 + 5 - 0.01)
      expect(Math.max(...xs)).toBeLessThanOrEqual(225 - 5 + 0.01)
    }
  })

  it('renders pocket doors with one arrow and no divider', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 300, y: 0 }, [
      doorOpening({
        kind: 'door.pocket',
        t: 0.5,
        width: 100,
      }),
    ])

    expect(groups[0].catalogLabel).toBe('Schuifdeur (kast)')
    expect(polylines(groups[0].glyphs, 'leaf').length).toBeGreaterThanOrEqual(1)
    expect(polylines(groups[0].glyphs, 'arrow')).toHaveLength(1)
    expect(byRole(groups[0].glyphs, 'swing')).toHaveLength(0)
    const leaf = polylines(groups[0].glyphs, 'leaf')[0]
    const xs = [leaf.points[0], leaf.points[2], leaf.points[4], leaf.points[6]]
    // opening 100 @ t0.5 → 100..200; frame 5 → leaf in 105..195
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(105 - 0.01)
    expect(Math.max(...xs)).toBeLessThanOrEqual(195 + 0.01)
  })

  it('renders sliding_single with fixed glass + leaf + one arrow', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 300, y: 0 }, [
      doorOpening({
        kind: 'door.sliding_single',
        t: 0.5,
        width: 180,
      }),
    ])

    expect(groups[0].catalogLabel).toBe('Schuifpui (1 schuivend)')
    expect(polylines(groups[0].glyphs, 'leaf')).toHaveLength(1)
    expect(polylines(groups[0].glyphs, 'glass')).toHaveLength(2)
    expect(polylines(groups[0].glyphs, 'arrow')).toHaveLength(1)
  })

  it('renders Anna kast-schuif (df95e84f) as pocket arrows', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 10, y: 0 }, { x: -154, y: 0 }, [
      doorOpening({
        kind: 'door.pocket',
        t: 0.728,
        width: 68.6,
        mirrored: [0, 0],
      }),
      doorOpening({
        kind: 'door.pocket',
        t: 0.322,
        width: 68.6,
        mirrored: [1, 1],
      }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].catalogLabel).toBe('Schuifdeur (kast)')
    expect(polylines(groups[0].glyphs, 'arrow')).toHaveLength(1)
    expect(byRole(groups[0].glyphs, 'swing')).toHaveLength(0)
    expect(polylines(groups[1].glyphs, 'arrow')).toHaveLength(1)
  })

  it('renders french balcony as inward swing + railing in front', () => {
    const groups = groupDoorOpeningsOnWall(
      'wall-1',
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      [
        doorOpening({
          kind: 'door.french_balcony',
          t: 0.5,
          width: 84,
          mirrored: [0, 0],
        }),
      ],
      20,
    )
    expect(groups[0].catalogLabel).toBe('Frans balkon')
    expect(byRole(groups[0].glyphs, 'swing')).toHaveLength(1)
    const leaves = polylines(groups[0].glyphs, 'leaf')
    expect(leaves.filter((l) => l.closed)).toHaveLength(1)
    expect(leaves.filter((l) => !l.closed)).toHaveLength(1)
    expect(polylines(groups[0].glyphs, 'rail').length).toBeGreaterThan(1)
    expect(polylines(groups[0].glyphs, 'arrow')).toHaveLength(0)
    const { tip } = leafCenterline(leaves.find((l) => l.closed)!)
    expect(tip.y).toBeCloseTo(0, 1)
    const arc = byRole(groups[0].glyphs, 'swing')[0]
    expect(arc.kind).toBe('arc')
    if (arc.kind === 'arc') expect(arc.sweepRad).toBeGreaterThan(0)
    const rail = polylines(groups[0].glyphs, 'rail')[0]
    const railY = (rail.points[1] + rail.points[3]) / 2
    expect(railY).toBeLessThan(0)
    // Rek over volle gatbreedte (muur tot muur), niet gestopt bij framing.
    expect(rail.points[0]).toBeCloseTo(58, 5)
    expect(rail.points[2]).toBeCloseTo(142, 5)
  })

  it('renders d34e31c as a closet45 door (45° arc, leaf closed in frame)', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 300, y: 0 }, [
      doorOpening({
        kind: 'door.closet',
        t: 0.5,
        width: 67,
        mirrored: [0, 1],
      }),
    ])

    expect(groups[0].catalogLabel).toBe('Kastdeur (draai 45°)')
    expect(groups[0].isDouble).toBe(false)
    const leaves = polylines(groups[0].glyphs, 'leaf')
    expect(leaves.filter((l) => l.closed)).toHaveLength(1)
    expect(leaves.filter((l) => !l.closed)).toHaveLength(1)
    const arcs = byRole(groups[0].glyphs, 'swing')
    expect(arcs).toHaveLength(1)
    if (arcs[0].kind === 'arc') {
      expect(Math.abs(arcs[0].sweepRad)).toBeCloseTo(Math.PI / 4, 5)
    }
    // Blad gesloten langs de muur
    const { hinge, tip } = leafCenterline(leaves.find((l) => l.closed)!)
    expect(Math.abs(tip.y - hinge.y)).toBeLessThan(1)
  })

  it('renders 2cb4a1c as standard 90° door with arc', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 300, y: 0 }, { x: 100, y: 0 }, [
      doorOpening({
        kind: 'door.single',
        t: 0.5,
        width: 90,
        mirrored: [1, 1],
      }),
    ])

    expect(byRole(groups[0].glyphs, 'swing')).toHaveLength(1)
    expect(groups[0].catalogLabel).not.toBe('Kastdeur')
  })

  it('defaults unknown refids to a single 90° door', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 300, y: 0 }, [
      doorOpening({
        kind: 'door.unmapped',
        t: 0.5,
        width: 90,
      }),
    ])

    expect(groups[0].isDouble).toBe(false)
    expect(polylines(groups[0].glyphs, 'leaf').filter((l) => l.closed)).toHaveLength(1)
    expect(byRole(groups[0].glyphs, 'swing')).toHaveLength(1)
  })

  it('gap = volle opening; boog/blad = catalogus swingInsetCm (5cm) per zijde', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 400, y: 0 }, [
      doorOpening({
        t: 0.5,
        width: 100,
        mirrored: [0, 1],
        // Gemeten framing mag FML-weergave niet meer sturen:
        swingHingeInsetCm: 8,
        swingFreeInsetCm: 16,
      }),
    ])

    // Gap: volle opening.width
    expect(groups[0].startCm.x).toBeCloseTo(150, 5)
    expect(groups[0].endCm.x).toBeCloseTo(250, 5)

    // Boog/blad: catalogus 5cm per zijde → clear 90 @ 155..245
    const { hinge, tip } = leafCenterline(polylines(groups[0].glyphs, 'leaf')[0])
    expect(hinge.x).toBeCloseTo(155, 5)
    expect(Math.hypot(tip.x - hinge.x, tip.y - hinge.y)).toBeCloseTo(90, 5)

    const arc = byRole(groups[0].glyphs, 'swing')[0]
    expect(arc.kind).toBe('arc')
    if (arc.kind === 'arc') {
      expect(arc.r).toBeCloseTo(90, 5)
      expect(arc.cx).toBeCloseTo(hinge.x, 5)
      expect(arc.cy).toBeCloseTo(hinge.y, 5)
    }

    expect(polylines(groups[0].glyphs, 'jamb')).toHaveLength(2)
  })

  it('draaideur: dwarslijnen op gat-einden (volle muurdikte), geen langs-sill', () => {
    const groups = groupDoorOpeningsOnWall(
      'wall-1',
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      [doorOpening({ t: 0.5, width: 100 })],
      20,
    )
    const sills = polylines(groups[0].glyphs, 'sill')
    expect(sills).toHaveLength(2)
    expect(sills.every((s) => !s.dashed)).toBe(true)
    const xs = sills.map((s) => s.points[0]).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(150, 5)
    expect(xs[1]).toBeCloseTo(250, 5)
    for (const sill of sills) {
      const ys = [sill.points[1], sill.points[3]].sort((a, b) => a - b)
      expect(ys[0]).toBeCloseTo(-10, 5)
      expect(ys[1]).toBeCloseTo(10, 5)
      expect(sill.points[0]).toBeCloseTo(sill.points[2], 5)
    }
  })

  it('passage: dashed buitenfaces + solid dwars-einden', () => {
    const groups = groupDoorOpeningsOnWall(
      'wall-1',
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      [doorOpening({ kind: 'door.passage', t: 0.5, width: 90 })],
      16,
    )
    const sills = polylines(groups[0].glyphs, 'sill')
    expect(sills).toHaveLength(4)
    expect(sills.filter((s) => s.dashed)).toHaveLength(2)
    expect(sills.filter((s) => !s.dashed)).toHaveLength(2)
  })
})

describe('resolveSwingSign', () => {
  it('follows Floorplanner mirrored[1] swing-side convention (0=−normal, 1=+normal)', () => {
    expect(resolveSwingSign([0, 0])).toBe(-1)
    expect(resolveSwingSign([0, 1])).toBe(1)
    expect(resolveSwingSign([1, 0])).toBe(-1)
    expect(resolveSwingSign([1, 1])).toBe(1)
    expect(resolveSwingSign(undefined)).toBe(-1)
  })
})

describe('resolveHingeAtStart', () => {
  it('follows Floorplanner mirrored[0] hinge-end convention (0=start, 1=end)', () => {
    expect(resolveHingeAtStart([0, 0])).toBe(true)
    expect(resolveHingeAtStart([0, 1])).toBe(true)
    expect(resolveHingeAtStart([1, 0])).toBe(false)
    expect(resolveHingeAtStart([1, 1])).toBe(false)
    expect(resolveHingeAtStart(undefined)).toBe(true)
  })
})

describe('single 90° door — Floorplanner editor mapping (vertical wall up)', () => {
  // Muur a=(0,0) (junction, onder) → b=(0,-400) (boven). wallUnit=(0,-1).
  // wallNormal(code) = (1,0) = rechts. Dus +swingSign = rechts, -swingSign = links.
  const A = { x: 0, y: 0 }
  const B = { x: 0, y: -400 }

  function doorFor(mirrored: [number, number]): Opening {
    return doorOpening({ t: 0.5, width: 90, mirrored })
  }

  function hingeAndSide(mirrored: [number, number]) {
    const groups = groupDoorOpeningsOnWall('wall-up', A, B, [doorFor(mirrored)])
    const { hinge } = leafCenterline(polylines(groups[0].glyphs, 'leaf')[0])
    const arc = byRole(groups[0].glyphs, 'swing')[0]
    expect(arc.kind).toBe('arc')
    // Opening bij t=0.5 → midden op (0,-200).
    const atStart = hinge.y > -200
    const atEnd = hinge.y < -200
    // Open tip via arc: wallNormal = (1,0) = rechts
    if (arc.kind !== 'arc') return { atStart, atEnd, side: '?' as const }
    const openX = arc.cx + Math.cos(arc.startRad + arc.sweepRad) * arc.r
    const side = openX - hinge.x > 0.5 ? 'right' : openX - hinge.x < -0.5 ? 'left' : '?'
    return { atStart, atEnd, side }
  }

  it('s00 = hinge start (onder), swing links', () => {
    const r = hingeAndSide([0, 0])
    expect(r.atStart).toBe(true)
    expect(r.side).toBe('left')
  })
  it('s01 = hinge start (onder), swing rechts', () => {
    const r = hingeAndSide([0, 1])
    expect(r.atStart).toBe(true)
    expect(r.side).toBe('right')
  })
  it('s10 = hinge end (boven), swing links', () => {
    const r = hingeAndSide([1, 0])
    expect(r.atEnd).toBe(true)
    expect(r.side).toBe('left')
  })
  it('s11 = hinge end (boven), swing rechts', () => {
    const r = hingeAndSide([1, 1])
    expect(r.atEnd).toBe(true)
    expect(r.side).toBe('right')
  })
})

describe('buildMirrored — write↔read roundtrip', () => {
  it('is the exact inverse of resolveHingeAtStart/resolveSwingSign for all 4 combos', () => {
    const cases: Array<{ hingeAtStart: boolean; swingRight: boolean }> = [
      { hingeAtStart: true, swingRight: false },
      { hingeAtStart: true, swingRight: true },
      { hingeAtStart: false, swingRight: false },
      { hingeAtStart: false, swingRight: true },
    ]
    for (const { hingeAtStart, swingRight } of cases) {
      const mirrored = buildMirrored(hingeAtStart, swingRight)
      expect(resolveHingeAtStart(mirrored)).toBe(hingeAtStart)
      expect(resolveSwingSign(mirrored)).toBe(swingRight ? 1 : -1)
    }
  })

  it('produces the canonical Floorplanner tuples', () => {
    expect(buildMirrored(true, false)).toEqual([0, 0]) // s00
    expect(buildMirrored(true, true)).toEqual([0, 1]) // s01
    expect(buildMirrored(false, false)).toEqual([1, 0]) // s10
    expect(buildMirrored(false, true)).toEqual([1, 1]) // s11
  })
})

describe('resolveOpeningCatalog', () => {
  it('classifies known door refids by data-driven kind', () => {
    expect(resolveOpeningCatalog('5ae0ee3c682e32c8c7ac15a6136d692df5737b22', 'door').kind).toBe(
      'double_wide',
    )
    expect(resolveOpeningCatalog('1cdb4e6092e998630e7881667f2ddedafa3b0eb9', 'door').kind).toBe(
      'sliding',
    )
    expect(resolveOpeningCatalog('216', 'door').kind).toBe('sliding_pocket')
    expect(resolveOpeningCatalog('d2785cc45c9c0ec86644135d22fa9ac9c49bcad6', 'door').kind).toBe(
      'sliding_single',
    )
    expect(resolveOpeningCatalog('9c1479d9dfc482859aea10b9dd67f5e7773fff6d', 'door').kind).toBe(
      'double_wide',
    )
    expect(resolveOpeningCatalog('2cb4a1c74ec301ab0fdc762deb37eaf0e28d9ecc', 'door').kind).toBe(
      'single',
    )
    expect(resolveOpeningCatalog('d34e31c31ba6e6bd4e0d67096ec1b31e9035c7d9', 'door').kind).toBe(
      'closet45',
    )
    expect(resolveOpeningCatalog('9c845cf2ad8de220b65ee4dedeeb28ba4d750e21', 'door').kind).toBe(
      'french_balcony',
    )
    expect(resolveOpeningCatalog('37bb0bbe45ba0a5efda34f3f1e0b7ace63084e7f', 'door').kind).toBe(
      'garage',
    )
    expect(resolveOpeningCatalog('df95e84f01163fe9983d43d088551813e40e3e2f', 'door').kind).toBe(
      'sliding_pocket',
    )
    expect(resolveOpeningCatalog('e7ef286f1690491cf28bf8586c2b9624be881dba', 'door').kind).toBe(
      'bifold',
    )
    expect(resolveOpeningCatalog('919e3f1aaa05cd6b38b843f44573261442e38caa', 'door').kind).toBe(
      'bifold_double',
    )
  })

  it('defaults unknown refids to single', () => {
    expect(resolveOpeningCatalog('deadbeef', 'door').kind).toBe('single')
    expect(resolveOpeningCatalog('deadbeef', 'window').kind).toBe('single')
  })

  it('exposes swingInsetCm from catalog (plattegrond-onafhankelijk)', () => {
    expect(
      resolveOpeningCatalog('0434246537840a3326e305dbe7b9c355743e6e93', 'door').swingInsetCm,
    ).toBe(5)
    expect(
      resolveOpeningCatalog('d34e31c31ba6e6bd4e0d67096ec1b31e9035c7d9', 'door').swingInsetCm,
    ).toBe(5)
    expect(
      resolveOpeningCatalog('1cdb4e6092e998630e7881667f2ddedafa3b0eb9', 'door').swingInsetCm,
    ).toBe(0)
    expect(resolveOpeningCatalog('deadbeef', 'door').swingInsetCm).toBe(5)
    expect(resolveOpeningCatalog('deadbeef', 'window').swingInsetCm).toBe(0)
  })

  it('classifies the multi window refid', () => {
    expect(resolveOpeningCatalog('bbf86e131112adca8869e9970229a71d7ff3fc28', 'window').kind).toBe(
      'multi',
    )
    expect(resolveOpeningCatalog('bbf86e131112adca8869e9970229a71d7ff3fc28', 'window').panels).toBe(
      2,
    )
    expect(resolveOpeningCatalog('e3296a727699a3fc70e70dfec4ab715ed368ef63', 'window').panels).toBe(
      3,
    )
    expect(resolveOpeningCatalog('6da47b0a60330d19716d716046ec6c72c19d2cdb', 'window').kind).toBe(
      'round',
    )
    expect(resolveOpeningCatalog('65d378c39d0183c82927e4ed7f8be6b224cf1df8', 'window').kind).toBe(
      'half_round',
    )
  })
})
