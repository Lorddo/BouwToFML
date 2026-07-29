import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useWorkspaceOcr } from '@/ui/composables/workspace/useWorkspaceOcr'
import { ocrHitKey } from '@/cv/port/ocrHitKey'

describe('useWorkspaceOcr restoreOcrFromRegions', () => {
  it('vult kandidaten voor sidebar en shift-verwijderen', async () => {
    const applied = ref<{ regions: import('@/core/extraction').OcrTextCandidate[] }>({
      regions: [],
    })
    const ocr = useWorkspaceOcr({
      preprocess: ref({
        ocrEnabled: true,
        ocrMinConfidence: 70,
        ocrMode: 'general',
      } as import('@/platform/image').PreprocessConfig),
      cvLoader: {
        ready: ref(true),
        ensureOpenCv: async () => {},
      } as ReturnType<typeof import('@/ui/composables/useOpenCvLoader').useOpenCvLoader>,
      getImageEl: async () => {
        throw new Error('not used')
      },
      ensureScaleInitialized: () => {},
      preprocessMaskArgs: () => ({
        eraserMask: null,
        ocrMask: null,
        ocrMaskedRegions: [],
      }),
      applyOcrTextMask: async (regions) => {
        applied.value = { regions }
      },
      clearOcrTextMask: () => {
        applied.value = { regions: [] }
      },
      refreshOcrPreview: async () => {},
      setLocalError: () => {},
    })

    const region = { x: 10, y: 20, width: 40, height: 12, text: 'Hal', confidence: 92 }
    ocr.restoreOcrFromRegions([region])

    expect(ocr.ocrHitList.value).toHaveLength(1)
    expect(ocr.ocrHitList.value[0]?.text).toBe('Hal')

    ocr.removeOcrHit(ocrHitKey(region))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(ocr.ocrHitList.value).toHaveLength(0)
    expect(applied.value.regions).toHaveLength(0)
  })
})
