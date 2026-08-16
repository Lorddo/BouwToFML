import { describe, expect, it } from 'vitest'
import {
  cloneUnderlayOriginLayout,
  previewUnderlayLayoutFromDrawing,
} from '@/core/fml/drawing-to-underlay-layout'
import type { DrawingMeta } from '@/core/fml/types'
import { buildUnderlayStageGeom } from '@/ui/composables/fml-preview/fml-preview-underlay-layout'

/** Kinderdijkstraat 53 1 — floors[0].drawing (zonder url). */
const KINDERDIJK_DRAWING: DrawingMeta = {
  x: -210.8,
  y: 480.1,
  width: 1721.8,
  height: 1315.0,
  rotation: 180,
}

describe('previewUnderlayLayoutFromDrawing', () => {
  it('Kinderdijkstraat: midden → origin + rotationDeg + pxPerMm', () => {
    const layout = previewUnderlayLayoutFromDrawing(KINDERDIJK_DRAWING, {
      width: 3444,
      height: 2630,
    })
    expect(layout).not.toBeNull()
    // topLeft = (x − w/2, y − h/2) = (−1071.7, −177.4) → origin = −topLeft
    expect(layout!.origin.x).toBeCloseTo(1071.7, 5)
    expect(layout!.origin.y).toBeCloseTo(177.4, 5)
    expect(layout!.rotationDeg).toBe(180)
    expect(layout!.pxPerMmX).toBeCloseTo(3444 / (1721.8 * 10), 10)
    expect(layout!.pxPerMmY).toBeCloseTo(2630 / (1315.0 * 10), 10)
  })

  it('rotation ≈ 0 → geen rotationDeg-veld', () => {
    const layout = previewUnderlayLayoutFromDrawing(
      { ...KINDERDIJK_DRAWING, rotation: 0 },
      { width: 1000, height: 800 },
    )
    expect(layout).not.toBeNull()
    expect(layout!.rotationDeg).toBeUndefined()
  })

  it('ongeldige width → null', () => {
    expect(
      previewUnderlayLayoutFromDrawing(
        { ...KINDERDIJK_DRAWING, width: 0 },
        { width: 100, height: 100 },
      ),
    ).toBeNull()
  })

  it('ongeldige image-px → null', () => {
    expect(
      previewUnderlayLayoutFromDrawing(KINDERDIJK_DRAWING, { width: 0, height: 100 }),
    ).toBeNull()
  })

  it('cloneUnderlayOriginLayout bewaart rotationDeg', () => {
    const layout = previewUnderlayLayoutFromDrawing(KINDERDIJK_DRAWING, {
      width: 100,
      height: 100,
    })!
    const cloned = cloneUnderlayOriginLayout(layout)
    expect(cloned.rotationDeg).toBe(180)
    expect(cloned.origin).toEqual(layout.origin)
    expect(cloned.origin).not.toBe(layout.origin)
  })
})

describe('buildUnderlayStageGeom', () => {
  it('rotation 0 ≡ top-left (geen offset/rotation)', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 10, y: 20 },
      widthStage: 200,
      heightStage: 100,
      rotationDeg: 0,
    })
    expect(geom).toEqual({
      x: 10,
      y: 20,
      width: 200,
      height: 100,
    })
  })

  it('rotation 180 → midden + offset + rotation', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 10, y: 20 },
      widthStage: 200,
      heightStage: 100,
      rotationDeg: 180,
    })
    expect(geom).toEqual({
      x: 110,
      y: 70,
      width: 200,
      height: 100,
      offsetX: 100,
      offsetY: 50,
      rotation: 180,
    })
  })
})
