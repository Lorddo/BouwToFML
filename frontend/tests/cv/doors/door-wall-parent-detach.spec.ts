import { describe, expect, it } from 'vitest'
import { claimFacesFromParentMap } from '@/cv/walls/rooms/face-parent-claim'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'

describe('claimFacesFromParentMap (deur-faces)', () => {
  it('koppelt 2D_3E-stijl enclosed deur-faces los (198→14, 199→14)', () => {
    const parentMap = new Map<number, number>([
      [198, 14],
      [199, 14],
      [195, 14],
    ])
    const result = claimFacesFromParentMap({
      parentMap,
      faceIds: [198, 199],
    })
    expect(result.detachedFaceIds.sort((a, b) => a - b)).toEqual([198, 199])
    expect(result.parentMap.has(198)).toBe(false)
    expect(result.parentMap.has(199)).toBe(false)
    expect(result.parentMap.get(195)).toBe(14)
    expect(resolveMergedLabel(198, result.parentMap)).toBe(198)
    expect(resolveMergedLabel(199, result.parentMap)).toBe(199)
    expect(resolveMergedLabel(195, result.parentMap)).toBe(14)
  })

  it('no-op wanneer face al root is', () => {
    const parentMap = new Map<number, number>([[50, 10]])
    const result = claimFacesFromParentMap({
      parentMap,
      faceIds: [94, 203],
    })
    expect(result.detachedFaceIds).toEqual([])
    expect(result.parentMap.get(50)).toBe(10)
  })
})
