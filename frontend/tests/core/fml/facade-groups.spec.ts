import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import {
  applyFacadeGroupRemaps,
  assignWallsToGroup,
  assignWallsToStamp,
  createFacadeGroup,
  deleteFacadeGroup,
  detachWalls,
  detachWallsFromFacade,
  detachWallsFromStamp,
  ensureStampFacadeGroup,
  hasElevationFacadeGroups,
  groupIdForWall,
  isWallInStampGroup,
  listFacadeGroups,
  pruneFacadeGroups,
  remapFacadeGroupWallIds,
  renameFacadeGroup,
  STAMP_FACADE_GROUP_ID,
  stripFacadeGroupsFromPlan,
  stripStampGroupFromPlan,
  wallGuidsInGroup,
  wallsInStampGroup,
} from '@/core/fml/facade-groups'
import { applyStampToFloor, canApplyStampToFloor } from '@/core/fml/apply-stamp-to-floor'
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
    expect(hasElevationFacadeGroups(plan)).toBe(false)
  })

  it('hasElevationFacadeGroups alleen bij niet-stamp groep met muren', () => {
    const plan = planWithWalls(['w1'])
    ensureStampFacadeGroup(plan)
    expect(hasElevationFacadeGroups(plan)).toBe(false)
    const group = createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, group.id, ['w1'])
    expect(hasElevationFacadeGroups(plan)).toBe(true)
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

  it('ensureStampFacadeGroup maakt vaste id stamp eenmalig', () => {
    const plan = planWithWalls(['w1', 'w2'])
    expect(ensureStampFacadeGroup(plan)).toBe(true)
    expect(ensureStampFacadeGroup(plan)).toBe(false)
    const groups = listFacadeGroups(plan)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.id).toBe(STAMP_FACADE_GROUP_ID)
    expect(groups[0]?.name).toBe('Stempel')
  })

  it('wallsInStampGroup filtert op Stempel-leden; detach houdt lege stamp', () => {
    const plan = planWithWalls(['w1', 'w2', 'w3'])
    ensureStampFacadeGroup(plan)
    assignWallsToGroup(plan, STAMP_FACADE_GROUP_ID, ['w1', 'w3'])
    expect(
      wallsInStampGroup(plan, 0)
        .map((w) => w.id)
        .sort(),
    ).toEqual(['w1', 'w3'])
    detachWalls(plan, ['w1', 'w3'])
    expect(listFacadeGroups(plan).map((g) => g.id)).toEqual([STAMP_FACADE_GROUP_ID])
    expect(wallsInStampGroup(plan, 0)).toEqual([])
  })

  it('stripFacadeGroupsFromPlan verwijdert settings-key voor export', () => {
    const plan = planWithWalls(['w1'])
    ensureStampFacadeGroup(plan)
    assignWallsToGroup(plan, STAMP_FACADE_GROUP_ID, ['w1'])
    const stripped = stripFacadeGroupsFromPlan(plan)
    expect(stripped.source?.settings?.facadeGroups).toBeUndefined()
    expect(listFacadeGroups(plan)).toHaveLength(1)
    const json = buildFmlV3(stripped, { name: 'Export' })
    expect(json).not.toContain('facadeGroups')
  })

  it('muur mag in gevel + stamp tegelijk', () => {
    const plan = planWithWalls(['w1', 'w2'])
    createFacadeGroup(plan, { name: 'Voor' })
    ensureStampFacadeGroup(plan)
    assignWallsToGroup(plan, 'G1', ['w1'])
    assignWallsToStamp(plan, ['w1', 'w2'])
    expect(groupIdForWall(plan, 'w1')).toBe('G1')
    expect(isWallInStampGroup(plan, 'w1')).toBe(true)
    expect(isWallInStampGroup(plan, 'w2')).toBe(true)
    expect(groupIdForWall(plan, 'w2')).toBeNull()
    expect(wallGuidsInGroup(plan, 'G1')).toEqual(['w1'])
    expect(wallGuidsInGroup(plan, STAMP_FACADE_GROUP_ID).sort()).toEqual(['w1', 'w2'])
  })

  it('gevel-detach laat stamp staan; detach wis beide', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    ensureStampFacadeGroup(plan)
    assignWallsToGroup(plan, 'G1', ['w1'])
    assignWallsToStamp(plan, ['w1'])
    detachWallsFromFacade(plan, ['w1'])
    expect(groupIdForWall(plan, 'w1')).toBeNull()
    expect(isWallInStampGroup(plan, 'w1')).toBe(true)
    detachWallsFromStamp(plan, ['w1'])
    expect(isWallInStampGroup(plan, 'w1')).toBe(false)
    assignWallsToGroup(plan, 'G1', ['w1'])
    assignWallsToStamp(plan, ['w1'])
    detachWalls(plan, ['w1'])
    expect(groupIdForWall(plan, 'w1')).toBeNull()
    expect(isWallInStampGroup(plan, 'w1')).toBe(false)
  })

  it('stripStampGroupFromPlan houdt gevel, verwijdert stamp', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor', code: 'VG' })
    ensureStampFacadeGroup(plan)
    assignWallsToGroup(plan, 'G1', ['w1'])
    assignWallsToStamp(plan, ['w1'])
    const stripped = stripStampGroupFromPlan(plan)
    expect(listFacadeGroups(stripped).map((g) => g.id)).toEqual(['G1'])
    expect(wallGuidsInGroup(stripped, 'G1')).toEqual(['w1'])
    expect(isWallInStampGroup(stripped, 'w1')).toBe(false)
    // Bron-plan ongemoeid
    expect(isWallInStampGroup(plan, 'w1')).toBe(true)
  })

  it('remap split-id in gevel én stamp', () => {
    const plan = planWithWalls(['host', 'split-host-abc'])
    createFacadeGroup(plan, { name: 'Voor' })
    ensureStampFacadeGroup(plan)
    assignWallsToGroup(plan, 'G1', ['host'])
    assignWallsToStamp(plan, ['host'])
    remapFacadeGroupWallIds(plan, 'host', ['host', 'split-host-abc'])
    expect(wallGuidsInGroup(plan, 'G1').sort()).toEqual(['host', 'split-host-abc'])
    expect(wallGuidsInGroup(plan, STAMP_FACADE_GROUP_ID).sort()).toEqual(['host', 'split-host-abc'])
  })

  it('applyStampToFloor kopieert muren; tweede apply is no-op', () => {
    const plan = createEmptyFloorPlan({ name: 'Multi' })
    plan.floors[0].walls = [wall('src', { x: 0, y: 0 }, { x: 200, y: 0 })]
    plan.floors[0].height = 280
    plan.floors.push({
      name: '1e',
      level: 1,
      height: 260,
      walls: [],
    })
    createFacadeGroup(plan, { name: 'Voor' })
    ensureStampFacadeGroup(plan)
    assignWallsToGroup(plan, 'G1', ['src'])
    assignWallsToStamp(plan, ['src'])

    expect(canApplyStampToFloor(plan, 1)).toBe(true)
    const first = applyStampToFloor(plan, 1)
    expect(first.addedWallIds).toHaveLength(1)
    expect(first.skippedCount).toBe(0)
    const addedId = first.addedWallIds[0]
    const added = first.plan.floors[1].walls.find((w) => w.id === addedId)!
    expect(added.a).toEqual({ x: 0, y: 0 })
    expect(added.b).toEqual({ x: 200, y: 0 })
    expect(added.openings).toEqual([])
    expect(added.extras?.az).toEqual({ z: 0, h: 260 })
    expect(groupIdForWall(first.plan, addedId)).toBe('G1')
    expect(isWallInStampGroup(first.plan, addedId)).toBe(false)
    expect(isWallInStampGroup(first.plan, 'src')).toBe(true)

    expect(canApplyStampToFloor(first.plan, 1)).toBe(false)
    const second = applyStampToFloor(first.plan, 1)
    expect(second.addedWallIds).toEqual([])
    expect(second.skippedCount).toBe(1)
    expect(second.plan.floors[1].walls).toHaveLength(1)
  })
})
