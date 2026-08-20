import { describe, expect, it } from 'vitest'
import {
  cloneUnderlayOriginLayout,
  drawingFromImageScale,
  previewUnderlayLayoutFromDrawing,
  provisionalDrawingFromImage,
  resolveUnderlayPxPerMmFromRulers,
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
  it('rotation 0: linker-as + center (visueel top-left)', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 10, y: 20 },
      widthStage: 200,
      heightStage: 100,
      rotationDeg: 0,
    })
    expect(geom.flip).toEqual({ x: 10, y: 70, scaleX: 1 })
    expect(geom.rotate).toEqual({ x: 100, y: 0, rotation: 0 })
    expect(geom.image).toEqual({ x: -100, y: -50, width: 200, height: 100 })
  })

  it('rotation 180 → rotatie om het center, spiegel-as blijft links', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 10, y: 20 },
      widthStage: 200,
      heightStage: 100,
      rotationDeg: 180,
    })
    expect(geom.flip.x).toBe(10)
    expect(geom.rotate.rotation).toBe(180)
    expect(geom.rotate.x).toBe(100)
  })
})

describe('drawingFromImageScale', () => {
  it('roundtrip met origin 0 → layout origin 0', () => {
    const drawing = drawingFromImageScale({
      imageWidthPx: 2000,
      imageHeightPx: 1000,
      pxPerMmX: 2,
      pxPerMmY: 2,
      origin: { x: 0, y: 0 },
      url: 'data:image/png;base64,xx',
    })
    expect(drawing).not.toBeNull()
    expect(drawing!.width).toBeCloseTo(100)
    expect(drawing!.height).toBeCloseTo(50)
    expect(drawing!.x).toBeCloseTo(50)
    expect(drawing!.y).toBeCloseTo(25)
    const layout = previewUnderlayLayoutFromDrawing(drawing!, { width: 2000, height: 1000 })
    expect(layout!.origin.x).toBeCloseTo(0)
    expect(layout!.origin.y).toBeCloseTo(0)
    expect(layout!.pxPerMmX).toBeCloseTo(2)
    expect(layout!.pxPerMmY).toBeCloseTo(2)
  })

  it('bewaart origin bij stretch (geen muur-rescale)', () => {
    const drawing = drawingFromImageScale({
      imageWidthPx: 4000,
      imageHeightPx: 2000,
      pxPerMmX: 1,
      pxPerMmY: 1,
      origin: { x: 30, y: 10 },
    })
    expect(drawing).not.toBeNull()
    const layout = previewUnderlayLayoutFromDrawing(drawing!, { width: 4000, height: 2000 })
    expect(layout!.origin.x).toBeCloseTo(30)
    expect(layout!.origin.y).toBeCloseTo(10)
  })
})

describe('resolveUnderlayPxPerMmFromRulers', () => {
  it('liniaal 100 cm bij 2 px/mm + echte 2000 mm → 1 px/mm', () => {
    const next = resolveUnderlayPxPerMmFromRulers({
      measuredCmX: 100,
      measuredCmY: 50,
      currentPxPerMmX: 2,
      currentPxPerMmY: 2,
      trueMmX: 2000,
      trueMmY: 1000,
    })
    expect(next).toEqual({ pxPerMmX: 1, pxPerMmY: 1 })
  })

  it('weigerte te korte px-span', () => {
    expect(
      resolveUnderlayPxPerMmFromRulers({
        measuredCmX: 0.1,
        measuredCmY: 10,
        currentPxPerMmX: 1,
        currentPxPerMmY: 1,
        trueMmX: 1000,
        trueMmY: 1000,
      }),
    ).toBeNull()
  })
})

describe('provisionalDrawingFromImage', () => {
  it('35% span = 3000 mm', () => {
    const drawing = provisionalDrawingFromImage({ width: 4000, height: 2000 })
    expect(drawing).not.toBeNull()
    const layout = previewUnderlayLayoutFromDrawing(drawing!, { width: 4000, height: 2000 })
    expect(layout!.pxPerMmX).toBeCloseTo((4000 * 0.35) / 3000)
    expect(layout!.pxPerMmY).toBeCloseTo((2000 * 0.35) / 3000)
  })
})
