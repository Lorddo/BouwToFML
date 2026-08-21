import { describe, expect, it } from 'vitest'
import {
  imagePxToScantCm,
  resolveBakeNulpuntImageCm,
  resolveStampInjectOffsetCm,
  translatePointByOffset,
} from '@/core/fml/stamp-nulpunt'

describe('stamp-nulpunt', () => {
  it('imagePxToScantCm deelt door pxPerMm*10', () => {
    expect(imagePxToScantCm({ x: 100, y: 200 }, 1, 1)).toEqual({ x: 10, y: 20 })
    expect(imagePxToScantCm({ x: 50, y: 100 }, 2, 1)).toEqual({ x: 2.5, y: 10 })
  })

  it('resolveBakeNulpuntImageCm: translate-only verschuift FML (0,0)', () => {
    const baseBounds = { x: 0, y: 0, width: 100, height: 100 }
    const bounds = { x: 40, y: 60, width: 100, height: 100 }
    const nulpunt = resolveBakeNulpuntImageCm({
      originCm: { x: 0, y: 0 },
      baseBounds,
      bounds,
      pxPerMmX: 1,
      pxPerMmY: 1,
    })
    // FML 0,0 → px 0,0 → live 40,60 → cm 4,6
    expect(nulpunt.x).toBeCloseTo(4)
    expect(nulpunt.y).toBeCloseTo(6)
  })

  it('resolveStampInjectOffsetCm: bake − current', () => {
    expect(resolveStampInjectOffsetCm({ x: 10, y: 20 }, { x: 10, y: 20 })).toEqual({ x: 0, y: 0 })
    expect(resolveStampInjectOffsetCm({ x: 10, y: 20 }, { x: 12, y: 18 })).toEqual({ x: -2, y: 2 })
  })

  it('translatePointByOffset', () => {
    expect(translatePointByOffset({ x: 1, y: 2 }, { x: 3, y: -1 })).toEqual({ x: 4, y: 1 })
  })
})
