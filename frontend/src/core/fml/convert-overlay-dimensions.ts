/**
 * Autogen / slicer-overlay → persistente `dimensions[]` (handmatig).
 */
import { buildAutoDimensionLines } from './auto-dimension-lines'
import { filterManualDimensions, readPlanSlices, writePlanSlices } from './plan-slices'
import { readDimensionSettings, writeDimensionSettings } from './fml-dimension-settings'
import { bakeSliceDimensions } from './slice-dimension-lines'
import type { FloorDimension, FloorPlan } from './types'

export type OverlayDimensionSource = 'autogen' | 'slicer'

function nextDimId(prefix: string, index: number): string {
  const rand = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
  return `${prefix}-${index}-${rand}`
}

/** Huidige overlay-lijnen (zonder persist). */
export function collectOverlayDimensionLines(
  plan: FloorPlan,
  floorIndex: number,
  source: OverlayDimensionSource,
): FloorDimension[] {
  const floor = plan.floors[floorIndex] ?? plan.floors[0]
  if (!floor) return []
  const settings = readDimensionSettings(plan, floorIndex)
  if (source === 'autogen') {
    if (!settings.engineAutoDims) return []
    return buildAutoDimensionLines(floor.walls, floor.areas, {
      dimensionMode: settings.dimensionMode,
      generateOuterDimension: settings.generateOuterDimension,
    }).map((line, index) => ({
      id: nextDimId('auto-man', index),
      type: 'custom_dimension' as const,
      a: { ...line.a },
      b: { ...line.b },
    }))
  }
  const slices = readPlanSlices(floor)
  if (slices.length === 0) return []
  return bakeSliceDimensions(slices, floor.walls, settings.dimensionMode, 'slice-man').map(
    (line, index) => ({
      ...line,
      id: nextDimId('slice-man', index),
    }),
  )
}

/**
 * Bake overlay naar `dimensions[]`, zet bron uit, laat bestaande handmatige lijnen staan.
 */
export function convertOverlayDimensionsToManual(
  plan: FloorPlan,
  floorIndex: number,
  source: OverlayDimensionSource,
): FloorPlan {
  const baked = collectOverlayDimensionLines(plan, floorIndex, source)
  const floor = plan.floors[floorIndex] ?? plan.floors[0]
  if (!floor) return plan
  const slices = readPlanSlices(floor)
  const manuals = filterManualDimensions(floor.dimensions, slices)
  const nextDims = [...manuals, ...baked]
  const idx = Math.max(0, Math.min(floorIndex, plan.floors.length - 1))
  let next: FloorPlan = {
    ...plan,
    floors: plan.floors.map((entry, i) =>
      i === idx ? { ...entry, dimensions: nextDims.length > 0 ? nextDims : undefined } : entry,
    ),
  }
  if (source === 'autogen') {
    next = writeDimensionSettings(next, { engineAutoDims: false }, idx)
  } else {
    next = writePlanSlices(next, [], idx)
  }
  return next
}
