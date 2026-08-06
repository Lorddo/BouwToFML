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

  it('calibrates past Stage-1 max when REF-overlap faces are tilt-inflated', () => {
    // 2D-1E-achtig: deskewed REF target 4px, Stage-1 max = 4+max(2,2.8)=6.8,
    // maar floor AABB bij dezelfde REF is ~10–11px (scheve muur).
    const ref: WindowAxelRefBand = {
      refIndex: 0,
      stripCount: 3,
      stripHeightsPx: [4, 4, 5],
      targetStripHeightPx: 4,
      targetStripHeightRatio: 4 / 17,
      axisBandHeightPx: 17,
      orientation: 'horizontal',
      fullStripCount: 3,
      fullStripHeightsPx: [4, 4, 5],
      framingSizeRange: null,
      topRailRange: null,
      bottomRailRange: null,
    }
    const roots = [
      {
        root: 142,
        areaPx: 1900,
        bbox: { x: 349, y: 2820, width: 191, height: 10 },
        className: 'outside' as const,
      },
      {
        root: 143,
        areaPx: 2100,
        bbox: { x: 348, y: 2826, width: 192, height: 11 },
        className: 'outside' as const,
      },
      {
        root: 145,
        areaPx: 2100,
        bbox: { x: 348, y: 2832, width: 191, height: 11 },
        className: 'outside' as const,
      },
    ]
    const stage1Max = 4 + Math.max(2, 4 * 0.7) // 6.8 — oude sample-plafond
    const calibrated = resolveReferenceTargetStripHeightPx({
      roots,
      ref,
      refRect: { x: 314, y: 2774, width: 263, height: 111 },
      minSpanPx: 48,
      maxHeightPx: stage1Max,
    })
    expect(calibrated).toBeGreaterThan(stage1Max)
    expect(calibrated).toBeLessThanOrEqual(12) // 4 * 3
    expect(calibrated).toBeGreaterThanOrEqual(10)
  })

  it('ignores 1px hairline; calibrates to floor faces when REF crop measured thin glass', () => {
    // bg.jpg: REF-crop glas-witten 3px, floor bij REF-rect 8–9px + 1px haarlijn.
    // Oude nearest-to-ref pakte [1,8] → median 4.5 → maxStrip 7.65 → 8px faalt.
    const ref: WindowAxelRefBand = {
      refIndex: 0,
      stripCount: 2,
      stripHeightsPx: [3, 3],
      targetStripHeightPx: 3,
      targetStripHeightRatio: 3 / 9,
      axisBandHeightPx: 9,
      orientation: 'horizontal',
      fullStripCount: 4,
      fullStripHeightsPx: [3, 3, 10, 13],
      framingSizeRange: null,
      topRailRange: null,
      bottomRailRange: null,
    }
    const roots = [
      {
        root: 180,
        areaPx: 1400,
        bbox: { x: 2050, y: 552, width: 178, height: 8 },
        className: 'outside' as const,
      },
      {
        root: 183,
        areaPx: 1400,
        bbox: { x: 2056, y: 565, width: 166, height: 9 },
        className: 'outside' as const,
      },
      {
        root: 204,
        areaPx: 1400,
        bbox: { x: 2050, y: 579, width: 179, height: 8 },
        className: 'outside' as const,
      },
      {
        root: 196,
        areaPx: 155,
        bbox: { x: 2062, y: 566, width: 155, height: 1 },
        className: 'outside' as const,
      },
    ]
    const refTarget = 3
    const oldNearestMedian = 4.5
    const calibrated = resolveReferenceTargetStripHeightPx({
      roots,
      ref,
      refRect: { x: 2036, y: 540, width: 207, height: 64 },
      minSpanPx: 28,
      maxHeightPx: refTarget + Math.max(2, refTarget * 0.7),
    })
    expect(calibrated).toBeGreaterThan(oldNearestMedian)
    expect(calibrated).toBeGreaterThanOrEqual(8)
    expect(calibrated).toBeLessThanOrEqual(9) // clamp maxBound = 3*3
    const maxStrip = calibrated + Math.max(2, calibrated * 0.7)
    expect(maxStrip).toBeGreaterThanOrEqual(8)
  })
})
