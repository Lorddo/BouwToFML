import type { Floor } from './types'

/** Shallow clone of a floor (walls/openings/items/areas/… + designs). */
export function cloneFloorShallow(floor: Floor): Floor {
  return {
    ...floor,
    walls: floor.walls.map((wall) => ({
      ...wall,
      openings: wall.openings.map((op) => ({ ...op })),
    })),
    items: floor.items?.map((item) => ({ ...item })),
    areas: floor.areas?.map((area) => ({
      ...area,
      poly: area.poly.map((p) => ({ ...p })),
    })),
    surfaces: floor.surfaces?.map((surface) => ({
      ...surface,
      poly: surface.poly.map((p) => ({ ...p })),
    })),
    labels: floor.labels?.map((label) => ({ ...label })),
    lines: floor.lines?.map((line) => ({
      ...line,
      a: { ...line.a },
      b: { ...line.b },
    })),
    dimensions: floor.dimensions?.map((dim) => ({
      ...dim,
      a: { ...dim.a },
      b: { ...dim.b },
    })),
    designs: floor.designs?.map((d) => ({
      ...d,
      walls: d.walls.map((wall) => ({
        ...wall,
        openings: wall.openings.map((op) => ({ ...op })),
      })),
      items: d.items?.map((item) => ({ ...item })),
      areas: d.areas?.map((area) => ({
        ...area,
        poly: area.poly.map((p) => ({ ...p })),
      })),
      surfaces: d.surfaces?.map((surface) => ({
        ...surface,
        poly: surface.poly.map((p) => ({ ...p })),
      })),
      labels: d.labels?.map((label) => ({ ...label })),
      lines: d.lines?.map((line) => ({
        ...line,
        a: { ...line.a },
        b: { ...line.b },
      })),
      dimensions: d.dimensions?.map((dim) => ({
        ...dim,
        a: { ...dim.a },
        b: { ...dim.b },
      })),
    })),
  }
}
