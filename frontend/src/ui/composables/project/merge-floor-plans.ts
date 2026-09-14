import { ensureDesignsSynced } from '@/core/plan/design-sync'
import type {
  Floor,
  FloorArea,
  FloorDesign,
  FloorDimension,
  FloorLabel,
  FloorLine,
  FloorPlan,
  FloorSurface,
  Wall,
} from '@/core/plan/types'

function prefixId(floorLevel: number, id: string): string {
  const prefix = `f${floorLevel}-`
  if (id.startsWith(prefix)) return id
  return `${prefix}${id}`
}

function remapDesignIds(design: FloorDesign, floorLevel: number): FloorDesign {
  return {
    ...design,
    walls: design.walls.map((wall): Wall => ({
      ...wall,
      id: prefixId(floorLevel, wall.id),
    })),
    areas: design.areas?.map((area): FloorArea => ({
      ...area,
      id: prefixId(floorLevel, area.id),
    })),
    surfaces: design.surfaces?.map((surface): FloorSurface => ({
      ...surface,
      id: prefixId(floorLevel, surface.id),
    })),
    labels: design.labels?.map((label): FloorLabel => ({
      ...label,
      id: prefixId(floorLevel, label.id),
    })),
    lines: design.lines?.map((line): FloorLine => ({
      ...line,
      id: prefixId(floorLevel, line.id),
    })),
    dimensions: design.dimensions?.map((dim): FloorDimension => ({
      ...dim,
      id: prefixId(floorLevel, dim.id),
    })),
  }
}

function remapFloorWallIds(floor: Floor): Floor {
  // Live `floor.walls` is bron — niet een stale designs[0] snapshot van vóór
  // harmonize/T-split. Flush eerst zodat export en plat-velden gelijk lopen.
  const live = floor.designs?.length ? ensureDesignsSynced(floor) : floor
  const designs = live.designs?.map((d) => remapDesignIds(d, live.level))
  return {
    ...live,
    walls: live.walls.map((wall): Wall => ({
      ...wall,
      id: prefixId(live.level, wall.id),
    })),
    areas: live.areas?.map((area): FloorArea => ({
      ...area,
      id: prefixId(live.level, area.id),
    })),
    surfaces: live.surfaces?.map((surface): FloorSurface => ({
      ...surface,
      id: prefixId(live.level, surface.id),
    })),
    labels: live.labels?.map((label): FloorLabel => ({
      ...label,
      id: prefixId(live.level, label.id),
    })),
    lines: live.lines?.map((line): FloorLine => ({
      ...line,
      id: prefixId(live.level, line.id),
    })),
    dimensions: live.dimensions?.map((dim): FloorDimension => ({
      ...dim,
      id: prefixId(live.level, dim.id),
    })),
    designs,
  }
}

/**
 * Voeg N single-floor plans (of losse Floor-objecten) samen tot één project-FloorPlan.
 * Wall/area/surface/label/line/dimension-ids krijgen een `f{level}-` prefix.
 * Envelope (`source`/`designs`/`drawing`) blijft behouden.
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
