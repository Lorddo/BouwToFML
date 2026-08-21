import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { markStampOwned, isStampOwnedWall } from '@/core/fml/stamp-owned'
import {
  resolveStampOwnership,
  transferOpeningToStampWall,
  STAMP_OWN_MIN_KEEP_CM,
} from '@/core/fml/resolve-stamp-ownership'
import { harmonizeFmlWallThickness } from '@/core/fml/harmonize-fml-wall-thickness'
import { collectStampOwnedWallIds } from '@/core/fml/stamp-owned'
import { filterInjectWallsByEraseMask } from '@/cv/preprocess/stamp-inject-erase-filter'
import type { FloorPlan, Opening, Wall } from '@/core/fml/types'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  thickness: number,
  openings: Opening[] = [],
): Wall {
  return { id, a, b, thickness, balance: 0.5, c: null, openings }
}

function stamp(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  thickness: number,
): Wall {
  return markStampOwned(wall(id, a, b, thickness))
}

describe('resolveStampOwnership', () => {
  it('deel-overlap: detectie 6 m van 10 m stempel → detectie weg, stempel blijft', () => {
    const walls = [
      wall('det', { x: 0, y: 0 }, { x: 600, y: 0 }, 10),
      stamp('s1', { x: 0, y: 0 }, { x: 1000, y: 0 }, 10),
    ]
    const result = resolveStampOwnership(walls)
    expect(result.walls.filter((w) => !isStampOwnedWall(w))).toHaveLength(0)
    expect(result.walls.filter(isStampOwnedWall)).toHaveLength(1)
    expect(result.droppedCount).toBe(1)
  })

  it('parallel 5 cm ernaast → detectie weg', () => {
    const walls = [
      wall('det', { x: 0, y: 5 }, { x: 400, y: 5 }, 10),
      stamp('s1', { x: 0, y: 0 }, { x: 400, y: 0 }, 10),
    ]
    const result = resolveStampOwnership(walls)
    expect(result.walls.filter((w) => !isStampOwnedWall(w))).toHaveLength(0)
    expect(result.droppedCount).toBe(1)
  })

  it('twee donor-bladen (spouw) → twee detectie-bladen blijven', () => {
    const walls = [
      wall('dInner', { x: 0, y: 0 }, { x: 400, y: 0 }, 10),
      wall('dOuter', { x: 0, y: 20 }, { x: 400, y: 20 }, 10),
      stamp('sInner', { x: 0, y: 0 }, { x: 400, y: 0 }, 10),
      stamp('sOuter', { x: 0, y: 20 }, { x: 400, y: 20 }, 10),
    ]
    const result = resolveStampOwnership(walls)
    expect(result.walls.filter(isStampOwnedWall)).toHaveLength(2)
    expect(result.walls.filter((w) => !isStampOwnedWall(w))).toHaveLength(0)
  })

  it('twee collineaire stempelstukken → corridor klapt niet in', () => {
    const walls = [
      wall('det', { x: 0, y: 4 }, { x: 800, y: 4 }, 10),
      stamp('sLeft', { x: 0, y: 0 }, { x: 400, y: 0 }, 10),
      stamp('sRight', { x: 400, y: 0 }, { x: 800, y: 0 }, 10),
    ]
    const result = resolveStampOwnership(walls)
    expect(result.walls.filter((w) => !isStampOwnedWall(w))).toHaveLength(0)
    expect(result.droppedCount).toBe(1)
  })

  it('detectie loopt voorbij stempel → reststuk blijft met stempeldikte', () => {
    const walls = [
      wall('det', { x: 0, y: 0 }, { x: 1000, y: 0 }, 12),
      stamp('s1', { x: 0, y: 0 }, { x: 400, y: 0 }, 10),
    ]
    const result = resolveStampOwnership(walls)
    const rest = result.walls.filter((w) => !isStampOwnedWall(w))
    // overlap 400/1000 = 0.4 < 0.5 → trim, rest blijft
    expect(rest.length).toBe(1)
    expect(rest[0].thickness).toBe(10)
    expect(rest[0].a.x).toBeGreaterThan(390)
    expect(result.trimmedCount).toBe(1)
  })

  it('T 5 cm ernaast → detectie-eindpunt op stempelhartlijn', () => {
    const walls = [
      wall('t', { x: 200, y: 5 }, { x: 200, y: 300 }, 10),
      stamp('s1', { x: 0, y: 0 }, { x: 400, y: 0 }, 10),
    ]
    const result = resolveStampOwnership(walls)
    const tWall = result.walls.find((w) => w.id === 't')
    const s1 = result.walls.find((w) => w.id === 's1')!
    expect(tWall).toBeTruthy()
    expect(Math.abs(tWall!.a.y)).toBeLessThan(0.01)
    expect(s1.a.y).toBe(0)
    expect(s1.b.y).toBe(0)
    expect(result.snappedCount).toBe(1)
  })

  it('opening + tegengestelde a→b → t uit projectie, mirrored geflipt', () => {
    const opening: Opening = {
      refid: 'door',
      t: 0.25,
      width: 90,
      type: 'door',
      mirrored: [0, 0],
    }
    const from = wall('from', { x: 0, y: 0 }, { x: 400, y: 0 }, 10, [opening])
    const to = stamp('to', { x: 400, y: 0 }, { x: 0, y: 0 }, 10)
    const moved = transferOpeningToStampWall(opening, from, to)
    expect(moved.t).toBeCloseTo(0.75, 5)
    expect(moved.mirrored).toEqual([1, 1])
  })

  it('rest korter dan MIN_KEEP verdwijnt', () => {
    const keep = STAMP_OWN_MIN_KEEP_CM
    const walls = [
      wall('det', { x: 0, y: 0 }, { x: 400 + keep - 5, y: 0 }, 10),
      stamp('s1', { x: 0, y: 0 }, { x: 400, y: 0 }, 10),
    ]
    const result = resolveStampOwnership(walls)
    expect(result.walls.filter((w) => !isStampOwnedWall(w))).toHaveLength(0)
  })

  it('ronde 2: stempelcoords bevroren — detectie snapt op stempel (niet andersom)', () => {
    const walls = [
      wall('col', { x: 162.54, y: 751.87 }, { x: 162.54, y: 500.9 }, 50),
      stamp('sH', { x: 163.23, y: 500.9 }, { x: 353.3, y: 500.9 }, 30),
    ]
    const result = resolveStampOwnership(walls)
    const sH = result.walls.find((w) => w.id === 'sH')!
    const col = result.walls.find((w) => w.id === 'col')!
    // Stempel blijft op donor-cm
    expect(sH.a.x).toBeCloseTo(163.23, 5)
    expect(sH.a.y).toBeCloseTo(500.9, 5)
    expect(sH.thickness).toBe(30)
    // Kolom-eindpunt op stempel-as (y=500.9); x mag naar snijpunt
    expect(col.b.y).toBeCloseTo(500.9, 1)
    expect(Math.hypot(sH.a.x - col.b.x, sH.a.y - col.b.y)).toBeLessThan(0.05)
  })

  it('ronde 2: detectie-parallel met overlap ≥50% → drop; stamp dikte 30 blijft 30', () => {
    const walls = [
      wall('det', { x: 0, y: 4 }, { x: 400, y: 4 }, 50),
      stamp('s1', { x: 0, y: 0 }, { x: 400, y: 0 }, 30),
    ]
    const result = resolveStampOwnership(walls)
    expect(result.walls.filter((w) => !isStampOwnedWall(w))).toHaveLength(0)
    const s1 = result.walls.find((w) => w.id === 's1')!
    expect(s1.thickness).toBe(30)
    expect(s1.a).toEqual({ x: 0, y: 0 })
    expect(s1.b).toEqual({ x: 400, y: 0 })
  })

  it('ronde 2: na ownership + harmonize-pin blijft stamp dikte 30', () => {
    const walls = [
      wall('det', { x: 0, y: 3 }, { x: 500, y: 3 }, 50),
      stamp('s1', { x: 0, y: 0 }, { x: 500, y: 0 }, 30),
    ]
    const owned = resolveStampOwnership(walls).walls
    const plan: FloorPlan = {
      name: 'T',
      floors: [{ name: 'F0', level: 0, height: 280, walls: owned }],
    }
    const pinned = collectStampOwnedWallIds(owned)
    const harm = harmonizeFmlWallThickness(
      plan,
      { minCm: 10, midCm: 20, maxCm: 50 },
      { midBoundaryCm: 15, maxBoundaryCm: 25 },
      undefined,
      pinned,
    )
    const s1 = harm.floors[0].walls.find((w) => w.id === 's1')!
    expect(s1.thickness).toBe(30)
  })

  it('weld trekt detectie-eindpunt naar stempel; stamp blijft staan', () => {
    const walls = [
      wall('v', { x: 100, y: 0 }, { x: 100.7, y: 200 }, 50),
      stamp('s', { x: 100, y: 200 }, { x: 300, y: 200 }, 10),
    ]
    const result = resolveStampOwnership(walls)
    const s = result.walls.find((w) => w.id === 's')!
    const v = result.walls.find((w) => w.id === 'v')!
    expect(s.a).toEqual({ x: 100, y: 200 })
    expect(s.b).toEqual({ x: 300, y: 200 })
    const gap = Math.min(
      Math.hypot(s.a.x - v.a.x, s.a.y - v.a.y),
      Math.hypot(s.a.x - v.b.x, s.a.y - v.b.y),
    )
    expect(gap).toBeLessThan(0.05)
  })
})

