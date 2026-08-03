import type { Floor, FloorPlan, Wall } from '@/core/fml/types'

function prefixWallId(floorLevel: number, wallId: string): string {
  const prefix = `f${floorLevel}-`
  if (wallId.startsWith(prefix)) return wallId
  return `${prefix}${wallId}`
}

function remapFloorWallIds(floor: Floor): Floor {
  return {
    ...floor,
    walls: floor.walls.map((wall): Wall => ({
      ...wall,
      id: prefixWallId(floor.level, wall.id),
    })),
  }
}

/**
 * Voeg N single-floor plans (of losse Floor-objecten) samen tot één project-FloorPlan.
 * Wall-ids krijgen een `f{level}-` prefix om editor-botsingen te voorkomen.
 */
export function mergeFloorPlans(projectName: string, floors: Floor[]): FloorPlan {
  const sorted = [...floors].sort((a, b) => a.level - b.level)
  return {
    name: projectName.trim() || 'Project',
    floors: sorted.map(remapFloorWallIds),
  }
}

/** Haal floors[0] uit een gegenereerd single-floor plan en zet name/level/height. */
export function stampFloorMeta(
  floor: Floor,
  meta: { name: string; level: number; height: number },
): Floor {
  return {
    ...floor,
    name: meta.name,
    level: meta.level,
    height: meta.height,
  }
}
