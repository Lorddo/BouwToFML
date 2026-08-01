import { describe, expect, it } from 'vitest'
import {
  applyFaceClassificationOverrides,
  cycleFaceClassification,
  refineWallClassificationByKeptMask,
} from '@/cv/walls/rooms/room-ink-classify'
import {
  claimFacesInRoomRasterCache,
  classificationAtLabel,
  createRoomRasterCache,
  effectiveClassification,
  ensureFaceDualSpace,
  findFaceLabelsFullyInBBox,
  setFacesFullyInBBox,
  syncDoorBridgeWallOverrides,
  syncDoorSwingFaceOverrides,
  syncDoorframeFaceOverrides,
  syncWindowFaceOverrides,
  toggleFaceAtLabel,
  toggleFaceAtLabelDetailed,
} from '@/cv/walls/rooms/room-raster-cache'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'

function minimalState(
  overrides?: Partial<SerializedRoomClassifyState>,
): SerializedRoomClassifyState {
  const rawLabelsData = new Int32Array([0, 1, 1, 0, 2, 2])
  const labelsData = new Int32Array([1, 1, 1, 2, 2, 2])
  return {
    width: 3,
    height: 2,
    rawLabelsData,
    labelsData,
    parentMap: [],
    classificationByLabel: [
      [1, 'wall'],
      [2, 'surface'],
    ],
    threshold: 0.8,
    mergedFaceCount: 2,
    ...overrides,
  }
}

describe('cycleFaceClassification', () => {
  it('wisselt wall ↔ unknown; surface → wall', () => {
    expect(cycleFaceClassification('wall')).toBe('unknown')
    expect(cycleFaceClassification('unknown')).toBe('wall')
    expect(cycleFaceClassification('surface')).toBe('wall')
  })

  it('laat outside ongemoeid', () => {
    expect(cycleFaceClassification('outside')).toBe('outside')
  })

  it('zet deur naar unknown; window/doorframe naar wall', () => {
    expect(cycleFaceClassification('door')).toBe('unknown')
    expect(cycleFaceClassification('window')).toBe('wall')
    expect(cycleFaceClassification('doorframe')).toBe('wall')
  })
})

describe('applyFaceClassificationOverrides', () => {
  it('past overrides toe op classificatie', () => {
    const base = new Map<number, 'wall' | 'surface'>([
      [1, 'wall'],
      [2, 'surface'],
    ])
    const result = applyFaceClassificationOverrides(base, new Map([[1, 'unknown']]))
    expect(result.get(1)).toBe('unknown')
    expect(result.get(2)).toBe('surface')
  })
})

describe('refineWallClassificationByKeptMask pinnedRoots', () => {
  it('demoteert pinned wall roots niet', () => {
    const labelsData = new Int32Array([1, 1, 1, 1])
    const keptWallMask = new Uint8Array([0, 0, 0, 0])
    const classification = new Map<number, 'wall'>([[1, 'wall']])
    const result = refineWallClassificationByKeptMask({
      labelsData,
      parentMap: new Map(),
      classificationByLabel: classification,
      keptWallMask,
      pinnedRoots: new Set([1]),
    })
    expect(result.classificationByLabel.get(1)).toBe('wall')
    expect(result.demotedWallRootCount).toBe(0)
  })
})

