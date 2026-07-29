import { describe, expect, it } from 'vitest'
import {
  buildMergedWallFaceMaskData,
  buildWallFaceMaskData,
} from '@/cv/walls/rooms/room-wall-face-mask'

describe('buildMergedWallFaceMaskData', () => {
  it('unioneert alleen wall-classified roots', () => {
    const width = 5
    const height = 3
    const labelsData = new Int32Array([
      0, 1, 1, 0, 0,
      2, 2, 3, 3, 0,
      0, 0, 0, 0, 0,
    ])
    const parentMap = new Map<number, number>([
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    const classificationByLabel = new Map<number, 'wall' | 'surface'>([
      [1, 'wall'],
      [2, 'surface'],
      [3, 'wall'],
    ])

    const merged = buildMergedWallFaceMaskData({
      labelsData,
      parentMap,
      classificationByLabel,
      width,
      height,
    })

    expect(merged[1]).toBe(255)
    expect(merged[2]).toBe(255)
    expect(merged[5]).toBe(0)
    expect(merged[6]).toBe(0)
    expect(merged[7]).toBe(255)
    expect(merged[8]).toBe(255)
  })

  it('komt overeen met per-root union', () => {
    const width = 4
    const height = 2
    const labelsData = new Int32Array([1, 1, 2, 2, 1, 0, 2, 2])
    const parentMap = new Map<number, number>([[1, 1], [2, 2]])
    const classificationByLabel = new Map<number, 'wall' | 'surface'>([
      [1, 'wall'],
      [2, 'wall'],
    ])

    const merged = buildMergedWallFaceMaskData({
      labelsData,
      parentMap,
      classificationByLabel,
      width,
      height,
    })
    const root1 = buildWallFaceMaskData(labelsData, parentMap, 1, width, height)
    const root2 = buildWallFaceMaskData(labelsData, parentMap, 2, width, height)

    for (let idx = 0; idx < merged.length; idx += 1) {
      const expected = root1[idx] === 255 || root2[idx] === 255 ? 255 : 0
      expect(merged[idx]).toBe(expected)
    }
  })

  it('resolved arcering-band geeft doorlopend muurmasker', () => {
    const width = 11
    const height = 5
    const labelsData = new Int32Array(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x >= 1 && x <= 4 && y >= 1 && y <= 3) labelsData[y * width + x] = 1
        else if (x >= 6 && x <= 9 && y >= 1 && y <= 3) labelsData[y * width + x] = 2
        else if (x === 5 && y >= 1 && y <= 3) labelsData[y * width + x] = 3
      }
    }
    const parentMap = new Map<number, number>([
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    const classificationByLabel = new Map<number, 'wall' | 'surface'>([
      [1, 'surface'],
      [2, 'surface'],
      [3, 'wall'],
    ])

    const merged = buildMergedWallFaceMaskData({
      labelsData,
      parentMap,
      classificationByLabel,
      width,
      height,
    })

    for (let y = 1; y <= 3; y += 1) {
      expect(merged[5 + y * width]).toBe(255)
    }
    expect(merged[1 + width]).toBe(0)
    expect(merged[6 + width]).toBe(0)
  })
})
