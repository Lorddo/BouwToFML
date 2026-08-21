/**
 * Plan-brede opening-mutaties voor het gevel-aanzicht (alle floors).
 */
import type { FloorPlan, Opening } from './types'
import { clampOpeningToStory } from './elevation-opening-edit'
import { remapFacadeGroupWallIds } from './facade-groups'
import { setJunctionHeight, setWallsUniformHeight, type WallEnd } from './wall-endpoint-height'
import { splitWallAtT } from '@/ui/components/fml-preview-wall-edit'
import {
  addOpeningToWall,
  findOpeningById,
  removeOpeningsById,
  updateOpeningById,
  type OpeningLocation,
} from '@/ui/components/fml-preview-openings'

export type ElevationOpeningWrite = Partial<
  Pick<Opening, 't' | 'width' | 'z' | 'z_height' | 'refid' | 'type'>
>

function mapPlanWalls(
  plan: FloorPlan,
  mapWalls: (
    walls: (typeof plan.floors)[number]['walls'],
    floorIndex: number,
  ) => (typeof plan.floors)[number]['walls'],
): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor, floorIndex) => {
      const walls = mapWalls(floor.walls, floorIndex)
      if (walls === floor.walls) return floor
      return {
        ...floor,
        walls,
        designs: floor.designs?.map((design, di) =>
          di === (floor.activeDesignIndex ?? 0) ? { ...design, walls } : design,
        ),
      }
    }),
  }
}

export function findOpeningInPlan(
  plan: FloorPlan,
  openingId: string,
): (OpeningLocation & { floorIndex: number }) | null {
  for (let floorIndex = 0; floorIndex < plan.floors.length; floorIndex += 1) {
    const floor = plan.floors[floorIndex]
    if (!floor) continue
    const located = findOpeningById(floor.walls, openingId)
    if (located) return { ...located, floorIndex }
  }
  return null
}

export function findOpeningByGuidInPlan(
  plan: FloorPlan,
  guid: string,
): (OpeningLocation & { floorIndex: number }) | null {
  const needle = guid.trim()
  if (!needle) return null
  for (let floorIndex = 0; floorIndex < plan.floors.length; floorIndex += 1) {
    const floor = plan.floors[floorIndex]
    if (!floor) continue
    for (let wallIndex = 0; wallIndex < floor.walls.length; wallIndex += 1) {
      const wall = floor.walls[wallIndex]
      if (!wall) continue
      for (let openingIndex = 0; openingIndex < wall.openings.length; openingIndex += 1) {
        const opening = wall.openings[openingIndex]
        if (!opening || opening.guid !== needle) continue
        const located = findOpeningById(floor.walls, `${wall.id}-${opening.type}-${needle}`)
        if (located) return { ...located, floorIndex }
      }
    }
  }
  return null
}

export function updatePlanOpening(
  plan: FloorPlan,
  openingId: string,
  patch: ElevationOpeningWrite,
): FloorPlan {
  return mapPlanWalls(plan, (walls, floorIndex) => {
    const located = findOpeningById(walls, openingId)
    const floor = plan.floors[floorIndex]
    if (!located || !floor) return walls
    const clamped = clampOpeningToStory(
      { ...located.opening, ...patch },
      located.wall,
      floor.height,
    )
    return updateOpeningById(walls, openingId, {
      t: clamped.t,
      width: clamped.width,
      z: clamped.z,
      z_height: clamped.z_height,
      refid: clamped.refid,
      type: clamped.type,
    })
  })
}

export function removePlanOpening(plan: FloorPlan, openingId: string): FloorPlan {
  return mapPlanWalls(plan, (walls) => removeOpeningsById(walls, [openingId]))
}

export function addPlanOpening(
  plan: FloorPlan,
  wallId: string,
  opening: Opening,
): { plan: FloorPlan; openingId: string | null } {
  let openingId: string | null = null
  const next = mapPlanWalls(plan, (walls, floorIndex) => {
    const host = walls.find((item) => item.id === wallId)
    const floor = plan.floors[floorIndex]
    if (!host || !floor) return walls
    const clamped = clampOpeningToStory(opening, host, floor.height)
    const updated = addOpeningToWall(walls, wallId, clamped)
    if (updated === walls) return walls
    const wall = updated.find((item) => item.id === wallId)
    const added = wall?.openings[wall.openings.length - 1]
    if (wall && added) {
      openingId = `${wallId}-${added.type}-${added.guid ?? wall.openings.length - 1}`
    }
    return updated
  })
  return { plan: next, openingId }
}

export function splitPlanWallAtT(
  plan: FloorPlan,
  wallId: string,
  t: number,
): { plan: FloorPlan; firstWallId: string; secondWallId: string; floorIndex: number } | null {
  let floorIndex = -1
  let firstWallId = ''
  let secondWallId = ''
  const next = mapPlanWalls(plan, (walls, index) => {
    if (firstWallId) return walls
    const split = splitWallAtT(walls, wallId, t)
    if (!split) return walls
    floorIndex = index
    firstWallId = split.firstWallId
    secondWallId = split.secondWallId
    return split.walls
  })
  if (!firstWallId || floorIndex < 0) return null
  const cloned = cloneFacadeGroupPlan(next)
  remapFacadeGroupWallIds(cloned, wallId, [firstWallId, secondWallId])
  return { plan: cloned, firstWallId, secondWallId, floorIndex }
}

function cloneFacadeGroupPlan(plan: FloorPlan): FloorPlan {
  const settings = plan.source?.settings
  if (!settings?.facadeGroups || !plan.source) return plan
  return {
    ...plan,
    source: {
      ...plan.source,
      settings: {
        ...settings,
        facadeGroups: settings.facadeGroups.map((group) => ({
          ...group,
          wallGuids: [...group.wallGuids],
        })),
      },
    },
  }
}

export function setPlanJunctionHeight(
  plan: FloorPlan,
  floorIndex: number,
  refs: ReadonlyArray<{ wallId: string; end: WallEnd }>,
  heightCm: number,
): FloorPlan {
  return mapPlanWalls(plan, (walls, index) => {
    if (index !== floorIndex) return walls
    const floor = plan.floors[index]
    if (!floor) return walls
    const next = setJunctionHeight(walls, refs, heightCm, floor.height)
    const touched = new Set(refs.map((ref) => ref.wallId))
    return next.map((wall) => {
      if (!touched.has(wall.id)) return wall
      return {
        ...wall,
        openings: wall.openings.map((opening) => clampOpeningToStory(opening, wall, floor.height)),
      }
    })
  })
}

export function setPlanWallHeight(
  plan: FloorPlan,
  wallId: string,
  floorIndex: number,
  heightCm: number,
): FloorPlan {
  return mapPlanWalls(plan, (walls, index) => {
    if (index !== floorIndex) return walls
    const floor = plan.floors[index]
    if (!floor) return walls
    const next = setWallsUniformHeight(walls, [wallId], heightCm, floor.height)
    return next.map((wall) => {
      if (wall.id !== wallId) return wall
      return {
        ...wall,
        openings: wall.openings.map((opening) => clampOpeningToStory(opening, wall, floor.height)),
      }
    })
  })
}
