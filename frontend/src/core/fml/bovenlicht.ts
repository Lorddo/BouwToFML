import type { FloorPlan, Opening, Wall } from './types'
import { CONCEPT_WINDOW_REFID } from './types'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
} from './extraction-to-plan-types'
import { wallLengthCm } from './fml-wall-geom'
import { wallElevationAtT } from './wall-endpoint-height'

/** Fabrieks-glashoogte van een gesynthetiseerd bovenlicht (cm). */
export const BOVENLICHT_HEIGHT_CM = 40
/** Fabrieks-gat tussen bovenzijde opening en onderkant bovenlicht (cm). */
export const BOVENLICHT_GAP_CM = 10
export const MIN_BOVENLICHT_HEIGHT_CM = 1
export const MAX_BOVENLICHT_HEIGHT_CM = 400
export const MIN_BOVENLICHT_GAP_CM = 0
export const MAX_BOVENLICHT_GAP_CM = 200

/** Guid-suffix van gesynthetiseerde bovenlichten (export). */
export const BOVENLICHT_GUID_SUFFIX = '-bovenlicht'
/** Max |Δt| × muurlengte bij geometrische match (cm). */
export const BOVENLICHT_MATCH_AXIS_CM = 3
/** Max |Δwidth| bij geometrische match (cm). */
export const BOVENLICHT_MATCH_WIDTH_CM = 2
/** Toegestane overlap/flush: kandidaat.z ≥ ouderTop − dit (cm). */
const BOVENLICHT_Z_FLUSH_EPS_CM = 0.5

export function clampBovenlichtHeightCm(value: number): number {
  if (!Number.isFinite(value)) return BOVENLICHT_HEIGHT_CM
  return Math.max(MIN_BOVENLICHT_HEIGHT_CM, Math.min(MAX_BOVENLICHT_HEIGHT_CM, Math.round(value)))
}

export function clampBovenlichtGapCm(value: number): number {
  if (!Number.isFinite(value)) return BOVENLICHT_GAP_CM
  return Math.max(MIN_BOVENLICHT_GAP_CM, Math.min(MAX_BOVENLICHT_GAP_CM, Math.round(value)))
}

/**
 * Effectieve glashoogte: expliciete override wint, anders vloerdefault.
 */
export function resolveBovenlichtHeightCm(
  opening: Pick<Opening, 'bovenlichtHeightCm'>,
  floorDefault: number,
): number {
  const override = opening.bovenlichtHeightCm
  if (override != null && Number.isFinite(override) && override > 0) {
    return clampBovenlichtHeightCm(override)
  }
  if (Number.isFinite(floorDefault) && floorDefault > 0) {
    return clampBovenlichtHeightCm(floorDefault)
  }
  return BOVENLICHT_HEIGHT_CM
}

/**
 * Effectieve dorpel-gap: expliciete override wint, anders vloerdefault.
 */
export function resolveBovenlichtGapCm(
  opening: Pick<Opening, 'bovenlichtGapCm'>,
  floorDefault: number,
): number {
  const override = opening.bovenlichtGapCm
  if (override != null && Number.isFinite(override) && override >= 0) {
    return clampBovenlichtGapCm(override)
  }
  if (Number.isFinite(floorDefault) && floorDefault >= 0) {
    return clampBovenlichtGapCm(floorDefault)
  }
  return BOVENLICHT_GAP_CM
}

/**
 * Effectieve bovenlicht-flag voor deuren: expliciete override wint, anders default.
 */
export function resolveDoorBovenlicht(
  door: Pick<Opening, 'type' | 'bovenlicht'>,
  defaultOn: boolean,
): boolean {
  if (door.type !== 'door') return false
  if (door.bovenlicht === true || door.bovenlicht === false) return door.bovenlicht
  return defaultOn
}

/**
 * Effectieve bovenlicht-flag voor ramen: expliciete override wint, anders default.
 */
export function resolveWindowBovenlicht(
  window: Pick<Opening, 'type' | 'bovenlicht'>,
  defaultOn: boolean,
): boolean {
  if (window.type !== 'window') return false
  if (window.bovenlicht === true || window.bovenlicht === false) return window.bovenlicht
  return defaultOn
}

export interface BuildBovenlichtOptions {
  /** Muurtop in cm (`az`/`bz`.h); bovenlicht wordt geclampt zodat top ≤ dit. */
  floorHeightCm?: number
  /** Stabiele guid-prefix (meestal de bron-opening-guid). */
  sourceGuid?: string
  /** @deprecated Gebruik sourceGuid. */
  doorGuid?: string
  /** Glashoogte (cm); default {@link BOVENLICHT_HEIGHT_CM}. */
  heightCm?: number
  /** Gat boven opening (cm); default {@link BOVENLICHT_GAP_CM}. */
  gapCm?: number
}

