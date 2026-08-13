import { describe, expect, it } from 'vitest'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import {
  createDefaultWallLayerTune,
  copyLayerTuneBetween,
  isColorThresholdEnabled,
  layerTuneFingerprintParts,
  mirrorWallTuneToRoot,
  normalizeStoredPreprocess,
  resetLayerTuneToFactory,
  resolveLayerPreprocess,
  underlayPreviewFingerprint,
} from '@/cv/preprocess/layer-preprocess'

describe('resolveLayerPreprocess', () => {
  it('OCR-resolve deelt muur-layer (negeert ocrLayer-tune)', () => {
    const base = {
      ...DEFAULT_PREPROCESS,
      wallLayer: {
        ...createDefaultWallLayerTune(),
        thresholdMode: 'adaptive' as const,
        useAdaptive: true,
        colorThresholdEnabled: true,
        brightness: 42,
        thickenLinesEnabled: true,
        thickenLinesPx: 1,
      },
      ocrLayer: {
        ...createDefaultWallLayerTune(),
        colorThresholdEnabled: false,
        thresholdEnabled: false,
        useAdaptive: false,
        thresholdMode: 'fixed' as const,
        brightness: 99,
      },
    }
    const walls = resolveLayerPreprocess(base, 'walls')
    const ocr = resolveLayerPreprocess(base, 'ocr')
    expect(isColorThresholdEnabled(walls)).toBe(true)
    expect(walls.thresholdMode).toBe('adaptive')
    expect(walls.brightness).toBe(42)
    expect(isColorThresholdEnabled(ocr)).toBe(true)
    expect(ocr.useAdaptive).toBe(true)
    expect(ocr.thresholdMode).toBe('adaptive')
    expect(ocr.brightness).toBe(42)
    expect(ocr.thickenLinesEnabled).toBe(true)
  })

  it('houdt muren B/W aan met standaard wall-layer', () => {
    const base = {
      ...DEFAULT_PREPROCESS,
      wallLayer: createDefaultWallLayerTune(),
      ocrLayer: createDefaultWallLayerTune(),
    }
    const walls = resolveLayerPreprocess(base, 'walls')

    expect(isColorThresholdEnabled(walls)).toBe(true)
  })

  it('muur-defaults: pre-B/W 150, adaptive, thicken uit, despeckle uit', () => {
    const wall = createDefaultWallLayerTune()
    expect(wall.thresholdMode).toBe('adaptive')
    expect(wall.useAdaptive).toBe(true)
    expect(wall.brightness).toBe(50)
    expect(wall.contrast).toBe(1)
    expect(wall.preBinarizeEnabled).toBe(true)
    expect(wall.preBinarizeThreshold).toBe(150)
    expect(wall.removeSpecklesEnabled).toBe(false)
    expect(wall.thickenLinesEnabled).toBe(false)
    expect(wall.thickenLinesPx).toBe(1)
    expect(wall.bridgeGapsEnabled).toBe(false)
    expect(DEFAULT_PREPROCESS.removeSpecklesEnabled).toBe(false)
    expect(DEFAULT_PREPROCESS.thickenLinesEnabled).toBe(false)
    expect(DEFAULT_PREPROCESS.preBinarizeEnabled).toBe(true)
  })

  it('ocrEnabled default false in DEFAULT_PREPROCESS en normalize', () => {
    expect(DEFAULT_PREPROCESS.ocrEnabled).toBe(false)
    expect(normalizeStoredPreprocess({}).ocrEnabled).toBe(false)
    expect(normalizeStoredPreprocess({ ocrEnabled: true }).ocrEnabled).toBe(true)
  })

  it('muur B/W uit → OCR-resolve volgt muren', () => {
    const base = {
      ...DEFAULT_PREPROCESS,
      wallLayer: {
        ...createDefaultWallLayerTune(),
        colorThresholdEnabled: false,
        thresholdEnabled: false,
        useAdaptive: false,
      },
      ocrLayer: createDefaultWallLayerTune(),
    }
    const walls = resolveLayerPreprocess(base, 'walls')
    const ocr = resolveLayerPreprocess(base, 'ocr')

    expect(isColorThresholdEnabled(walls)).toBe(false)
    expect(isColorThresholdEnabled(ocr)).toBe(false)
  })

  it('kopieert layer-tune van OCR-storage naar muren zonder bron te wijzigen', () => {
    const base = {
      ...DEFAULT_PREPROCESS,
      wallLayer: {
        ...createDefaultWallLayerTune(),
        colorThresholdEnabled: true,
        thresholdMode: 'adaptive' as const,
        useAdaptive: true,
        brightness: 40,
      },
      ocrLayer: {
        ...createDefaultWallLayerTune(),
        colorThresholdEnabled: false,
        thresholdEnabled: false,
        useAdaptive: false,
        thresholdMode: 'fixed' as const,
        brightness: 70,
        bridgeGapsEnabled: true,
        bridgeGaps: 3,
      },
    }
    const copied = copyLayerTuneBetween(base, 'ocr', 'walls')
    const walls = resolveLayerPreprocess(copied, 'walls')
    const ocrResolved = resolveLayerPreprocess(copied, 'ocr')
    const wallsBefore = resolveLayerPreprocess(base, 'walls')

    expect(isColorThresholdEnabled(walls)).toBe(false)
    expect(walls.brightness).toBe(70)
    expect(walls.bridgeGapsEnabled).toBe(true)
    expect(walls.bridgeGaps).toBe(3)
    // Na kopie deelt OCR-resolve de nieuwe muur-tune
    expect(ocrResolved.brightness).toBe(70)
    expect(wallsBefore.brightness).toBe(40)
  })

  it('negeert legacy root bij expliciete wallLayer (OCR-kopie)', () => {
    const base = {
      ...DEFAULT_PREPROCESS,
      brightness: 40,
      colorThresholdEnabled: true,
      thresholdEnabled: true,
      useAdaptive: true,
      thresholdMode: 'adaptive' as const,
      wallLayer: {
        ...createDefaultWallLayerTune(),
        brightness: 40,
        colorThresholdEnabled: true,
        thresholdEnabled: true,
        useAdaptive: true,
        thresholdMode: 'adaptive' as const,
      },
      ocrLayer: {
        ...createDefaultWallLayerTune(),
        colorThresholdEnabled: false,
        thresholdEnabled: false,
        useAdaptive: false,
        thresholdMode: 'fixed' as const,
        brightness: 70,
      },
    }
    const copied = copyLayerTuneBetween(base, 'ocr', 'walls')
    const walls = resolveLayerPreprocess(copied, 'walls')

    expect(copied.brightness).toBe(70)
    expect(isColorThresholdEnabled(walls)).toBe(false)
    expect(walls.brightness).toBe(70)
    expect(walls.useAdaptive).toBe(false)
  })

  it('fingerprint serialiseert ocrLayer maar parts.wall volgt wallLayer', () => {
    const base = {
      ...DEFAULT_PREPROCESS,
      wallLayer: {
        ...createDefaultWallLayerTune(),
        brightness: 41,
      },
      ocrLayer: {
        ...createDefaultWallLayerTune(),
        brightness: 99,
      },
    }
    const fp = underlayPreviewFingerprint(base)
    const parts = layerTuneFingerprintParts(fp)
    expect(JSON.parse(fp)).toMatchObject({
      wallLayer: expect.objectContaining({ brightness: 41 }),
      ocrLayer: expect.objectContaining({ brightness: 99 }),
    })
    expect(JSON.parse(parts.wall)).toMatchObject({ brightness: 41 })
    expect(JSON.parse(parts.ocr)).toMatchObject({ brightness: 99 })

    const wallOnlyChange = underlayPreviewFingerprint({
      ...base,
      wallLayer: { ...base.wallLayer, brightness: 42 },
    })
    expect(layerTuneFingerprintParts(wallOnlyChange).wall).not.toBe(parts.wall)
    expect(layerTuneFingerprintParts(wallOnlyChange).ocr).toBe(parts.ocr)

    const ocrOnlyChange = underlayPreviewFingerprint({
      ...base,
      ocrLayer: { ...base.ocrLayer, brightness: 11 },
    })
    expect(layerTuneFingerprintParts(ocrOnlyChange).wall).toBe(parts.wall)
    expect(layerTuneFingerprintParts(ocrOnlyChange).ocr).not.toBe(parts.ocr)
  })

  it('mirrorWallTuneToRoot schrijft wallLayer naar legacy root', () => {
    const tune = {
      ...createDefaultWallLayerTune(),
      brightness: 88,
      colorThresholdEnabled: false,
      thresholdEnabled: false,
    }
    const mirrored = mirrorWallTuneToRoot(DEFAULT_PREPROCESS, tune)
    expect(mirrored.brightness).toBe(88)
    expect(mirrored.colorThresholdEnabled).toBe(false)
    expect(normalizeStoredPreprocess(mirrored).wallLayer?.brightness).toBe(88)
  })

  it('behoudt edgeAware + boost via resolveLayerPreprocess', () => {
    const base = {
      ...DEFAULT_PREPROCESS,
      wallLayer: {
        ...createDefaultWallLayerTune(),
        thresholdMode: 'edgeAware' as const,
        useAdaptive: false,
        edgeAwareEdgeBoost: 7,
        threshold: 140,
      },
    }
    const walls = resolveLayerPreprocess(base, 'walls')
    expect(walls.thresholdMode).toBe('edgeAware')
    expect(walls.useAdaptive).toBe(false)
    expect(walls.edgeAwareEdgeBoost).toBe(7)
    expect(walls.threshold).toBe(140)

    const mirrored = mirrorWallTuneToRoot(base, base.wallLayer)
    expect(mirrored.thresholdMode).toBe('edgeAware')
    expect(mirrored.edgeAwareEdgeBoost).toBe(7)
    expect(normalizeStoredPreprocess(mirrored).wallLayer?.thresholdMode).toBe('edgeAware')
    expect(normalizeStoredPreprocess(mirrored).edgeAwareEdgeBoost).toBe(7)
  })

  it('resetLayerTuneToFactory zet muur-tune terug en laat OCR/gaps staan', () => {
    const base = {
      ...DEFAULT_PREPROCESS,
      ocrEnabled: true,
      wallLayer: {
        ...createDefaultWallLayerTune(),
        brightness: 12,
        preBinarizeThreshold: 200,
        thickenLinesEnabled: true,
        thickenLinesPx: 4,
      },
      gapsLayer: {
        ...createDefaultWallLayerTune(),
        brightness: 77,
      },
    }
    const reset = resetLayerTuneToFactory(base, 'walls')
    expect(reset.ocrEnabled).toBe(true)
    expect(reset.wallLayer?.brightness).toBe(50)
    expect(reset.wallLayer?.preBinarizeThreshold).toBe(150)
    expect(reset.wallLayer?.thickenLinesEnabled).toBe(false)
    expect(reset.brightness).toBe(50)
    expect(reset.gapsLayer?.brightness).toBe(77)
  })

  it('resetLayerTuneToFactory op gaps raakt wallLayer niet', () => {
    const base = {
      ...DEFAULT_PREPROCESS,
      wallLayer: {
        ...createDefaultWallLayerTune(),
        brightness: 12,
      },
      gapsLayer: {
        ...createDefaultWallLayerTune(),
        brightness: 77,
        bridgeGapsEnabled: true,
      },
    }
    const reset = resetLayerTuneToFactory(base, 'gaps')
    expect(reset.wallLayer?.brightness).toBe(12)
    expect(reset.gapsLayer?.brightness).toBe(50)
    expect(reset.gapsLayer?.bridgeGapsEnabled).toBe(false)
  })
})