describe('room-raster-cache', () => {
  it('laadt faceOverrides en pinnedRoots uit opgeslagen state', () => {
    const cache = createRoomRasterCache(
      minimalState({
        faceOverrides: [[2, 'unknown']],
        pinnedRoots: [2],
      }),
    )
    expect(cache.faceOverrides.get(2)).toBe('unknown')
    expect(cache.pinnedRoots.has(2)).toBe(true)
    expect(classificationAtLabel(cache, 2)).toBe('unknown')
  })

  it('resolveert label op pixel in face', () => {
    const cache = createRoomRasterCache(minimalState())
    expect(classificationAtLabel(cache, 1)).toBe('wall')
    toggleFaceAtLabel(cache, 1)
    expect(classificationAtLabel(cache, 1)).toBe('unknown')
    expect(classificationAtLabel(cache, 2)).toBe('surface')
  })

  it('toggle op sibling label laat parent-component ongemoeid', () => {
    const cache = createRoomRasterCache(
      minimalState({
        parentMap: [[2, 1]],
        classificationByLabel: [
          [1, 'wall'],
          [2, 'wall'],
        ],
        labelsData: new Int32Array([1, 1, 2, 2]),
        classificationGroupBy: 'component',
      }),
    )
    toggleFaceAtLabel(cache, 2)
    expect(classificationAtLabel(cache, 1)).toBe('wall')
    expect(classificationAtLabel(cache, 2)).toBe('unknown')
  })

  it('toggle op outside root doet niets', () => {
    const cache = createRoomRasterCache(
      minimalState({
        classificationByLabel: [[3, 'outside']],
        rawLabelsData: new Int32Array([3, 3, 3]),
        labelsData: new Int32Array([3, 3, 3]),
      }),
    )
    expect(toggleFaceAtLabel(cache, 3)).toBeNull()
  })

  it('toggle wall herkent inkt opnieuw naar dichtstbijzijnde muur', () => {
    const rawLabelsData = new Int32Array([1, 0, 2, 1, 0, 2])
    const cache = createRoomRasterCache(
      minimalState({
        rawLabelsData,
        labelsData: new Int32Array(rawLabelsData),
        classificationByLabel: [
          [1, 'surface'],
          [2, 'surface'],
        ],
      }),
    )
    toggleFaceAtLabel(cache, 1, 16)
    expect(cache.state.labelsData[1]).toBe(1)
    expect(cache.state.labelsData[4]).toBe(1)
  })

  it('selecteert alleen vlakken volledig binnen bbox', () => {
    const cache = createRoomRasterCache(minimalState())
    expect(findFaceLabelsFullyInBBox(cache, { x: 0, y: 0, width: 3, height: 1 })).toEqual([1])
    expect(findFaceLabelsFullyInBBox(cache, { x: 0, y: 0, width: 3, height: 2 })).toEqual([1, 2])
    expect(findFaceLabelsFullyInBBox(cache, { x: 1, y: 0, width: 1, height: 1 })).toEqual([])
  })

  it('zet vlakken in bbox naar muur of onbekend', () => {
    const cache = createRoomRasterCache(minimalState())
    expect(setFacesFullyInBBox(cache, { x: 0, y: 0, width: 3, height: 2 }, 'unknown')).toBe(2)
    expect(classificationAtLabel(cache, 1)).toBe('unknown')
    expect(classificationAtLabel(cache, 2)).toBe('unknown')

    const cache2 = createRoomRasterCache(minimalState())
    // Label 1 is al wall → geen change; daarna unknown→wall telt wel.
    expect(setFacesFullyInBBox(cache2, { x: 0, y: 0, width: 3, height: 1 }, 'wall')).toBe(0)
    expect(classificationAtLabel(cache2, 1)).toBe('wall')
    expect(setFacesFullyInBBox(cache2, { x: 0, y: 0, width: 3, height: 1 }, 'unknown')).toBe(1)
    expect(setFacesFullyInBBox(cache2, { x: 0, y: 0, width: 3, height: 1 }, 'wall')).toBe(1)
    expect(classificationAtLabel(cache2, 1)).toBe('wall')
    expect(classificationAtLabel(cache2, 2)).toBe('surface')
  })

  it('toggle/box bouwen geen FaceDualSpace; faceBBox is gevuld', () => {
    const cache = createRoomRasterCache(minimalState())
    expect(cache.faceBBox).toBeTruthy()
    expect(cache.faceDual).toBeNull()

    toggleFaceAtLabel(cache, 1)
    expect(cache.faceDual).toBeNull()
    expect(cache.faceBBox?.inkByLabel.has(1)).toBe(true)

    const cache2 = createRoomRasterCache(minimalState())
    setFacesFullyInBBox(cache2, { x: 0, y: 0, width: 3, height: 2 }, 'unknown')
    expect(cache2.faceDual).toBeNull()
    expect(cache2.faceBBox).toBeTruthy()
  })

  it('root-aware dirtyBounds dekt child-component bij toggle op parent', () => {
    // 4×3: label1 links groot, label2 enclosed rechtsonder (child van 1 in parentMap)
    const width = 4
    const height = 3
    const raw = new Int32Array(width * height)
    const labels = new Int32Array(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < 2; x += 1) {
        raw[y * width + x] = 1
        labels[y * width + x] = 1
      }
    }
    raw[2 * width + 2] = 2
    raw[2 * width + 3] = 2
    labels[2 * width + 2] = 2
    labels[2 * width + 3] = 2
    const cache = createRoomRasterCache(
      minimalState({
        width,
        height,
        rawLabelsData: raw,
        labelsData: labels,
        parentMap: [[2, 1]],
        classificationByLabel: [
          [1, 'unknown'],
          [2, 'unknown'],
        ],
        classificationGroupBy: 'merged',
      }),
    )
    const result = toggleFaceAtLabelDetailed(cache, 1)
    expect(result?.next).toBe('wall')
    expect(result?.didInkReresolve).toBe(true)
    expect(result?.dirtyBounds).toBeTruthy()
    // Child bbox zit op y=2 — dirty moet die meenemen (root-unie / regionaal resolve).
    expect(result!.dirtyBounds!.y1).toBeGreaterThanOrEqual(2)
    expect(result!.dirtyBounds!.x1).toBeGreaterThanOrEqual(3)
  })
})

