/**
 * FML extras/settings-keys for concepts Floorplanner has no first-class field for.
 * Values are `plg*` — never invent other prefixes. `.plg` uses typed fields instead.
 */
export const FML_OPENING_FRAME_EXTRA = 'plgFrame'
export const FML_PLAN_SLICES_SETTINGS_KEY = 'plgSlices'
export const FML_PLAN_ROLE_SETTINGS_KEY = 'plgRole'
export const FML_ROOF_ORIGIN_EXTRA = 'plgOrigin'
export const FML_ROOF_SURFACE_ID_EXTRA = 'plgRoofSurfaceId'

/** Keys that must never appear in a `.plg` file (typed fields only). */
export const PLG_STRIP_FML_EXTRA_KEYS = [
  FML_OPENING_FRAME_EXTRA,
  FML_PLAN_SLICES_SETTINGS_KEY,
  FML_PLAN_ROLE_SETTINGS_KEY,
  FML_ROOF_ORIGIN_EXTRA,
  FML_ROOF_SURFACE_ID_EXTRA,
] as const
