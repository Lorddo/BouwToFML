import { describe, expect, it } from 'vitest'
import {
  clampAdaptiveBlockSize,
  DEFAULT_ADAPTIVE_BLOCK_SIZE,
  MAX_ADAPTIVE_BLOCK_SIZE,
  MIN_ADAPTIVE_BLOCK_SIZE,
} from '@/cv/port/preprocess'
import { createDefaultWallLayerTune } from '@/cv/preprocess/layer-preprocess'

describe('clampAdaptiveBlockSize', () => {
  it('defaults to 11', () => {
    expect(clampAdaptiveBlockSize(undefined)).toBe(DEFAULT_ADAPTIVE_BLOCK_SIZE)
    expect(clampAdaptiveBlockSize(Number.NaN)).toBe(DEFAULT_ADAPTIVE_BLOCK_SIZE)
  })

  it('forces odd and clamps range', () => {
    expect(clampAdaptiveBlockSize(10)).toBe(11)
    expect(clampAdaptiveBlockSize(2)).toBe(MIN_ADAPTIVE_BLOCK_SIZE)
    expect(clampAdaptiveBlockSize(100)).toBe(MAX_ADAPTIVE_BLOCK_SIZE)
    expect(clampAdaptiveBlockSize(25)).toBe(25)
  })

  it('wall defaults include adaptiveBlockSize 11', () => {
    expect(createDefaultWallLayerTune().adaptiveBlockSize).toBe(11)
  })
})
