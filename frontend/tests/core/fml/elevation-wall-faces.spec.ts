import { describe, expect, it } from 'vitest'
import {
  displayWidthFromRidgeElevationRect,
  elevationFaceXs,
  elevationOwnThicknessFaceXs,
  elevationRidgeIsEndOn,
  elevationWallProjectedXs,
  resolveElevationWallEndFaces,
  ridgeElevationFaceXs,
} from '@/core/fml/elevation-wall-faces'
import type { Wall } from '@/core/fml/types'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  thickness = 20,
  balance?: number,
): Wall {
  return { id, a, b, thickness, ...(balance != null ? { balance } : {}), openings: [] }
}

describe('resolveElevationWallEndFaces', () => {
  it('vrij einde: buiten = halve dikte, binnen = hartlijn', () => {
    const front = wall('front', { x: 0, y: 0 }, { x: 400, y: 0 })
    const faces = resolveElevationWallEndFaces(front, [front])
    expect(faces.outerA).toBeCloseTo(10, 5)
    expect(faces.outerB).toBeCloseTo(10, 5)
    expect(faces.innerA).toBe(0)
    expect(faces.innerB).toBe(0)
  })

  it('hoek met return: buiten én binnen = halve burendikte', () => {
    const front = wall('front', { x: 0, y: 0 }, { x: 400, y: 0 })
    const ret = wall('return', { x: 400, y: 0 }, { x: 400, y: 200 })
    const faces = resolveElevationWallEndFaces(front, [front, ret])
    expect(faces.outerA).toBeCloseTo(10, 5)
    expect(faces.innerA).toBe(0)
    expect(faces.outerB).toBeCloseTo(10, 5)
    expect(faces.innerB).toBeCloseTo(10, 5)
  })

  it('flush-return naar binnen: buiten blijft op de knoop, binnen = volle dikte', () => {
    const front = wall('front', { x: 0, y: 0 }, { x: 400, y: 0 })
    const ret = wall('return', { x: 400, y: 0 }, { x: 400, y: 200 }, 20, 0)
    const faces = resolveElevationWallEndFaces(front, [front, ret])
    expect(faces.outerB).toBeCloseTo(0, 5)
    expect(faces.innerB).toBeCloseTo(20, 5)
  })
})

describe('elevationFaceXs', () => {
  it('legt buiten links/rechts voorbij de hartlijn', () => {
    const xs = elevationFaceXs(0, 400, { outerA: 10, outerB: 10, innerA: 0, innerB: 10 })
    expect(xs.xOuterA).toBeCloseTo(-10, 5)
    expect(xs.xOuterB).toBeCloseTo(410, 5)
    expect(xs.xInnerA).toBeCloseTo(0, 5)
    expect(xs.xInnerB).toBeCloseTo(390, 5)
  })
})

describe('ridgeElevationFaceXs', () => {
  it('kopgevel: displayWidth gecentreerd, niet eenzijdig +1', () => {
    const xs = ridgeElevationFaceXs(200, 200, 200, 10)
    expect(xs.xOuterA).toBeCloseTo(195, 5)
    expect(xs.xOuterB).toBeCloseTo(205, 5)
    expect(xs.xInnerA).toBeCloseTo(195, 5)
    expect(xs.xInnerB).toBeCloseTo(205, 5)
  })

  it('langs de gevel: projectielengte, geen extra dikte in X', () => {
    const xs = ridgeElevationFaceXs(50, 350, 300, 10)
    expect(xs.xOuterA).toBeCloseTo(50, 5)
    expect(xs.xOuterB).toBeCloseTo(350, 5)
  })

  it('licht scheve as: projectie + dwarsdikte, niet max(projectie, dikte)', () => {
    const xs = ridgeElevationFaceXs(200, 220, 200, 10)
    expect(xs.xOuterB - xs.xOuterA).toBeCloseTo(20 + 10 * Math.sqrt(1 - (20 / 200) ** 2), 5)
    expect(xs.xOuterB - xs.xOuterA).toBeLessThan(40)
  })

  it('herkent kopse vs lange nok', () => {
    expect(elevationRidgeIsEndOn(200, 200, 200)).toBe(true)
    expect(elevationRidgeIsEndOn(50, 350, 300)).toBe(false)
  })

  it('displayWidth inverse van kopse silhouet', () => {
    const xs = ridgeElevationFaceXs(200, 200, 200, 16)
    expect(displayWidthFromRidgeElevationRect(xs.xOuterB - xs.xOuterA, 200, 200, 200)).toBe(16)
  })
})

describe('elevationOwnThicknessFaceXs', () => {
  const elevY: { x: number; y: number } = { x: 0, y: 1 }

  it('end-on 0.5: dikte gecentreerd op de as', () => {
    const front = wall('front', { x: 0, y: 0 }, { x: 400, y: 0 }, 20, 0.5)
    const xs = elevationOwnThicknessFaceXs(0, 0, front, elevY)
    expect(Math.abs(xs.xOuterB - xs.xOuterA)).toBeCloseTo(20, 5)
    expect((xs.xOuterA + xs.xOuterB) / 2).toBeCloseTo(0, 5)
  })

  it('end-on flush (balance 0): as op één face, dikte naar de andere kant', () => {
    const front = wall('front', { x: 0, y: 0 }, { x: 400, y: 0 }, 20, 0)
    const xs = elevationOwnThicknessFaceXs(0, 0, front, elevY)
    const lo = Math.min(xs.xOuterA, xs.xOuterB)
    const hi = Math.max(xs.xOuterA, xs.xOuterB)
    expect(hi - lo).toBeCloseTo(20, 5)
    expect(Math.min(Math.abs(lo), Math.abs(hi))).toBeCloseTo(0, 5)
    expect(Math.max(Math.abs(lo), Math.abs(hi))).toBeCloseTo(20, 5)
  })

  it('face-on: geen extra X uit eigen dikte', () => {
    const front = wall('front', { x: 0, y: 0 }, { x: 400, y: 0 }, 20, 0)
    const xs = elevationOwnThicknessFaceXs(0, 400, front, { x: 1, y: 0 })
    expect(xs.xOuterA).toBeCloseTo(0, 5)
    expect(xs.xOuterB).toBeCloseTo(400, 5)
  })
})

describe('elevationWallProjectedXs', () => {
  it('face-on houdt knoop-oren', () => {
    const front = wall('front', { x: 0, y: 0 }, { x: 400, y: 0 })
    const ret = wall('return', { x: 400, y: 0 }, { x: 400, y: 200 })
    const xs = elevationWallProjectedXs(0, 400, 1, front, { x: 1, y: 0 }, [front, ret])
    expect(xs.xOuterA).toBeCloseTo(-10, 5)
    expect(xs.xOuterB).toBeCloseTo(410, 5)
    expect(xs.xInnerB).toBeCloseTo(390, 5)
  })

  it('end-on gebruikt eigen balance, niet buurdikte als X-breedte', () => {
    const front = wall('front', { x: 0, y: 0 }, { x: 400, y: 0 }, 20, 0)
    const ret = wall('return', { x: 400, y: 0 }, { x: 400, y: 200 }, 20, 0.5)
    const xs = elevationWallProjectedXs(0, 0, 0, front, { x: 0, y: 1 }, [front, ret])
    const width = Math.abs(xs.xOuterB - xs.xOuterA)
    expect(width).toBeCloseTo(20, 5)
    const lo = Math.min(xs.xOuterA, xs.xOuterB)
    const hi = Math.max(xs.xOuterA, xs.xOuterB)
    expect(Math.min(Math.abs(lo), Math.abs(hi))).toBeCloseTo(0, 5)
  })
})
