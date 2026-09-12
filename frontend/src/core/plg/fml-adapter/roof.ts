/**
 * FML ↔ `.plg` adapter for dak: ridge + roof planes + floor stack + rollen + surface-origin.
 *
 * Hydrate draait ná legacy import-keten (ensureRidgeDesigns → syncRidgeWallGuids →
 * syncRoofPlaneGuids → …). Die syncs schrijven al naar `plan.roof`; hydrate ruimt
 * restanten in settings/extras op en promoveert wall.role / design.role / surface.origin.
 */
import {
  DEFAULT_FLOOR_THICKNESS_CM,
  DEFAULT_NOK_THICKNESS_CM,
  FLOOR_STACK_SETTINGS_KEY,
  readFloorStack,
} from '../../fml/floor-stack'
import {
  DEFAULT_RIDGE_DISPLAY_WIDTH_CM,
  isRidgeDesign,
  isRidgeWall,
  PLAN_ROLE_SETTINGS_KEY,
  RIDGE_DESIGN_ROLE,
  RIDGE_WALL_EXTRA,
  RIDGE_WALLS_SETTINGS_KEY,
  readRidgeWallsSettings,
} from '../../fml/ridge-walls'
import {
  ROOF_ORIGIN_EXTRA,
  ROOF_ORIGIN_GENERATED,
  ROOF_ORIGIN_MANUAL,
  ROOF_PLANES_KINDS_KEY,
  ROOF_PLANES_SETTINGS_KEY,
  isDormerRoof,
  listRidgeSurfacesOnPlan,
  readRoofPlanesSettings,
  roofSurfaceOrigin,
} from '../../fml/roof-planes'
import type { FloorDesign, FloorPlan, FloorSurface, Wall } from '../../fml/types'
import type { RoofKind } from '../extension-types'
import type { FmlConceptAdapter } from './registry'

function clampPositiveCm(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return Math.round(value)
}

function normalizeStackFromSettings(raw: unknown): {
  nokThicknessCm: number
  floors: Array<{ level: number; thicknessCm: number; ridgeZCm?: number }>
} {
  if (!raw || typeof raw !== 'object') {
    return { nokThicknessCm: DEFAULT_NOK_THICKNESS_CM, floors: [] }
  }
  const record = raw as Record<string, unknown>
  const floors: Array<{ level: number; thicknessCm: number; ridgeZCm?: number }> = []
  const seen = new Set<number>()
  if (Array.isArray(record.floors)) {
    for (const entry of record.floors) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      if (typeof row.level !== 'number' || !Number.isFinite(row.level)) continue
      const level = Math.round(row.level)
      if (seen.has(level)) continue
      seen.add(level)
      const ridgeZCm =
        typeof row.ridgeZCm === 'number' && Number.isFinite(row.ridgeZCm) && row.ridgeZCm >= 0
          ? Math.round(row.ridgeZCm)
          : undefined
      floors.push({
        level,
        thicknessCm: clampPositiveCm(row.thicknessCm, DEFAULT_FLOOR_THICKNESS_CM),
        ...(ridgeZCm != null ? { ridgeZCm } : {}),
      })
    }
  }
  return {
    nokThicknessCm: clampPositiveCm(record.nokThicknessCm, DEFAULT_NOK_THICKNESS_CM),
    floors,
  }
}

function hydrateWallRole(wall: Wall): void {
  if (wall.role === RIDGE_DESIGN_ROLE || wall.extras?.[RIDGE_WALL_EXTRA] === true) {
    wall.role = RIDGE_DESIGN_ROLE
  }
  if (wall.extras && RIDGE_WALL_EXTRA in wall.extras) {
    const extras = { ...wall.extras }
    delete extras[RIDGE_WALL_EXTRA]
    wall.extras = Object.keys(extras).length > 0 ? extras : undefined
  }
}

