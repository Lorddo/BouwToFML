import { rebuildAreasFromHoles } from '@/core/fml/area-match'
import { ensureDesignsSynced } from '@/core/fml/design-sync'
import { holeMatchesFloorCutout } from '@/core/fml/ridge-floor'
import type { Floor, Wall } from '@/core/fml/types'
import { buildWallRenderGeometry } from '@/ui/components/fml-preview-wall-polygons'
import { snapHoleRingsToWallFaces } from './snap-area-holes-to-faces'

/**
 * Regenereer `floor.areas` uit gesloten binnenruimtes (wall-union holes ná balance).
 * Surfaces blijven ongemoeid. Tags blijven via IoU-match.
 * Holes worden teruggezet op muurfaces zodat getypte binnenmaten exact blijven.
 * Trapgat/`isCutout` wordt geen kamer (geen gat in deze tekeningen).
 */
export function regenerateFloorAreas(floor: Floor): Floor {
  const walls: Wall[] = floor.walls
  let holes: { x: number; y: number }[][]
  try {
    const geometry = buildWallRenderGeometry(walls)
    holes = snapHoleRingsToWallFaces(
      geometry.fillComponents.flatMap((component) => component.rings.slice(1)),
      walls,
    ).filter((ring) => !holeMatchesFloorCutout(ring, floor))
  } catch {
    // Union kan falen op degeneraat; behoud bestaande areas
    return floor
  }
  const areas = rebuildAreasFromHoles(holes, floor.areas)
  const next = {
    ...floor,
    areas: areas.length > 0 ? areas : undefined,
  }
  return floor.designs?.length ? ensureDesignsSynced(next) : next
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