describe('stampOwned export', () => {
  it('buildFmlV3 stript stampOwned uit wall extras', () => {
    const owned = markStampOwned(wall('s1', { x: 0, y: 0 }, { x: 100, y: 0 }, 10))
    expect(isStampOwnedWall(owned)).toBe(true)
    const plan: FloorPlan = {
      name: 'T',
      floors: [{ name: 'F0', level: 0, height: 280, walls: [owned] }],
    }
    const text = buildFmlV3(plan)
    expect(text).not.toContain('stampOwned')
    const json = JSON.parse(text) as {
      floors: Array<{ designs: Array<{ walls: Array<{ guid: string }> }> }>
    }
    expect(json.floors[0].designs[0].walls[0].guid).toBe('s1')
  })
})

describe('filterInjectWallsByEraseMask', () => {
  it('filtert muur met ≥50% erase-dekking', () => {
    const width = 500
    const height = 200
    const erase = new Uint8Array(width * height)
    for (let x = 0; x < width; x += 1) erase[10 * width + x] = 255

    const walls: Wall[] = [
      wall('keep', { x: 0, y: 0 }, { x: 40, y: 0 }, 10),
      wall('drop', { x: 0, y: 1 }, { x: 40, y: 1 }, 10),
    ]
    const filtered = filterInjectWallsByEraseMask({
      walls,
      eraseMask: erase,
      imageWidth: width,
      imageHeight: height,
      originCm: { x: 0, y: 0 },
      baseBounds: { x: 0, y: 0, width: 500, height: 200 },
      bounds: { x: 0, y: 0, width: 500, height: 200 },
      pxPerMmX: 1,
      pxPerMmY: 1,
    })
    expect(filtered.map((w) => w.id)).toEqual(['keep'])
  })
})