describe('syncDoorSwingFaceOverrides', () => {
  it('zet Stage-2 faces op door en pinnt ze (overschrijft wall)', () => {
    const cache = createRoomRasterCache(minimalState())
    expect(classificationAtLabel(cache, 1)).toBe('wall')

    const result = syncDoorSwingFaceOverrides(cache, [1])
    expect(result.changed).toBe(true)
    expect(result.applied).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('door')
    expect(cache.pinnedRoots.has(1)).toBe(true)
    expect(effectiveClassification(cache).get(1)).toBe('door')
  })

  it('verwijdert stale door-overrides en is idempotent', () => {
    const cache = createRoomRasterCache(minimalState())
    syncDoorSwingFaceOverrides(cache, [1, 2])
    expect(classificationAtLabel(cache, 1)).toBe('door')
    expect(classificationAtLabel(cache, 2)).toBe('door')

    const second = syncDoorSwingFaceOverrides(cache, [1])
    expect(second.changed).toBe(true)
    expect(second.removed).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('door')
    expect(classificationAtLabel(cache, 2)).toBe('surface')
    expect(cache.faceOverrides.has(2)).toBe(false)

    const third = syncDoorSwingFaceOverrides(cache, [1])
    expect(third.changed).toBe(false)
    expect(third.applied).toBe(0)
  })

  it('raakt niet-door overrides niet aan', () => {
    const cache = createRoomRasterCache(minimalState())
    cache.faceOverrides.set(2, 'unknown')
    cache.pinnedRoots.add(2)
    syncDoorSwingFaceOverrides(cache, [1])
    expect(classificationAtLabel(cache, 1)).toBe('door')
    expect(classificationAtLabel(cache, 2)).toBe('unknown')
  })

  it('bewaart handmatige deur-pins buiten previousAutoFaceIds', () => {
    const cache = createRoomRasterCache(minimalState())
    syncDoorSwingFaceOverrides(cache, [1])
    cache.faceOverrides.set(2, 'door')
    cache.pinnedRoots.add(2)

    const result = syncDoorSwingFaceOverrides(cache, [], undefined, [1])
    expect(result.removed).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('wall')
    expect(classificationAtLabel(cache, 2)).toBe('door')
    expect(cache.pinnedRoots.has(2)).toBe(true)
  })

  it('overschrijft gepinde wall/unknown/surface naar door (wall-seed Stage-1)', () => {
    const cache = createRoomRasterCache(minimalState())
    cache.faceOverrides.set(1, 'wall')
    cache.pinnedRoots.add(1)
    const result = syncDoorSwingFaceOverrides(cache, [1])
    expect(result.applied).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('door')
    expect(cache.pinnedRoots.has(1)).toBe(true)
  })

  it('overschrijft gepinde window → door (wall-rescue absorb van autoclass-stroken)', () => {
    const cache = createRoomRasterCache(minimalState())
    cache.faceOverrides.set(1, 'window')
    cache.pinnedRoots.add(1)
    const result = syncDoorSwingFaceOverrides(cache, [1])
    expect(result.applied).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('door')
  })

  it('overschrijft geen sticky doorframe', () => {
    const cache = createRoomRasterCache(minimalState())
    cache.faceOverrides.set(1, 'doorframe')
    cache.pinnedRoots.add(1)
    const result = syncDoorSwingFaceOverrides(cache, [1])
    expect(result.applied).toBe(0)
    expect(classificationAtLabel(cache, 1)).toBe('doorframe')
  })
})

