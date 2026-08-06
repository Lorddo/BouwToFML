import type { Opening, OpeningType } from '@/core/fml/types'
import {
  resolveDoorSubtypeFromRefid,
  resolveWindowSubtypeFromRefid,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/fml/opening-add-presets'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import { resolveDoorBovenlicht, resolveWindowBovenlicht } from '@/core/fml/bovenlicht'
import { resolveHingeAtStart, resolveSwingSign } from '@/ui/components/fml-preview-doors'
import { resolveOpeningHeight, resolveWindowSillZ } from '@/ui/components/fml-preview-openings'

export type OpeningDraftType = OpeningType | 'mixed'

export type OpeningSubtypeDraft = DoorAddSubtype | WindowAddSubtype

export interface OpeningDraftState {
  openingType: OpeningDraftType
  /** Subtype uit refid; meaningful alleen als openingType door of window is. */
  subtype: OpeningSubtypeDraft
  subtypeMixed: boolean
  widthCm: number
  widthMixed: boolean
  heightCm: number
  heightMixed: boolean
  sillZCm: number
  sillZMixed: boolean
  hingeAtStart: boolean
  hingeMixed: boolean
  swingRight: boolean
  swingMixed: boolean
  /** Effectieve bovenlicht (override of vloerdefault voor deur/raam). */
  bovenlichtOn: boolean
  bovenlichtMixed: boolean
}

export interface OpeningDraftOptions {
  doorBovenlichtDefault?: boolean
  windowBovenlichtDefault?: boolean
  /** @deprecated Gebruik doorBovenlichtDefault. */
  bovenlichtDefault?: boolean
}

/** Mixed/first draft van geselecteerde openings (editor sync + panel). */
export function computeOpeningDraftState(
  openings: Opening[],
  options: OpeningDraftOptions = {},
): OpeningDraftState | null {
  if (openings.length === 0) return null

  const doorBovenlichtDefault =
    options.doorBovenlichtDefault === true || options.bovenlichtDefault === true
  const windowBovenlichtDefault = options.windowBovenlichtDefault === true
  const types = new Set(openings.map((opening) => opening.type))
  const openingType: OpeningDraftType = types.size === 1 ? openings[0].type : 'mixed'

  const subtypes =
    openingType === 'window'
      ? openings.map((opening) => resolveWindowSubtypeFromRefid(opening.refid))
      : openingType === 'door'
        ? openings.map((opening) => resolveDoorSubtypeFromRefid(opening.refid))
        : []
  const subtypeFirst = subtypes[0] ?? (openingType === 'window' ? 'single' : 'standard')
  const subtypeMixed = subtypes.length > 0 && subtypes.some((value) => value !== subtypeFirst)

  const widths = openings.map((opening) => Math.round(opening.width))
  const heights = openings.map((opening) => resolveOpeningHeight(opening))
  const sillZs = openings
    .filter((opening) => opening.type === 'window')
    .map((opening) => resolveWindowSillZ(opening))
  const doorOpenings = openings.filter((opening) => opening.type === 'door')
  const windowOpenings = openings.filter((opening) => opening.type === 'window')
  const hinges = doorOpenings.map((opening) => resolveHingeAtStart(opening.mirrored))
  const swings = doorOpenings.map((opening) => resolveSwingSign(opening.mirrored) > 0)
  const bovenlichtFlags =
    openingType === 'window'
      ? windowOpenings.map((opening) => resolveWindowBovenlicht(opening, windowBovenlichtDefault))
      : doorOpenings.map((opening) => resolveDoorBovenlicht(opening, doorBovenlichtDefault))

  const widthFirst = widths[0] ?? 90
  const heightFirst =
    heights[0] ??
    (openingType === 'window' ? DEFAULT_FML_WINDOW_HEIGHT_CM : DEFAULT_FML_DOOR_HEIGHT_CM)
  const sillFirst = sillZs[0] ?? DEFAULT_FML_WINDOW_SILL_Z_CM
  const hingeFirst = hinges[0] ?? true
  const swingFirst = swings[0] ?? false
  const bovenlichtDefaultFallback =
    openingType === 'window' ? windowBovenlichtDefault : doorBovenlichtDefault
  const bovenlichtFirst = bovenlichtFlags[0] ?? bovenlichtDefaultFallback

  return {
    openingType,
    subtype: subtypeFirst,
    subtypeMixed,
    widthCm: widthFirst,
    widthMixed: widths.some((value) => value !== widthFirst),
    heightCm: heightFirst,
    heightMixed: heights.some((value) => value !== heightFirst),
    sillZCm: sillFirst,
    sillZMixed: sillZs.length > 0 && sillZs.some((value) => value !== sillFirst),
    hingeAtStart: hingeFirst,
    hingeMixed: hinges.some((value) => value !== hingeFirst),
    swingRight: swingFirst,
    swingMixed: swings.some((value) => value !== swingFirst),
    bovenlichtOn: bovenlichtFirst,
    bovenlichtMixed: bovenlichtFlags.some((value) => value !== bovenlichtFirst),
  }
}
