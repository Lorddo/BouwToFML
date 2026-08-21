/**
 * Floorplanner maatlijn-flags: project (`dimensionMode`, `generateOuterDimension`,
 * `showDims`) + design (`engineAutoDims`). Geen `dimensions[]`.
 */
import { flushActiveDesign } from './design-sync'
import type { FloorPlan, FloorPlanSource } from './types'

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

/** Lees flags; ontbrekend = uit / interior / geen totaalmaat. */
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
  const idx = Math.max(0, floor?.activeDesignIndex ?? 0)
  const design = floor?.designs?.[idx] ?? floor?.designs?.[0]
  const engineAutoDims = design?.source?.settings?.engineAutoDims === true
  return { engineAutoDims, dimensionMode, generateOuterDimension }
}

/**
 * Immutable plan-update. `engineAutoDims` op alle designs van alle floors
 * (één schakelaar). Bij aanzetten ook `showDims: true` op project.
 */
export function writeDimensionSettings(
  plan: FloorPlan,
  patch: Partial<DimensionSettings>,
): FloorPlan {
  const settings = cloneSettings(plan.source?.settings)

  if (patch.dimensionMode != null) {
    settings.dimensionMode = patch.dimensionMode
  }
  if (patch.generateOuterDimension != null) {
    settings.generateOuterDimension = patch.generateOuterDimension
  }
  const engineAutoDims = patch.engineAutoDims ?? readDimensionSettings(plan).engineAutoDims
  if (patch.engineAutoDims === true) {
    settings.showDims = true
  }
  const source: FloorPlanSource = { ...plan.source, settings }

  const floors = plan.floors.map((floor) => {
    const flushed = flushActiveDesign(floor)
    const designs = (flushed.designs ?? []).map((design) => ({
      ...design,
      source: {
        ...design.source,
        settings: {
          ...cloneSettings(design.source?.settings),
          engineAutoDims,
        },
      },
    }))
    return { ...flushed, designs }
  })

  return { ...plan, source, floors }
}
