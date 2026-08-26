import { describe, expect, it } from 'vitest'
import { WALL_BW_INK, WALL_BW_WHITE } from '@/cv/preprocess/compose-wall-bw'
import { applyStampWallFacePrior } from '@/cv/walls/rooms/stamp-wall-face-prior'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'

describe('applyStampWallFacePrior', () => {
  const width = 10
  const height = 4
  const len = width * height

  function labelsForTwoFaces(): Int32Array {
    // Face 1 = left half, face 2 = right half
    const labels = new Int32Array(len)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        labels[y * width + x] = x < 5 ? 1 : 2
      }
    }
    return labels
  }

  it('pin’t face met hoge stamp-overlap als wall; kamer blijft surface', () => {
    const labelsData = labelsForTwoFaces()
    const stampMask = new Uint8Array(len)
    stampMask.fill(WALL_BW_WHITE)
    // Face 1 volledig onder stamp
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        stampMask[y * width + x] = WALL_BW_INK
      }
    }
    const classificationByLabel = new Map<number, RoomRasterClass>([
      [1, 'surface'],
      [2, 'surface'],
    ])
    const parentMap = new Map<number, number>()
    const faceOverrides = new Map<number, RoomRasterClass>()
    const pinnedRoots = new Set<number>()

    const result = applyStampWallFacePrior({
      labelsData,
      parentMap,
      classificationByLabel,
      stampMask,
      groupBy: 'component',
      faceOverrides,
      pinnedRoots,
    })

    expect(result.classificationByLabel.get(1)).toBe('wall')
    expect(result.classificationByLabel.get(2)).toBe('surface')
    expect(result.stampedLabels).toEqual([1])
    expect(faceOverrides.get(1)).toBe('wall')
    expect(pinnedRoots.has(1)).toBe(true)
    expect(pinnedRoots.has(2)).toBe(false)
  })

  it('overschrijft alleen overlap; bestaande Otsu-wall elders blijft', () => {
    const labelsData = labelsForTwoFaces()
    const stampMask = new Uint8Array(len)
    stampMask.fill(WALL_BW_WHITE)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        stampMask[y * width + x] = WALL_BW_INK
      }
    }
    const classificationByLabel = new Map<number, RoomRasterClass>([
      [1, 'surface'],
      [2, 'wall'],
    ])

    const result = applyStampWallFacePrior({
      labelsData,
      parentMap: new Map(),
      classificationByLabel,
      stampMask,
      groupBy: 'component',
    })

    expect(result.classificationByLabel.get(1)).toBe('wall')
    expect(result.classificationByLabel.get(2)).toBe('wall')
  })

  it('lage overlap (<50%) pin’t niet', () => {
    const labelsData = labelsForTwoFaces()
    const stampMask = new Uint8Array(len)
    stampMask.fill(WALL_BW_WHITE)
    // 1 van 20 pixels in face 1
    stampMask[0] = WALL_BW_INK
    const classificationByLabel = new Map<number, RoomRasterClass>([[1, 'surface']])

    const result = applyStampWallFacePrior({
      labelsData,
      parentMap: new Map(),
      classificationByLabel,
      stampMask,
      groupBy: 'component',
    })

    expect(result.classificationByLabel.get(1)).toBe('surface')
    expect(result.stampedLabels).toEqual([])
  })
})
