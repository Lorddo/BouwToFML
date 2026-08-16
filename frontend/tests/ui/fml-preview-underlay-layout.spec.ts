import { describe, expect, it } from 'vitest'
import { buildUnderlayStageGeom } from '@/ui/composables/fml-preview/fml-preview-underlay-layout'

describe('buildUnderlayStageGeom', () => {
  it('zonder rot/flip: top-left placement (byte-identiek pad)', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 10, y: 20 },
      widthStage: 100,
      heightStage: 80,
    })
    expect(geom).toEqual({ x: 10, y: 20, width: 100, height: 80 })
  })

  it('met rotation: center + offset + rotation', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 10, y: 20 },
      widthStage: 100,
      heightStage: 80,
      rotationDeg: 90,
    })
    expect(geom.x).toBe(60)
    expect(geom.y).toBe(60)
    expect(geom.offsetX).toBe(50)
    expect(geom.offsetY).toBe(40)
    expect(geom.rotation).toBe(90)
    expect(geom.scaleX).toBeUndefined()
  })

  it('met flipX: center + scaleX -1', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 0, y: 0 },
      widthStage: 200,
      heightStage: 100,
      flipX: true,
    })
    expect(geom.x).toBe(100)
    expect(geom.y).toBe(50)
    expect(geom.scaleX).toBe(-1)
    expect(geom.rotation).toBeUndefined()
  })

  it('flip + rotatie combineert', () => {
    const geom = buildUnderlayStageGeom({
      topLeftStage: { x: 0, y: 0 },
      widthStage: 40,
      heightStage: 20,
      rotationDeg: -90,
      flipX: true,
    })
    expect(geom.rotation).toBe(-90)
    expect(geom.scaleX).toBe(-1)
    expect(geom.offsetX).toBe(20)
    expect(geom.offsetY).toBe(10)
  })
})
