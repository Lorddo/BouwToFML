/**
 * Floorplanner maatlijn-flags: project (`dimensionMode`, `generateOuterDimension`,
 * `showDims`) + design (`engineAutoDims`). Geen `dimensions[]`.
 */
import { flushActiveDesign } from './design-sync'
import { isRidgeDesign } from './ridge-walls'
import type { Floor, FloorDesign, FloorPlan, FloorPlanSource } from './types'

export type DimensionMode = 'interior' | 'exterior'

export interface DimensionSettings {
  engineAutoDims: boolean
  dimensionMode: DimensionMode
  generateOuterDimension: boolean
}

const DEFAULTS: DimensionSettings = {
  engineAutoDims: false,
  dimensionMode: 'interior',
  generateOuterDimension: false,
}

function isDimensionMode(value: unknown): value is DimensionMode {
  return value === 'interior' || value === 'exterior'
}

function cloneSettings(settings: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...(settings ?? {}) }
}

/** Actieve plattegrond-design; Dak (`btfRole: ridge`) krijgt geen maatvoering. */
export function plattegrondDesignIndex(floor: Floor | null | undefined): number {
  const designs = floor?.designs ?? []
  if (designs.length === 0) return -1
  const active = Math.max(0, Math.min(floor?.activeDesignIndex ?? 0, designs.length - 1))
  if (!isRidgeDesign(designs[active])) return active
  return designs.findIndex((design) => !isRidgeDesign(design))
}

function withEngineAutoDims(design: FloorDesign, on: boolean): FloorDesign {
  const settings = cloneSettings(design.source?.settings)
  settings.engineAutoDims = on
  return {
    ...design,
    source: { ...design.source, settings },
  }
}

/** Lees flags; `engineAutoDims` van het plattegrond-design van `floorIndex`. */
export function readDimensionSettings(
  plan: FloorPlan | null | undefined,
  floorIndex = 0,
): DimensionSettings {
  const project = plan?.source?.settings
  const dimensionMode = isDimensionMode(project?.dimensionMode)
    ? project.dimensionMode
    : DEFAULTS.dimensionMode
  const generateOuterDimension = project?.generateOuterDimension === true
  const floor = plan?.floors[floorIndex] ?? plan?.floors[0]
  const idx = plattegrondDesignIndex(floor)
  const design = idx >= 0 ? floor?.designs?.[idx] : (floor?.designs?.[0] ?? undefined)
  const engineAutoDims = design?.source?.settings?.engineAutoDims === true
  return { engineAutoDims, dimensionMode, generateOuterDimension }
}

/**
 * Immutable plan-update.
 * `dimensionMode` / `generateOuterDimension` / `showDims` = project.
 * `engineAutoDims` = alleen het plattegrond-design van `floorIndex` (niet Dak, niet andere floors).
 */
export function writeDimensionSettings(
  plan: FloorPlan,
  patch: Partial<DimensionSettings>,
  floorIndex = 0,
): FloorPlan {
  const settings = cloneSettings(plan.source?.settings)

  if (patch.dimensionMode != null) {
    settings.dimensionMode = patch.dimensionMode
  }
  if (patch.generateOuterDimension != null) {
    settings.generateOuterDimension = patch.generateOuterDimension
  }
  if (patch.engineAutoDims === true) {
    settings.showDims = true
  }
  const source: FloorPlanSource = { ...plan.source, settings }

  if (patch.engineAutoDims == null) {
    return { ...plan, source }
  }

  const targetFloor = Math.max(0, Math.min(floorIndex, plan.floors.length - 1))
  const engineAutoDims = patch.engineAutoDims
  const floors = plan.floors.map((floor, index) => {
    if (index !== targetFloor) return floor
    const flushed = flushActiveDesign(floor)
    const platIndex = plattegrondDesignIndex(flushed)
    const designs = (flushed.designs ?? []).map((design, designIndex) => {
      if (isRidgeDesign(design)) return withEngineAutoDims(design, false)
      if (designIndex !== platIndex) return design
      return withEngineAutoDims(design, engineAutoDims)
    })
    return { ...flushed, designs }
  })

  return { ...plan, source, floors }
}
