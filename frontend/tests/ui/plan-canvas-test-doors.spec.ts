import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { resolveOpeningCatalog } from '@/core/plan/opening-refid-catalog'
import { groupDoorOpeningsOnWall } from '@/ui/components/plan-canvas-doors'

const TEST_FML = resolve(__dirname, '../../../examples/FML(test)/test-doors.json.fml')

function loadPlan() {
  const { plan, warnings } = importFmlV3(readFileSync(TEST_FML, 'utf8'))
  return { plan, warnings }
}

describe('test-doors.json.fml', () => {
  it('imports cleanly: 1 floor, 4 walls, no warnings', () => {
    const { plan, warnings } = loadPlan()
    expect(warnings).toHaveLength(0)
    expect(plan.floors).toHaveLength(1)
    const walls = plan.floors[0].walls
    expect(walls).toHaveLength(4)
    expect(walls.every((w) => w.openings.length === 12)).toBe(true)
  })

  it('covers the 4 wall orientations (horizontal, vertical, 2 diagonals)', () => {
    const { plan } = loadPlan()
    const walls = plan.floors[0].walls
    const orient = walls.map((w) => {
      const dx = w.b.x - w.a.x
      const dy = w.b.y - w.a.y
      const isHor = Math.abs(dy) < 1e-6 && Math.abs(dx) > 1
      const isVer = Math.abs(dx) < 1e-6 && Math.abs(dy) > 1
      const isDiag = !isHor && !isVer
      return isHor ? 'h' : isVer ? 'v' : isDiag ? 'd' : '?'
    })
    expect(orient.sort()).toEqual(['d', 'd', 'h', 'v'])
  })

  it('places single → closet45 → double_wide, each with 4 mirrored combos, per wall', () => {
    const { plan } = loadPlan()
    for (const wall of plan.floors[0].walls) {
      const kinds = wall.openings.map((o) => resolveOpeningCatalog(o.kind, 'door').kind)
      expect(kinds).toEqual([
        'single',
        'single',
        'single',
        'single',
        'closet45',
        'closet45',
        'closet45',
        'closet45',
        'double_wide',
        'double_wide',
        'double_wide',
        'double_wide',
      ])
      const mirrors = wall.openings.map((o) => `${o.mirrored?.[0] ?? 0}${o.mirrored?.[1] ?? 0}`)
      // per type-blok van 4: [00,01,10,11]
      expect(mirrors.slice(0, 4)).toEqual(['00', '01', '10', '11'])
      expect(mirrors.slice(4, 8)).toEqual(['00', '01', '10', '11'])
      expect(mirrors.slice(8, 12)).toEqual(['00', '01', '10', '11'])
    }
  })

  it('renders 12 door groups per wall with correct symbol shapes', () => {
    const { plan } = loadPlan()
    for (const wall of plan.floors[0].walls) {
      const groups = groupDoorOpeningsOnWall(wall.id, wall.a, wall.b, wall.openings)
      expect(groups).toHaveLength(12)
      groups.forEach((g) => {
        const kind = resolveOpeningCatalog(g.openings[0].kind, 'door').kind
        const leaves = g.glyphs.filter((x) => x.kind === 'polyline' && x.role === 'leaf')
        const arcs = g.glyphs.filter((x) => x.role === 'swing')
        if (kind === 'single') {
          expect(leaves.filter((l) => l.kind === 'polyline' && l.closed)).toHaveLength(1)
          expect(leaves.filter((l) => l.kind === 'polyline' && !l.closed)).toHaveLength(1)
          expect(arcs).toHaveLength(1)
        } else if (kind === 'closet45') {
          expect(leaves.filter((l) => l.kind === 'polyline' && l.closed)).toHaveLength(1)
          expect(leaves.filter((l) => l.kind === 'polyline' && !l.closed)).toHaveLength(1)
          expect(arcs).toHaveLength(1) // 45° met boogje
        } else if (kind === 'double_wide') {
          expect(leaves.filter((l) => l.kind === 'polyline' && l.closed)).toHaveLength(2)
          expect(leaves.filter((l) => l.kind === 'polyline' && !l.closed)).toHaveLength(2)
          expect(arcs).toHaveLength(2)
        }
      })
    }
  })

  it('is direction-invariant: same mirrored combo renders same swing side across orientations', () => {
    const { plan } = loadPlan()
    const walls = plan.floors[0].walls
    // Vergelijk de swing-zijde (teken van (tip - hinge) · normal) voor pos 0 (single m00)
    // op alle 4 de muren — moet consistent zijn (alle +normal of alle -normal).
    function swingSignOf(wall: (typeof walls)[number], pos: number): number {
      const groups = groupDoorOpeningsOnWall(wall.id, wall.a, wall.b, wall.openings)
      const g = groups[pos]
      const leaf = g.glyphs.find((x) => x.kind === 'polyline' && x.role === 'leaf' && x.closed)
      const arc = g.glyphs.find((x) => x.kind === 'arc')
      expect(leaf?.kind).toBe('polyline')
      expect(arc?.kind).toBe('arc')
      if (leaf?.kind !== 'polyline' || arc?.kind !== 'arc') return 0
      const p = leaf.points
      const hinge = { x: (p[0] + p[6]) / 2, y: (p[1] + p[7]) / 2 }
      const open = {
        x: arc.cx + Math.cos(arc.startRad + arc.sweepRad) * arc.r,
        y: arc.cy + Math.sin(arc.startRad + arc.sweepRad) * arc.r,
      }
      const dx = wall.b.x - wall.a.x
      const dy = wall.b.y - wall.a.y
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      return Math.sign((open.x - hinge.x) * nx + (open.y - hinge.y) * ny)
    }
    const signs = walls.map((w) => swingSignOf(w, 0)) // single, mirrored [0,0]
    expect(new Set(signs).size).toBe(1) // allemaal dezelfde zijde t.o.v. de muur-normaal
  })
})
