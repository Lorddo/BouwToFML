import { rebuildAreasFromHoles } from '@/core/fml/area-match'
import type { Floor, Wall } from '@/core/fml/types'
import { buildWallRenderGeometry } from '@/ui/components/fml-preview-wall-polygons'

/**
 * Regenereer `floor.areas` uit gesloten binnenruimtes (wall-union holes ná balance).
 * Surfaces blijven ongemoeid. Tags blijven via IoU-match.
 */
export function regenerateFloorAreas(floor: Floor): Floor {
  const walls: Wall[] = floor.walls
  let holes: { x: number; y: number }[][]
  try {
    const geometry = buildWallRenderGeometry(walls)
    holes = geometry.fillComponents.flatMap((component) => component.rings.slice(1))
  } catch {
    // Union kan falen op degeneraat; behoud bestaande areas
    return floor
  }
  const areas = rebuildAreasFromHoles(holes, floor.areas)
  return {
    ...floor,
    areas: areas.length > 0 ? areas : undefined,
  }
}

export function regeneratePlanAreas(plan: { name: string; floors: Floor[] }): {
  name: string
  floors: Floor[]
} {
  return {
    ...plan,
    floors: plan.floors.map((floor) => regenerateFloorAreas(floor)),
  }
}
