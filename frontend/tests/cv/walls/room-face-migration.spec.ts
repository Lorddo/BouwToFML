import { describe, expect, it } from 'vitest'
import {
  applyMigratedFaceOverrides,
  collectAssignmentsForMigration,
  collectSpatialAssignmentsForMigration,
  computeFaceSignatures,
  faceSignaturesMatch,
  migratePinnedOverridesSpatially,
  migratePinnedOverridesToTopology,
} from '@/cv/walls/rooms/room-face-migration'
import { createRoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'

function minimalState(overrides?: Partial<SerializedRoomClassifyState>): SerializedRoomClassifyState {
  const labelsData = new Int32Array([
    0, 1, 1,
    0, 2, 2,
  ])
  return {
    width: 3,
    height: 2,
    labelsData,
    parentMap: [],
    classificationByLabel: [
      [1, 'wall'],
      [2, 'surface'],
    ],
    threshold: 0.8,
    mergedFaceCount: 2,
    classificationGroupBy: 'component',
    ...overrides,
  }
}

describe('computeFaceSignatures', () => {
  it('berekent area en perimeter per component', () => {
    const signatures = computeFaceSignatures(minimalState())
    expect(signatures.get(1)).toEqual({
      areaPx: 2,
      perimeterPx: 6,
      bbox: { x: 1, y: 0, width: 2, height: 1 },
    })
    expect(signatures.get(2)).toEqual({
      areaPx: 2,
      perimeterPx: 6,
      bbox: { x: 1, y: 1, width: 2, height: 1 },
    })
  })
})

describe('faceSignaturesMatch', () => {
  it('matcht op area + perimeter + bbox', () => {
    const a = { areaPx: 100, perimeterPx: 40, bbox: { x: 0, y: 0, width: 10, height: 10 } }
    const b = { areaPx: 100, perimeterPx: 40, bbox: { x: 5, y: 5, width: 10, height: 10 } }
    const c = { areaPx: 101, perimeterPx: 40, bbox: { x: 0, y: 0, width: 10, height: 10 } }
    expect(faceSignaturesMatch(a, a)).toBe(true)
    expect(faceSignaturesMatch(a, b)).toBe(false)
    expect(faceSignaturesMatch(a, c)).toBe(false)
  })
})

describe('applyMigratedFaceOverrides', () => {
  it('behoudt handmatige toewijzing bij gelijke omtrek', () => {
    const oldCache = createRoomRasterCache(minimalState())
    oldCache.faceOverrides.set(1, 'unknown')
    oldCache.pinnedRoots.add(1)
    const assignments = collectAssignmentsForMigration(oldCache)

    const newCache = createRoomRasterCache(
      minimalState({
        classificationByLabel: [
          [1, 'surface'],
          [2, 'surface'],
        ],
      }),
    )
    const { applied, dropped } = applyMigratedFaceOverrides(newCache, assignments)
    expect(applied).toBe(1)
    expect(dropped).toBe(0)
    expect(newCache.faceOverrides.get(1)).toBe('unknown')
    expect(newCache.pinnedRoots.has(1)).toBe(true)
  })

  it('verwerpt handmatige toewijzing bij gewijzigde omtrek', () => {
    const oldCache = createRoomRasterCache(minimalState())
    oldCache.faceOverrides.set(1, 'unknown')
    oldCache.pinnedRoots.add(1)
    const assignments = collectAssignmentsForMigration(oldCache)

    const newCache = createRoomRasterCache(
      minimalState({
        labelsData: new Int32Array([
          0, 1, 1, 1, 1,
          0, 2, 2, 0, 0,
        ]),
        width: 5,
        height: 2,
        classificationByLabel: [
          [1, 'wall'],
          [2, 'surface'],
        ],
      }),
    )
    const { applied, dropped } = applyMigratedFaceOverrides(newCache, assignments)
    expect(applied).toBe(0)
    expect(dropped).toBe(1)
    expect(newCache.faceOverrides.size).toBe(0)
  })
})

describe('migratePinnedOverridesToTopology', () => {
  it('behoudt surface override bij ongewijzigde topologie', () => {
    const state = minimalState()
    const migrated = migratePinnedOverridesToTopology({
      priorState: state,
      priorOverrides: new Map([[1, 'surface']]),
      pinnedRoots: new Set([1]),
      newLabelsData: state.labelsData,
      newParentMap: [],
      width: state.width,
      height: state.height,
    })

    expect(migrated.faceOverrides.get(1)).toBe('surface')
    expect(migrated.pinnedRoots.has(1)).toBe(true)
  })
})

describe('migratePinnedOverridesSpatially', () => {
  it('behoudt override bij hernummerd label op dezelfde plek', () => {
    const prior = minimalState()
    const newLabels = new Int32Array([
      0, 99, 99,
      0, 2, 2,
    ])
    const migrated = migratePinnedOverridesSpatially({
      priorState: prior,
      priorOverrides: new Map([[1, 'unknown']]),
      pinnedRoots: new Set([1]),
      newState: minimalState({
        labelsData: newLabels,
        classificationByLabel: [
          [99, 'wall'],
          [2, 'surface'],
        ],
      }),
    })

    expect(migrated.applied).toBe(1)
    expect(migrated.dropped).toBe(0)
    expect(migrated.faceOverrides.get(99)).toBe('unknown')
    expect(migrated.pinnedRoots.has(99)).toBe(true)
  })

  it('migreert door-override via centroid-anker', () => {
    const prior = minimalState()
    const migrated = migratePinnedOverridesSpatially({
      priorState: prior,
      priorOverrides: new Map([[1, 'door']]),
      pinnedRoots: new Set([1]),
      newState: minimalState({
        classificationByLabel: [
          [1, 'wall'],
          [2, 'wall'],
        ],
      }),
    })

    expect(migrated.applied).toBe(1)
    expect(migrated.dropped).toBe(0)
    expect(migrated.faceOverrides.get(1)).toBe('door')
    expect(migrated.pinnedRoots.has(1)).toBe(true)
  })

  it('verwerpt override als vlak op ankerplek verdwenen is', () => {
    const prior = minimalState()
    const newLabels = new Int32Array(100).fill(0)
    const migrated = migratePinnedOverridesSpatially({
      priorState: prior,
      priorOverrides: new Map([[1, 'unknown']]),
      pinnedRoots: new Set([1]),
      newState: minimalState({
        width: 10,
        height: 10,
        labelsData: newLabels,
      }),
    })

    expect(migrated.applied).toBe(0)
    expect(migrated.dropped).toBe(1)
    expect(migrated.faceOverrides.size).toBe(0)
  })
})

describe('collectSpatialAssignmentsForMigration', () => {
  it('verzamelt centroid van gepinde override', () => {
    const cache = createRoomRasterCache(minimalState())
    cache.faceOverrides.set(1, 'surface')
    cache.pinnedRoots.add(1)
    const assignments = collectSpatialAssignmentsForMigration({
      state: cache.state,
      priorOverrides: cache.faceOverrides,
      pinnedRoots: cache.pinnedRoots,
    })
    expect(assignments).toHaveLength(1)
    expect(assignments[0]?.class).toBe('surface')
    expect(assignments[0]?.x).toBeGreaterThan(0)
  })
})
