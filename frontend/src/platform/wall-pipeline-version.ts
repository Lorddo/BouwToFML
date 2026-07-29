/**
 * Active wall finalize pipeline version.
 * Runtime is V3-only after cutover.
 */
export type WallPipelineVersion = 'v3'

const WALL_PIPELINE_VERSION_STORAGE_KEY = 'bouwtofml.wallPipelineVersion'

export const DEFAULT_WALL_PIPELINE_VERSION: WallPipelineVersion = 'v3'

export function isWallPipelineVersion(value: unknown): value is WallPipelineVersion {
  return value === 'v3'
}

/** Always v3 — migrates stale localStorage `v2` from pre-cutover sessions. */
export function loadWallPipelineVersion(): WallPipelineVersion {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(WALL_PIPELINE_VERSION_STORAGE_KEY, 'v3')
    } catch {
      /* ignore quota / private mode */
    }
  }
  return DEFAULT_WALL_PIPELINE_VERSION
}

export function storeWallPipelineVersion(_version?: WallPipelineVersion): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(WALL_PIPELINE_VERSION_STORAGE_KEY, 'v3')
  } catch {
    /* ignore */
  }
}
