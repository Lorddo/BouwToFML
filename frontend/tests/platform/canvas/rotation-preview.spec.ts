import { describe, expect, it } from 'vitest'
import {
  axisAlignedBoundsForRotation,
  layerPointToImagePoint,
  totalInputRotationDeg,
} from '@/platform/canvas/rotationPreview'

describe('rotationPreview', () => {
  it('sums manual, auto and 180° checkbox', () => {
    expect(
      totalInputRotationDeg({
        rotationDeg: 10,
        autoRotationDeg: 2,
        rotate180: true,
      }),
    ).toBe(192)
  })

  it('expands bounds for diagonal rotation', () => {
    const bounds = axisAlignedBoundsForRotation(1000, 500, 45)
    expect(bounds.width).toBeGreaterThan(1000)
    expect(bounds.height).toBeGreaterThan(500)
  })

  it('roundtrips layer ↔ image coordinates for center rotation', () => {
    const image = { x: 200, y: 100 }
    const w = 400
    const h = 300
    const deg = 90
    const cx = w / 2
    const cy = h / 2
    const rad = (deg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const dx = image.x - cx
    const dy = image.y - cy
    const layer = {
      x: cos * dx - sin * dy + cx,
      y: sin * dx + cos * dy + cy,
    }
    const back = layerPointToImagePoint(layer, w, h, deg)
    expect(back.x).toBeCloseTo(image.x, 5)
    expect(back.y).toBeCloseTo(image.y, 5)
  })
})
