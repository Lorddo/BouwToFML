import type { Floor, FloorDesign } from './types'

/** Kopieer actieve plat-velden naar een FloorDesign-snapshot. */
export function snapshotActiveDesign(floor: Floor): FloorDesign {
  const idx = floor.activeDesignIndex ?? 0
  const existing = floor.designs?.[idx]
  return {
    name: existing?.name ?? floor.name,
    walls: floor.walls,
    items: floor.items,
    areas: floor.areas,
    surfaces: floor.surfaces,
    labels: floor.labels,
    lines: floor.lines,
    dimensions: floor.dimensions,
    source: existing?.source,
  }
}

/** Schrijf actieve plat-velden terug in `designs[activeDesignIndex]`. */
export function flushActiveDesign(floor: Floor): Floor {
  const designs = floor.designs
  if (!designs || designs.length === 0) {
    const snapshot = snapshotActiveDesign(floor)
    return {
      ...floor,
      designs: [snapshot],
      activeDesignIndex: 0,
    }
  }
  const idx = Math.max(0, Math.min(floor.activeDesignIndex ?? 0, designs.length - 1))
  const nextDesigns = designs.map((design, i) =>
    i === idx
      ? {
          ...design,
          walls: floor.walls,
          items: floor.items,
          areas: floor.areas,
          surfaces: floor.surfaces,
          labels: floor.labels,
          lines: floor.lines,
          dimensions: floor.dimensions,
        }
      : design,
  )
  return {
    ...floor,
    designs: nextDesigns,
    activeDesignIndex: idx,
  }
}

/** Laad `designs[index]` op de platte Floor-velden. */
export function loadDesignOntoFloor(floor: Floor, designIndex: number): Floor {
  const designs = floor.designs
  if (!designs || designs.length === 0) {
    return { ...floor, activeDesignIndex: 0 }
  }
  const idx = Math.max(0, Math.min(designIndex, designs.length - 1))
  const design = designs[idx]
  return {
    ...floor,
    walls: design.walls,
    items: design.items,
    areas: design.areas,
    surfaces: design.surfaces,
    labels: design.labels,
    lines: design.lines,
    dimensions: design.dimensions,
    activeDesignIndex: idx,
  }
}

/**
 * Flush huidig design, wissel naar `designIndex`, laad plat.
 * Geen-op wanneer index gelijk is.
 */
export function switchFloorDesign(floor: Floor, designIndex: number): Floor {
  const flushed = flushActiveDesign(floor)
  const idx = Math.max(0, Math.min(designIndex, (flushed.designs?.length ?? 1) - 1))
  if (idx === (flushed.activeDesignIndex ?? 0)) return flushed
  return loadDesignOntoFloor(flushed, idx)
}

/** Zorg dat designs[] synchroon is met platte velden vóór export. */
export function ensureDesignsSynced(floor: Floor): Floor {
  if (!floor.designs || floor.designs.length === 0) {
    return flushActiveDesign(floor)
  }
  return flushActiveDesign(floor)
}
