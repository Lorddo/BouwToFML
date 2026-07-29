import { describe, expect, it } from 'vitest'
import {
  syncDoorBridgeWallOverrides,
  syncDoorframeFaceOverrides,
  syncWindowFaceOverrides,
} from '@/cv/walls/rooms/face-override-sync'

function emptyCache() {
  return {
    faceOverrides: new Map<
      number,
      'door' | 'window' | 'doorframe' | 'wall' | 'unknown' | 'surface' | 'outside'
    >(),
    pinnedRoots: new Set<number>(),
  }
}

describe('face-override-sync sticky doorframe', () => {
  it('houdt doorframe-pin bij her-sync zonder face in faceIds', () => {
    const cache = emptyCache()
    syncDoorframeFaceOverrides(cache, [27, 28], undefined, [27, 28])
    expect(cache.faceOverrides.get(27)).toBe('doorframe')
    expect(cache.pinnedRoots.has(27)).toBe(true)

    const result = syncDoorframeFaceOverrides(cache, [], undefined, [27, 28])
    expect(result.removed).toBe(0)
    expect(cache.faceOverrides.get(27)).toBe('doorframe')
    expect(cache.faceOverrides.get(28)).toBe('doorframe')
  })

  it('window-sync claimt geen gepinde doorframe-face', () => {
    const cache = emptyCache()
    syncDoorframeFaceOverrides(cache, [27], undefined, [27])
    const result = syncWindowFaceOverrides(cache, [27, 99], undefined, [])
    expect(cache.faceOverrides.get(27)).toBe('doorframe')
    expect(cache.faceOverrides.get(99)).toBe('window')
    expect(result.applied).toBe(1)
  })

  it('bridge-sync verwijdert geen doorframe, wel stale wall-seed', () => {
    const cache = emptyCache()
    cache.faceOverrides.set(10, 'doorframe')
    cache.pinnedRoots.add(10)
    cache.faceOverrides.set(11, 'wall')
    cache.pinnedRoots.add(11)

    syncDoorBridgeWallOverrides(cache, [12], undefined, [10, 11])
    expect(cache.faceOverrides.get(10)).toBe('doorframe')
    expect(cache.faceOverrides.has(11)).toBe(false)
    expect(cache.faceOverrides.get(12)).toBe('doorframe')
  })
})
