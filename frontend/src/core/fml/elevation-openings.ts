/**
 * Opening-mutaties voor het gevel-aanzicht. IDs zijn floor-scoped (`floor:localId`)
 * omdat gestapelde gevels dezelfde muur-id (en vaak dezelfde opening-guid) delen.
 */
import type { FloorPlan, Opening, Wall } from './types'
import { clampOpeningToStory } from './elevation-opening-edit'
import { listFacadeGroups, remapFacadeGroupWallIds } from './facade-groups'
import { decodePlanOpeningId, encodePlanOpeningId } from './opening-ids'
import { findOpeningById, moveOpeningToWall, type OpeningLocation } from './opening-wall-ops'
import { setJunctionHeight, setWallsUniformHeight, type WallEnd } from './wall-endpoint-height'
import {
  addOpeningToWall,
  removeOpeningsById,
  updateOpeningById,
} from '@/ui/components/fml-preview-openings'

export { decodePlanOpeningId, encodePlanOpeningId } from './opening-ids'

export type ElevationOpeningWrite = Partial<
  Pick<
    Opening,
    | 't'
    | 'width'
    | 'z'
    | 'z_height'
    | 'refid'
    | 'mirrored'
    | 'bovenlicht'
    | 'bovenlichtHeightCm'
    | 'bovenlichtGapCm'
  >
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
  const { floorIndex: scoped, localId } = decodePlanOpeningId(openingId)
  if (scoped != null) {
    const floor = plan.floors[scoped]
    if (!floor) return null
    const located = findOpeningById(floor.walls, localId)
    return located ? { ...located, floorIndex: scoped } : null
  }
  for (let floorIndex = 0; floorIndex < plan.floors.length; floorIndex += 1) {
    const floor = plan.floors[floorIndex]
    if (!floor) continue
    const located = findOpeningById(floor.walls, localId)
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
  const { floorIndex: scoped, localId } = decodePlanOpeningId(openingId)
  let wrote = false
  return mapPlanWalls(plan, (walls, floorIndex) => {
    if (scoped != null && floorIndex !== scoped) return walls
    if (wrote && scoped == null) return walls
    const located = findOpeningById(walls, localId)
    const floor = plan.floors[floorIndex]
    if (!located || !floor) return walls
    const clamped = clampOpeningToStory(
      { ...located.opening, ...patch },
      located.wall,
      floor.height,
    )
    const next = updateOpeningById(walls, localId, {
      t: clamped.t,
      width: clamped.width,
      z: clamped.z,
      z_height: clamped.z_height,
      refid: clamped.refid,
      ...(patch.mirrored !== undefined ? { mirrored: patch.mirrored } : {}),
      ...(patch.bovenlicht !== undefined ? { bovenlicht: patch.bovenlicht } : {}),
      ...(patch.bovenlichtHeightCm !== undefined
        ? { bovenlichtHeightCm: patch.bovenlichtHeightCm }
        : {}),
      ...(patch.bovenlichtGapCm !== undefined ? { bovenlichtGapCm: patch.bovenlichtGapCm } : {}),
    })
    if (next !== walls) wrote = true
    return next
  })
}

export function movePlanOpening(
  plan: FloorPlan,
  openingId: string,
  targetWallId: string,
  t: number,
): { plan: FloorPlan; openingId: string } {
  const { floorIndex: scoped, localId } = decodePlanOpeningId(openingId)
  let nextId = openingId
  const next = mapPlanWalls(plan, (walls, floorIndex) => {
    if (scoped != null && floorIndex !== scoped) return walls
    if (nextId !== openingId) return walls
    const moved = moveOpeningToWall(walls, localId, targetWallId, t)
    if (!moved) return walls
    nextId = encodePlanOpeningId(floorIndex, moved.openingId)
    return moved.walls
  })
  return { plan: next, openingId: nextId }
}

export function removePlanOpening(plan: FloorPlan, openingId: string): FloorPlan {
  const { floorIndex: scoped, localId } = decodePlanOpeningId(openingId)
  let wrote = false
  return mapPlanWalls(plan, (walls, floorIndex) => {
    if (scoped != null && floorIndex !== scoped) return walls
    if (wrote && scoped == null) return walls
    const next = removeOpeningsById(walls, [localId])
    if (next !== walls) wrote = true
    return next
  })
}

export function addPlanOpening(
  plan: FloorPlan,
  wallId: string,
  opening: Opening,
  targetFloorIndex?: number,
): { plan: FloorPlan; openingId: string | null } {
  let openingId: string | null = null
  const next = mapPlanWalls(plan, (walls, floorIndex) => {
    if (openingId) return walls
    if (targetFloorIndex != null && floorIndex !== targetFloorIndex) return walls
    const host = walls.find((item) => item.id === wallId)
    const floor = plan.floors[floorIndex]
    if (!host || !floor) return walls
    const clamped = clampOpeningToStory(opening, host, floor.height)
    const updated = addOpeningToWall(walls, wallId, clamped)
    if (updated === walls) return walls
    const wall = updated.find((item) => item.id === wallId)
    const added = wall?.openings[wall.openings.length - 1]
    if (wall && added) {
      const localId = `${wallId}-${added.type}-${added.guid ?? wall.openings.length - 1}`
      openingId = encodePlanOpeningId(floorIndex, localId)
    }
    return updated
  })
  return { plan: next, openingId }
}

/** UI-split (junctions/openings) — core importeert geen `fml-preview-wall-edit`. */
export type SplitWallAtTFn = (
  walls: Wall[],
  wallId: string,
  t: number,
) => { walls: Wall[]; firstWallId: string; secondWallId: string } | null

export function splitPlanWallAtT(
  plan: FloorPlan,
  wallId: string,
  t: number,
  splitWalls: SplitWallAtTFn,
): { plan: FloorPlan; firstWallId: string; secondWallId: string; floorIndex: number } | null {
  let floorIndex = -1
  let firstWallId = ''
  let secondWallId = ''
  const next = mapPlanWalls(plan, (walls, index) => {
    if (firstWallId) return walls
    const split = splitWalls(walls, wallId, t)
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
  if (!settings || !plan.source) return plan
  const groups = listFacadeGroups(plan)
  if (groups.length === 0) return plan
  return {
    ...plan,
    source: {
      ...plan.source,
      settings: {
        ...settings,
        facadeGroups: groups.map((group) => ({
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