describe('syncWindowFaceOverrides', () => {
  it('zet Stage-3 faces op window en pinnt ze', () => {
    const cache = createRoomRasterCache(minimalState())
    expect(classificationAtLabel(cache, 1)).toBe('wall')

    const result = syncWindowFaceOverrides(cache, [1])
    expect(result.changed).toBe(true)
    expect(result.applied).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('window')
    expect(cache.pinnedRoots.has(1)).toBe(true)
    expect(effectiveClassification(cache).get(1)).toBe('window')
  })

  it('verwijdert stale window-overrides en is idempotent', () => {
    const cache = createRoomRasterCache(minimalState())
    syncWindowFaceOverrides(cache, [1, 2])
    expect(classificationAtLabel(cache, 1)).toBe('window')
    expect(classificationAtLabel(cache, 2)).toBe('window')

    const second = syncWindowFaceOverrides(cache, [1])
    expect(second.changed).toBe(true)
    expect(second.removed).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('window')
    expect(classificationAtLabel(cache, 2)).toBe('surface')
    expect(cache.faceOverrides.has(2)).toBe(false)

    const third = syncWindowFaceOverrides(cache, [1])
    expect(third.changed).toBe(false)
    expect(third.applied).toBe(0)
  })

  it('overschrijft geen handmatige door-pin', () => {
    const cache = createRoomRasterCache(minimalState())
    cache.faceOverrides.set(1, 'door')
    cache.pinnedRoots.add(1)
    const result = syncWindowFaceOverrides(cache, [1])
    expect(result.applied).toBe(0)
    expect(classificationAtLabel(cache, 1)).toBe('door')
  })
})

describe('syncDoorBridgeWallOverrides', () => {
  it('zet bridge-faces op doorframe en pinnt ze', () => {
    const cache = createRoomRasterCache(minimalState())
    const result = syncDoorBridgeWallOverrides(cache, [1])
    expect(result.changed).toBe(true)
    expect(result.applied).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('doorframe')
    expect(cache.pinnedRoots.has(1)).toBe(true)
  })

  it('verwijdert stale doorframe- en legacy wall-overrides', () => {
    const cache = createRoomRasterCache(minimalState())
    syncDoorBridgeWallOverrides(cache, [1])
    cache.faceOverrides.set(2, 'wall')
    cache.pinnedRoots.add(2)

    const result = syncDoorBridgeWallOverrides(cache, [1], undefined, [1, 2])
    expect(result.removed).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('doorframe')
    expect(cache.faceOverrides.has(2)).toBe(false)
  })

  it('upgrade legacy pinned wall-bridge naar doorframe', () => {
    const cache = createRoomRasterCache(minimalState())
    cache.faceOverrides.set(1, 'wall')
    cache.pinnedRoots.add(1)
    const result = syncDoorBridgeWallOverrides(cache, [1])
    expect(result.applied).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('doorframe')
  })

  it('overschrijft geen handmatige door-pin', () => {
    const cache = createRoomRasterCache(minimalState())
    cache.faceOverrides.set(1, 'door')
    cache.pinnedRoots.add(1)
    const result = syncDoorBridgeWallOverrides(cache, [1])
    expect(result.applied).toBe(0)
    expect(classificationAtLabel(cache, 1)).toBe('door')
  })
})

