import { describe, expect, it } from 'vitest'
import {
  aabbOfOrientedRect,
  compactRectRotationDeg,
  hasRectRotation,
  orientedRectCorners,
  pointInOrientedRect,
  recoverOrientedRectFromCorners,
  sampleOrientedRectNearest,
  snapRectRotationDeg,
} from '@/platform/selection/oriented-rect'
import { findSelectionRectAt } from '@/ui/composables/floorplan-selection-hit'
import { transformSelectionRect } from '@/ui/composables/workspace/imageUtils'
import {
  resolveOpeningRects,
  resolveReferenceWallRects,
} from '@/ui/composables/workspace/workspace-dev-session-capture'

describe('oriented LBE rect', () => {
  it('treats ~0 rotation as axis-aligned', () => {
    expect(hasRectRotation({ x: 0, y: 0, width: 10, height: 4 })).toBe(false)
    expect(hasRectRotation({ x: 0, y: 0, width: 10, height: 4, rotationDeg: 0.1 })).toBe(false)
    expect(compactRectRotationDeg(0)).toBeUndefined()
    expect(compactRectRotationDeg(45)).toBe(45)
  })

  it('hits inside a 45° box and misses the AABB corners outside the diamond', () => {
    const rect = {
      id: 'a',
      type: 'wall' as const,
      x: 40,
      y: 40,
      width: 40,
      height: 20,
      rotationDeg: 45,
    }
    expect(pointInOrientedRect({ x: 60, y: 50 }, rect)).toBe(true)
    expect(findSelectionRectAt({ x: 60, y: 50 }, [rect])?.id).toBe('a')
    expect(findSelectionRectAt({ x: 40, y: 50 }, [rect])).toBeNull()
  })

  it('snaps near-cardinal angles', () => {
    expect(snapRectRotationDeg(8)).toBe(0)
    expect(snapRectRotationDeg(84)).toBe(90)
    expect(snapRectRotationDeg(40)).toBe(40)
  })

  it('samples a sloped ink band into a local crop', () => {
    const w = 80
    const h = 80
    const src = new Uint8Array(w * h).fill(255)
    const cx = 40
    const cy = 40
    const rad = (Math.PI / 180) * 45
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const lx = (x + 0.5 - cx) * cos + (y + 0.5 - cy) * sin
        const ly = -(x + 0.5 - cx) * sin + (y + 0.5 - cy) * cos
        if (Math.abs(ly) <= 3 && Math.abs(lx) <= 20) src[y * w + x] = 0
      }
    }
    const crop = sampleOrientedRectNearest(src, w, h, {
      x: 20,
      y: 32,
      width: 40,
      height: 16,
      rotationDeg: 45,
    })
    let dark = 0
    for (const v of crop.data) if (v < 128) dark += 1
    expect(crop.width).toBe(40)
    expect(crop.height).toBe(16)
    expect(dark).toBeGreaterThan(40 * 4)
  })

  it('keeps OBB size and rotation through bake crop+scale', () => {
    const next = transformSelectionRect(
      { x: 100, y: 80, width: 40, height: 16, rotationDeg: 45 },
      {
        sourceWidth: 400,
        sourceHeight: 300,
        rotate180: false,
        uiRotationDeg: 0,
        bakedWidth: 400,
        bakedHeight: 300,
        cropOffset: { x: 20, y: 10 },
        scale: 2,
        outWidth: 760,
        outHeight: 580,
      },
    )
    expect(next.width).toBeCloseTo(80, 5)
    expect(next.height).toBeCloseTo(32, 5)
    expect(next.rotationDeg).toBeCloseTo(45, 5)
    expect(next.x).toBeCloseTo(160, 5)
    expect(next.y).toBeCloseTo(140, 5)
  })

  it('recovers a rectangle from mapped corners', () => {
    const rect = { x: 10, y: 20, width: 30, height: 10, rotationDeg: 30 }
    const recovered = recoverOrientedRectFromCorners(orientedRectCorners(rect))
    expect(recovered.width).toBeCloseTo(30, 5)
    expect(recovered.height).toBeCloseTo(10, 5)
    expect(recovered.rotationDeg).toBeCloseTo(30, 5)
    expect(aabbOfOrientedRect(rect).width).toBeGreaterThan(rect.width)
  })

  it('persists rotation on wall and opening refs', () => {
    const walls = resolveReferenceWallRects([
      { type: 'wall', x: 0, y: 0, width: 10, height: 4, wallThicknessCm: 20, rotationDeg: 33 },
    ])
    expect(walls[0]?.rotationDeg).toBe(33)
    const openings = resolveOpeningRects([
      { type: 'door', x: 1, y: 2, width: 8, height: 6, rotationDeg: 12 },
    ])
    expect(openings[0]?.rotationDeg).toBe(12)
  })
})
