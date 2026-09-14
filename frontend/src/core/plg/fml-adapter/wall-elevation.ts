/**
 * B1 — wall.elevation ↔ Floorplanner-native az/bz.
 *
 * az/bz zijn FP-native (geen eigen extensie). Export moet byte-identiek blijven
 * aan `buildFmlV3` serializeWall: zelfde objectvorm, geen her-parse die ontbrekende
 * `h` als `z + floorHeight` invult (export-default is `{ z: 0, h: floor.height }`).
 */
import { defaultWallElevation } from '../extension-types'
import type { FmlConceptAdapter } from './registry'
import type { Floor, FloorPlan, Wall } from '../../plan/types'

function tryEndpoint(raw: unknown): { z: number; h: number } | undefined {
  if (raw == null || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  if (typeof obj.z !== 'number' || !Number.isFinite(obj.z)) return undefined
  if (typeof obj.h !== 'number' || !Number.isFinite(obj.h)) return undefined
  return { z: obj.z, h: obj.h }
}

function hydrateWall(wall: Wall, floorHeightCm: number): void {
  const extras = wall.extras
  if (!extras) return
  const a = tryEndpoint(extras.az)
  const b = tryEndpoint(extras.bz)
  if (a == null && b == null) return

  const fallback = defaultWallElevation(floorHeightCm)
  wall.elevation = {
    a: a ?? { ...fallback },
    b: b ?? { ...fallback },
  }
  const next = { ...extras }
  delete next.az
  delete next.bz
  wall.extras = Object.keys(next).length > 0 ? next : undefined
}

function hydratePlan(plan: FloorPlan): void {
  for (const floor of plan.floors) {
    for (const wall of floor.walls) hydrateWall(wall, floor.height)
    for (const design of floor.designs ?? []) {
      for (const wall of design.walls) hydrateWall(wall, floor.height)
    }
  }
}

function serializeWallElevation(wall: Wall, out: Record<string, unknown>, _floor: Floor): void {
  // buildFmlV3 zette az/bz al uit extras (nu meestal leeg → default).
  // Alleen overschrijven vanuit getypt veld wanneer extras geen az/bz meer dragen
  // (na hydrate / accessor-write). Als extras.az nog staat (legacy/split), blijft
  // de buildFmlV3-waarde leidend.
  const extras = wall.extras
  if (extras?.az == null && wall.elevation?.a != null) {
    out.az = wall.elevation.a
  }
  if (extras?.bz == null && wall.elevation?.b != null) {
    out.bz = wall.elevation.b
  }
}

export const wallElevationAdapter: FmlConceptAdapter = {
  id: 'wall-elevation',
  hydrate: hydratePlan,
  serializeWall: serializeWallElevation,
}
