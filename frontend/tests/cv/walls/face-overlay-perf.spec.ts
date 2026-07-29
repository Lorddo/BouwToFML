/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import {
  inkTopologyBucket,
  needsInkReresolve,
  paintClassifiedFaceMaskRegion,
  renderClassifiedFaceMask,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'
import {
  resolveInkBetweenFaces,
  resolveInkBetweenFacesInRegion,
} from '@/cv/walls/rooms/room-ink-resolve'
import {
  UNKNOWN_FACE_RGBA,
  WALL_FACE_RGBA,
  type RasterRoomComponent,
} from '@/cv/walls/rooms/room-raster'
import {
  createRoomRasterCache,
  setFaceClassificationForLabels,
  toggleFaceAtLabelDetailed,
  updateRoomRasterPreviewMask,
} from '@/cv/walls/rooms/room-raster-cache'

describe('inkTopologyBucket / needsInkReresolve', () => {
  it('groepeert wall+window+doorframe vs outside vs overig', () => {
    expect(inkTopologyBucket('wall')).toBe('wallish')
    expect(inkTopologyBucket('window')).toBe('wallish')
    expect(inkTopologyBucket('doorframe')).toBe('wallish')
    expect(inkTopologyBucket('outside')).toBe('outside')
    expect(inkTopologyBucket('unknown')).toBe('other')
    expect(inkTopologyBucket('surface')).toBe('other')
    expect(inkTopologyBucket('door')).toBe('other')
  })

  it('skipt ink-reresolve binnen dezelfde bucket', () => {
    expect(needsInkReresolve('unknown', 'surface')).toBe(false)
    expect(needsInkReresolve('surface', 'door')).toBe(false)
    expect(needsInkReresolve('door', 'unknown')).toBe(false)
    expect(needsInkReresolve('wall', 'window')).toBe(false)
    expect(needsInkReresolve('window', 'doorframe')).toBe(false)
  })

  it('vereist ink-reresolve bij wallish ↔ other', () => {
    expect(needsInkReresolve('wall', 'unknown')).toBe(true)
    expect(needsInkReresolve('unknown', 'wall')).toBe(true)
    expect(needsInkReresolve('window', 'door')).toBe(true)
    expect(needsInkReresolve('door', 'window')).toBe(true)
    expect(needsInkReresolve('wall', 'outside')).toBe(true)
  })
})

function component(label: number, bbox: RasterRoomComponent['bbox']): RasterRoomComponent {
  return {
    label,
    areaPx: bbox.width * bbox.height,
    bbox,
    touchesBorder: false,
  }
}

describe('resolveInkBetweenFacesInRegion ≈ full', () => {
  it('wijst inkt in regio gelijk toe als full resolve', () => {
    const width = 20
    const height = 12
    const labelsData = new Int32Array(width * height)
    // Face 1 links, face 2 rechts, ink-corridor in het midden (label 0)
    for (let y = 2; y <= 9; y += 1) {
      for (let x = 1; x <= 6; x += 1) labelsData[y * width + x] = 1
      for (let x = 13; x <= 18; x += 1) labelsData[y * width + x] = 2
    }
    const components = [
      component(1, { x: 1, y: 2, width: 6, height: 8 }),
      component(2, { x: 13, y: 2, width: 6, height: 8 }),
    ]
    const labelClass = new Map<number, RoomRasterClass>([
      [1, 'wall'],
      [2, 'surface'],
    ])

    const full = resolveInkBetweenFaces({
      labelsData,
      components,
      width,
      height,
      labelClass,
      referenceWallThicknessPx: 10,
    })

    const bounds = { x0: 0, y0: 0, x1: width - 1, y1: height - 1 }
    const regional = resolveInkBetweenFacesInRegion({
      labelsData,
      priorLabelsData: new Int32Array(labelsData),
      width,
      height,
      labelClass,
      referenceWallThicknessPx: 10,
      bounds,
    })

    for (let idx = 0; idx < labelsData.length; idx += 1) {
      expect(regional.labelsData[idx]).toBe(full.labelsData[idx])
    }
  })
})

describe('paintClassifiedFaceMaskRegion', () => {
  it('dirty-rect kleuren komen overeen met full paint', () => {
    const width = 8
    const height = 6
    const labelsData = new Int32Array(width * height)
    for (let y = 1; y <= 4; y += 1) {
      for (let x = 1; x <= 3; x += 1) labelsData[y * width + x] = 1
      for (let x = 4; x <= 6; x += 1) labelsData[y * width + x] = 2
    }
    const parentMap = new Map<number, number>()
    const classificationByLabel = new Map<number, RoomRasterClass>([
      [1, 'wall'],
      [2, 'door'],
    ])

    const full = renderClassifiedFaceMask({
      width,
      height,
      labelsData,
      parentMap,
      classificationByLabel,
      groupBy: 'component',
    })
    const dirty = renderClassifiedFaceMask({
      width,
      height,
      labelsData,
      parentMap,
      classificationByLabel: new Map([
        [1, 'wall'],
        [2, 'unknown'],
      ]),
      groupBy: 'component',
    })
    // Start van full (door), herkleur alleen label-2 bbox naar unknown
    paintClassifiedFaceMaskRegion(full, {
      width,
      height,
      labelsData,
      parentMap,
      classificationByLabel: new Map([
        [1, 'wall'],
        [2, 'unknown'],
      ]),
      groupBy: 'component',
      bounds: { x0: 4, y0: 1, x1: 6, y1: 4 },
    })

    const fullCtx = full.getContext('2d')
    const dirtyCtx = dirty.getContext('2d')
    expect(fullCtx).toBeTruthy()
    expect(dirtyCtx).toBeTruthy()
    const a = fullCtx!.getImageData(0, 0, width, height).data
    const b = dirtyCtx!.getImageData(0, 0, width, height).data
    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i]).toBe(b[i])
    }
  })
})

