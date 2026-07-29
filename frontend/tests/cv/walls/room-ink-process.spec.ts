import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import * as roomInkClassify from '@/cv/walls/rooms/room-ink-classify'
import * as roomInkSymmetric from '@/cv/walls/rooms/room-ink-symmetric'
import * as roomTopologyPatch from '@/cv/walls/rooms/room-topology-patch'
import { runInkProcessAfterEdits, needsFullInkResolveForEdits } from '@/cv/walls/rooms/room-ink-process'
import type { RoomClassifyResult } from '@/cv/walls/strategies/room-first'

class FakeMat {
  cols: number
  rows: number
  data: Uint8Array

  constructor(rows: number, cols: number, data?: Uint8Array) {
    this.rows = rows
    this.cols = cols
    this.data = data ?? new Uint8Array(rows * cols)
  }

  delete() {}
}

function minimalClassifyResult(): RoomClassifyResult {
  const labelsData = new Int32Array([1, 1, 2, 2])
  const rawLabelsData = new Int32Array([1, 1, 2, 2])
  const canvas = { width: 2, height: 2 } as HTMLCanvasElement
  return {
    width: 2,
    height: 2,
    rawLabelsData,
    labelsData,
    parentMap: new Map(),
    components: [],
    classificationByLabel: new Map([
      [1, 'wall'],
      [2, 'surface'],
    ]),
    classificationGroupBy: 'component',
    classifiedMaskCanvas: canvas,
    roomReferenceCanvas: canvas,
    threshold: 0.8,
    mergedFaceCount: 2,
    wallCount: 1,
    surfaceCount: 1,
    unknownCount: 0,
    baselineWallBwData: new Uint8Array([255, 255, 255, 255]),
  }
}

