import type { WallRenderStyle } from '@/core/extraction/geometric-signature'
import type { PreprocessConfig } from '@/core/extraction/types'
import { migratePreprocessConfig } from '@/cv/preprocess/layer-preprocess'

export type DrawingProfileId = 'solid' | 'open'

export interface DetectionPreset {
  wallStyle: 'solid' | 'open'
  expectedWallStyles: WallRenderStyle[]
  /** Drempel voor muur-classificatie via Otsu-referentie inkt-dekking (0–1). */
  roomInkCoverageThreshold: number
}

export interface DrawingProfile extends DetectionPreset {
  id: DrawingProfileId
  label: string
  tagline: string
  description: string
  expectations: string[]
}

const DEFAULT_PROFILE_ID: DrawingProfileId = 'open'

const STORAGE_KEY = 'bouwToFml.drawingProfileId'

const DEFAULT_DETECTION: DetectionPreset = {
  wallStyle: 'open',
  expectedWallStyles: ['parallel_lines', 'solid'],
  roomInkCoverageThreshold: 0.6,
}

const ROOM_INK_THRESHOLD_BY_PROFILE: Record<DrawingProfileId, number> = {
  open: 0.6,
  solid: 0.8,
}

function profile(
  id: DrawingProfileId,
  label: string,
  tagline: string,
  description: string,
  expectations: string[],
  detection: Partial<DetectionPreset>,
): DrawingProfile {
  return {
    id,
    label,
    tagline,
    description,
    expectations,
    ...DEFAULT_DETECTION,
    ...detection,
  }
}

export const DRAWING_PROFILES: DrawingProfile[] = [
  profile(
    'solid',
    'Solid Walls',
    'Massieve muurbanden',
    'Voor tekeningen met gevulde zwarte muurbanden waar de muur als volle vorm zichtbaar is.',
    [
      'Muren als gevulde band',
      'Kleinere close-kernel tegen over-merge',
      'Geschikt voor strakke B/W onderleggers',
    ],
    {
      wallStyle: 'solid',
      expectedWallStyles: ['solid'],
      roomInkCoverageThreshold: ROOM_INK_THRESHOLD_BY_PROFILE.solid,
    },
  ),
  profile(
    'open',
    'Open Walls',
    'Dubbele randlijnen (holle muur)',
    'Voor tekeningen met twee parallelle muurlijnen waar de binnenkant van de muur wit blijft.',
    [
      'Muren als outline / parallelle lijnen',
      'Adaptieve close op basis van referentiedikte',
      'Robuuster voor technische CAD-achtige plattegronden',
    ],
    {
      wallStyle: 'open',
      expectedWallStyles: ['parallel_lines', 'solid', 'details'],
      roomInkCoverageThreshold: ROOM_INK_THRESHOLD_BY_PROFILE.open,
    },
  ),
]

const profileById = Object.fromEntries(DRAWING_PROFILES.map((item) => [item.id, item])) as Record<
  DrawingProfileId,
  DrawingProfile
>

export function getDrawingProfile(id: DrawingProfileId): DrawingProfile {
  return profileById[id] ?? profileById[DEFAULT_PROFILE_ID]
}

function isDrawingProfileId(value: string): value is DrawingProfileId {
  return value === 'solid' || value === 'open'
}

export function loadStoredProfileId(): DrawingProfileId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && isDrawingProfileId(raw)) return raw
    if (raw === 'simpel') return 'solid'
    if (raw === 'standaard' || raw === 'gedetailleerd') return 'open'
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_PROFILE_ID
}

export function storeProfileId(id: DrawingProfileId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* localStorage unavailable */
  }
}

export function defaultRoomInkThresholdForProfile(id: DrawingProfileId): number {
  return ROOM_INK_THRESHOLD_BY_PROFILE[id] ?? ROOM_INK_THRESHOLD_BY_PROFILE.open
}

export function detectionPresetForProfile(id: DrawingProfileId): DetectionPreset {
  const {
    id: _id,
    label: _label,
    tagline: _tagline,
    description: _desc,
    expectations: _exp,
    ...preset
  } = getDrawingProfile(id)
  return preset
}

/** Past alleen detectievelden toe — voorbewerking uit stap 2 blijft ongewijzigd. */
export function applyDetectionPreset(
  base: PreprocessConfig,
  id: DrawingProfileId,
): { preprocess: PreprocessConfig; preset: DetectionPreset } {
  const preset = detectionPresetForProfile(id)
  const merged: PreprocessConfig = {
    ...base,
    wallStyle: preset.wallStyle,
  }
  return {
    preprocess: migratePreprocessConfig(merged),
    preset,
  }
}
