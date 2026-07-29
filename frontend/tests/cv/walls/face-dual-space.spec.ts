import { describe, expect, it } from 'vitest'
import {
  buildFaceDualSpace,
  buildFaceDualSpaceFromState,
  inkGeom,
  pickGeomByPrefer,
  rebindFaceDualWhite,
  whiteGeom,
  type GeomPrefer,
} from '@/cv/walls/rooms/face-dual-space'
import {
  createRoomRasterCache,
  ensureFaceDualSpace,
  invalidateFaceDualSpace,
  resolveFloorDual,
} from '@/cv/walls/rooms/room-raster-cache'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import { prepareOpeningPipeDual } from '@/cv/walls/rooms/opening-pipe-dual'

describe('pickGeomByPrefer', () => {
  const W = 'white'
  const I = 'ink'
  const prefers: GeomPrefer[] = ['white', 'ink', 'whiteThenInk', 'inkThenWhite']

  it('prefer × presence matrix', () => {
    const cases: Array<{
      white: string | undefined
      ink: string | undefined
      expect: Record<GeomPrefer, string | undefined>
    }> = [
      {
        white: W,
        ink: I,
        expect: { white: W, ink: I, whiteThenInk: W, inkThenWhite: I },
      },
      {
        white: W,
        ink: undefined,
        expect: { white: W, ink: undefined, whiteThenInk: W, inkThenWhite: W },
      },
      {
        white: undefined,
        ink: I,
        expect: { white: undefined, ink: I, whiteThenInk: I, inkThenWhite: I },
      },
      {
        white: undefined,
        ink: undefined,
        expect: {
          white: undefined,
          ink: undefined,
          whiteThenInk: undefined,
          inkThenWhite: undefined,
        },
      },
    ]

    for (const c of cases) {
      for (const prefer of prefers) {
        expect(pickGeomByPrefer(c.white, c.ink, prefer)).toBe(c.expect[prefer])
      }
    }
  })
})

