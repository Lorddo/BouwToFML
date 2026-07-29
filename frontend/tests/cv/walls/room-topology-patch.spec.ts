import { describe, expect, it } from 'vitest'
import { patchTopologyLabelsInDiffRegion } from '@/cv/walls/rooms/room-topology-patch'

describe('patchTopologyLabelsInDiffRegion', () => {
  it('laat labels buiten patch ongemoeid', () => {
    const width = 5
    const height = 3
    const rawLabelsData = new Int32Array([1, 1, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0, 2, 2])
    const newWallBwData = Uint8Array.from([
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    ])

    const before = new Int32Array(rawLabelsData)
    const patched = patchTopologyLabelsInDiffRegion({
      rawLabelsData,
      newWallBwData,
      width,
      height,
      bounds: { x0: 1, y0: 0, x1: 3, y1: 2 },
    })

    expect(patched.rewrittenPx).toBeGreaterThan(0)
    expect(patched.rawLabelsData[0]).toBe(before[0])
    expect(patched.rawLabelsData[width * height - 1]).toBe(before[width * height - 1])
  })

  it('wijzigt alleen labels in patch zonder classificatie-maps', () => {
    const width = 3
    const height = 1
    const rawLabelsData = new Int32Array([1, 0, 2])
    const newWallBwData = Uint8Array.from([255, 255, 255])

    const patched = patchTopologyLabelsInDiffRegion({
      rawLabelsData,
      newWallBwData,
      width,
      height,
      bounds: { x0: 0, y0: 0, x1: 2, y1: 0 },
    })

    const middleLabel = patched.rawLabelsData[1]
    expect(middleLabel).toBeGreaterThan(0)
    expect(patched.createdLabels).toBeGreaterThanOrEqual(0)
  })
})