/**
 * Bouwt een export-only raam boven een deur of raam.
 * `z = top + gap`; hoogte uit options (geclampt binnen floorHeight indien gezet).
 * Past de gap niet: plaats direct op de opening. Skip alleen als opening tot plafond reikt.
 */
export function buildBovenlichtOpening(
  source: Pick<Opening, 't' | 'width' | 'z' | 'z_height' | 'type' | 'guid'>,
  options: BuildBovenlichtOptions = {},
): Opening | null {
  const sillZ = source.z ?? 0
  const openingHeight =
    source.z_height ??
    (source.type === 'window' ? DEFAULT_FML_WINDOW_HEIGHT_CM : DEFAULT_FML_DOOR_HEIGHT_CM)
  const top = sillZ + openingHeight
  const gapCm =
    options.gapCm != null && Number.isFinite(options.gapCm) && options.gapCm >= 0
      ? options.gapCm
      : BOVENLICHT_GAP_CM
  const requestedHeight =
    options.heightCm != null && Number.isFinite(options.heightCm) && options.heightCm > 0
      ? options.heightCm
      : BOVENLICHT_HEIGHT_CM
  let z = top + gapCm
  let zHeight = requestedHeight
  const floorHeight = options.floorHeightCm
  if (floorHeight != null && Number.isFinite(floorHeight)) {
    if (!(top < floorHeight)) return null
    if (z >= floorHeight) z = top
    zHeight = Math.min(zHeight, floorHeight - z)
    if (zHeight <= 0) return null
  }

  const sourceGuid = options.sourceGuid ?? options.doorGuid ?? source.guid
  return {
    refid: CONCEPT_WINDOW_REFID,
    t: source.t,
    width: source.width,
    type: 'window',
    z,
    z_height: zHeight,
    mirrored: [0, 0],
    guid: sourceGuid ? `${sourceGuid}${BOVENLICHT_GUID_SUFFIX}` : undefined,
  }
}

/** Bovenzijde opening in cm (zelfde defaults als {@link buildBovenlichtOpening}). */
function openingTopCm(opening: Pick<Opening, 'type' | 'z' | 'z_height'>): number {
  const sillZ = opening.z ?? 0
  const height =
    opening.z_height ??
    (opening.type === 'window' ? DEFAULT_FML_WINDOW_HEIGHT_CM : DEFAULT_FML_DOOR_HEIGHT_CM)
  return sillZ + height
}

function applyBovenlichtFromTransom(parent: Opening, transom: Opening): Opening {
  const gapRaw = (transom.z ?? 0) - openingTopCm(parent)
  return {
    ...parent,
    bovenlicht: true,
    bovenlichtHeightCm: clampBovenlichtHeightCm(transom.z_height ?? BOVENLICHT_HEIGHT_CM),
    // Gap 0 moet expliciet gezet — anders erft fabriek 10 via resolveBovenlichtGapCm.
    bovenlichtGapCm: clampBovenlichtGapCm(Math.max(0, gapRaw)),
  }
}

/**
 * Vouwt gestapelde bovenlicht-ramen terug naar session-flags op de ouder-opening.
 * Guid-pass (onze export) eerst; daarna geometrie (Floorplanner t/width/z).
 * Transom-ramen verdwijnen uit de lijst; export synthetiseert ze opnieuw.
 */