describe('face-dual-space', () => {
  it('same label can have larger ink geom than white', () => {
    const width = 4
    const height = 3
    // White: label 1 = two pixels
    const raw = new Int32Array(width * height)
    raw[1 * width + 1] = 1
    raw[1 * width + 2] = 1
    // Ink: label 1 owns three pixels (ink assigned)
    const ink = new Int32Array(width * height)
    ink[1 * width + 1] = 1
    ink[1 * width + 2] = 1
    ink[1 * width + 3] = 1

    const dual = buildFaceDualSpace({
      rawLabelsData: raw,
      labelsData: ink,
      width,
      height,
      classificationByLabel: new Map([[1, 'surface']]),
    })

    const white = whiteGeom(dual, 1)
    const inkG = inkGeom(dual, 1)
    expect(white?.areaPx).toBe(2)
    expect(inkG?.areaPx).toBe(3)
    expect(dual.geom(1, 'whiteThenInk')?.areaPx).toBe(2)
    expect(dual.geom(1, 'inkThenWhite')?.areaPx).toBe(3)
    expect(dual.space('white')).toBe(dual.white)
    expect(dual.space('ink')).toBe(dual.ink)
  })

  it('space throws on fallthrough prefer', () => {
    const dual = buildFaceDualSpace({
      rawLabelsData: new Int32Array(4),
      labelsData: new Int32Array(4),
      width: 2,
      height: 2,
      classificationByLabel: new Map(),
    })
    // @ts-expect-error fallthrough prefer is niet SpacePrefer
    expect(() => dual.space('whiteThenInk')).toThrow(/FaceDualSpace\.space: unsupported prefer/)
  })

  it('hard-fails without rawLabelsData', () => {
    expect(() =>
      buildFaceDualSpaceFromState({
        width: 2,
        height: 2,
        labelsData: new Int32Array(4),
        parentMap: [],
        classificationByLabel: [],
        threshold: 0,
        mergedFaceCount: 0,
      }),
    ).toThrow(/rawLabelsData/)
  })

  it('prefer policies and unionBBox', () => {
    const width = 3
    const height = 2
    const raw = new Int32Array(width * height)
    raw[0] = 1
    raw[1] = 2
    const ink = new Int32Array(width * height)
    ink[0] = 1
    ink[1] = 2
    ink[2] = 2
    const dual = buildFaceDualSpace({
      rawLabelsData: raw,
      labelsData: ink,
      width,
      height,
      classificationByLabel: new Map([
        [1, 'surface'],
        [2, 'wall'],
      ]),
    })
    expect(dual.geom(99, 'white')).toBeUndefined()
    expect(dual.geom(2, 'ink')?.areaPx).toBe(2)
    const union = dual.unionBBox([1, 2], 'white')
    expect(union).toEqual({ x: 0, y: 0, width: 2, height: 1 })
  })

  it('ensureFaceDualSpace caches and invalidates', () => {
    const width = 3
    const height = 2
    const raw = new Int32Array(width * height)
    raw[0] = 1
    const labels = new Int32Array(width * height)
    labels[0] = 1
    labels[1] = 1
    const cache = createRoomRasterCache({
      width,
      height,
      rawLabelsData: raw,
      labelsData: labels,
      parentMap: [],
      classificationByLabel: [[1, 'surface']],
      threshold: 0,
      mergedFaceCount: 1,
    })
    const a = ensureFaceDualSpace(cache)
    const b = ensureFaceDualSpace(cache)
    expect(a).toBe(b)
    expect(a.white.byId.get(1)?.areaPx).toBe(1)
    expect(a.ink.byId.get(1)?.areaPx).toBe(2)

    invalidateFaceDualSpace(cache)
    expect(cache.faceDual).toBeNull()
    const c = ensureFaceDualSpace(cache)
    expect(c).not.toBe(a)
    expect(c.ink.byId.get(1)?.areaPx).toBe(2)
  })

  it('ensureFaceDualSpace hard-fails without raw', () => {
    const cache = createRoomRasterCache({
      width: 2,
      height: 2,
      labelsData: new Int32Array(4),
      parentMap: [],
      classificationByLabel: [],
      threshold: 0,
      mergedFaceCount: 0,
    })
    expect(() => ensureFaceDualSpace(cache)).toThrow(/rawLabelsData/)
  })

  it('resolveFloorDual: cache-hit when labels length matches + raw', () => {
    const width = 3
    const height = 2
    const raw = new Int32Array(width * height)
    raw[0] = 1
    const labels = new Int32Array(width * height)
    labels[0] = 1
    labels[1] = 1
    const state: SerializedRoomClassifyState = {
      width,
      height,
      rawLabelsData: raw,
      labelsData: labels,
      parentMap: [],
      classificationByLabel: [[1, 'surface']],
      threshold: 0,
      mergedFaceCount: 1,
    }
    const cache = createRoomRasterCache(state)
    const fromCache = ensureFaceDualSpace(cache)
    const resolved = resolveFloorDual({
      state,
      cache,
      classificationByLabel: new Map([[1, 'surface']]),
    })
    expect(resolved).toBe(fromCache)
  })

  it('resolveFloorDual: state-fallback when cache labels length differs', () => {
    const width = 3
    const height = 2
    const raw = new Int32Array(width * height)
    raw[0] = 1
    const labels = new Int32Array(width * height)
    labels[0] = 1
    labels[1] = 1
    const cache = createRoomRasterCache({
      width,
      height,
      rawLabelsData: raw,
      labelsData: labels,
      parentMap: [],
      classificationByLabel: [[1, 'surface']],
      threshold: 0,
      mergedFaceCount: 1,
    })
    ensureFaceDualSpace(cache)

    const otherRaw = new Int32Array(4)
    otherRaw[0] = 1
    const otherLabels = new Int32Array(4)
    otherLabels[0] = 1
    const otherState: SerializedRoomClassifyState = {
      width: 2,
      height: 2,
      rawLabelsData: otherRaw,
      labelsData: otherLabels,
      parentMap: [],
      classificationByLabel: [[1, 'surface']],
      threshold: 0,
      mergedFaceCount: 1,
    }
    const resolved = resolveFloorDual({
      state: otherState,
      cache,
      classificationByLabel: new Map([[1, 'surface']]),
    })
    expect(resolved).not.toBe(cache.faceDual)
    expect(resolved.white.width).toBe(2)
    expect(resolved.ink.byId.get(1)?.areaPx).toBe(1)
  })

  it('resolveFloorDual: state-fallback without cache', () => {
    const width = 2
    const height = 2
    const raw = new Int32Array(4)
    raw[0] = 1
    const labels = new Int32Array(4)
    labels[0] = 1
    labels[1] = 1
    const dual = resolveFloorDual({
      state: {
        width,
        height,
        rawLabelsData: raw,
        labelsData: labels,
        parentMap: [],
        classificationByLabel: [[1, 'surface']],
        threshold: 0,
        mergedFaceCount: 1,
      },
      classificationByLabel: new Map([[1, 'wall']]),
    })
    expect(dual.ink.classificationByLabel.get(1)).toBe('wall')
    expect(dual.ink.byId.get(1)?.areaPx).toBe(2)
  })

  it('rebindFaceDualWhite volgt white byId/parentMap; ink geom unchanged', () => {
    const width = 4
    const height = 2
    const raw = new Int32Array(width * height)
    raw[0] = 1
    raw[1] = 2
    const inkLabels = new Int32Array(width * height)
    inkLabels[0] = 1
    inkLabels[1] = 2
    inkLabels[2] = 2
    const dual = buildFaceDualSpace({
      rawLabelsData: raw,
      labelsData: inkLabels,
      width,
      height,
      classificationByLabel: new Map([
        [1, 'surface'],
        [2, 'surface'],
      ]),
    })
    expect(dual.white.byId.has(1)).toBe(true)
    expect(dual.white.byId.has(2)).toBe(true)
    const inkAreaBefore = dual.ink.byId.get(2)?.areaPx

    // Detach-achtig: merge label 2 → 1
    const rebound = rebindFaceDualWhite(dual, {
      parentMap: new Map([[2, 1]]),
      classificationByLabel: new Map([
        [1, 'surface'],
        [2, 'surface'],
      ]),
    })
    expect(rebound.white.byId.has(1)).toBe(true)
    expect(rebound.white.byId.has(2)).toBe(false)
    expect(rebound.white.byId.get(1)?.areaPx).toBe(2)
    expect(rebound.ink.byId.get(2)?.areaPx).toBe(inkAreaBefore)
    expect(rebound.geom(1, 'whiteThenInk')?.areaPx).toBe(2)
    expect(rebound.geom(2, 'inkThenWhite')?.areaPx).toBe(inkAreaBefore)
  })

  it('prepareOpeningPipeDual: byId volgt detached parentMap; ink unchanged', () => {
    const width = 4
    const height = 2
    const raw = new Int32Array(width * height)
    raw[0] = 1
    raw[1] = 2
    const inkLabels = new Int32Array(width * height)
    inkLabels[0] = 1
    inkLabels[1] = 2
    inkLabels[2] = 2
    const dual = buildFaceDualSpace({
      rawLabelsData: raw,
      labelsData: inkLabels,
      width,
      height,
      classificationByLabel: new Map([
        [1, 'wall'],
        [2, 'surface'],
      ]),
    })
    const inkAreaBefore = dual.ink.byId.get(2)?.areaPx

    // Child 2 onder wall-root 1 → detach maakt 2 individuele root.
    const { pipeDual, detachedParentMap } = prepareOpeningPipeDual(dual, {
      parentMap: new Map([[2, 1]]),
      classificationByLabel: new Map([
        [1, 'wall'],
        [2, 'surface'],
      ]),
    })
    expect(detachedParentMap.has(2)).toBe(false)
    expect(pipeDual.white.byId.has(1)).toBe(true)
    expect(pipeDual.white.byId.has(2)).toBe(true)
    expect(pipeDual.white.byId.get(2)?.className).toBe('surface')
    expect(pipeDual.ink.byId.get(2)?.areaPx).toBe(inkAreaBefore)
  })
})
