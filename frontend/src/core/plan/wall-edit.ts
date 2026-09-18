import type { FloorPlan, Wall } from '@/core/plan/types'
import { clampWallBalance } from '@/core/plan/plan-wall-geom'
import {
  setJunctionHeight as setJunctionEndpointHeight,
  setJunctionBottomZ as setJunctionEndpointBottomZ,
  setWallsUniformBottomZ as setWallsUniformEndpointBottomZ,
  setWallsUniformHeight as setWallsUniformEndpointHeight,
  promoteWallElevationFromExtras,
  splitWallEndpointExtras,
} from '@/core/plan/wall-endpoint-height'
import {
  MIN_SPLIT_SEGMENT_CM,
  BALANCE_DEFAULT,
  BALANCE_SLIDER_PCT_MAX,
  BALANCE_SLIDER_PCT_MIN,
  distance,
  stableJunctionId,
  type SplitWallResult,
  type WallEndRef,
} from './junction-core'
import { redistributeOpeningsAcrossSplit } from '@/core/plan/opening-plan-ops'

/** FML-fractie (0.5 = 50%). Altijd 0–1 (0–100%). */
export function clampBalance(balance: number): number {
  return Math.round(clampWallBalance(balance) * 1000) / 1000
}

export function balanceToPercent(fraction: number): number {
  return Math.round(clampBalance(fraction) * 1000) / 10
}

export function percentToBalance(percent: number): number {
  if (!Number.isFinite(percent)) return BALANCE_DEFAULT
  return clampBalance(percent / 100)
}

/** Slider en invoer: 0–100%. */
export function sliderPercentFromDraft(percent: number): number {
  if (!Number.isFinite(percent)) return 50
  return Math.min(BALANCE_SLIDER_PCT_MAX, Math.max(BALANCE_SLIDER_PCT_MIN, percent))
}

function cloneWallWith(
  wall: Wall,
  patch: Pick<Wall, 'thickness' | 'balance'> & Partial<Pick<Wall, 'a' | 'b'>>,
): Wall {
  return {
    ...wall,
    ...patch,
    a: { ...wall.a },
    b: { ...wall.b },
    openings: wall.openings.map((opening) => ({ ...opening })),
  }
}

export function setWallBalance(walls: Wall[], wallId: string, balance: number): Wall[] {
  return setWallsBalance(walls, [wallId], balance)
}

/**
 * Keep-axis: alleen `balance` schrijven. Hartlijn `a`/`b` blijft liggen;
 * het lichaam schuift (zelfde model als detectie-flush X-01).
 */
export function setWallsBalance(walls: Wall[], wallIds: Iterable<string>, balance: number): Wall[] {
  const target = clampBalance(balance)
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  let changed = false
  const next = walls.map((wall) => {
    if (!idSet.has(wall.id)) return wall
    if (clampBalance(wall.balance ?? BALANCE_DEFAULT) === target) return wall
    changed = true
    return cloneWallWith(wall, { thickness: wall.thickness, balance: target })
  })
  return changed ? next : walls
}

export function setWallThickness(walls: Wall[], wallId: string, thicknessCm: number): Wall[] {
  return setWallsThickness(walls, [wallId], thicknessCm)
}

function clampThicknessCm(thicknessCm: number): number {
  return Math.max(1, Math.min(200, thicknessCm))
}

/**
 * Dikte wijzigen: hartlijn vast, balance terug naar 0.5 (flush hoorde bij oude dikte).
 */
export function setWallsThickness(
  walls: Wall[],
  wallIds: Iterable<string>,
  thicknessCm: number,
): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  const clamped = clampThicknessCm(thicknessCm)
  let changed = false
  const next = walls.map((wall) => {
    if (!idSet.has(wall.id)) return wall
    if (
      wall.thickness === clamped &&
      clampBalance(wall.balance ?? BALANCE_DEFAULT) === BALANCE_DEFAULT
    ) {
      return wall
    }
    changed = true
    return cloneWallWith(wall, { thickness: clamped, balance: BALANCE_DEFAULT })
  })
  return changed ? next : walls
}

/**
 * Alleen `thickness` schrijven. Hartlijn én balance blijven (binnenmaten bij 0/1).
 */
export function setWallsThicknessKeepBalance(
  walls: Wall[],
  wallIds: Iterable<string>,
  thicknessCm: number,
): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  const clamped = clampThicknessCm(thicknessCm)
  let changed = false
  const next = walls.map((wall) => {
    if (!idSet.has(wall.id)) return wall
    if (wall.thickness === clamped) return wall
    changed = true
    return cloneWallWith(wall, {
      thickness: clamped,
      balance: wall.balance ?? BALANCE_DEFAULT,
    })
  })
  return changed ? next : walls
}

/** Muren met deze ids, over alle verdiepingen. */
export function collectPlanWallsByIds(plan: FloorPlan, wallIds: Iterable<string>): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return []
  const out: Wall[] = []
  for (const floor of plan.floors) {
    for (const wall of floor.walls) {
      if (idSet.has(wall.id)) out.push(wall)
    }
  }
  return out
}

/**
 * Dikte van genoemde ids op elke floor, zonder balance te wijzigen.
 * Ongewijzigde floors blijven dezelfde referentie.
 */
