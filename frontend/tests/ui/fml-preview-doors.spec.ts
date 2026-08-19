import { describe, expect, it } from 'vitest'
import type { Opening } from '@/core/fml/types'
import { resolveOpeningCatalog } from '@/core/fml/opening-refid-catalog'
import {
  buildMirrored,
  groupDoorOpeningsOnWall,
  resolveHingeAtStart,
  resolveSwingSign,
  resolveSwingSpanWithinOpening,
} from '@/ui/components/fml-preview-doors'

function doorOpening(partial: Partial<Opening> & Pick<Opening, 't' | 'width'>): Opening {
  return {
    type: 'door',
    refid: '0434246537840a3326e305dbe7b9c355743e6e93',
    mirrored: [0, 1],
    guid: partial.guid ?? 'door-guid',
    ...partial,
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
      doorOpening({ guid: 'left', t: 0.45, width: 90 }),
      doorOpening({ guid: 'right', t: 0.55, width: 90 }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].isDouble).toBe(false)
    expect(groups[0].openings).toHaveLength(1)
    expect(groups[0].leafLines).toHaveLength(1)
    expect(groups[0].arcPoints).toHaveLength(1)
  })

  it('renders wide double-leaf doors (double_wide) from a single opening', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 400, y: 0 }, [
      doorOpening({
        refid: '5ae0ee3c682e32c8c7ac15a6136d692df5737b22',
        t: 0.5,
        width: 170,
        mirrored: [0, 1],
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].isDouble).toBe(true)
    expect(groups[0].leafLines).toHaveLength(2)
    expect(groups[0].arcPoints).toHaveLength(2)
  })

  it('renders sliding doors with divider + two arrows and no swing arc', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 300, y: 0 }, [
      doorOpening({
        refid: '1cdb4e6092e998630e7881667f2ddedafa3b0eb9',
        t: 0.5,
        width: 150,
      }),
    ])

    expect(groups[0].arcPoints).toHaveLength(0)
    expect(groups[0].leafLines).toHaveLength(1)
    expect(groups[0].arrowPoints).toHaveLength(2)
  })

  it('renders pocket doors with one arrow and no divider', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 300, y: 0 }, [
      doorOpening({
        refid: '216',
        t: 0.5,
        width: 100,
      }),
    ])

    expect(groups[0].catalogLabel).toBe('Pocketdeur')
    expect(groups[0].leafLines).toHaveLength(0)
    expect(groups[0].arrowPoints).toHaveLength(1)
    expect(groups[0].arcPoints).toHaveLength(0)
  })

  it('renders sliding_single with divider + one arrow', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 300, y: 0 }, [
      doorOpening({
        refid: 'd2785cc45c9c0ec86644135d22fa9ac9c49bcad6',
        t: 0.5,
        width: 180,
      }),
    ])

    expect(groups[0].catalogLabel).toBe('Schuifpui (1 schuivend)')
    expect(groups[0].leafLines).toHaveLength(1)
    expect(groups[0].arrowPoints).toHaveLength(1)
  })

  it('renders Anna kast-schuif (df95e84f) as pocket arrows', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 10, y: 0 }, { x: -154, y: 0 }, [
      doorOpening({
        refid: 'df95e84f01163fe9983d43d088551813e40e3e2f',
        t: 0.728,
        width: 68.6,
        mirrored: [0, 0],
      }),
      doorOpening({
        refid: 'df95e84f01163fe9983d43d088551813e40e3e2f',
        t: 0.322,
        width: 68.6,
        mirrored: [1, 1],
      }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].catalogLabel).toBe('Schuifdeur (kast)')
    expect(groups[0].arrowPoints).toHaveLength(1)
    expect(groups[0].arcPoints).toHaveLength(0)
    expect(groups[1].arrowPoints).toHaveLength(1)
  })

  it('renders french balcony as inward swing + railing in front', () => {
    const groups = groupDoorOpeningsOnWall(
      'wall-1',
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      [
        doorOpening({
          refid: '9c845cf2ad8de220b65ee4dedeeb28ba4d750e21',
          t: 0.5,
          width: 84,
          mirrored: [0, 0],
        }),
      ],
      20,
    )
    expect(groups[0].catalogLabel).toBe('Frans balkon')
    expect(groups[0].arcPoints).toHaveLength(1)
    expect(groups[0].leafLines.length).toBeGreaterThan(2)
    expect(groups[0].arrowPoints).toHaveLength(0)
    const leaf = groups[0].leafLines[0]
    expect(leaf[3]).toBeGreaterThan(0)
    const railY = (groups[0].leafLines[1][1] + groups[0].leafLines[1][3]) / 2
    expect(railY).toBeLessThan(0)
  })

  it('renders d34e31c as a closet45 door (45° leaf + arc, like Floorplanner 2D)', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 300, y: 0 }, [
      doorOpening({
        refid: 'd34e31c31ba6e6bd4e0d67096ec1b31e9035c7d9',
        t: 0.5,
        width: 67,
        mirrored: [0, 1],
      }),
    ])

    expect(groups[0].catalogLabel).toBe('Kastdeur (draai 45°)')
    expect(groups[0].isDouble).toBe(false)
    expect(groups[0].leafLines).toHaveLength(1)
    // 45° kastdeur heeft een boogje (Floorplanner 2D toont dat ook).
    expect(groups[0].arcPoints).toHaveLength(1)

    // vleugel staat onder 45°, niet loodrecht (90°) op de muur.
    const leaf = groups[0].leafLines[0]
    const hinge = { x: leaf[0], y: leaf[1] }
    const tip = { x: leaf[2], y: leaf[3] }
    const leafAngle = Math.atan2(tip.y - hinge.y, tip.x - hinge.x)
    const wallAngle = 0 // muur langs +X
    let diff = Math.abs(leafAngle - wallAngle)
    while (diff > Math.PI) diff -= Math.PI * 2
    diff = Math.abs(diff)
    expect(diff).toBeGreaterThan(Math.PI / 8) // duidelijk geen 0°
    expect(diff).toBeLessThan(Math.PI / 2 - 0.05) // duidelijk geen 90°
  })

  it('renders 2cb4a1c as standard 90° door with arc', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 300, y: 0 }, { x: 100, y: 0 }, [
      doorOpening({
        refid: '2cb4a1c74ec301ab0fdc762deb37eaf0e28d9ecc',
        t: 0.5,
        width: 90,
        mirrored: [1, 1],
      }),
    ])

    expect(groups[0].arcPoints).toHaveLength(1)
    expect(groups[0].catalogLabel).not.toBe('Kastdeur')
  })

  it('defaults unknown refids to a single 90° door', () => {
    const groups = groupDoorOpeningsOnWall('wall-1', { x: 0, y: 0 }, { x: 300, y: 0 }, [
      doorOpening({
        refid: 'unknownrefidunknownrefidunknownrefidunknown',
        t: 0.5,
        width: 90,
      }),
    ])

    expect(groups[0].isDouble).toBe(false)
    expect(groups[0].leafLines).toHaveLength(1)
    expect(groups[0].arcPoints).toHaveLength(1)
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
    const leaf = groups[0].leafLines[0]
    const hinge = { x: leaf[0], y: leaf[1] }
    const tip = { x: leaf[2], y: leaf[3] }
    expect(hinge.x).toBeCloseTo(155, 5)
    expect(Math.hypot(tip.x - hinge.x, tip.y - hinge.y)).toBeCloseTo(90, 5)

    const arc = groups[0].arcPoints[0]
    const arcEnd = { x: arc[arc.length - 2], y: arc[arc.length - 1] }
    expect(Math.hypot(arcEnd.x - hinge.x, arcEnd.y - hinge.y)).toBeCloseTo(90, 5)
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
    const leaf = groups[0].leafLines[0]
    const hinge = { x: leaf[0], y: leaf[1] }
    const tip = { x: leaf[2], y: leaf[3] }
    // Opening bij t=0.5 → midden op (0,-200). start (a-kant) = y≈-155, end (b-kant) = y≈-245.
    // start = richting junction (y groter/kleiner negatief), end = verder van junction.
    const atStart = hinge.y > -200
    const atEnd = hinge.y < -200
    // wallNormal(code) = (1,0) = rechts; zwaaizijde = teken van (tip-hinge).x
    const side = tip.x - hinge.x > 0.5 ? 'right' : tip.x - hinge.x < -0.5 ? 'left' : '?'
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
    expect(resolveOpeningCatalog('df95e84f01163fe9983d43d088551813e40e3e2f', 'door').kind).toBe(
      'sliding_pocket',
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
