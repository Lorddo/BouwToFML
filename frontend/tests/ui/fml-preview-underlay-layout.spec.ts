import { describe, expect, it } from 'vitest'
import {
  buildUnderlayStageGeom,
  underlayContentBoundsCm,
} from '@/ui/composables/fml-preview/fml-preview-underlay-layout'

describe('buildUnderlayStageGeom', () => {
  it('zonder rot/flip: linker-as + center-rotatie (visueel top-left)', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 10, y: 20 },
      widthStage: 100,
      heightStage: 80,
    })
    expect(geom.flip).toEqual({ x: 10, y: 60, scaleX: 1 })
    expect(geom.rotate).toEqual({ x: 50, y: 0, rotation: 0 })
    expect(geom.image).toEqual({ x: -50, y: -40, width: 100, height: 80 })
  })

  it('met rotation: zelfde center, rotatie op binnenste groep', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 10, y: 20 },
      widthStage: 100,
      heightStage: 80,
      rotationDeg: 90,
    })
    expect(geom.flip.scaleX).toBe(1)
    expect(geom.rotate.rotation).toBe(90)
    expect(geom.rotate.x).toBe(50)
    expect(geom.image.x).toBe(-50)
    expect(geom.image.y).toBe(-40)
  })

  it('met flipX: scaleX -1 over de linker rand', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 0, y: 0 },
      widthStage: 200,
      heightStage: 100,
      flipX: true,
    })
    expect(geom.flip).toEqual({ x: 0, y: 50, scaleX: -1 })
    expect(geom.rotate.rotation).toBe(0)
  })

  it('flip + rotatie: rotatie blijft op het center', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 0, y: 0 },
      widthStage: 40,
      heightStage: 20,
      rotationDeg: -90,
      flipX: true,
    })
    expect(geom.rotate.rotation).toBe(-90)
    expect(geom.flip.scaleX).toBe(-1)
    expect(geom.rotate.x).toBe(20)
  })
})

describe('underlayContentBoundsCm', () => {
  it('origin 0 + 2 px/mm → cm-bbox van de plaat', () => {
    const bounds = underlayContentBoundsCm({
      cmOrigin: { x: 0, y: 0 },
      underlayWidthPx: 2000,
      underlayHeightPx: 1000,
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    expect(bounds).toEqual({ minX: 0, minY: 0, spanX: 100, spanY: 50 })
  })

  it('90° rotatie wisselt span om het center', () => {
    const bounds = underlayContentBoundsCm({
      cmOrigin: { x: 0, y: 0 },
      underlayWidthPx: 2000,
      underlayHeightPx: 1000,
      pxPerMmX: 2,
      pxPerMmY: 2,
      rotationDeg: 90,
    })
    expect(bounds).not.toBeNull()
    expect(bounds!.spanX).toBeCloseTo(50)
    expect(bounds!.spanY).toBeCloseTo(100)
    expect(bounds!.minX).toBeCloseTo(25)
    expect(bounds!.minY).toBeCloseTo(-25)
  })

  it('flipX over de linkerrand schuift de bbox naar −X', () => {
    const bounds = underlayContentBoundsCm({
      cmOrigin: { x: 0, y: 0 },
      underlayWidthPx: 2000,
      underlayHeightPx: 1000,
      pxPerMmX: 2,
      pxPerMmY: 2,
      flipX: true,
    })
    expect(bounds).toEqual({ minX: -100, minY: 0, spanX: 100, spanY: 50 })
  })
})