function hydrateDesignRole(design: FloorDesign): void {
  if (
    design.role === RIDGE_DESIGN_ROLE ||
    design.source?.settings?.[PLAN_ROLE_SETTINGS_KEY] === RIDGE_DESIGN_ROLE ||
    isRidgeDesign(design)
  ) {
    design.role = RIDGE_DESIGN_ROLE
  }
  if (design.source?.settings && PLAN_ROLE_SETTINGS_KEY in design.source.settings) {
    const settings = { ...design.source.settings }
    delete settings[PLAN_ROLE_SETTINGS_KEY]
    design.source = { ...design.source, settings }
  }
}

function hydrateSurfaceOrigin(surface: FloorSurface): void {
  if (surface.origin === ROOF_ORIGIN_MANUAL || surface.origin === ROOF_ORIGIN_GENERATED) {
    // typed wint; strip legacy
  } else {
    const raw = surface.extras?.[ROOF_ORIGIN_EXTRA]
    if (raw === ROOF_ORIGIN_MANUAL || raw === ROOF_ORIGIN_GENERATED) {
      surface.origin = raw
    }
  }
  if (surface.extras && ROOF_ORIGIN_EXTRA in surface.extras) {
    const extras = { ...surface.extras }
    delete extras[ROOF_ORIGIN_EXTRA]
    surface.extras = Object.keys(extras).length > 0 ? extras : undefined
  }
}

type RoofKindEntry = { kind: RoofKind; parentId?: string }

function parseKindsMap(raw: unknown): Record<string, RoofKindEntry> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, RoofKindEntry> = {}
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!id.trim() || !entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const kind: RoofKind = row.kind === 'dormer' ? 'dormer' : 'plane'
    const parentId =
      typeof row.parentId === 'string' && row.parentId.trim() ? row.parentId.trim() : undefined
    out[id.trim()] = kind === 'dormer' ? { kind, parentId } : { kind: 'plane' }
  }
  return out
}

function hydrateSurfaceRoofKind(
  surface: FloorSurface,
  kindsFromSettings: Record<string, RoofKindEntry>,
): void {
  if (surface.roofKind === 'dormer' || surface.roofKind === 'plane') {
    if (surface.roofKind === 'plane') delete surface.roofParentId
    return
  }
  const fromSettings = kindsFromSettings[surface.id]
  if (fromSettings) {
    surface.roofKind = fromSettings.kind
    if (fromSettings.kind === 'dormer' && fromSettings.parentId) {
      surface.roofParentId = fromSettings.parentId
    } else {
      delete surface.roofParentId
    }
  }
}

function collectKindsForSerialize(plan: FloorPlan): Record<string, RoofKindEntry> | undefined {
  const kinds: Record<string, RoofKindEntry> = {}
  for (const surface of listRidgeSurfacesOnPlan(plan)) {
    if (!isDormerRoof(surface)) continue
    kinds[surface.id] = {
      kind: 'dormer',
      ...(surface.roofParentId ? { parentId: surface.roofParentId } : {}),
    }
  }
  return Object.keys(kinds).length > 0 ? kinds : undefined
}

