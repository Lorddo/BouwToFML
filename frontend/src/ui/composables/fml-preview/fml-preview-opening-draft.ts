import type { Opening, OpeningType } from '@/core/fml/types'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import { resolveDoorBovenlicht } from '@/core/fml/bovenlicht'
import { resolveHingeAtStart, resolveSwingSign } from '@/ui/components/fml-preview-doors'
import { resolveOpeningHeight, resolveWindowSillZ } from '@/ui/components/fml-preview-openings'

export type OpeningDraftType = OpeningType | 'mixed'

export interface OpeningDraftState {
  openingType: OpeningDraftType
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
  /** Effectieve bovenlicht (override of projectdefault). */
  bovenlichtOn: boolean
  bovenlichtMixed: boolean
}

export interface OpeningDraftOptions {
  bovenlichtDefault?: boolean
}

/** Mixed/first draft van geselecteerde openings (editor sync + panel). */
export function computeOpeningDraftState(
  openings: Opening[],
  options: OpeningDraftOptions = {},
): OpeningDraftState | null {
  if (openings.length === 0) return null

  const bovenlichtDefault = options.bovenlichtDefault === true
  const types = new Set(openings.map((opening) => opening.type))
  const openingType: OpeningDraftType = types.size === 1 ? openings[0].type : 'mixed'

  const widths = openings.map((opening) => Math.round(opening.width))
  const heights = openings.map((opening) => resolveOpeningHeight(opening))
  const sillZs = openings
    .filter((opening) => opening.type === 'window')
    .map((opening) => resolveWindowSillZ(opening))
  const doorOpenings = openings.filter((opening) => opening.type === 'door')
  const hinges = doorOpenings.map((opening) => resolveHingeAtStart(opening.mirrored))
  const swings = doorOpenings.map((opening) => resolveSwingSign(opening.mirrored) > 0)
  const bovenlichtFlags = doorOpenings.map((opening) =>
    resolveDoorBovenlicht(opening, bovenlichtDefault),
  )

  const widthFirst = widths[0] ?? 90
  const heightFirst =
    heights[0] ??
    (openingType === 'window' ? DEFAULT_FML_WINDOW_HEIGHT_CM : DEFAULT_FML_DOOR_HEIGHT_CM)
  const sillFirst = sillZs[0] ?? DEFAULT_FML_WINDOW_SILL_Z_CM
  const hingeFirst = hinges[0] ?? true
  const swingFirst = swings[0] ?? false
  const bovenlichtFirst = bovenlichtFlags[0] ?? bovenlichtDefault

  return {
    openingType,
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