export function foldBovenlichtOnWall(openings: Opening[], wallLenCm: number): Opening[] {
  if (openings.length < 2) return openings

  const next = openings.map((op) => op)
  const consumed = new Set<number>()
  const parentHasTransom = new Set<number>()

  // 1) Guid-pass: `{parentGuid}-bovenlicht` → ouder met die guid.
  for (let i = 0; i < openings.length; i++) {
    const cand = openings[i]
    if (cand.type !== 'window') continue
    const guid = cand.guid
    if (!guid || !guid.endsWith(BOVENLICHT_GUID_SUFFIX)) continue
    const parentGuid = guid.slice(0, -BOVENLICHT_GUID_SUFFIX.length)
    if (!parentGuid) continue
    const parentIdx = openings.findIndex(
      (op, j) => j !== i && !consumed.has(j) && !parentHasTransom.has(j) && op.guid === parentGuid,
    )
    if (parentIdx < 0) continue
    next[parentIdx] = applyBovenlichtFromTransom(next[parentIdx], cand)
    consumed.add(i)
    parentHasTransom.add(parentIdx)
  }

  // 2) Geometrie-pass: window boven deur/raam met zelfde t/width (± tolerantie).
  const candOrder = openings
    .map((op, i) => ({ op, i }))
    .filter(({ op, i }) => op.type === 'window' && !consumed.has(i))
    .sort((a, b) => (a.op.z ?? 0) - (b.op.z ?? 0))

  for (const { op: cand, i: candIdx } of candOrder) {
    if (consumed.has(candIdx)) continue
    const candZ = cand.z ?? 0
    let bestIdx = -1
    let bestGap = Number.POSITIVE_INFINITY
    let bestAxis = Number.POSITIVE_INFINITY

    for (let j = 0; j < openings.length; j++) {
      if (j === candIdx || consumed.has(j) || parentHasTransom.has(j)) continue
      const parent = openings[j]
      const top = openingTopCm(parent)
      if (candZ + BOVENLICHT_Z_FLUSH_EPS_CM < top) continue
      const gap = Math.max(0, candZ - top)
      if (gap > MAX_BOVENLICHT_GAP_CM) continue
      if (Math.abs(cand.width - parent.width) > BOVENLICHT_MATCH_WIDTH_CM) continue
      const dt = Math.abs(cand.t - parent.t)
      if (wallLenCm > 0) {
        if (dt * wallLenCm > BOVENLICHT_MATCH_AXIS_CM) continue
      } else if (dt > 0) {
        continue
      }
      const axisCm = wallLenCm > 0 ? dt * wallLenCm : dt
      if (gap < bestGap - 1e-9 || (Math.abs(gap - bestGap) <= 1e-9 && axisCm < bestAxis)) {
        bestGap = gap
        bestAxis = axisCm
        bestIdx = j
      }
    }

    if (bestIdx < 0) continue
    next[bestIdx] = applyBovenlichtFromTransom(next[bestIdx], cand)
    consumed.add(candIdx)
    parentHasTransom.add(bestIdx)
  }

  if (consumed.size === 0) return openings
  return next.filter((_, i) => !consumed.has(i))
}

/** Fold bovenlichten op elke muur (import-pad). */
export function foldBovenlichtOnWalls(walls: Wall[]): Wall[] {
  return walls.map((wall) => ({
    ...wall,
    openings: foldBovenlichtOnWall(wall.openings, wallLengthCm(wall)),
  }))
}

/** Ontbrekend / niet-false → packed (huidige default). */
export function readBovenlichtPacked(plan: FloorPlan | null | undefined): boolean {
  return plan?.source?.settings?.bovenlichtPacked !== false
}

export function writeBovenlichtPacked(plan: FloorPlan, packed: boolean): FloorPlan {
  return {
    ...plan,
    source: {
      ...plan.source,
      settings: {
        ...(plan.source?.settings ?? {}),
        bovenlichtPacked: packed,
      },
    },
  }
}

export type ExpandBovenlichtFloorDefaults = {
  doorDefault: boolean
  windowDefault: boolean
  heightCm: number
  gapCm: number
}

function stripBovenlichtFlags(opening: Opening): Opening {
  const next = { ...opening }
  delete next.bovenlicht
  delete next.bovenlichtHeightCm
  delete next.bovenlichtGapCm
  return next
}

function openingWantsBovenlicht(
  opening: Opening,
  defaults: ExpandBovenlichtFloorDefaults,
): boolean {
  if (opening.type === 'door') return resolveDoorBovenlicht(opening, defaults.doorDefault)
  if (opening.type === 'window') return resolveWindowBovenlicht(opening, defaults.windowDefault)
  return false
}

/**
 * Zet effectieve bovenlicht-flags om naar losse ramen; wist flags op de ouder.
 * Skip als er al een `{guid}-bovenlicht` sibling bestaat.
 */
