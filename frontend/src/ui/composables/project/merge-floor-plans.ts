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
} from '@/core/fml/types'

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
  const designs = floor.designs?.map((d) => remapDesignIds(d, floor.level))
  const activeIdx = floor.activeDesignIndex ?? 0
  const active = designs?.[activeIdx]
  return {
    ...floor,
    walls: (active?.walls ?? floor.walls).map((wall): Wall => ({
      ...wall,
      id: prefixId(floor.level, wall.id),
    })),
    areas: (active?.areas ?? floor.areas)?.map((area): FloorArea => ({
      ...area,
      id: prefixId(floor.level, area.id),
    })),
    surfaces: (active?.surfaces ?? floor.surfaces)?.map((surface): FloorSurface => ({
      ...surface,
      id: prefixId(floor.level, surface.id),
    })),
    labels: (active?.labels ?? floor.labels)?.map((label): FloorLabel => ({
      ...label,
      id: prefixId(floor.level, label.id),
    })),
    lines: (active?.lines ?? floor.lines)?.map((line): FloorLine => ({
      ...line,
      id: prefixId(floor.level, line.id),
    })),
    dimensions: (active?.dimensions ?? floor.dimensions)?.map((dim): FloorDimension => ({
      ...dim,
      id: prefixId(floor.level, dim.id),
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
