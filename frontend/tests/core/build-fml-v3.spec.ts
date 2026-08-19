import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import type { FloorPlan, Opening } from '@/core/fml/types'

function planWithDoors(): FloorPlan {
  const door: Opening = {
    refid: '0434246537840a3326e305dbe7b9c355743e6e93',
    t: 0.5,
    width: 90,
    type: 'door',
    mirrored: [1, 0],
  }
  const window: Opening = {
    refid: 'b88cd3f479455fbf57205a91c613c02b7e6dc2df',
    t: 0.5,
    width: 120,
    type: 'window',
    mirrored: [0, 1],
  }
  return {
    name: 'Export-test',
    floors: [
      {
        name: '1e',
        level: 0,
        height: 280,
        walls: [
          {
            id: 'w1',
            a: { x: 0, y: 0 },
            b: { x: 400, y: 0 },
            thickness: 10,
            balance: 0.5,
            c: null,
            openings: [door, window],
          },
        ],
      },
    ],
  }
}

describe('buildFmlV3 — Floorplanner-valid formaat', () => {
  it('bevat alle verplichte project/floor/design velden', () => {
    const raw = JSON.parse(buildFmlV3(planWithDoors()))
    expect(raw.id).toBeTruthy()
    expect(raw.public).toBe(false)
    expect(Array.isArray(raw.features)).toBe(true)
    expect(raw.settings.wallHeight).toBe(280)

    const floor = raw.floors[0]
    expect(floor.id).toBeTruthy()
    expect(floor.project_id).toBe(raw.id)
    expect(typeof floor.created_at).toBe('string')
    expect(typeof floor.updated_at).toBe('string')
    expect(Array.isArray(floor.cameras)).toBe(true)

    const design = floor.designs[0]
    expect(design.id).toBeTruthy()
    expect(Array.isArray(design.lines)).toBe(true)
    expect(Array.isArray(design.areas)).toBe(true)
    expect(Array.isArray(design.items)).toBe(true)
    expect(Array.isArray(design.annotations)).toBe(true)
    expect(Array.isArray(design.cameras)).toBe(true)
    expect(design.settings.minWallLength).toBe(4)
  })

  it('bevat alle verplichte muur-velden (decor/az/bz/groupMarkerConfig/c)', () => {
    const raw = JSON.parse(buildFmlV3(planWithDoors()))
    const wall = raw.floors[0].designs[0].walls[0]
    expect(wall.guid).toBe('w1')
    expect(wall.c).toBeNull()
    expect(wall.az).toEqual({ z: 0, h: 280 })
    expect(wall.bz).toEqual({ z: 0, h: 280 })
    expect(wall.groupMarkerConfig).toEqual({ locked: false })
    expect(wall.decor).toEqual({ left: null, right: null, top: null, outline: 0 })
  })

  it('zet dimensionMode interior in project-settings (zoals FML(current))', () => {
    const raw = JSON.parse(buildFmlV3(planWithDoors()))
    expect(raw.settings.dimensionMode).toBe('interior')
  })

  it('neemt floor.height over in settings.wallHeight', () => {
    const plan = planWithDoors()
    plan.floors[0].height = 300
    const raw = JSON.parse(buildFmlV3(plan))
    expect(raw.settings.wallHeight).toBe(300)
    expect(raw.floors[0].height).toBe(300)
    expect(raw.floors[0].designs[0].walls[0].az.h).toBe(300)
  })

  it('voegt juiste materials + guid toe per openingstype', () => {
    const raw = JSON.parse(buildFmlV3(planWithDoors()))
    const openings = raw.floors[0].designs[0].walls[0].openings
    const door = openings.find((o: { type: string }) => o.type === 'door')
    const window = openings.find((o: { type: string }) => o.type === 'window')

    expect(door.materials).toMatchObject({
      FP_DOOR: { type: 'color', value: '#ffffff' },
      FP_DOORFRAME: { type: 'color', value: '#ffffff' },
    })
    expect(door.guid).toMatch(/^[0-9a-f]{6}$/)
    expect(door.mirrored).toEqual([1, 0])

    expect(window.materials).toMatchObject({
      FP_FRAME_OUT: { type: 'color', value: '#ffffff' },
      FP_FRAME_IN: { type: 'color', value: '#ffffff' },
    })
    expect(window.guid).toMatch(/^[0-9a-f]{6}$/)
  })

  it('roundtript door importFmlV3 (muren + openings bewaard)', () => {
    const fmlText = buildFmlV3(planWithDoors())
    const parsed = importFmlV3(fmlText)
    const wall = parsed.plan.floors[0].walls[0]
    expect(wall.a).toEqual({ x: 0, y: 0 })
    expect(wall.b).toEqual({ x: 400, y: 0 })
    expect(wall.thickness).toBe(10)
    expect(wall.openings).toHaveLength(2)
    expect(wall.openings[0].type).toBe('door')
    expect(wall.openings[0].mirrored).toEqual([1, 0])
    expect(wall.openings[1].type).toBe('window')
  })

  it('respecteert bestaande materials/guid van de opening', () => {
    const plan = planWithDoors()
    plan.floors[0].walls[0].openings[0].materials = {
      FP_DOOR: { type: 'color', value: '#ff0000' },
      FP_DOORFRAME: { type: 'color', value: '#00ff00' },
    }
    plan.floors[0].walls[0].openings[0].guid = 'abcdef'
    const raw = JSON.parse(buildFmlV3(plan))
    const door = raw.floors[0].designs[0].walls[0].openings.find(
      (o: { type: string }) => o.type === 'door',
    )
    expect(door.materials.FP_DOOR.value).toBe('#ff0000')
    expect(door.guid).toBe('abcdef')
  })
})

