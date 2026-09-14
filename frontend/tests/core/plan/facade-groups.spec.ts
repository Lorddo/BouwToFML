import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import {
  applyFacadeGroupRemaps,
  assignWallsToGroup,
  assignWallsToStamp,
  createFacadeGroup,
  deleteFacadeGroup,
  detachWalls,
  detachWallsFromFacade,
  detachWallsFromStamp,
  ensureDefaultFacadeGroups,
  ensureStampFacadeGroup,
  findStackedWallIds,
  hasElevationFacadeGroups,
  hydrateFacadeGroupsFromNativeMarkers,
  groupIdForWall,
  groupIdsForWall,
  isWallInStampGroup,
  nativeGroupRefsFromWallExtras,
  listFacadeGroups,
  pruneFacadeGroups,
  remapFacadeGroupWallIds,
  renameFacadeGroup,
  STAMP_FACADE_GROUP_ID,
  stripFacadeGroupsFromPlan,
  stripStampGroupFromPlan,
  syncNativeMarkersOnWalls,
  wallGuidsInGroup,
  wallsInStampGroup,
} from '@/core/plan/facade-groups'
import { applyStampToFloor, canApplyStampToFloor } from '@/core/plan/apply-stamp-to-floor'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { applyJunctionSanitizeToPlan } from '@/core/plan/materialize-wall-junctions'
import { sanitizePlanWallsDetailed } from '@/core/plan/sanitize-plan-walls'
import type { FloorPlan, Wall } from '@/core/plan/types'

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
  it('createFacadeGroup maakt G1 met lege leden, nativeId en typed catalogus', () => {
    const plan = createEmptyFloorPlan({ name: 'Test' })
    expect(plan.source).toBeUndefined()
    const group = createFacadeGroup(plan, { name: 'Voorgevel', code: 'VG' })
    expect(group.id).toBe('G1')
    expect(group.code).toBe('VG')
    expect(group.name).toBe('Voorgevel')
    expect(group.wallGuids).toEqual([])
    expect(typeof group.nativeId).toBe('number')
    expect(typeof group.groupMarker).toBe('number')
    expect(listFacadeGroups(plan)).toHaveLength(1)
    expect(plan.facadeGroups).toBeTruthy()
    expect(plan.source?.settings?.facadeGroups).toBeUndefined()
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

  it('assign voegt toe; muur mag in G1 én G2', () => {
    const plan = planWithWalls(['w1', 'w2'])
    createFacadeGroup(plan, { name: 'Voor', code: 'VG' })
    createFacadeGroup(plan, { name: 'Achter', code: 'AG' })
    assignWallsToGroup(plan, 'G1', ['w1', 'w2'])
    expect(wallGuidsInGroup(plan, 'G1').sort()).toEqual(['w1', 'w2'])
    assignWallsToGroup(plan, 'G2', ['w1'])
    expect(groupIdsForWall(plan, 'w1').sort()).toEqual(['G1', 'G2'])
    expect(wallGuidsInGroup(plan, 'G1').sort()).toEqual(['w1', 'w2'])
    expect(wallGuidsInGroup(plan, 'G2')).toEqual(['w1'])
    expect(
      listFacadeGroups(plan)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['G1', 'G2'])
  })

  it('detach houdt lege groep als catalogus-slot', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, 'G1', ['w1'])
    detachWalls(plan, ['w1'])
    expect(listFacadeGroups(plan)).toHaveLength(1)
    expect(wallGuidsInGroup(plan, 'G1')).toEqual([])
    expect(groupIdForWall(plan, 'w1')).toBeNull()
  })

  it('deleteFacadeGroup weigert niet-lege groep; force wist leden', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, 'G1', ['w1'])
    expect(deleteFacadeGroup(plan, 'G1')).toBe(false)
    expect(listFacadeGroups(plan)).toHaveLength(1)
    detachWalls(plan, ['w1'])
    expect(deleteFacadeGroup(plan, 'G1')).toBe(true)
    expect(listFacadeGroups(plan)).toEqual([])
    createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, 'G1', ['w1'])
    expect(deleteFacadeGroup(plan, 'G1', { force: true })).toBe(true)
    expect(listFacadeGroups(plan)).toEqual([])
    expect(groupIdForWall(plan, 'w1')).toBeNull()
  })

  it('muur mag in meerdere gevelgroepen', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'A' })
    createFacadeGroup(plan, { name: 'B' })
    assignWallsToGroup(plan, 'G1', ['w1'])
    assignWallsToGroup(plan, 'G2', ['w1'])
    expect(groupIdsForWall(plan, 'w1').sort()).toEqual(['G1', 'G2'])
    expect(
      listFacadeGroups(plan)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['G1', 'G2'])
  })

  it('overlap tussen groepen blijft bij list/prune', () => {
    const plan = planWithWalls(['w1', 'w2'])
    plan.source = {
      settings: {
        facadeGroups: [
          { id: 'G1', code: 'A', name: 'A', wallGuids: ['w1', 'w2'] },
          { id: 'G2', code: 'B', name: 'B', wallGuids: ['w1'] },
        ],
      },
    }
    expect(groupIdsForWall(plan, 'w1').sort()).toEqual(['G1', 'G2'])
    expect(wallGuidsInGroup(plan, 'G2')).toEqual(['w1'])
    pruneFacadeGroups(plan)
    expect(groupIdsForWall(plan, 'w1').sort()).toEqual(['G1', 'G2'])
    expect(
      listFacadeGroups(plan)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['G1', 'G2'])
    expect(wallGuidsInGroup(plan, 'G1').sort()).toEqual(['w1', 'w2'])
  })

  it('prune verwijdert wees-GUIDs; lege groepen blijven', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, 'G1', ['w1', 'ghost'])
    pruneFacadeGroups(plan)
    expect(wallGuidsInGroup(plan, 'G1')).toEqual(['w1'])
    plan.floors[0].walls = []
    pruneFacadeGroups(plan)
    expect(listFacadeGroups(plan)).toHaveLength(1)
    expect(wallGuidsInGroup(plan, 'G1')).toEqual([])
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

  it('renameFacadeGroup wijzigt naam/code, niet id; geen native sync op muur', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, 'G1', ['w1'])
    const renamed = renameFacadeGroup(plan, 'G1', { name: 'Voorgevel', code: 'VG' })
    expect(renamed?.id).toBe('G1')
    expect(renamed?.code).toBe('VG')
    expect(renamed?.name).toBe('Voorgevel')
    expect(renamed?.wallGuids).toEqual(['w1'])
    expect(plan.floors[0].walls[0].extras?.groupMarkerConfig).toBeUndefined()
  })

  it('buildFmlV3 → importFmlV3 behoudt facadeGroups; geen native groupId op muur', () => {
    const plan = planWithWalls(['wall-a', 'wall-b'])
    createFacadeGroup(plan, { name: 'Voorgevel', code: 'VG' })
    assignWallsToGroup(plan, 'G1', ['wall-a', 'wall-b'])
    const g1 = listFacadeGroups(plan)[0]
    expect(plan.facadeGroups?.[0]?.id).toBe('G1')
    expect(plan.source?.settings?.facadeGroups).toBeUndefined()
    const exported = buildFmlV3(plan)
    const raw = JSON.parse(exported) as {
      settings?: { facadeGroups?: Array<Record<string, unknown>> }
      floors?: Array<{ designs?: Array<{ walls?: Array<Record<string, unknown>> }> }>
    }
    expect(raw.settings?.facadeGroups?.[0]).toMatchObject({
      id: 'G1',
      code: 'VG',
      name: 'Voorgevel',
      wallGuids: ['wall-a', 'wall-b'],
      nativeId: g1.nativeId,
      groupMarker: g1.groupMarker,
    })
    const wallRaw = raw.floors?.[0]?.designs?.[0]?.walls?.find((w) => w.guid === 'wall-a')
    expect(wallRaw?.groupMarkerConfig).toEqual({ locked: false })
    expect(wallRaw?.groupMarker).toBeUndefined()
    const { plan: reimported } = importFmlV3(exported)
    expect(reimported.source?.settings?.facadeGroups).toBeUndefined()
    expect(reimported.facadeGroups?.[0]).toMatchObject({
      id: 'G1',
      code: 'VG',
      name: 'Voorgevel',
      wallGuids: ['wall-a', 'wall-b'],
      nativeId: g1.nativeId,
    })
    expect(listFacadeGroups(reimported)[0]).toMatchObject({
      id: 'G1',
      code: 'VG',
      name: 'Voorgevel',
      wallGuids: ['wall-a', 'wall-b'],
      nativeId: g1.nativeId,
    })
  })

  it('assign schrijft alleen catalogus; geen native markers op de muur', () => {
    const plan = planWithWalls(['w1'])
    const gevel = createFacadeGroup(plan, { name: 'Voor' })
    ensureStampFacadeGroup(plan)
    assignWallsToGroup(plan, gevel.id, ['w1'])
    assignWallsToStamp(plan, ['w1'])
    expect(groupIdForWall(plan, 'w1')).toBe(gevel.id)
    expect(isWallInStampGroup(plan, 'w1')).toBe(true)
    expect(plan.floors[0].walls[0].extras?.groupMarkerConfig).toBeUndefined()
    expect(plan.floors[0].walls[0].extras?.groupMarker).toBeUndefined()
  })

  it('stripStampGroupFromPlan houdt gevel-catalogus, stript alle native markers', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor', code: 'VG' })
    ensureStampFacadeGroup(plan)
    assignWallsToGroup(plan, 'G1', ['w1'])
    assignWallsToStamp(plan, ['w1'])
    // Legacy native markers (oude sessie) moeten ook weg bij editor-download.
    syncNativeMarkersOnWalls(plan)
    const stripped = stripStampGroupFromPlan(plan)
    expect(listFacadeGroups(stripped).map((g) => g.id)).toEqual(['G1'])
    expect(wallGuidsInGroup(stripped, 'G1')).toEqual(['w1'])
    expect(isWallInStampGroup(stripped, 'w1')).toBe(false)
    expect(stripped.floors[0].walls[0].extras?.groupMarker).toBeUndefined()
    expect(stripped.floors[0].walls[0].extras?.groupMarkerConfig).toEqual({ locked: false })
    // Bron-plan ongemoeid
    expect(isWallInStampGroup(plan, 'w1')).toBe(true)
  })

  it('stripFacadeGroupsFromPlan verwijdert catalogus én native markers', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, 'G1', ['w1'])
    assignWallsToStamp(plan, ['w1'])
    const stripped = stripFacadeGroupsFromPlan(plan)
    expect(stripped.facadeGroups).toBeUndefined()
    expect(stripped.source?.settings?.facadeGroups).toBeUndefined()
    expect(listFacadeGroups(plan).length).toBeGreaterThan(0)
    expect(stripped.floors[0].walls[0].extras?.groupMarker).toBeUndefined()
    expect(stripped.floors[0].walls[0].extras?.groupMarkerConfig).toEqual({ locked: false })
    const json = buildFmlV3(stripped, { name: 'Export' })
    expect(json).not.toContain('facadeGroups')
    expect(json).not.toContain('stampGroupId')
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

    const detailed = sanitizePlanWallsDetailed(walls)
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

  it('ensureDefaultFacadeGroups zaait 4 slots; aanzicht pas met muren', () => {
    const plan = planWithWalls(['w1'])
    expect(ensureDefaultFacadeGroups(plan)).toBe(true)
    expect(ensureDefaultFacadeGroups(plan)).toBe(false)
    expect(listFacadeGroups(plan).map((g) => g.id)).toEqual(['front', 'back', 'left', 'right'])
    expect(hasElevationFacadeGroups(plan)).toBe(false)
    assignWallsToGroup(plan, 'front', ['w1'])
    expect(hasElevationFacadeGroups(plan)).toBe(true)
  })

  it('ensureDefaultFacadeGroups no-op als er al een gevelgroep is', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    expect(ensureDefaultFacadeGroups(plan)).toBe(false)
    expect(listFacadeGroups(plan).map((g) => g.id)).toEqual(['G1'])
  })

  it('ensureDefaultFacadeGroups naast stamp; lege presets = no-op', () => {
    const plan = planWithWalls(['w1'])
    ensureStampFacadeGroup(plan)
    expect(ensureDefaultFacadeGroups(plan, [])).toBe(false)
    expect(ensureDefaultFacadeGroups(plan, [{ id: 'front', name: 'Straat' }])).toBe(true)
    expect(
      listFacadeGroups(plan)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['front', STAMP_FACADE_GROUP_ID])
    expect(listFacadeGroups(plan).find((g) => g.id === 'front')?.name).toBe('Straat')
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
    expect(added.elevation?.a).toEqual({ z: 0, h: 260 })
    expect(added.elevation?.b).toEqual({ z: 0, h: 260 })
    expect(groupIdForWall(first.plan, addedId)).toBe('G1')
    expect(isWallInStampGroup(first.plan, addedId)).toBe(false)
    expect(isWallInStampGroup(first.plan, 'src')).toBe(true)

    expect(canApplyStampToFloor(first.plan, 1)).toBe(false)
    const second = applyStampToFloor(first.plan, 1)
    expect(second.addedWallIds).toEqual([])
    expect(second.skippedCount).toBe(1)
    expect(second.plan.floors[1].walls).toHaveLength(1)
  })

  it('applyStampToFloor behoudt bron elevatie (lift)', () => {
    const plan = createEmptyFloorPlan({ name: 'LiftStamp' })
    const src = wall('src', { x: 0, y: 0 }, { x: 200, y: 0 })
    src.elevation = { a: { z: 30, h: 310 }, b: { z: 30, h: 310 } }
    plan.floors[0].walls = [src]
    plan.floors.push({
      name: '1e',
      level: 1,
      height: 260,
      walls: [],
    })
    ensureStampFacadeGroup(plan)
    assignWallsToStamp(plan, ['src'])
    const first = applyStampToFloor(plan, 1)
    const added = first.plan.floors[1].walls[0]
    expect(added?.elevation?.a).toEqual({ z: 30, h: 310 })
    expect(added?.elevation?.b).toEqual({ z: 30, h: 310 })
  })
})

