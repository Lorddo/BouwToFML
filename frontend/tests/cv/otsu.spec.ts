import { describe, expect, it } from 'vitest'
import { otsuThresholdFromGray, otsuThresholdFromHistogram } from '@/cv/port/otsu'

describe('otsu', () => {
  it('vindt een drempel tussen twee pieken', () => {
    const hist = new Uint32Array(256)
    for (let i = 0; i < 80; i += 1) hist[40] += 1
    for (let i = 0; i < 80; i += 1) hist[200] += 1
    const t = otsuThresholdFromHistogram(hist, 160)
    expect(t).toBeGreaterThanOrEqual(40)
    expect(t).toBeLessThanOrEqual(200)
  })

  it('werkt ook direct op grijswaarden-array', () => {
    const data = new Uint8Array([
      ...Array.from({ length: 60 }, () => 30),
      ...Array.from({ length: 60 }, () => 210),
    ])
    const t = otsuThresholdFromGray(data)
    expect(t).toBeGreaterThanOrEqual(30)
    expect(t).toBeLessThan(210)
  })
})