describe('buildFmlV3 — bovenlicht export', () => {
  function doorOnlyPlan(overrides: Partial<Opening> = {}): FloorPlan {
    const plan = planWithDoors()
    plan.floors[0].walls[0].openings = [
      {
        refid: '0434246537840a3326e305dbe7b9c355743e6e93',
        t: 0.4,
        width: 90,
        type: 'door',
        z_height: 220,
        guid: 'door001',
        ...overrides,
      },
    ]
    return plan
  }

  it('voegt bovenlicht-window toe bij default on', () => {
    const raw = JSON.parse(buildFmlV3(doorOnlyPlan(), { bovenlichtDefault: true }))
    const openings = raw.floors[0].designs[0].walls[0].openings
    expect(openings).toHaveLength(2)
    expect(openings[0].type).toBe('door')
    expect(openings[1]).toMatchObject({
      type: 'window',
      t: 0.4,
      width: 90,
      z: 230,
      z_height: 40,
      guid: 'door001-bovenlicht',
    })
  })

  it('plaatst bovenlicht tegen muurtop az/bz, niet tegen floor.height (Poort6)', () => {
    const plan = doorOnlyPlan()
    plan.floors[0].height = 55
    plan.floors[0].walls[0].extras = { az: { z: 0, h: 330 }, bz: { z: 0, h: 330 } }
    const raw = JSON.parse(buildFmlV3(plan, { bovenlichtDefault: true }))
    const openings = raw.floors[0].designs[0].walls[0].openings
    expect(openings).toHaveLength(2)
    expect(openings[1]).toMatchObject({
      type: 'window',
      z: 230,
      z_height: 40,
      guid: 'door001-bovenlicht',
    })
  })

  it('ondersteunt per-floor bovenlicht via resolver', () => {
    const plan = doorOnlyPlan()
    plan.floors.push({
      ...plan.floors[0],
      name: '1e',
      level: 1,
      walls: plan.floors[0].walls.map((wall) => ({
        ...wall,
        id: `${wall.id}-1e`,
        openings: wall.openings.map((op) => ({ ...op, guid: `${op.guid}-1e` })),
      })),
    })
    const raw = JSON.parse(
      buildFmlV3(plan, {
        bovenlichtDefault: (floor) => floor.level === 0,
      }),
    )
    expect(raw.floors[0].designs[0].walls[0].openings).toHaveLength(2)
    expect(raw.floors[1].designs[0].walls[0].openings).toHaveLength(1)
  })

  it('slaat bovenlicht over bij override false ondanks default on', () => {
    const raw = JSON.parse(
      buildFmlV3(doorOnlyPlan({ bovenlicht: false }), { bovenlichtDefault: true }),
    )
    const openings = raw.floors[0].designs[0].walls[0].openings
    expect(openings).toHaveLength(1)
    expect(openings[0].type).toBe('door')
  })

  it('voegt bovenlicht toe bij override true ondanks default off', () => {
    const raw = JSON.parse(
      buildFmlV3(doorOnlyPlan({ bovenlicht: true }), { bovenlichtDefault: false }),
    )
    const openings = raw.floors[0].designs[0].walls[0].openings
    expect(openings).toHaveLength(2)
    expect(openings[1].type).toBe('window')
  })

  it('emitteert geen bovenlicht-veld op de deur zelf', () => {
    const raw = JSON.parse(
      buildFmlV3(doorOnlyPlan({ bovenlicht: true }), { bovenlichtDefault: false }),
    )
    const door = raw.floors[0].designs[0].walls[0].openings[0]
    expect(door.bovenlicht).toBeUndefined()
  })

  function windowOnlyPlan(overrides: Partial<Opening> = {}): FloorPlan {
    const plan = planWithDoors()
    plan.floors[0].walls[0].openings = [
      {
        refid: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        t: 0.4,
        width: 120,
        type: 'window',
        z: 70,
        z_height: 150,
        guid: 'win001',
        ...overrides,
      },
    ]
    return plan
  }

  it('voegt bovenlicht toe op raam bij window-default on', () => {
    const raw = JSON.parse(buildFmlV3(windowOnlyPlan(), { windowBovenlichtDefault: true }))
    const openings = raw.floors[0].designs[0].walls[0].openings
    expect(openings).toHaveLength(2)
    expect(openings[0].type).toBe('window')
    expect(openings[1]).toMatchObject({
      type: 'window',
      t: 0.4,
      width: 120,
      z: 230,
      z_height: 40,
      guid: 'win001-bovenlicht',
    })
  })

  it('houdt deur- en raam-defaults gescheiden', () => {
    const plan = windowOnlyPlan()
    plan.floors[0].walls[0].openings.push({
      refid: '0434246537840a3326e305dbe7b9c355743e6e93',
      t: 0.2,
      width: 90,
      type: 'door',
      z_height: 220,
      guid: 'door001',
    })
    const raw = JSON.parse(
      buildFmlV3(plan, {
        bovenlichtDefault: false,
        windowBovenlichtDefault: true,
      }),
    )
    const openings = raw.floors[0].designs[0].walls[0].openings
    expect(openings.map((o: { guid: string }) => o.guid).sort()).toEqual([
      'door001',
      'win001',
      'win001-bovenlicht',
    ])
  })

  it('slaat raam-bovenlicht over bij override false ondanks default on', () => {
    const raw = JSON.parse(
      buildFmlV3(windowOnlyPlan({ bovenlicht: false }), { windowBovenlichtDefault: true }),
    )
    expect(raw.floors[0].designs[0].walls[0].openings).toHaveLength(1)
  })

  it('gebruikt custom bovenlichtHeightCm en bovenlichtGapCm', () => {
    const raw = JSON.parse(
      buildFmlV3(doorOnlyPlan(), {
        bovenlichtDefault: true,
        bovenlichtHeightCm: 25,
        bovenlichtGapCm: 5,
      }),
    )
    expect(raw.floors[0].designs[0].walls[0].openings[1]).toMatchObject({
      z: 225,
      z_height: 25,
      guid: 'door001-bovenlicht',
    })
  })

  it('gebruikt per-opening maat-override naast vloerdefault', () => {
    const plan = doorOnlyPlan()
    plan.floors[0].walls[0].openings.push({
      refid: '0434246537840a3326e305dbe7b9c355743e6e93',
      t: 0.7,
      width: 80,
      type: 'door',
      z_height: 220,
      guid: 'door002',
      bovenlichtHeightCm: 25,
      bovenlichtGapCm: 5,
    })
    const raw = JSON.parse(
      buildFmlV3(plan, {
        bovenlichtDefault: true,
        bovenlichtHeightCm: 40,
        bovenlichtGapCm: 10,
      }),
    )
    const openings = raw.floors[0].designs[0].walls[0].openings as Array<{
      guid: string
      z: number
      z_height: number
      bovenlichtHeightCm?: number
      bovenlichtGapCm?: number
    }>
    expect(openings.find((o) => o.guid === 'door001-bovenlicht')).toMatchObject({
      z: 230,
      z_height: 40,
    })
    expect(openings.find((o) => o.guid === 'door002-bovenlicht')).toMatchObject({
      z: 225,
      z_height: 25,
    })
    const door002 = openings.find((o) => o.guid === 'door002')
    expect(door002?.bovenlichtHeightCm).toBeUndefined()
    expect(door002?.bovenlichtGapCm).toBeUndefined()
  })

  it('import vouwt export-bovenlicht terug; re-export behoudt maten', () => {
    const exported = buildFmlV3(
      doorOnlyPlan({ bovenlicht: true, bovenlichtHeightCm: 30, bovenlichtGapCm: 0 }),
    )
    const raw = JSON.parse(exported)
    expect(raw.floors[0].designs[0].walls[0].openings).toHaveLength(2)

    const parsed = importFmlV3(exported)
    const openings = parsed.plan.floors[0].walls[0].openings
    expect(openings).toHaveLength(1)
    expect(openings[0]).toMatchObject({
      type: 'door',
      guid: 'door001',
      bovenlicht: true,
      bovenlichtHeightCm: 30,
      bovenlichtGapCm: 0,
    })

    const again = JSON.parse(buildFmlV3(parsed.plan))
    const againOpenings = again.floors[0].designs[0].walls[0].openings
    expect(againOpenings).toHaveLength(2)
    expect(againOpenings[1]).toMatchObject({
      type: 'window',
      z: 220,
      z_height: 30,
      guid: 'door001-bovenlicht',
    })
  })
})