describe('syncDoorframeFaceOverrides', () => {
  it('zet Stage-3 faces op doorframe en pinnt ze', () => {
    const cache = createRoomRasterCache(minimalState())
    const result = syncDoorframeFaceOverrides(cache, [1])
    expect(result.changed).toBe(true)
    expect(result.applied).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('doorframe')
    expect(cache.pinnedRoots.has(1)).toBe(true)
  })

  it('verwijdert geen stale doorframe-overrides (sticky pins)', () => {
    const cache = createRoomRasterCache(minimalState())
    syncDoorframeFaceOverrides(cache, [1])
    cache.faceOverrides.set(2, 'doorframe')
    cache.pinnedRoots.add(2)

    const result = syncDoorframeFaceOverrides(cache, [], undefined, [1])
    expect(result.removed).toBe(0)
    expect(classificationAtLabel(cache, 1)).toBe('doorframe')
    expect(classificationAtLabel(cache, 2)).toBe('doorframe')
    expect(cache.pinnedRoots.has(1)).toBe(true)
    expect(cache.pinnedRoots.has(2)).toBe(true)
  })

  it('upgrade auto-window naar doorframe (Stage-3 retarget)', () => {
    const cache = createRoomRasterCache(minimalState())
    cache.faceOverrides.set(1, 'window')
    cache.pinnedRoots.add(1)
    const result = syncDoorframeFaceOverrides(cache, [1])
    expect(result.applied).toBe(1)
    expect(classificationAtLabel(cache, 1)).toBe('doorframe')
  })

  it('overschrijft geen handmatige wall-pin', () => {
    const cache = createRoomRasterCache(minimalState())
    cache.faceOverrides.set(1, 'wall')
    cache.pinnedRoots.add(1)
    const result = syncDoorframeFaceOverrides(cache, [1])
    expect(result.applied).toBe(0)
    expect(classificationAtLabel(cache, 1)).toBe('wall')
  })
})

describe('claimFacesInRoomRasterCache early-exit', () => {
  it('skip bij al-root face zonder class: geen parentMap-change, dual blijft intact', () => {
    const cache = createRoomRasterCache(minimalState())
    const dualBefore = ensureFaceDualSpace(cache)
    const parentBefore = [...cache.state.parentMap]
    const result = claimFacesInRoomRasterCache(cache, [1])
    expect(result.parentMapChanged).toBe(false)
    expect(result.classChanged).toBe(false)
    expect(result.detachedFaceIds).toEqual([])
    expect(cache.state.parentMap).toEqual(parentBefore)
    expect(ensureFaceDualSpace(cache)).toBe(dualBefore)
  })

  it('detach child uit parentMap', () => {
    const cache = createRoomRasterCache(
      minimalState({
        parentMap: [[2, 1]],
        classificationByLabel: [
          [1, 'wall'],
          [2, 'wall'],
        ],
      }),
    )
    const result = claimFacesInRoomRasterCache(cache, [2])
    expect(result.parentMapChanged).toBe(true)
    expect(result.detachedFaceIds).toEqual([2])
    expect(cache.state.parentMap.some(([child]) => child === 2)).toBe(false)
  })

  it('wall-rescue: forceClass door materialiseert class + breekt enclosed parent', () => {
    const cache = createRoomRasterCache(
      minimalState({
        parentMap: [[234, 100]],
        classificationByLabel: [
          [100, 'wall'],
          [234, 'wall'],
        ],
      }),
    )
    const result = claimFacesInRoomRasterCache(cache, [234], {
      class: 'door',
      forceClass: true,
    })
    expect(result.parentMapChanged).toBe(true)
    expect(result.classChanged).toBe(true)
    expect(result.detachedFaceIds).toEqual([234])
    expect(cache.state.parentMap.some(([child]) => child === 234)).toBe(false)
    expect(new Map(cache.state.classificationByLabel).get(234)).toBe('door')
    expect(cache.faceOverrides.get(234)).toBe('door')
    expect(cache.pinnedRoots.has(234)).toBe(true)
    expect(classificationAtLabel(cache, 234)).toBe('door')
  })

  it('wall-rescue root: forceClass door materialiseert ook zonder parentMap-child', () => {
    const cache = createRoomRasterCache(
      minimalState({
        classificationByLabel: [[234, 'wall']],
      }),
    )
    const result = claimFacesInRoomRasterCache(cache, [234], {
      class: 'door',
      forceClass: true,
    })
    expect(result.parentMapChanged).toBe(false)
    expect(result.classChanged).toBe(true)
    expect(new Map(cache.state.classificationByLabel).get(234)).toBe('door')
    expect(classificationAtLabel(cache, 234)).toBe('door')
  })
})