describe('findStackedWallIds', () => {
  function stackedPlan(): FloorPlan {
    const plan = createEmptyFloorPlan({ name: 'Stack' })
    plan.floors[0].walls = [
      wall('bg-front', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('bg-side', { x: 0, y: 0 }, { x: 0, y: 200 }),
    ]
    plan.floors.push(createBlankFloor({ name: 'Verdieping 1', level: 1 }))
    plan.floors[1].walls = [
      wall('v1-front', { x: 400, y: 0 }, { x: 0, y: 0 }),
      wall('v1-other', { x: 80, y: 80 }, { x: 180, y: 80 }),
    ]
    return plan
  }

  it('vindt omgekeerd segment op andere floor', () => {
    const plan = stackedPlan()
    expect(findStackedWallIds(plan, ['bg-front'])).toEqual(['v1-front'])
    expect(findStackedWallIds(plan, ['v1-front'])).toEqual(['bg-front'])
  })

  it('negeert andere coördinaten en dezelfde floor', () => {
    const plan = stackedPlan()
    expect(findStackedWallIds(plan, ['bg-side'])).toEqual([])
    expect(findStackedWallIds(plan, ['bg-front', 'bg-side'])).toEqual(['v1-front'])
  })

  it('houdt 5 cm band; 8 cm naast de as mist', () => {
    const plan = stackedPlan()
    plan.floors[1].walls[0] = wall('v1-front', { x: 400, y: 4 }, { x: 0, y: 4 })
    expect(findStackedWallIds(plan, ['bg-front'])).toEqual(['v1-front'])
    plan.floors[1].walls[0] = wall('v1-front', { x: 400, y: 8 }, { x: 0, y: 8 })
    expect(findStackedWallIds(plan, ['bg-front'])).toEqual([])
  })

  it('pakt junction-helften op dezelfde as, niet de T-tak', () => {
    const plan = stackedPlan()
    plan.floors[1].walls = [
      wall('v1-a', { x: 0, y: 0 }, { x: 180, y: 0 }),
      wall('v1-b', { x: 180, y: 0 }, { x: 400, y: 0 }),
      wall('v1-t', { x: 180, y: 0 }, { x: 180, y: 80 }),
    ]
    expect(findStackedWallIds(plan, ['bg-front']).sort()).toEqual(['v1-a', 'v1-b'])
  })

  it('pakt langere muur op dezelfde as als seed-helften', () => {
    const plan = stackedPlan()
    plan.floors[0].walls = [
      wall('bg-a', { x: 0, y: 0 }, { x: 180, y: 0 }),
      wall('bg-b', { x: 180, y: 0 }, { x: 400, y: 0 }),
    ]
    plan.floors[1].walls = [wall('v1-front', { x: 0, y: 0 }, { x: 400, y: 0 })]
    expect(findStackedWallIds(plan, ['bg-a', 'bg-b'])).toEqual(['v1-front'])
  })

  it('negeert collineair stuk zonder overlap (andere vleugel)', () => {
    const plan = stackedPlan()
    plan.floors[1].walls = [wall('v1-far', { x: 500, y: 0 }, { x: 700, y: 0 })]
    expect(findStackedWallIds(plan, ['bg-front'])).toEqual([])
  })
})

describe('hydrateFacadeGroupsFromNativeMarkers', () => {
  it('bouwt G1/G2/G3/stamp uit groupMarkerConfig als settings ontbreekt', () => {
    const plan = createEmptyFloorPlan({ name: 'FP-import' })
    plan.floors[0].walls = [
      {
        ...wall('bg-l'),
        extras: {
          groupMarker: 1787490663030,
          groupMarkerConfig: { locked: true, groupId: 708151, name: 'gevel links' },
        },
      },
      {
        ...wall('bg-r'),
        extras: {
          groupMarker: 1787490678301,
          groupMarkerConfig: { locked: true, groupId: 708409, name: 'gevel rechts' },
        },
      },
      {
        ...wall('bg-voor'),
        extras: {
          groupMarker: 1787490694442,
          groupMarkerConfig: {
            locked: true,
            groupId: 708421,
            name: 'gevel voor',
            stampGroupId: 708412,
            stampName: 'gevels',
          },
        },
      },
    ]
    plan.floors.push(createBlankFloor({ name: '1e', level: 1 }))
    plan.floors[1].walls = [
      {
        ...wall('v1-l'),
        extras: {
          groupMarker: 1787490663030,
          groupMarkerConfig: { locked: true, groupId: 708151, name: 'gevel links' },
        },
      },
    ]

    const groups = hydrateFacadeGroupsFromNativeMarkers(plan)
    expect(groups.map((g) => g.id).sort()).toEqual(['G1', 'G2', 'G3', 'stamp'])
    expect(wallGuidsInGroup(plan, 'G1').sort()).toEqual(['bg-l', 'v1-l'])
    expect(wallGuidsInGroup(plan, 'stamp')).toEqual(['bg-voor'])
    expect(isWallInStampGroup(plan, 'bg-voor')).toBe(true)
    expect(groupIdForWall(plan, 'bg-voor')).toBe('G3')
  })

  it('extras bestaan: hydrate overschrijft niet vanuit markers', () => {
    const plan = planWithWalls(['w1'])
    createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, 'G1', ['w1'])
    plan.floors[0].walls[0].extras = {
      groupMarker: 99,
      groupMarkerConfig: { locked: true, groupId: 708409, name: 'gevel rechts' },
    }
    hydrateFacadeGroupsFromNativeMarkers(plan)
    const g1 = listFacadeGroups(plan).find((g) => g.id === 'G1')
    expect(g1?.name).toBe('Voor')
    expect(g1?.wallGuids).toEqual(['w1'])
  })

  it('stale catalogus blijft tot prune; hydrate no-op als extras bestaan', () => {
    const plan = planWithWalls(['alive-new'])
    plan.source = {
      settings: {
        facadeGroups: [
          {
            id: 'G1',
            code: 'L',
            name: 'L',
            nativeId: 708151,
            groupMarker: 1,
            wallGuids: ['dead-old'],
          },
        ],
      },
    }
    plan.floors[0].walls[0].extras = {
      groupMarker: 1,
      groupMarkerConfig: { locked: true, groupId: 708151, name: 'gevel links' },
    }
    hydrateFacadeGroupsFromNativeMarkers(plan)
    expect(wallGuidsInGroup(plan, 'G1')).toEqual(['dead-old'])
    pruneFacadeGroups(plan)
    expect(listFacadeGroups(plan)).toHaveLength(1)
    expect(wallGuidsInGroup(plan, 'G1')).toEqual([])
  })

  it('oude FML alleen catalogus: geen native markers zonder sync', () => {
    const plan = planWithWalls(['w1', 'w2'])
    plan.source = {
      settings: {
        facadeGroups: [{ id: 'G1', code: 'VG', name: 'Voor', wallGuids: ['w1', 'w2'] }],
      },
    }
    hydrateFacadeGroupsFromNativeMarkers(plan)
    expect(groupIdForWall(plan, 'w1')).toBe('G1')
    expect(plan.floors[0].walls[0].extras?.groupMarkerConfig).toBeUndefined()
  })

  it('leest dual groups[] en groupMarker-als-naam', () => {
    expect(
      nativeGroupRefsFromWallExtras({
        groupMarkerConfig: {
          groupId: 708420,
          name: 'gevel achter',
          groups: [
            { groupId: 708420, name: 'gevel achter' },
            { groupId: 708412, name: 'gevels' },
          ],
        },
      }).map((r) => r.key),
    ).toEqual(['708420', '708412'])
    expect(
      nativeGroupRefsFromWallExtras({
        groupMarker: 'gevel links',
        groupMarkerConfig: { locked: true, groupId: 708151 },
      }),
    ).toEqual([{ key: '708151' }, { key: 'gevel links', name: 'gevel links' }])
  })

  it('importFmlV3 hydrateert als Floorplanner facadeGroups stript', () => {
    const raw = {
      name: 'FP-roundtrip',
      settings: { wallHeight: 280 },
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          designs: [
            {
              name: 'BG',
              walls: [
                {
                  guid: 'west-1',
                  a: { x: 0, y: 0 },
                  b: { x: 0, y: 100 },
                  thickness: 20,
                  groupMarker: 1787490663030,
                  groupMarkerConfig: { locked: true, groupId: 708151, name: 'gevel links' },
                  openings: [],
                },
              ],
            },
          ],
        },
      ],
    }
    const { plan } = importFmlV3(raw)
    expect(groupIdForWall(plan, 'west-1')).toBe('G1')
    expect(listFacadeGroups(plan)[0]?.name).toBe('gevel links')
    expect(listFacadeGroups(plan)[0]?.nativeId).toBe(708151)
    expect(plan.facadeGroups?.[0]?.id).toBe('G1')
    expect(plan.source?.settings?.facadeGroups).toBeUndefined()
  })
})
