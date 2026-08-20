import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import {
  applyFacadeGroupRemaps,
  assignWallsToGroup,
  createFacadeGroup,
  deleteFacadeGroup,
  detachWalls,
  groupIdForWall,
  listFacadeGroups,
  pruneFacadeGroups,
  remapFacadeGroupWallIds,
  renameFacadeGroup,
  wallGuidsInGroup,
} from '@/core/fml/facade-groups'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { applyJunctionSanitizeToPlan } from '@/core/fml/materialize-wall-junctions'
import { sanitizeFmlWallsDetailed } from '@/core/fml/sanitize-fml-walls'
import type { FloorPlan, Wall } from '@/core/fml/types'

function wall(
  id: string,
  a: { x: number; y: number } = { x: 0, y: 0 },
  b: { x: number; y: number } = { x: 100, y: 0 },
): Wall {
  return {
    id,
    a,
    b,
    thickness: 20,
    openings: [],
  }
}

function planWithWalls(ids: string[]): FloorPlan {
  const plan = createEmptyFloorPlan({ name: 'Geveltest' })
  plan.floors[0].walls = ids.map((id) => wall(id))
  return plan
}

describe('facade-groups', () => {
  it('createFacadeGroup maakt G1 met lege leden en settings-source', () => {
    const plan = createEmptyFloorPlan({ name: 'Test' })
    expect(plan.source).toBeUndefined()
    const group = createFacadeGroup(plan, { name: 'Voorgevel', code: 'VG' })
    expect(group).toEqual({ id: 'G1', code: 'VG', name: 'Voorgevel', wallGuids: [] })
    expect(listFacadeGroups(plan)).toHaveLength(1)
    expect(plan.source?.settings?.facadeGroups).toBeTruthy()
  })

  it('assign verplaatst muur van G1 naar G2; G1 verdwijnt als leeg', () => {
    const plan = planWithWalls(['w1', 'w2'])
    createFacadeGroup(plan, { name: 'Voor', code: 'VG' })
    createFacadeGroup(plan, { name: 'Achter', code: 'AG' })
    assignWallsToGroup(plan, 'G1', ['w1', 'w2'])
    expect(wallGuidsInGroup(plan, 'G1').sort()).toEqual(['w1', 'w2'])
    assignWallsToGroup(plan, 'G2', ['w1'])
    expect(groupIdForWall(plan, 'w1')).toBe('G2')
    expect(wallGuidsInGroup(plan, 'G1')).toEqual(['w2'])
    expect(
      listFacadeGroups(plan)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['G1', 'G2'])
  })

  it('detach + lege groep auto-delete', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, 'G1', ['w1'])
    detachWalls(plan, ['w1'])
    expect(listFacadeGroups(plan)).toEqual([])
    expect(groupIdForWall(plan, 'w1')).toBeNull()
  })

  it('deleteFacadeGroup weigert niet-lege groep', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, 'G1', ['w1'])
    expect(deleteFacadeGroup(plan, 'G1')).toBe(false)
    expect(listFacadeGroups(plan)).toHaveLength(1)
    detachWalls(plan, ['w1'])
    // al leeg gewist door detach
    expect(deleteFacadeGroup(plan, 'G1')).toBe(true)
  })

  it('één muur zit in max één groep', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'A' })
    createFacadeGroup(plan, { name: 'B' })
    assignWallsToGroup(plan, 'G1', ['w1'])
    assignWallsToGroup(plan, 'G2', ['w1'])
    expect(groupIdForWall(plan, 'w1')).toBe('G2')
    expect(listFacadeGroups(plan).map((g) => g.id)).toEqual(['G2'])
  })

  it('corrupte dubbele membership: eerste groep wint bij list/prune', () => {
    const plan = planWithWalls(['w1', 'w2'])
    plan.source = {
      settings: {
        facadeGroups: [
          { id: 'G1', code: 'A', name: 'A', wallGuids: ['w1', 'w2'] },
          { id: 'G2', code: 'B', name: 'B', wallGuids: ['w1'] },
        ],
      },
    }
    expect(groupIdForWall(plan, 'w1')).toBe('G1')
    expect(wallGuidsInGroup(plan, 'G2')).toEqual([])
    pruneFacadeGroups(plan)
    expect(groupIdForWall(plan, 'w1')).toBe('G1')
    expect(listFacadeGroups(plan).map((g) => g.id)).toEqual(['G1'])
    expect(wallGuidsInGroup(plan, 'G1').sort()).toEqual(['w1', 'w2'])
  })

  it('prune verwijdert wees-GUIDs en lege groepen', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, 'G1', ['w1', 'ghost'])
    pruneFacadeGroups(plan)
    expect(wallGuidsInGroup(plan, 'G1')).toEqual(['w1'])
    plan.floors[0].walls = []
    pruneFacadeGroups(plan)
    expect(listFacadeGroups(plan)).toEqual([])
  })

  it('remapFacadeGroupWallIds vervangt split-id', () => {
    const plan = planWithWalls(['host', 'split-host-abc'])
    createFacadeGroup(plan, { name: 'Voor', code: 'VG' })
    assignWallsToGroup(plan, 'G1', ['host'])
    remapFacadeGroupWallIds(plan, 'host', ['host', 'split-host-abc'])
    expect(wallGuidsInGroup(plan, 'G1').sort()).toEqual(['host', 'split-host-abc'])
  })

  it('applyFacadeGroupRemaps remapt batch; tak-id blijft buiten groep', () => {
    const plan = planWithWalls(['east', 'east-b', 'branch'])
    createFacadeGroup(plan, { name: 'Oost' })
    assignWallsToGroup(plan, 'G1', ['east'])
    applyFacadeGroupRemaps(plan, [{ fromId: 'east', intoIds: ['east', 'east-b'] }])
    expect(wallGuidsInGroup(plan, 'G1').sort()).toEqual(['east', 'east-b'])
    expect(groupIdForWall(plan, 'branch')).toBeNull()
  })

  it('renameFacadeGroup wijzigt naam/code, niet id', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, 'G1', ['w1'])
    const renamed = renameFacadeGroup(plan, 'G1', { name: 'Voorgevel', code: 'VG' })
    expect(renamed).toEqual({
      id: 'G1',
      code: 'VG',
      name: 'Voorgevel',
      wallGuids: ['w1'],
    })
  })

  it('buildFmlV3 → importFmlV3 behoudt facadeGroups', () => {
    const plan = planWithWalls(['wall-a', 'wall-b'])
    createFacadeGroup(plan, { name: 'Voorgevel', code: 'VG' })
    assignWallsToGroup(plan, 'G1', ['wall-a', 'wall-b'])
    const exported = buildFmlV3(plan)
    const raw = JSON.parse(exported) as {
      settings?: { facadeGroups?: unknown }
    }
    expect(raw.settings?.facadeGroups).toEqual([
      { id: 'G1', code: 'VG', name: 'Voorgevel', wallGuids: ['wall-a', 'wall-b'] },
    ])
    const { plan: reimported } = importFmlV3(exported)
    expect(listFacadeGroups(reimported)).toEqual([
      { id: 'G1', code: 'VG', name: 'Voorgevel', wallGuids: ['wall-a', 'wall-b'] },
    ])
  })

  it('junction-pass: T-host-helften blijven in groep; uitstekende tak niet', () => {
    const plan = createEmptyFloorPlan({ name: 'T' })
    // Oostmuur 0→600, binnenmuur vanaf midpunt naar binnen (T).
    plan.floors[0].walls = [
      wall('east', { x: 600, y: 0 }, { x: 600, y: 600 }),
      wall('branch', { x: 300, y: 300 }, { x: 600, y: 300 }),
    ]
    createFacadeGroup(plan, { name: 'Oostgevel', code: 'O' })
    assignWallsToGroup(plan, 'G1', ['east'])

    const next = applyJunctionSanitizeToPlan(plan)
    const ids = next.floors[0].walls.map((w) => w.id)
    expect(ids).toContain('east')
    expect(ids).toContain('branch')
    expect(ids.some((id) => id.startsWith('split-host-'))).toBe(true)

    const members = wallGuidsInGroup(next, 'G1')
    expect(members).toContain('east')
    expect(members.some((id) => id.startsWith('split-host-'))).toBe(true)
    expect(members).not.toContain('branch')
    expect(groupIdForWall(next, 'branch')).toBeNull()
    for (const id of members) {
      expect(groupIdForWall(next, id)).toBe('G1')
    }
  })

  it('Opschonen-remap: T-split host-helften in groep', () => {
    const walls = [
      wall('east', { x: 600, y: 0 }, { x: 600, y: 600 }),
      wall('branch', { x: 300, y: 300 }, { x: 600, y: 300 }),
    ]
    const plan = createEmptyFloorPlan({ name: 'Sanitize' })
    plan.floors[0].walls = walls
    createFacadeGroup(plan, { name: 'Oost' })
    assignWallsToGroup(plan, 'G1', ['east'])

    const detailed = sanitizeFmlWallsDetailed(walls)
    expect(detailed.remaps.length).toBeGreaterThan(0)
    // Zelfde volgorde als editor: muren eerst, dan remap, dan prune wezen.
    plan.floors[0].walls = detailed.walls
    applyFacadeGroupRemaps(plan, detailed.remaps)
    pruneFacadeGroups(plan)

    const members = wallGuidsInGroup(plan, 'G1')
    expect(members).toContain('east')
    expect(members.some((id) => id.startsWith('split-host-'))).toBe(true)
    expect(members).not.toContain('branch')
  })
})
