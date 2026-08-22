import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { floorWallBaseWorldZ } from '@/core/fml/floor-stack'
import { projectFacadeElevation } from '@/core/fml/facade-elevation'
import { assignWallsToGroup, createFacadeGroup } from '@/core/fml/facade-groups'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { sanitizeFmlWalls } from '@/core/fml/sanitize-fml-walls'
import {
  assignRidgeWallGuids,
  dropEmptyRidgeDesign,
  ensureRidgeDesign,
  ensureRidgeDesignsOnPlan,
  findRidgeDesignFloorIndex,
  findRidgeDesignIndex,
  isRidgeDesign,
  isRidgeWallId,
  listDakDesignFloors,
  listRidgeWallsOnFloor,
  markWallAsRidge,
  overwriteRidgeDakThickness,
  overwriteRidgeWorldBottomZ,
  ridgeAwareNokWorldRange,
  ridgeEndpointExtras,
  ridgeEndpointZCm,
  ridgeWorldBottomZ,
  ridgeZForTargetFloor,
  setRidgeJunctionZ,
  setPlanRidgeJunctionZ,
  setFloorRidgeHeights,
  setRidgeWallsOnFloor,
  setRidgeWallsZ,
  syncRidgeWallGuidsFromDesigns,
} from '@/core/fml/ridge-walls'
import type { FloorPlan, Wall } from '@/core/fml/types'
import { addRidgeSegment, addWallSegment } from '@/ui/components/fml-preview-wall-draw-geom'
import { buildJunctions, moveJunctionWithWallJoins } from '@/ui/components/fml-preview-junctions'

function wall(id: string, a = { x: 0, y: 0 }, b = { x: 400, y: 0 }): Wall {
  return { id, a, b, thickness: 20, openings: [] }
}

function planWithWall(id = 'w1'): FloorPlan {
  const plan = createEmptyFloorPlan({ name: 'Noktest' })
  plan.floors[0].walls = [wall(id)]
  return plan
}

