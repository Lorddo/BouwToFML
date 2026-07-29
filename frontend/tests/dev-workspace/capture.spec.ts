import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { clonePlain } from '@/platform/dev-workspace/clone-plain'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import type { PreprocessConfig } from '@/platform/image'

describe('clonePlain', () => {
  it('clones vue reactive preprocess config', () => {
    const preprocess = reactive<PreprocessConfig>({
      ...DEFAULT_PREPROCESS,
      rotationDeg: 5,
      wallLayer: { ...DEFAULT_PREPROCESS.wallLayer, brightness: 40 },
    })
    const cloned = clonePlain(preprocess)
    expect(cloned.rotationDeg).toBe(5)
    expect(cloned.wallLayer?.brightness).toBe(40)
    expect(cloned).not.toBe(preprocess)
  })
})