describe('runInkProcessAfterEdits', () => {
  beforeEach(() => {
    vi.spyOn(roomInkClassify, 'renderClassifiedFaceMask').mockReturnValue({
      width: 2,
      height: 2,
    } as HTMLCanvasElement)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('laat topology stappen staan bij lege diff', async () => {
    const symmetricSpy = vi.spyOn(roomInkSymmetric, 'applySymmetricInkDiff')
    const patchSpy = vi.spyOn(roomTopologyPatch, 'patchTopologyLabelsInDiffRegion')
    const subsetSpy = vi.spyOn(roomInkClassify, 'classifyFaceLabelsSubset')
    const prior = minimalClassifyResult()
    const mat = new FakeMat(2, 2, new Uint8Array([255, 255, 255, 255]))
    const result = await runInkProcessAfterEdits({
      cv: {} as never,
      mat: mat as never,
      classify: prior,
      faceOverrides: new Map(),
      pinnedRoots: new Set(),
      referenceWallThicknessPx: 12,
      referenceData: new Uint8Array([255, 255, 255, 255]),
    })

    expect(symmetricSpy).not.toHaveBeenCalled()
    expect(patchSpy).not.toHaveBeenCalled()
    expect(subsetSpy).not.toHaveBeenCalled()
    expect(result.refinedFaceOverrides.size).toBe(0)
    expect(result.baselineWallBwData).toEqual(new Uint8Array([255, 255, 255, 255]))
  })

  it('draait topology + subset-classify bij echte inktwijziging', async () => {
    const symmetricSpy = vi.spyOn(roomInkSymmetric, 'applySymmetricInkDiff')
    const patchSpy = vi.spyOn(roomTopologyPatch, 'patchTopologyLabelsInDiffRegion')
    const subsetSpy = vi.spyOn(roomInkClassify, 'classifyFaceLabelsSubset')
    const result = await runInkProcessAfterEdits({
      cv: {} as never,
      mat: new FakeMat(2, 2, new Uint8Array([255, 0, 255, 255])) as never,
      classify: minimalClassifyResult(),
      faceOverrides: new Map([[1, 'surface']]),
      pinnedRoots: new Set([1]),
      referenceData: new Uint8Array([0, 0, 255, 255]),
    })

    expect(symmetricSpy).toHaveBeenCalledOnce()
    expect(patchSpy).toHaveBeenCalledOnce()
    expect(subsetSpy).toHaveBeenCalledOnce()
    expect(result.refinedFaceOverrides.has(1)).toBe(false)
    expect(result.refinedPinnedRoots.has(1)).toBe(false)
    expect(result.baselineWallBwData).toEqual(new Uint8Array([255, 0, 255, 255]))
  })

  it('behoudt door/window/doorframe-pins in impactzone', async () => {
    const width = 150
    const height = 1
    const labelsData = new Int32Array(width)
    for (let i = 0; i <= 40; i += 1) labelsData[i] = 1
    for (let i = 100; i < width; i += 1) labelsData[i] = 2
    const canvas = { width, height } as HTMLCanvasElement
    const classify: RoomClassifyResult = {
      width,
      height,
      rawLabelsData: new Int32Array(labelsData),
      labelsData: new Int32Array(labelsData),
      parentMap: new Map(),
      components: [],
      classificationByLabel: new Map([
        [1, 'wall'],
        [2, 'surface'],
      ]),
      classificationGroupBy: 'component',
      classifiedMaskCanvas: canvas,
      roomReferenceCanvas: canvas,
      threshold: 0.8,
      mergedFaceCount: 2,
      wallCount: 1,
      surfaceCount: 1,
      unknownCount: 0,
      baselineWallBwData: new Uint8Array(width * height).fill(255),
    }

    vi.spyOn(roomInkClassify, 'classifyFaceLabelsSubset').mockImplementation((params) => {
      const merged = new Map(params.frozenClassification)
      for (const label of params.affectedLabels) {
        if (!merged.has(label)) merged.set(label, 'wall')
      }
      return {
        classificationByLabel: merged,
        wallCount: 1,
        surfaceCount: 1,
        unknownCount: 0,
        threshold: 0.8,
      }
    })

    const newBw = new Uint8Array(width * height).fill(255)
    newBw[30] = 0 // raakt label 1 (0–40)

    const result = await runInkProcessAfterEdits({
      cv: {} as never,
      mat: new FakeMat(height, width, newBw) as never,
      classify,
      faceOverrides: new Map([
        [1, 'window'],
        [2, 'door'],
      ]),
      pinnedRoots: new Set([1, 2]),
      referenceWallThicknessPx: 12,
      referenceData: new Uint8Array(width * height).fill(255),
    })

    expect(result.refinedFaceOverrides.get(1)).toBe('window')
    expect(result.refinedFaceOverrides.get(2)).toBe('door')
    expect(result.refinedPinnedRoots.has(1)).toBe(true)
    expect(result.refinedPinnedRoots.has(2)).toBe(true)
  })

  it('behoudt frozen override op ongeraakt vlak', async () => {
    const width = 150
    const height = 1
    const labelsData = new Int32Array(width)
    for (let i = 0; i <= 40; i += 1) labelsData[i] = 1
    for (let i = 100; i < width; i += 1) labelsData[i] = 2
    const rawLabelsData = new Int32Array(labelsData)
    const canvas = { width, height } as HTMLCanvasElement
    const classify: RoomClassifyResult = {
      width,
      height,
      rawLabelsData,
      labelsData: new Int32Array(labelsData),
      parentMap: new Map(),
      components: [],
      classificationByLabel: new Map([
        [1, 'wall'],
        [2, 'surface'],
      ]),
      classificationGroupBy: 'component',
      classifiedMaskCanvas: canvas,
      roomReferenceCanvas: canvas,
      threshold: 0.8,
      mergedFaceCount: 2,
      wallCount: 1,
      surfaceCount: 1,
      unknownCount: 0,
      baselineWallBwData: new Uint8Array(width * height).fill(255),
    }

    vi.spyOn(roomInkClassify, 'classifyFaceLabelsSubset').mockImplementation((params) => {
      const merged = new Map(params.frozenClassification)
      for (const label of params.affectedLabels) {
        merged.set(label, 'wall')
      }
      return {
        classificationByLabel: merged,
        wallCount: 1,
        surfaceCount: 1,
        unknownCount: 0,
        threshold: 0.8,
      }
    })

    const newBw = new Uint8Array(width * height).fill(255)
    newBw[60] = 0

    const result = await runInkProcessAfterEdits({
      cv: {} as never,
      mat: new FakeMat(height, width, newBw) as never,
      classify,
      faceOverrides: new Map([[2, 'unknown']]),
      pinnedRoots: new Set([2]),
      referenceWallThicknessPx: 12,
      referenceData: new Uint8Array(width * height).fill(255),
    })

    expect(result.refinedFaceOverrides.get(2)).toBe('unknown')
    expect(result.refinedPinnedRoots.has(2)).toBe(true)
    expect(result.classificationByLabel.get(1)).toBe('wall')
  })
})

describe('needsFullInkResolveForEdits', () => {
  it('vereist volledige resolve bij border-face of rand-diff', () => {
    const components = [
      { label: 1, areaPx: 10, bbox: { x: 0, y: 0, width: 10, height: 10 }, touchesBorder: true },
      { label: 2, areaPx: 10, bbox: { x: 20, y: 0, width: 10, height: 10 }, touchesBorder: false },
    ]
    expect(
      needsFullInkResolveForEdits({
        components,
        affectedLabels: new Set([1]),
        effectiveClass: new Map([[1, 'outside']]),
        priorEffectiveClass: new Map([[1, 'outside']]),
        diffBounds: { x0: 50, y0: 50, x1: 60, y1: 60 },
        width: 200,
        height: 200,
        borderMarginPx: 32,
      }),
    ).toBe(true)

    expect(
      needsFullInkResolveForEdits({
        components,
        affectedLabels: new Set([2]),
        effectiveClass: new Map([[2, 'surface']]),
        priorEffectiveClass: new Map([[2, 'surface']]),
        diffBounds: { x0: 5, y0: 5, x1: 8, y1: 8 },
        width: 200,
        height: 200,
        borderMarginPx: 32,
      }),
    ).toBe(true)

    expect(
      needsFullInkResolveForEdits({
        components,
        affectedLabels: new Set([2]),
        effectiveClass: new Map([[2, 'surface']]),
        priorEffectiveClass: new Map([[2, 'surface']]),
        diffBounds: { x0: 80, y0: 80, x1: 90, y1: 90 },
        width: 200,
        height: 200,
        borderMarginPx: 32,
      }),
    ).toBe(false)
  })
})
