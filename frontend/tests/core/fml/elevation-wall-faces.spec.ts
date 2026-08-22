import { describe, expect, it } from 'vitest'
import {
  displayWidthFromRidgeElevationRect,
  elevationFaceXs,
  elevationRidgeIsEndOn,
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
