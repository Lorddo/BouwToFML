/**
 * Kozijnmaten: persist op `floor.defaults.openingFrameDefaults`.
 * `plan.settings.openingFrameDefaults` is alleen legacy-zaad (wordt bij load gepromoveerd).
 */
import type { FloorDefaults } from './floor-defaults'
import type { Floor, FloorItem, FloorPlan, Opening } from './types'
import { defaultOpeningFrame, type OpeningFrameCm } from './opening-kind-catalog'
import {
  buildOpeningFramePatch,
  buildSkylightFramePatch,
  isFramelessOpeningKind,
} from './opening-display-geom'

export type OpeningFrameDefaults = {
  door: OpeningFrameCm
  window: OpeningFrameCm
}

function cloneFrame(frame: OpeningFrameCm): OpeningFrameCm {
  return {
    leftCm: frame.leftCm,
    rightCm: frame.rightCm,
    topCm: frame.topCm,
    bottomCm: frame.bottomCm,
  }
}

export function createFactoryOpeningFrameDefaults(): OpeningFrameDefaults {
  return {
    door: defaultOpeningFrame('door', 'single'),
    window: defaultOpeningFrame('window', 'single'),
  }
}

function nonNegativeCm(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function normalizeFrameCm(raw: unknown, factory: OpeningFrameCm): OpeningFrameCm {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    leftCm: nonNegativeCm(src.leftCm, factory.leftCm),
    rightCm: nonNegativeCm(src.rightCm, factory.rightCm),
    topCm: nonNegativeCm(src.topCm, factory.topCm),
    bottomCm: nonNegativeCm(src.bottomCm, factory.bottomCm),
  }
}

export function normalizeOpeningFrameDefaults(
  raw: unknown,
  factory: OpeningFrameDefaults = createFactoryOpeningFrameDefaults(),
): OpeningFrameDefaults {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    door: normalizeFrameCm(src.door, factory.door),
    window: normalizeFrameCm(src.window, factory.window),
  }
}

export function cloneOpeningFrameDefaults(defaults: OpeningFrameDefaults): OpeningFrameDefaults {
  return {
    door: cloneFrame(defaults.door),
    window: cloneFrame(defaults.window),
  }
}

export function readPlanOpeningFrameDefaults(
  plan: FloorPlan | null | undefined,
  floorIndex = 0,
  fallback: OpeningFrameDefaults = createFactoryOpeningFrameDefaults(),
): OpeningFrameDefaults {
  const floor = plan?.floors[floorIndex] ?? plan?.floors[0]
  const fromFloor = floor?.defaults?.openingFrameDefaults
  if (fromFloor) return normalizeOpeningFrameDefaults(fromFloor, fallback)
  return normalizeOpeningFrameDefaults(plan?.settings?.openingFrameDefaults, fallback)
}

export function writePlanOpeningFrameDefaults(
  plan: FloorPlan,
  defaults: OpeningFrameDefaults,
  floorIndex = 0,
): FloorPlan {
  const frames = cloneOpeningFrameDefaults(normalizeOpeningFrameDefaults(defaults))
  return {
    ...plan,
    floors: plan.floors.map((floor, i) =>
      i === floorIndex
        ? {
            ...floor,
            defaults: {
              ...(floor.defaults as FloorDefaults | undefined),
              openingFrameDefaults: frames,
            } as FloorDefaults,
          }
        : floor,
    ),
  }
}

/** Zaai kozijnmaten op floors zonder eigen frame-defaults. */
export function seedPlanOpeningFrameDefaults(
  plan: FloorPlan,
  seed: OpeningFrameDefaults = createFactoryOpeningFrameDefaults(),
): FloorPlan {
  if (plan.floors.some((floor) => floor.defaults?.openingFrameDefaults)) return plan
  if (plan.settings?.openingFrameDefaults) return plan
  const frames = cloneOpeningFrameDefaults(normalizeOpeningFrameDefaults(seed))
  return {
    ...plan,
    floors: plan.floors.map((floor) => ({
      ...floor,
      defaults: {
        ...(floor.defaults as FloorDefaults | undefined),
        openingFrameDefaults: cloneOpeningFrameDefaults(frames),
      } as FloorDefaults,
    })),
  }
}

function isFramedOpening(opening: Opening, type: 'door' | 'window'): boolean {
  return opening.type === type && !isFramelessOpeningKind(opening.kind)
}

function isSkylight(item: FloorItem): boolean {
  return item.kind === 'skylight'
}

export function countPlanFramedOpenings(
  plan: FloorPlan,
  kind: 'door' | 'window',
  floorIndex?: number,
): number {
  let count = 0
  for (const [i, floor] of plan.floors.entries()) {
    if (floorIndex != null && i !== floorIndex) continue
    for (const wall of floor.walls) {
      for (const opening of wall.openings) {
        if (isFramedOpening(opening, kind)) count += 1
      }
    }
    if (kind === 'window') {
      for (const item of floor.items ?? []) {
        if (isSkylight(item)) count += 1
      }
    }
  }
  return count
}

function patchOpeningFrame(
  opening: Opening,
  type: 'door' | 'window',
  side: keyof OpeningFrameCm,
  cm: number,
): Opening {
  if (!isFramedOpening(opening, type)) return opening
  return {
    ...opening,
    frame: buildOpeningFramePatch(opening, { [side]: cm }),
  }
}

function patchItemFrame(item: FloorItem, side: keyof OpeningFrameCm, cm: number): FloorItem {
  if (!isSkylight(item)) return item
  return {
    ...item,
    frame: buildSkylightFramePatch(item, { [side]: cm }),
  }
}

function mapFloorFrames(
  floor: Floor,
  kind: 'door' | 'window',
  side: keyof OpeningFrameCm,
  cm: number,
): Floor {
  return {
    ...floor,
    walls: floor.walls.map((wall) => ({
      ...wall,
      openings: wall.openings.map((opening) => patchOpeningFrame(opening, kind, side, cm)),
    })),
    items:
      kind === 'window' && floor.items
        ? floor.items.map((item) => patchItemFrame(item, side, cm))
        : floor.items,
    designs: floor.designs?.map((design) => ({
      ...design,
      walls: design.walls.map((wall) => ({
        ...wall,
        openings: wall.openings.map((opening) => patchOpeningFrame(opening, kind, side, cm)),
      })),
      items:
        kind === 'window' && design.items
          ? design.items.map((item) => patchItemFrame(item, side, cm))
          : design.items,
    })),
  }
}

/** Overschrijf één kozijnkant op bestaande framed openings (+ dakramen bij raam). */
export function overwritePlanOpeningFrameSide(
  plan: FloorPlan,
  kind: 'door' | 'window',
  side: keyof OpeningFrameCm,
  cm: number,
  floorIndex?: number,
): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor, i) =>
      floorIndex != null && i !== floorIndex ? floor : mapFloorFrames(floor, kind, side, cm),
    ),
  }
}
