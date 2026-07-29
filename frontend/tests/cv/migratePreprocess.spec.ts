import { describe, expect, it } from 'vitest'
import { migratePreprocessConfig } from '@/cv/preprocess/layer-preprocess'
import type { PreprocessConfig } from '@/core/extraction/types'

function baseConfig(): PreprocessConfig {
  return {
    brightness: 50,
    contrast: 1,
    threshold: 128,
    thresholdEnabled: true,
    useAdaptive: true,
    rotate180: false,
  }
}

describe('migratePreprocessConfig', () => {
  it('mapt legacy noiseReduction naar smooth en bridge op wallLayer', () => {
    const migrated = migratePreprocessConfig({
      ...baseConfig(),
      noiseReduction: 3,
    })

    expect(migrated.wallLayer?.smoothLinesEnabled).toBe(true)
    expect(migrated.wallLayer?.bridgeGapsEnabled).toBe(true)
    expect(migrated.wallLayer?.smoothLines).toBe(2)
    expect(migrated.wallLayer?.bridgeGaps).toBe(3)
  })

  it('neemt thresholdEnabled over naar colorThresholdEnabled op wallLayer', () => {
    const migrated = migratePreprocessConfig({
      ...baseConfig(),
      thresholdEnabled: false,
    })

    expect(migrated.wallLayer?.colorThresholdEnabled).toBe(false)
  })

  it('behoudt legacy despeckleMinPx; ontbrekende vlag volgt muur-default (uit)', () => {
    const migrated = migratePreprocessConfig({
      ...baseConfig(),
      despeckleMinPx: 5,
    })

    expect(migrated.wallLayer?.despeckleMinPx).toBe(5)
    expect(migrated.wallLayer?.removeSpecklesEnabled).toBe(false)
  })

  it('behoudt expliciete removeSpecklesEnabled false boven defaults', () => {
    const migrated = migratePreprocessConfig({
      ...baseConfig(),
      despeckleMinPx: 5,
      removeSpecklesEnabled: false,
    })

    expect(migrated.wallLayer?.despeckleMinPx).toBe(5)
    expect(migrated.wallLayer?.removeSpecklesEnabled).toBe(false)
  })
})
