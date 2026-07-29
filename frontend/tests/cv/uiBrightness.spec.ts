import { describe, expect, it } from 'vitest'
import {
  UI_BRIGHTNESS_MAX,
  UI_BRIGHTNESS_MIN,
  UI_BRIGHTNESS_NEUTRAL,
  uiBrightnessToOpenCv,
} from '@/cv/port/preprocess'

describe('uiBrightnessToOpenCv', () => {
  it('maakt UI-midden neutraal voor OpenCV', () => {
    expect(UI_BRIGHTNESS_NEUTRAL).toBe(50)
    expect(UI_BRIGHTNESS_MIN).toBe(-150)
    expect(UI_BRIGHTNESS_MAX).toBe(250)
    expect(uiBrightnessToOpenCv(50)).toBe(0)
    expect(uiBrightnessToOpenCv(UI_BRIGHTNESS_MIN)).toBe(-200)
    expect(uiBrightnessToOpenCv(UI_BRIGHTNESS_MAX)).toBe(200)
  })
})