export function expandBovenlichtOnWall(
  wall: Wall,
  floorHeightCm: number,
  defaults: ExpandBovenlichtFloorDefaults,
): Wall {
  const existingGuids = new Set(
    wall.openings.map((op) => op.guid).filter((guid): guid is string => Boolean(guid)),
  )
  const nextOpenings: Opening[] = []
  for (const opening of wall.openings) {
    if (!openingWantsBovenlicht(opening, defaults)) {
      nextOpenings.push(stripBovenlichtFlags(opening))
      continue
    }
    const wallTopCm = wallElevationAtT(wall, opening.t, floorHeightCm).h
    const sibling = buildBovenlichtOpening(opening, {
      floorHeightCm: wallTopCm,
      sourceGuid: opening.guid,
      heightCm: resolveBovenlichtHeightCm(opening, defaults.heightCm),
      gapCm: resolveBovenlichtGapCm(opening, defaults.gapCm),
    })
    nextOpenings.push(stripBovenlichtFlags(opening))
    if (!sibling) continue
    if (sibling.guid && existingGuids.has(sibling.guid)) continue
    nextOpenings.push(sibling)
    if (sibling.guid) existingGuids.add(sibling.guid)
  }
  return { ...wall, openings: nextOpenings }
}

export function expandBovenlichtOnPlan(
  plan: FloorPlan,
  defaultsForFloor: (floorIndex: number) => ExpandBovenlichtFloorDefaults,
): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor, floorIndex) => {
      const defaults = defaultsForFloor(floorIndex)
      const designs = floor.designs?.map((design) => ({
        ...design,
        walls: design.walls.map((wall) => expandBovenlichtOnWall(wall, floor.height, defaults)),
      }))
      const activeIndex = floor.activeDesignIndex ?? 0
      const walls = designs
        ? (designs[activeIndex]?.walls ?? floor.walls)
        : floor.walls.map((wall) => expandBovenlichtOnWall(wall, floor.height, defaults))
      return { ...floor, walls, designs }
    }),
  }
}

/** Fold op alle floors + alle designs (toggle packed aan / import). */
export function foldBovenlichtOnPlan(plan: FloorPlan): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor) => {
      const designs = floor.designs?.map((design) => ({
        ...design,
        walls: foldBovenlichtOnWalls(design.walls),
      }))
      const activeIndex = floor.activeDesignIndex ?? 0
      const walls = designs
        ? (designs[activeIndex]?.walls ?? foldBovenlichtOnWalls(floor.walls))
        : foldBovenlichtOnWalls(floor.walls)
      return { ...floor, walls, designs }
    }),
  }
}

/** Aantal ouders die bij expand een sibling zouden krijgen. */
export function countExpandableBovenlicht(
  plan: FloorPlan,
  defaultsForFloor: (floorIndex: number) => ExpandBovenlichtFloorDefaults,
): number {
  let count = 0
  plan.floors.forEach((floor, floorIndex) => {
    const defaults = defaultsForFloor(floorIndex)
    for (const wall of floor.walls) {
      const existingGuids = new Set(
        wall.openings.map((op) => op.guid).filter((guid): guid is string => Boolean(guid)),
      )
      for (const opening of wall.openings) {
        if (!openingWantsBovenlicht(opening, defaults)) continue
        const wallTopCm = wallElevationAtT(wall, opening.t, floor.height).h
        const sibling = buildBovenlichtOpening(opening, {
          floorHeightCm: wallTopCm,
          sourceGuid: opening.guid,
          heightCm: resolveBovenlichtHeightCm(opening, defaults.heightCm),
          gapCm: resolveBovenlichtGapCm(opening, defaults.gapCm),
        })
        if (!sibling) continue
        if (sibling.guid && existingGuids.has(sibling.guid)) continue
        count += 1
      }
    }
  })
  return count
}

/** Aantal openingen die bij fold zouden verdwijnen (guid- of geometrie-match). */
export function countFoldableBovenlicht(plan: FloorPlan): number {
  let count = 0
  for (const floor of plan.floors) {
    for (const wall of floor.walls) {
      const before = wall.openings.length
      const after = foldBovenlichtOnWall(wall.openings, wallLengthCm(wall)).length
      count += Math.max(0, before - after)
    }
  }
  return count
}

/**
 * Unpacked place: zet direct een sibling-raam als floor-default voor dit type aan.
 * Geen flags op de ouder.
 */
export function maybeAddSiblingBovenlicht(
  wall: Wall,
  parent: Opening,
  floorHeightCm: number,
  defaults: ExpandBovenlichtFloorDefaults,
): Opening | null {
  if (parent.type === 'door' && !defaults.doorDefault) return null
  if (parent.type === 'window' && !defaults.windowDefault) return null
  if (parent.type !== 'door' && parent.type !== 'window') return null
  const wallTopCm = wallElevationAtT(wall, parent.t, floorHeightCm).h
  return buildBovenlichtOpening(parent, {
    floorHeightCm: wallTopCm,
    sourceGuid: parent.guid,
    heightCm: defaults.heightCm,
    gapCm: defaults.gapCm,
  })
}