export function setPlanWallsThicknessKeepBalance(
  plan: FloorPlan,
  wallIds: Iterable<string>,
  thicknessCm: number,
): FloorPlan {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return plan
  let changed = false
  const floors = plan.floors.map((floor) => {
    const nextWalls = setWallsThicknessKeepBalance(floor.walls, idSet, thicknessCm)
    if (nextWalls === floor.walls) return floor
    changed = true
    return { ...floor, walls: nextWalls }
  })
  return changed ? { ...plan, floors } : plan
}

/** Beide uiteinden van geselecteerde muren op dezelfde hoogte (`az`/`bz`). */
export function setWallsHeight(
  walls: Wall[],
  wallIds: Iterable<string>,
  heightCm: number,
  floorHeightCm: number,
): Wall[] {
  return setWallsUniformEndpointHeight(walls, wallIds, heightCm, floorHeightCm)
}

/** Beide uiteinden van geselecteerde muren op dezelfde bodem (`az.z`/`bz.z`); hoogte behouden. */
export function setWallsBottomZ(
  walls: Wall[],
  wallIds: Iterable<string>,
  bottomZCm: number,
  floorHeightCm: number,
): Wall[] {
  return setWallsUniformEndpointBottomZ(walls, wallIds, bottomZCm, floorHeightCm)
}

/** Alle wall-ends op één knoop op dezelfde hoogte. */
export function setJunctionHeight(
  walls: Wall[],
  refs: ReadonlyArray<WallEndRef>,
  heightCm: number,
  floorHeightCm: number,
): Wall[] {
  return setJunctionEndpointHeight(walls, refs, heightCm, floorHeightCm)
}

/** Alle wall-ends op één knoop op dezelfde bodem; hoogte behouden. */
export function setJunctionBottomZ(
  walls: Wall[],
  refs: ReadonlyArray<WallEndRef>,
  bottomZCm: number,
  floorHeightCm: number,
): Wall[] {
  return setJunctionEndpointBottomZ(walls, refs, bottomZCm, floorHeightCm)
}

/** Verwijder één muursegment (openingen op die muur gaan mee). */
export function removeWall(walls: Wall[], wallId: string): Wall[] {
  return removeWalls(walls, [wallId])
}

/** Verwijder meerdere muursegmenten (openingen op die muren gaan mee). */
export function removeWalls(walls: Wall[], wallIds: Iterable<string>): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  const next = walls.filter((wall) => !idSet.has(wall.id))
  return next.length === walls.length ? walls : next
}

/**
 * Split een muur op parameter `t` (0–1 langs a→b) in twee segmenten met een gedeeld hoekpunt.
 * `t` wordt geclamped zodat beide segmenten ≥ {@link MIN_SPLIT_SEGMENT_CM} blijven.
 */
export function splitWallAtT(walls: Wall[], wallId: string, tSplit = 0.5): SplitWallResult | null {
  const index = walls.findIndex((item) => item.id === wallId)
  if (index < 0) return null

  const wall = walls[index]
  const len = distance(wall.a, wall.b)
  if (len < MIN_SPLIT_SEGMENT_CM * 2) return null

  const tMin = MIN_SPLIT_SEGMENT_CM / len
  const tMax = 1 - MIN_SPLIT_SEGMENT_CM / len
  const t = Math.min(tMax, Math.max(tMin, tSplit))

  const splitPoint = {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  }
  const secondWallId = `${wallId}-split-${crypto.randomUUID().slice(0, 8)}`

  const firstEndpoints = { a: wall.a, b: { ...splitPoint } }
  const secondEndpoints = { a: { ...splitPoint }, b: wall.b }
  const { first: firstOpenings, second: secondOpenings } = redistributeOpeningsAcrossSplit({
    openings: wall.openings,
    sourceWall: wall,
    tSplit: t,
    firstWall: firstEndpoints,
    secondWall: secondEndpoints,
  })

  const { firstExtras, secondExtras } = splitWallEndpointExtras(wall, t)
  const firstEnds = promoteWallElevationFromExtras(firstExtras)
  const secondEnds = promoteWallElevationFromExtras(secondExtras)
  const firstWall: Wall = {
    ...wall,
    b: { ...splitPoint },
    openings: firstOpenings,
    extras: firstEnds.extras,
    elevation: firstEnds.elevation,
  }
  const secondWall: Wall = {
    ...wall,
    id: secondWallId,
    a: { ...splitPoint },
    openings: secondOpenings,
    extras: secondEnds.extras,
    elevation: secondEnds.elevation,
  }

  const next = [...walls.slice(0, index), firstWall, secondWall, ...walls.slice(index + 1)]
  const junctionId = stableJunctionId([
    { wallId: firstWall.id, end: 'b' },
    { wallId: secondWallId, end: 'a' },
  ])

  return {
    walls: next,
    junctionId,
    firstWallId: firstWall.id,
    secondWallId,
  }
}

/** Split een muur op het midden in twee segmenten met een gedeeld hoekpunt. */
export function splitWallAtMidpoint(walls: Wall[], wallId: string): SplitWallResult | null {
  return splitWallAtT(walls, wallId, 0.5)
}