describe('toggle window→wall neemt resolved ink mee in dirty paint', () => {
  it('inkt-pixels buiten raw face-bbox krijgen wall-kleur (geen ink-reresolve)', () => {
    const width = 10
    const height = 8
    // Raw face: 2×2 blok. Resolved: zelfde label ook op ink-pixel eronder.
    const raw = new Int32Array(width * height)
    const resolved = new Int32Array(width * height)
    for (let y = 2; y <= 3; y += 1) {
      for (let x = 3; x <= 4; x += 1) {
        raw[y * width + x] = 1
        resolved[y * width + x] = 1
      }
    }
    const inkX = 3
    const inkY = 5
    resolved[inkY * width + inkX] = 1

    const cache = createRoomRasterCache({
      width,
      height,
      labelsData: resolved,
      rawLabelsData: raw,
      parentMap: [],
      classificationByLabel: [[1, 'window']],
      classificationGroupBy: 'component',
      threshold: 0.8,
      mergedFaceCount: 1,
    })
    updateRoomRasterPreviewMask(cache)

    expect(cache.faceDual).toBeNull()
    const result = toggleFaceAtLabelDetailed(cache, 1)
    expect(cache.faceDual).toBeNull()
    expect(result?.next).toBe('wall')
    expect(result?.didInkReresolve).toBe(false)
    expect(result?.dirtyBounds).toBeTruthy()
    // Dirty moet ink-pixel (y=5) meenemen — raw bbox stopt bij y=3.
    expect(result!.dirtyBounds!.y1).toBeGreaterThanOrEqual(inkY)

    updateRoomRasterPreviewMask(cache, { dirtyBounds: result!.dirtyBounds })
    const ctx = cache.previewMaskCanvas!.getContext('2d')!
    const px = ctx.getImageData(inkX, inkY, 1, 1).data
    expect([px[0], px[1], px[2], px[3]]).toEqual([...WALL_FACE_RGBA])
    // Niet blijven hangen op unknown-rood
    expect([px[0], px[1], px[2], px[3]]).not.toEqual([...UNKNOWN_FACE_RGBA])
  })
})

describe('claim detach → dirtyBounds dekt child (merged groupBy)', () => {
  it('dirty-rect na child claim→wall matcht full paint', () => {
    const width = 6
    const height = 4
    const raw = new Int32Array(width * height)
    const labels = new Int32Array(width * height)
    // Parent face 1: left block; child face 2: enclosed right
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        raw[y * width + x] = 1
        labels[y * width + x] = 1
      }
    }
    for (let y = 1; y <= 2; y += 1) {
      for (let x = 3; x <= 4; x += 1) {
        raw[y * width + x] = 2
        labels[y * width + x] = 2
      }
    }
    const cache = createRoomRasterCache({
      width,
      height,
      labelsData: labels,
      rawLabelsData: raw,
      parentMap: [[2, 1]],
      classificationByLabel: [
        [1, 'unknown'],
        [2, 'unknown'],
      ],
      classificationGroupBy: 'merged',
      threshold: 0.8,
      mergedFaceCount: 2,
    })
    updateRoomRasterPreviewMask(cache)

    // Merged lookup ziet child als unknown (root). box_wall claimt/detacht child.
    const change = setFaceClassificationForLabels(cache, [2], 'wall')
    expect(change.changedLabels).toEqual([2])
    expect(change.dirtyBounds).toBeTruthy()
    expect(change.dirtyBounds!.x0).toBeLessThanOrEqual(3)
    expect(change.dirtyBounds!.x1).toBeGreaterThanOrEqual(4)
    expect(change.dirtyBounds!.y0).toBeLessThanOrEqual(1)
    expect(change.dirtyBounds!.y1).toBeGreaterThanOrEqual(2)

    updateRoomRasterPreviewMask(cache, { dirtyBounds: change.dirtyBounds })
    const dirtyCtx = cache.previewMaskCanvas!.getContext('2d')!
    const childPx = dirtyCtx.getImageData(3, 1, 1, 1).data
    expect([childPx[0], childPx[1], childPx[2], childPx[3]]).toEqual([...WALL_FACE_RGBA])

    // Full paint moet identiek zijn aan dirty-path resultaat
    const afterDirty = new Uint8ClampedArray(dirtyCtx.getImageData(0, 0, width, height).data)
    updateRoomRasterPreviewMask(cache)
    const fullData = cache
      .previewMaskCanvas!.getContext('2d')!
      .getImageData(0, 0, width, height).data
    expect(afterDirty.length).toBe(fullData.length)
    for (let i = 0; i < afterDirty.length; i += 1) {
      expect(afterDirty[i]).toBe(fullData[i])
    }
  })
})
