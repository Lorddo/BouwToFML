import { describe, expect, it } from 'vitest'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import {
  applyDetectionPreset,
  defaultRoomInkThresholdForProfile,
  detectionPresetForProfile,
  loadStoredProfileId,
} from '@/platform/profile'

const mockStorage = (() => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  configurable: true,
})

describe('drawing-profiles', () => {
  it('heeft solid/open presets met wallStyle', () => {
    expect(detectionPresetForProfile('solid').wallStyle).toBe('solid')
    expect(detectionPresetForProfile('open').wallStyle).toBe('open')
  })

  it('heeft profiel-defaults voor muur-drempel inkt-dekking', () => {
    expect(defaultRoomInkThresholdForProfile('open')).toBe(0.6)
    expect(defaultRoomInkThresholdForProfile('solid')).toBe(0.8)
    expect(detectionPresetForProfile('open').roomInkCoverageThreshold).toBe(0.6)
    expect(detectionPresetForProfile('solid').roomInkCoverageThreshold).toBe(0.8)
  })

  it('mapt oude opgeslagen profiel-ids naar nieuwe ids', () => {
    localStorage.setItem('bouwToFml.drawingProfileId', 'simpel')
    expect(loadStoredProfileId()).toBe('solid')
    localStorage.setItem('bouwToFml.drawingProfileId', 'standaard')
    expect(loadStoredProfileId()).toBe('open')
  })

  it('applyDetectionPreset zet wallStyle zonder OCR te overschrijven', () => {
    const base = {
      ...DEFAULT_PREPROCESS,
      ocrEnabled: false,
      ocrMinConfidence: 61,
    }
    const { preprocess } = applyDetectionPreset(base, 'open')
    expect(preprocess.wallStyle).toBe('open')
    expect(preprocess.ocrEnabled).toBe(false)
    expect(preprocess.ocrMinConfidence).toBe(61)
  })
})