function hydrateRoof(plan: FloorPlan): void {
  const ridge = readRidgeWallsSettings(plan)
  const planes = readRoofPlanesSettings(plan)
  const settingsStack = plan.source?.settings?.[FLOOR_STACK_SETTINGS_KEY]
  const rawPlanesSettings = plan.source?.settings?.[ROOF_PLANES_SETTINGS_KEY]
  const kindsFromSettings =
    rawPlanesSettings && typeof rawPlanesSettings === 'object'
      ? parseKindsMap((rawPlanesSettings as Record<string, unknown>)[ROOF_PLANES_KINDS_KEY])
      : {}
  const stack =
    settingsStack != null
      ? normalizeStackFromSettings(settingsStack)
      : plan.roof?.stack
        ? plan.roof.stack
        : readFloorStack(plan)

  plan.roof = {
    ridge: {
      wallGuids: [...ridge.wallGuids],
      displayWidthCm: ridge.displayWidthCm || DEFAULT_RIDGE_DISPLAY_WIDTH_CM,
    },
    planes: { surfaceGuids: [...planes.surfaceGuids] },
    stack: {
      nokThicknessCm: stack.nokThicknessCm,
      floors: stack.floors.map((entry) => ({ ...entry })),
    },
    ...(plan.roof?.clearHeightOverride
      ? { clearHeightOverride: plan.roof.clearHeightOverride }
      : {}),
  }

  if (plan.source?.settings) {
    const settings = { ...plan.source.settings }
    delete settings[RIDGE_WALLS_SETTINGS_KEY]
    delete settings[ROOF_PLANES_SETTINGS_KEY]
    delete settings[FLOOR_STACK_SETTINGS_KEY]
    plan.source = { ...plan.source, settings }
  }

  for (const floor of plan.floors) {
    for (const wall of floor.walls) hydrateWallRole(wall)
    if (floor.surfaces) {
      for (const surface of floor.surfaces) {
        hydrateSurfaceOrigin(surface)
        hydrateSurfaceRoofKind(surface, kindsFromSettings)
      }
    }
    if (!floor.designs) continue
    for (const design of floor.designs) {
      hydrateDesignRole(design)
      for (const wall of design.walls) hydrateWallRole(wall)
      if (design.surfaces) {
        for (const surface of design.surfaces) {
          hydrateSurfaceOrigin(surface)
          hydrateSurfaceRoofKind(surface, kindsFromSettings)
        }
      }
    }
  }
}

export const roofAdapter: FmlConceptAdapter = {
  id: 'roof',

  hydrate(plan) {
    hydrateRoof(plan)
  },

  serializeWall(wall, out) {
    if (wall.role === RIDGE_DESIGN_ROLE || isRidgeWall(wall)) {
      out.ridge = true
    }
  },

  serializeSurface(surface, out) {
    if (surface.origin != null || surface.extras?.[ROOF_ORIGIN_EXTRA] != null) {
      out[ROOF_ORIGIN_EXTRA] = roofSurfaceOrigin(surface)
    }
  },

  serializeDesignSettings(design, settings) {
    if (design.role === RIDGE_DESIGN_ROLE || isRidgeDesign(design)) {
      settings[PLAN_ROLE_SETTINGS_KEY] = RIDGE_DESIGN_ROLE
    }
  },

  serializePlanSettings(plan, settings) {
    const roof = plan.roof
    const ridge = roof?.ridge ?? readRidgeWallsSettings(plan)
    const planes = roof?.planes ?? readRoofPlanesSettings(plan)
    const stack = roof?.stack ?? readFloorStack(plan)

    const hasRidgeContent =
      ridge.wallGuids.length > 0 || ridge.displayWidthCm !== DEFAULT_RIDGE_DISPLAY_WIDTH_CM
    if (hasRidgeContent) {
      settings[RIDGE_WALLS_SETTINGS_KEY] = {
        wallGuids: [...ridge.wallGuids],
        displayWidthCm: ridge.displayWidthCm,
      }
    }
    if (planes.surfaceGuids.length > 0) {
      const kinds = collectKindsForSerialize(plan)
      settings[ROOF_PLANES_SETTINGS_KEY] = {
        surfaceGuids: [...planes.surfaceGuids],
        ...(kinds ? { [ROOF_PLANES_KINDS_KEY]: kinds } : {}),
      }
    }
    // Mag gezet worden; buildFmlV3 stript floorStack daarna (Floorplanner-hostile).
    if (stack.floors.length > 0 || stack.nokThicknessCm !== DEFAULT_NOK_THICKNESS_CM) {
      settings[FLOOR_STACK_SETTINGS_KEY] = {
        nokThicknessCm: stack.nokThicknessCm,
        floors: stack.floors.map((entry) => ({ ...entry })),
      }
    }
  },
}