describe('ridge-walls', () => {
  it('listDakDesignFloors somt floors met muren', () => {
    const plan = createEmptyFloorPlan({ name: 'Dakchips', wallHeightCm: 250 })
    plan.floors[0].name = 'BG'
    plan.floors[0].walls = [wall('bg')]
    plan.floors.push(createBlankFloor({ name: '1e', level: 1, wallHeightCm: 250 }))
    plan.floors[1].walls = [wall('e1')]
    plan.floors.push(createBlankFloor({ name: 'leeg', level: 2, wallHeightCm: 250 }))
    expect(listDakDesignFloors(plan)).toEqual([
      { floorIndex: 0, name: 'BG' },
      { floorIndex: 1, name: '1e' },
    ])
  })

  it('leeg plan heeft al een Dak-design (tab zonder nok)', () => {
    const plan = createEmptyFloorPlan({ name: 'Plat dak' })
    expect(findRidgeDesignIndex(plan.floors[0])).toBeGreaterThanOrEqual(0)
    expect(findRidgeDesignFloorIndex(plan)).toBe(0)
  })

  it('ensureRidgeDesignsOnPlan vult ontbrekende Dak-designs', () => {
    const plan = createEmptyFloorPlan({ name: 'Import' })
    plan.floors[0] = { name: 'BG', level: 0, height: 280, walls: [wall('w1')] }
    const next = ensureRidgeDesignsOnPlan(plan)
    expect(findRidgeDesignIndex(next.floors[0])).toBeGreaterThanOrEqual(0)
    expect(next.floors[0].walls[0]?.id).toBe('w1')
    expect(ensureRidgeDesignsOnPlan(next)).toBe(next)
  })

  it('ensureRidgeDesign maakt sibling Dak-design zonder floor.walls te overschrijven', () => {
    const plan = planWithWall()
    const { floor, designIndex } = ensureRidgeDesign(plan.floors[0])
    expect(floor.walls).toHaveLength(1)
    expect(floor.walls[0].id).toBe('w1')
    expect(isRidgeDesign(floor.designs?.[designIndex])).toBe(true)
    expect(floor.designs?.[designIndex]?.walls).toEqual([])
    expect(floor.activeDesignIndex ?? 0).toBe(0)
  })

  it('setRidgeWallsOnFloor schrijft alleen naar Dak-design', () => {
    const plan = planWithWall()
    const ridge = markWallAsRidge(wall('r1', { x: 50, y: 50 }, { x: 350, y: 50 }))
    const next = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    expect(next.walls.map((item) => item.id)).toEqual(['w1'])
    expect(listRidgeWallsOnFloor(next).map((item) => item.id)).toEqual(['r1'])
  })

  it('import na export zonder nok krijgt weer een leeg Dak-design', () => {
    const exported = buildFmlV3(createEmptyFloorPlan({ name: 'Plat' }))
    const raw = JSON.parse(exported) as { floors: Array<{ designs?: Array<{ name?: string }> }> }
    expect(raw.floors[0]?.designs?.some((design) => design.name === 'Dak')).toBe(false)
    const imported = importFmlV3(exported).plan
    expect(findRidgeDesignIndex(imported.floors[0])).toBeGreaterThanOrEqual(0)
  })

  it('dropEmptyRidgeDesign laat leeg Dak-design weg', () => {
    const plan = planWithWall()
    const { floor } = ensureRidgeDesign(plan.floors[0])
    const dropped = dropEmptyRidgeDesign(floor)
    expect(dropped.designs?.some(isRidgeDesign)).toBe(false)
  })

  it('tekenen maakt geen T op plattegrond-muren', () => {
    const planWalls = [wall('w1', { x: 0, y: 0 }, { x: 400, y: 0 })]
    const extras = ridgeEndpointExtras(280, 20)
    const added = addRidgeSegment([], { x: 200, y: -100 }, { x: 200, y: 100 }, extras)
    expect(added).not.toBeNull()
    expect(added!.walls).toHaveLength(1)
    expect(added!.walls[0].thickness).toBe(0)
    expect(planWalls).toHaveLength(1)
    expect(planWalls[0].a).toEqual({ x: 0, y: 0 })
    expect(planWalls[0].b).toEqual({ x: 400, y: 0 })
  })

  it('addWallSegment splitst plattegrond wel; addRidgeSegment niet', () => {
    const base = [wall('w1', { x: 0, y: 0 }, { x: 400, y: 0 })]
    const crossed = addWallSegment(base, { x: 200, y: -80 }, { x: 200, y: 80 }, 20, 280)
    expect(crossed?.walls.length).toBeGreaterThan(1)

    const ridges = addRidgeSegment(
      [],
      { x: 200, y: -80 },
      { x: 200, y: 80 },
      ridgeEndpointExtras(280, 20),
    )
    expect(ridges?.walls).toHaveLength(1)
    expect(sanitizeFmlWalls(base)).toHaveLength(1)
  })

  it('sanitize plattegrond blijft ongewijzigd bij nok-overlay', () => {
    const plan = planWithWall()
    const ridge = markWallAsRidge(wall('r1', { x: 100, y: 40 }, { x: 300, y: 40 }))
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const sanitized = sanitizeFmlWalls(plan.floors[0].walls)
    expect(sanitized).toHaveLength(1)
    expect(sanitized[0].id).toBe('w1')
    expect(listRidgeWallsOnFloor(plan.floors[0])).toHaveLength(1)
  })

  it('export/import houdt designs gescheiden en vult GUID-lijst', () => {
    const plan = planWithWall()
    const ridge = markWallAsRidge(wall('r1', { x: 40, y: 80 }, { x: 360, y: 80 }))
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    assignRidgeWallGuids(plan, ['r1'])
    const json = JSON.parse(buildFmlV3(plan)) as {
      floors: Array<{ designs?: Array<{ name?: string; walls?: unknown[] }> }>
    }
    const designs = json.floors[0].designs as Array<{ name?: string; walls?: unknown[] }>
    expect(designs.some((design) => design.name === 'Dak')).toBe(true)
    expect(designs[0].walls).toHaveLength(1)
    const dak = designs.find((design) => design.name === 'Dak')
    expect(dak?.walls).toHaveLength(1)

    const imported = importFmlV3(json).plan
    expect(imported.floors[0].walls.map((item) => item.id)).toEqual(['w1'])
    expect(listRidgeWallsOnFloor(imported.floors[0]).map((item) => item.id)).toEqual(['r1'])
    expect(isRidgeWallId(imported, 'r1')).toBe(true)
    expect(syncRidgeWallGuidsFromDesigns(imported)).toEqual(['r1'])
  })

  it('nok-band volgt getekende nok', () => {
    const plan = planWithWall()
    const extras = ridgeEndpointExtras(280, 24)
    const ridge = markWallAsRidge(wall('r1', { x: 50, y: 80 }, { x: 350, y: 80 }), extras)
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const range = ridgeAwareNokWorldRange(plan)
    expect(range.z1 - range.z0).toBe(24)
    expect(range.z0).toBeGreaterThanOrEqual(280)
  })

  it('projectie neemt nokken mee zonder return-dot filter', () => {
    const plan = planWithWall('g1')
    plan.floors[0].walls[0] = wall('g1', { x: 0, y: 0 }, { x: 400, y: 0 })
    const group = createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, group.id, ['g1'])
    const extras = ridgeEndpointExtras(280, 20)
    const ridge = markWallAsRidge(wall('r1', { x: 200, y: 0 }, { x: 200, y: 200 }), extras)
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const elevation = projectFacadeElevation(plan, group.id)
    expect(elevation).not.toBeNull()
    expect(elevation!.walls.some((item) => item.wallId === 'g1' && !item.ridge)).toBe(true)
    const ridgeRect = elevation!.walls.find((item) => item.wallId === 'r1' && item.ridge)
    expect(ridgeRect).toBeTruthy()
    expect(ridgeRect!.x1 - ridgeRect!.x0).toBeCloseTo(10, 5)
    expect((ridgeRect!.x0 + ridgeRect!.x1) / 2).toBeCloseTo(200, 5)
    expect(elevation!.bands.some((band) => band.kind === 'nok')).toBe(true)
    expect(elevation!.roofPlanes).toEqual([])
  })

  it('linker en rechter kopgevel: zelfde gecentreerde balkdikte', () => {
    const plan = planWithWall('left')
    plan.floors[0].walls = [
      wall('left', { x: 0, y: 0 }, { x: 0, y: 200 }),
      wall('right', { x: 400, y: 0 }, { x: 400, y: 200 }),
    ]
    const left = createFacadeGroup(plan, { name: 'Links' })
    const right = createFacadeGroup(plan, { name: 'Rechts' })
    assignWallsToGroup(plan, left.id, ['left'])
    assignWallsToGroup(plan, right.id, ['right'])
    const extras = ridgeEndpointExtras(280, 20, 350)
    const ridge = markWallAsRidge(wall('r1', { x: 0, y: 100 }, { x: 400, y: 100 }), extras)
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const elevL = projectFacadeElevation(plan, left.id)
    const elevR = projectFacadeElevation(plan, right.id)
    const ridgeL = elevL!.walls.find((item) => item.ridge)
    const ridgeR = elevR!.walls.find((item) => item.ridge)
    expect(ridgeL).toBeTruthy()
    expect(ridgeR).toBeTruthy()
    expect(ridgeL!.x1 - ridgeL!.x0).toBeCloseTo(10, 5)
    expect(ridgeR!.x1 - ridgeR!.x0).toBeCloseTo(10, 5)
    expect(ridgeL!.y1 - ridgeL!.y0).toBeCloseTo(ridgeR!.y1 - ridgeR!.y0, 5)
  })

  it('overwriteRidgeWorldBottomZ zet alle floors op dezelfde world-Z', () => {
    const plan = createEmptyFloorPlan({ name: 'Noktest', wallHeightCm: 280 })
    plan.floors.push(createBlankFloor({ name: '1e', level: 1, wallHeightCm: 260 }))
    const extras0 = ridgeEndpointExtras(280, 20, 200)
    const extras1 = ridgeEndpointExtras(260, 20, 100)
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [
      markWallAsRidge(wall('r0', { x: 0, y: 80 }, { x: 200, y: 80 }), extras0),
    ])
    plan.floors[1] = setRidgeWallsOnFloor(plan.floors[1], [
      markWallAsRidge(wall('r1', { x: 0, y: 80 }, { x: 200, y: 80 }), extras1),
    ])
    const world = floorWallBaseWorldZ(plan, 1) + 180
    const next = overwriteRidgeWorldBottomZ(plan, world)
    expect(ridgeWorldBottomZ(next, 0, listRidgeWallsOnFloor(next.floors[0])[0])).toBe(world)
    expect(ridgeWorldBottomZ(next, 1, listRidgeWallsOnFloor(next.floors[1])[0])).toBe(world)
  })

  it('ridgeZForTargetFloor valt terug op doel-hoogte als draft onder de vloer zakt', () => {
    const plan = createEmptyFloorPlan({ name: 'Noktest', wallHeightCm: 280 })
    plan.floors.push(createBlankFloor({ name: '1e', level: 1, wallHeightCm: 260 }))
    expect(ridgeZForTargetFloor(plan, 0, 280, 1)).toBe(260)
    expect(ridgeZForTargetFloor(plan, 1, 400, 1)).toBe(400)
  })

  it('overwriteRidgeDakThickness zet span en houdt onderkant', () => {
    const plan = planWithWall()
    const extras = ridgeEndpointExtras(280, 20, 350)
    const ridge = markWallAsRidge(wall('r1', { x: 50, y: 80 }, { x: 350, y: 80 }), extras)
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const next = overwriteRidgeDakThickness(plan, 40)
    const updated = listRidgeWallsOnFloor(next.floors[0])[0]
    expect(updated).toBeTruthy()
    expect(ridgeEndpointZCm(updated, 'a', 280)).toBe(350)
    expect(updated.extras?.az).toEqual({ z: 350, h: 390 })
    expect(updated.extras?.bz).toEqual({ z: 350, h: 390 })
    expect(ridgeAwareNokWorldRange(next).z1 - ridgeAwareNokWorldRange(next).z0).toBe(40)
  })

  it('setRidgeWallsZ zet onderkant en houdt dakspan', () => {
    const extras = ridgeEndpointExtras(280, 20, 350)
    const ridge = markWallAsRidge(wall('r1', { x: 0, y: 0 }, { x: 200, y: 0 }), extras)
    const next = setRidgeWallsZ([ridge], ['r1'], 420, 280)
    expect(ridgeEndpointZCm(next[0], 'a', 280)).toBe(420)
    expect(ridgeEndpointZCm(next[0], 'b', 280)).toBe(420)
    expect(next[0].extras?.az).toEqual({ z: 420, h: 440 })
  })

  it('nok-junction verslepen blijft in eigen graaf', () => {
    const extras = ridgeEndpointExtras(280, 20, 350)
    const ridges = [
      markWallAsRidge(wall('r1', { x: 0, y: 0 }, { x: 200, y: 0 }), extras),
      markWallAsRidge(wall('r2', { x: 200, y: 0 }, { x: 200, y: 160 }), extras),
    ]
    const planWalls = [wall('w1', { x: 0, y: 80 }, { x: 400, y: 80 })]
    const hub = buildJunctions(ridges).find((junction) => junction.refs.length === 2)
    expect(hub).toBeDefined()
    const moved = moveJunctionWithWallJoins(ridges, hub!, { x: 220, y: 20 })
    expect(moved.find((item) => item.id === 'r1')?.b).toEqual({ x: 220, y: 20 })
    expect(moved.find((item) => item.id === 'r2')?.a).toEqual({ x: 220, y: 20 })
    expect(planWalls[0].a).toEqual({ x: 0, y: 80 })
    expect(planWalls[0].b).toEqual({ x: 400, y: 80 })
  })

  it('setRidgeJunctionZ wijzigt alleen het gekozen uiteinde', () => {
    const extras = ridgeEndpointExtras(280, 20, 350)
    const ridge = markWallAsRidge(wall('r1', { x: 0, y: 0 }, { x: 200, y: 0 }), extras)
    const next = setRidgeJunctionZ([ridge], [{ wallId: 'r1', end: 'b' }], 480, 280)
    expect(ridgeEndpointZCm(next[0], 'a', 280)).toBe(350)
    expect(ridgeEndpointZCm(next[0], 'b', 280)).toBe(480)
  })

  it('setPlanRidgeJunctionZ schrijft naar het Dak-design', () => {
    const plan = createEmptyFloorPlan({ name: 'Nokplan', wallHeightCm: 280 })
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [
      markWallAsRidge(
        wall('r1', { x: 0, y: 0 }, { x: 200, y: 0 }),
        ridgeEndpointExtras(280, 20, 350),
      ),
    ])
    const next = setPlanRidgeJunctionZ(plan, 0, [{ wallId: 'r1', end: 'a' }], 410)
    const written = listRidgeWallsOnFloor(next.floors[0])[0]
    expect(ridgeEndpointZCm(written, 'a', 280)).toBe(410)
    expect(ridgeEndpointZCm(written, 'b', 280)).toBe(350)
  })

  it('setFloorRidgeHeights wijzigt alleen nokken van die floor', () => {
    const plan = createEmptyFloorPlan({ name: 'Nokhoogte', wallHeightCm: 250 })
    plan.floors.push(createBlankFloor({ name: '1e', level: 1, wallHeightCm: 250 }))
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [
      markWallAsRidge(wall('r0'), ridgeEndpointExtras(250, 30, 250)),
    ])
    plan.floors[1] = setRidgeWallsOnFloor(plan.floors[1], [
      markWallAsRidge(wall('r1'), ridgeEndpointExtras(250, 30, 250)),
    ])
    const next = setFloorRidgeHeights(plan, 1, 520)
    expect(ridgeEndpointZCm(listRidgeWallsOnFloor(next.floors[0])[0], 'a', 250)).toBe(250)
    expect(ridgeEndpointZCm(listRidgeWallsOnFloor(next.floors[1])[0], 'a', 250)).toBe(520)
  })
})
