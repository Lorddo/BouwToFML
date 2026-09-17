import type { Opening, OpeningType } from '@/core/plan/types'
import {
  isTriangleWindow,
  resolveDoorSubtypeFromRefid,
  resolveWindowSubtypeFromRefid,
  type OpeningSubtypeDraft,
} from '@/core/plan/opening-add-presets'
import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  resolveBovenlichtGapCm,
  resolveBovenlichtHeightCm,
  resolveDoorBovenlicht,
  resolveWindowBovenlicht,
} from '@/core/plan/bovenlicht'
import {
  DEFAULT_DOOR_HEIGHT_CM,
  DEFAULT_WINDOW_HEIGHT_CM,
  DEFAULT_WINDOW_SILL_Z_CM,
} from '@/core/plan/extraction-to-plan-types'
import { effectiveOpeningFrame } from '@/core/plan/opening-display-geom'
import { resolveHingeAtStart, resolveSwingSign } from '@/ui/composables/plan-canvas/plan-canvas-doors'
import { resolveOpeningHeight, resolveWindowSillZ } from '@/core/plan/opening-plan-ops'

export type OpeningDraftType = OpeningType | 'mixed'

export type { OpeningSubtypeDraft }

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
  /** Effectieve glashoogte (override of vloerdefault). */
  bovenlichtHeightCm: number
  bovenlichtHeightMixed: boolean
  /** Effectieve dorpel-gap (override of vloerdefault). */
  bovenlichtGapCm: number
  bovenlichtGapMixed: boolean
  /** Effectief kozijn (instance of catalogus); mixed per kant. */
  frameLeftCm: number
  frameLeftMixed: boolean
  frameRightCm: number
  frameRightMixed: boolean
  frameTopCm: number
  frameTopMixed: boolean
  frameBottomCm: number
  frameBottomMixed: boolean
}

export interface OpeningDraftOptions {
  doorBovenlichtDefault?: boolean
  windowBovenlichtDefault?: boolean
  /** @deprecated Gebruik doorBovenlichtDefault. */
  bovenlichtDefault?: boolean
  bovenlichtHeightCm?: number
  bovenlichtGapCm?: number
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
      ? openings.map((opening) => resolveWindowSubtypeFromRefid(opening.kind))
      : openingType === 'door'
        ? openings.map((opening) => resolveDoorSubtypeFromRefid(opening.kind))
        : []
  const subtypeFirst = subtypes[0] ?? (openingType === 'window' ? 'single' : 'standard')
  const subtypeMixed = subtypes.length > 0 && subtypes.some((value) => value !== subtypeFirst)

  const widths = openings.map((opening) => Math.round(opening.width))
  const heights = openings.map((opening) => resolveOpeningHeight(opening))
  const sillZs = openings
    .filter((opening) => opening.type === 'window' || opening.type === 'door')
    .map((opening) =>
      opening.type === 'window' ? resolveWindowSillZ(opening) : Math.round(opening.z ?? 0),
    )
  const doorOpenings = openings.filter((opening) => opening.type === 'door')
  const windowOpenings = openings.filter((opening) => opening.type === 'window')
  const mirrorable = openings.filter(
    (opening) => opening.type === 'door' || isTriangleWindow(opening.type, opening.kind),
  )
  const hinges = mirrorable.map((opening) => resolveHingeAtStart(opening.mirrored))
  const swings = doorOpenings.map((opening) => resolveSwingSign(opening.mirrored) > 0)
  const bovenlichtFlags =
    openingType === 'window'
      ? windowOpenings.map((opening) => resolveWindowBovenlicht(opening, windowBovenlichtDefault))
      : doorOpenings.map((opening) => resolveDoorBovenlicht(opening, doorBovenlichtDefault))

  const widthFirst = widths[0] ?? 90
  const heightFirst =
    heights[0] ??
    (openingType === 'window' ? DEFAULT_WINDOW_HEIGHT_CM : DEFAULT_DOOR_HEIGHT_CM)
  const sillFirst = sillZs[0] ?? (openingType === 'window' ? DEFAULT_WINDOW_SILL_Z_CM : 0)
  const hingeFirst = hinges[0] ?? true
  const swingFirst = swings[0] ?? false
  const bovenlichtDefaultFallback =
    openingType === 'window' ? windowBovenlichtDefault : doorBovenlichtDefault
  const bovenlichtFirst = bovenlichtFlags[0] ?? bovenlichtDefaultFallback
  const floorHeightDefault = options.bovenlichtHeightCm ?? BOVENLICHT_HEIGHT_CM
  const floorGapDefault = options.bovenlichtGapCm ?? BOVENLICHT_GAP_CM
  const bovenlichtHeights = openings.map((opening) =>
    resolveBovenlichtHeightCm(opening, floorHeightDefault),
  )
  const bovenlichtGaps = openings.map((opening) => resolveBovenlichtGapCm(opening, floorGapDefault))
  const bovenlichtHeightFirst = bovenlichtHeights[0] ?? floorHeightDefault
  const bovenlichtGapFirst = bovenlichtGaps[0] ?? floorGapDefault

  const frames = openings.map((opening) => effectiveOpeningFrame(opening))
  const frameLeftFirst = Math.round(frames[0]?.leftCm ?? 5)
  const frameRightFirst = Math.round(frames[0]?.rightCm ?? 5)
  const frameTopFirst = Math.round(frames[0]?.topCm ?? 5)
  const frameBottomFirst = Math.round(frames[0]?.bottomCm ?? 0)

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
    bovenlichtHeightCm: bovenlichtHeightFirst,
    bovenlichtHeightMixed: bovenlichtHeights.some((value) => value !== bovenlichtHeightFirst),
    bovenlichtGapCm: bovenlichtGapFirst,
    bovenlichtGapMixed: bovenlichtGaps.some((value) => value !== bovenlichtGapFirst),
    frameLeftCm: frameLeftFirst,
    frameLeftMixed: frames.some((frame) => Math.round(frame.leftCm) !== frameLeftFirst),
    frameRightCm: frameRightFirst,
    frameRightMixed: frames.some((frame) => Math.round(frame.rightCm) !== frameRightFirst),
    frameTopCm: frameTopFirst,
    frameTopMixed: frames.some((frame) => Math.round(frame.topCm) !== frameTopFirst),
    frameBottomCm: frameBottomFirst,
    frameBottomMixed: frames.some((frame) => Math.round(frame.bottomCm) !== frameBottomFirst),
  }
}
