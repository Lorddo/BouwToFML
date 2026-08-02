import type { Opening } from './types'
import { CONCEPT_WINDOW_REFID } from './types'
import { DEFAULT_FML_DOOR_HEIGHT_CM } from './extraction-to-plan-types'

/** Glashoogte van een gesynthetiseerd bovenlicht (cm). */
export const BOVENLICHT_HEIGHT_CM = 40
/** Gat tussen bovenzijde deur en onderkant bovenlicht (cm). */
export const BOVENLICHT_GAP_CM = 10

/**
 * Effectieve bovenlicht-flag: expliciete override wint, anders projectdefault.
 * Alleen zinvol voor `type === 'door'`.
 */
export function resolveDoorBovenlicht(
  door: Pick<Opening, 'type' | 'bovenlicht'>,
  defaultOn: boolean,
): boolean {
  if (door.type !== 'door') return false
  if (door.bovenlicht === true || door.bovenlicht === false) return door.bovenlicht
  return defaultOn
}

export interface BuildBovenlichtOptions {
  /** Muur-/vloerhoogte; bovenlicht wordt geclampt zodat top ≤ floorHeightCm. */
  floorHeightCm?: number
  /** Stabiele guid-prefix (meestal de deur-guid). */
  doorGuid?: string
}

/**
 * Bouwt een export-only raam boven de deur.
 * `z = deurhoogte + gap`; hoogte 40 cm (geclampt binnen floorHeight indien gezet).
 */
export function buildBovenlichtOpening(
  door: Pick<Opening, 't' | 'width' | 'z_height' | 'guid'>,
  options: BuildBovenlichtOptions = {},
): Opening | null {
  const doorHeight = door.z_height ?? DEFAULT_FML_DOOR_HEIGHT_CM
  const z = doorHeight + BOVENLICHT_GAP_CM
  let zHeight = BOVENLICHT_HEIGHT_CM
  const floorHeight = options.floorHeightCm
  if (floorHeight != null && Number.isFinite(floorHeight)) {
    if (z >= floorHeight) return null
    zHeight = Math.min(zHeight, floorHeight - z)
    if (zHeight <= 0) return null
  }

  const doorGuid = options.doorGuid ?? door.guid
  return {
    refid: CONCEPT_WINDOW_REFID,
    t: door.t,
    width: door.width,
    type: 'window',
    z,
    z_height: zHeight,
    mirrored: [0, 0],
    guid: doorGuid ? `${doorGuid}-bovenlicht` : undefined,
  }
}
