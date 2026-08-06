import type { Opening } from './types'
import { CONCEPT_WINDOW_REFID } from './types'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
} from './extraction-to-plan-types'

/** Fabrieks-glashoogte van een gesynthetiseerd bovenlicht (cm). */
export const BOVENLICHT_HEIGHT_CM = 40
/** Fabrieks-gat tussen bovenzijde opening en onderkant bovenlicht (cm). */
export const BOVENLICHT_GAP_CM = 10

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
  /** Muur-/vloerhoogte; bovenlicht wordt geclampt zodat top ≤ floorHeightCm. */
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
    guid: sourceGuid ? `${sourceGuid}-bovenlicht` : undefined,
  }
}
