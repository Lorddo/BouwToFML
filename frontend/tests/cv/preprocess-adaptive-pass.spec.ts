import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDefaultWallLayerTune,
  resolveLayerPreprocess,
} from '@/cv/preprocess/layer-preprocess'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import { runPreprocessLayerFromGrayscale } from '@/cv/layers/preprocess-layer'
import type { LayerContext } from '@/cv/layers/types'
import type { OpenCV } from '@/cv/loadOpenCV'

const binarizeMat = vi.hoisted(() =>
  vi.fn((_cv: unknown, src: { delete?: () => void }, _opts: unknown) => {
    // Mimic binarizeMat consuming src and returning a fresh mat.
    src.delete?.()
    return {
      cols: 2,
      rows: 2,
      channels: () => 1,
      data: new Uint8Array(4),
      clone: () => ({
        cols: 2,
        rows: 2,
        channels: () => 1,
        data: new Uint8Array(4),
        delete: vi.fn(),
        setTo: vi.fn(),
      }),
      delete: vi.fn(),
      setTo: vi.fn(),
    }
  }),
)

vi.mock('@/cv/port/preprocess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/cv/port/preprocess')>()
  return {
    ...actual,
    binarizeMat,
    matToCanvas: () => ({ width: 2, height: 2 }),
  }
})

vi.mock('@/cv/port/binaryPolarity', () => ({
  ensureBlackInkOnWhiteBackground: vi.fn(),
}))

vi.mock('@/cv/port/despeckle', () => ({
  despeckleByMinArea: vi.fn(),
}))

vi.mock('@/cv/port/cleanBinary', () => ({
  applyNegative: vi.fn(),
  fillHolesByMaxArea: vi.fn(),
  openWhiteDetails: vi.fn(),
  smoothBinaryLines: vi.fn(),
  thickenLines: vi.fn(),
  thinLines: vi.fn(),
}))

vi.mock('@/cv/port/morphClose', () => ({
  directionalClose: (_cv: unknown, mat: unknown) => mat,
  kernelFromPixelRadius: () => 1,
}))

vi.mock('@/cv/tools/polygon', () => ({
  maskHasInk: () => false,
}))

function makeGrayMat() {
  return {
    cols: 2,
    rows: 2,
    channels: () => 1,
    data: new Uint8Array(4),
    clone: () => ({
      cols: 2,
      rows: 2,
      channels: () => 1,
      data: new Uint8Array(4),
      delete: vi.fn(),
      setTo: vi.fn(),
    }),
    delete: vi.fn(),
    setTo: vi.fn(),
  }
}

function makeCtx(wallTune: ReturnType<typeof createDefaultWallLayerTune>): LayerContext {
  const preprocess = resolveLayerPreprocess(
    {
      ...DEFAULT_PREPROCESS,
      wallLayer: wallTune,
    },
    'walls',
  )
  return {
    cv: {} as OpenCV,
    image: {} as HTMLCanvasElement,
    preprocess,
    examples: [],
  }
}

describe('preprocess adaptive pass', () => {
  beforeEach(() => {
    binarizeMat.mockClear()
  })

  it('slaat adaptive over wanneer useAdaptive false + preBinarize aan', () => {
    const result = runPreprocessLayerFromGrayscale(
      makeCtx({
        ...createDefaultWallLayerTune(),
        useAdaptive: false,
        thresholdMode: 'fixed',
        preBinarizeEnabled: true,
        preBinarizeThreshold: 150,
      }),
      makeGrayMat(),
    )
    expect(binarizeMat).toHaveBeenCalledTimes(1)
    expect(binarizeMat.mock.calls[0]?.[2]).toMatchObject({
      thresholdMode: 'fixed',
      useAdaptive: false,
      threshold: 150,
    })
    result.mat.delete()
  })

  it('draait adaptive wanneer useAdaptive true', () => {
    const result = runPreprocessLayerFromGrayscale(
      makeCtx({
        ...createDefaultWallLayerTune(),
        useAdaptive: true,
        thresholdMode: 'adaptive',
        preBinarizeEnabled: true,
        adaptiveBlockSize: 21,
      }),
      makeGrayMat(),
    )
    expect(binarizeMat).toHaveBeenCalledTimes(2)
    expect(binarizeMat.mock.calls[1]?.[2]).toMatchObject({
      thresholdMode: 'adaptive',
      useAdaptive: true,
      adaptiveBlockSize: 21,
    })
    result.mat.delete()
  })

  it('valt terug op vaste drempel als beide passes uit staan', () => {
    const result = runPreprocessLayerFromGrayscale(
      makeCtx({
        ...createDefaultWallLayerTune(),
        useAdaptive: false,
        thresholdMode: 'fixed',
        preBinarizeEnabled: false,
        preBinarizeThreshold: 180,
      }),
      makeGrayMat(),
    )
    expect(binarizeMat).toHaveBeenCalledTimes(1)
    expect(binarizeMat.mock.calls[0]?.[2]).toMatchObject({
      thresholdMode: 'fixed',
      useAdaptive: false,
      threshold: 180,
    })
    result.mat.delete()
  })
})
