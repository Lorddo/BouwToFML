import { describe, expect, it } from 'vitest'
import {
  claimFacesFromParentMap,
  claimWallishAfterInherit,
  collectWallishParentMapChildren,
  isClaimIdentityClass,
} from '@/cv/walls/rooms/face-parent-claim'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'

describe('claimFacesFromParentMap', () => {
  it('koppelt enclosed children los (198→14, 199→14)', () => {
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

  it('forceClass overschrijft bestaande wall-erfenis', () => {
    const parentMap = new Map<number, number>([[198, 14]])
    const classificationByLabel = new Map<number, 'wall' | 'door'>([
      [14, 'wall'],
      [198, 'wall'],
    ])
    const result = claimFacesFromParentMap({
      parentMap,
      faceIds: [198],
      classificationByLabel,
      class: 'door',
      forceClass: true,
    })
    expect(result.detachedFaceIds).toEqual([198])
    expect(result.classificationByLabel?.get(198)).toBe('door')
    expect(result.classChangedIds).toEqual([198])
  })

  it('zonder forceClass laat bestaande class staan', () => {
    const result = claimFacesFromParentMap({
      parentMap: new Map([[198, 14]]),
      faceIds: [198],
      classificationByLabel: new Map([[198, 'wall']]),
      class: 'door',
      forceClass: false,
    })
    expect(result.classificationByLabel?.get(198)).toBe('wall')
    expect(result.classChangedIds).toEqual([])
  })

  it('maakt geen nieuwe parent-hiërarchie — alleen individuele roots', () => {
    const result = claimFacesFromParentMap({
      parentMap: new Map([
        [198, 14],
        [199, 14],
      ]),
      faceIds: [198, 199],
    })
    expect(result.parentMap.size).toBe(0)
    expect(resolveMergedLabel(198, result.parentMap)).toBe(198)
    expect(resolveMergedLabel(14, result.parentMap)).toBe(14)
  })
})

describe('collectWallishParentMapChildren', () => {
  it('verzamelt children met wallish class via root of directe key', () => {
    const parentMap = new Map<number, number>([
      [198, 14],
      [50, 20],
    ])
    const classByLabel = new Map([
      [14, 'wall' as const],
      [50, 'surface' as const],
      [20, 'surface' as const],
    ])
    expect(collectWallishParentMapChildren(parentMap, classByLabel).sort()).toEqual([198])
  })
})

describe('isClaimIdentityClass', () => {
  it('herkent wall/door/window/doorframe', () => {
    expect(isClaimIdentityClass('wall')).toBe(true)
    expect(isClaimIdentityClass('door')).toBe(true)
    expect(isClaimIdentityClass('window')).toBe(true)
    expect(isClaimIdentityClass('doorframe')).toBe(true)
    expect(isClaimIdentityClass('surface')).toBe(false)
    expect(isClaimIdentityClass('unknown')).toBe(false)
  })
})

describe('claimWallishAfterInherit', () => {
  it('wallish inherited children worden losgekoppeld; class blijft in overrides', () => {
    // Zelfde volgorde als runRoomTopologyRefinePass na inheritance.
    const parentMap = new Map<number, number>([[2, 1]])
    const classificationByLabel = new Map([[1, 'wall' as const]])
    const faceOverrides = new Map([[1, 'wall' as const]])

    const result = claimWallishAfterInherit({
      classificationByLabel,
      parentMap,
      faceOverrides,
    })

    expect(result.inheritanceOverrides.get(2)).toBe('wall')
    expect(result.detachedFaceIds).toEqual([2])
    expect(result.parentMap.has(2)).toBe(false)
    expect(resolveMergedLabel(2, result.parentMap)).toBe(2)
    // Geen nieuwe hiërarchie; class blijft op override-map.
    expect(result.inheritanceOverrides.get(2)).toBe('wall')
    expect(result.classificationByLabel.get(2)).toBe('wall')
  })

  it('room-first pad: lege overrides materialiseert class + claim', () => {
    const parentMap = new Map<number, number>([[2, 1]])
    const classificationByLabel = new Map([[1, 'wall' as const]])

    const result = claimWallishAfterInherit({
      classificationByLabel,
      parentMap,
      faceOverrides: new Map(),
    })

    expect(result.classificationByLabel.get(2)).toBe('wall')
    expect(result.detachedFaceIds).toEqual([2])
    expect(result.parentMap.has(2)).toBe(false)
  })
})
