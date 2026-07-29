import { describe, expect, it } from 'vitest'
import {
  buildOpeningWhiteSpace,
  extractWallInkComponents,
  isOpeningWhiteClass,
  mergeOpeningWhiteWithWallInk,
} from '@/cv/walls/rooms/opening-white-space'
import { allowedClassForWindow } from '@/cv/windows/window-axel-strip-geometry'
import { resolveReferenceTargetStripHeightPx } from '@/cv/windows/window-axel-strip-geometry'
import type { WindowAxelRefBand } from '@/cv/windows/types'

describe('opening-white-space', () => {
  it('isOpeningWhiteClass excludes wall and doorframe', () => {
    expect(isOpeningWhiteClass('surface')).toBe(true)
    expect(isOpeningWhiteClass('outside')).toBe(true)
    expect(isOpeningWhiteClass('unknown')).toBe(true)
    expect(isOpeningWhiteClass('door')).toBe(true)
    expect(isOpeningWhiteClass('window')).toBe(true)
    expect(isOpeningWhiteClass('wall')).toBe(false)
    expect(isOpeningWhiteClass('doorframe')).toBe(false)
  })

  it('allowedClassForWindow includes wall and doorframe (ink-measure ≠ class gate)', () => {
    expect(allowedClassForWindow('outside')).toBe(true)
    expect(allowedClassForWindow('surface')).toBe(true)
    expect(allowedClassForWindow('wall')).toBe(true)
    expect(allowedClassForWindow('window')).toBe(true)
    expect(allowedClassForWindow('doorframe')).toBe(true)
  })

  it('buildOpeningWhiteSpace uses raw white area and class map', () => {
    // 5×5: label 1 = 2×2 white block inset (niet border → surface blijft)
    const width = 5
    const height = 5
    const raw = new Int32Array(width * height)
    for (let y = 1; y < 3; y += 1) {
      for (let x = 1; x < 3; x += 1) {
        raw[y * width + x] = 1
      }
    }
    const opening = buildOpeningWhiteSpace({
      rawLabelsData: raw,
      width,
      height,
      classificationByLabel: new Map([[1, 'surface']]),
    })
    expect(opening.components).toHaveLength(1)
    expect(opening.components[0]?.areaPx).toBe(4)
    expect(opening.classificationByLabel.get(1)).toBe('surface')
    expect(opening.roots).toEqual([1])
  })

  it('mergeOpeningWhiteWithWallInk prefers wall-ink geometry on conflict', () => {
    const width = 3
    const height = 3
    const raw = new Int32Array(width * height)
    raw[0] = 1
    raw[1] = 1
    const opening = buildOpeningWhiteSpace({
      rawLabelsData: raw,
      width,
      height,
      classificationByLabel: new Map([[1, 'wall']]),
    })
    const inkLabels = new Int32Array(width * height)
    // Post-ink: label 1 owns more pixels (ink assigned)
    inkLabels[0] = 1
    inkLabels[1] = 1
    inkLabels[2] = 1
    const wallInk = extractWallInkComponents({
      labelsData: inkLabels,
      width,
      height,
      classificationByLabel: new Map([[1, 'wall']]),
    })
    expect(wallInk[0]?.areaPx).toBe(3)
    const merged = mergeOpeningWhiteWithWallInk({
      whiteComponents: opening.components,
      wallInkComponents: wallInk,
    })
    const face1 = merged.find((c) => c.label === 1)
    expect(face1?.areaPx).toBe(3)
  })
})

describe('resolveReferenceTargetStripHeightPx micro-strip', () => {
  it('allows bounded calibrate jump beyond 1.5× for multi-strip refs', () => {
    const ref: WindowAxelRefBand = {
      refIndex: 0,
      stripCount: 2,
      stripHeightsPx: [2, 2],
      targetStripHeightPx: 2,
      targetStripHeightRatio: 2 / 9,
      axisBandHeightPx: 9,
      orientation: 'horizontal',
      fullStripCount: 2,
      fullStripHeightsPx: [2, 2],
      framingSizeRange: null,
      topRailRange: null,
      bottomRailRange: null,
    }
    // Two long thin faces overlapping ref, height 6 (would be relativeJump 2.0)
    const roots = [
      {
        root: 10,
        areaPx: 600,
        bbox: { x: 0, y: 10, width: 100, height: 6 },
        className: 'outside' as const,
      },
      {
        root: 11,
        areaPx: 600,
        bbox: { x: 0, y: 20, width: 100, height: 6 },
        className: 'outside' as const,
      },
    ]
    const calibrated = resolveReferenceTargetStripHeightPx({
      roots,
      ref,
      refRect: { x: 0, y: 0, width: 120, height: 40 },
      minSpanPx: 12,
      maxHeightPx: 20,
    })
    // Bounded to max 2 * 3 = 6
    expect(calibrated).toBe(6)
  })
})
