import { describe, expect, it } from 'vitest'
import {
  dimensionLengthCm,
  dimensionSlideAxis,
  hitTestDimensionAtCm,
  hitTestDimensionEndpointAtCm,
  MIN_DIMENSION_LENGTH_CM,
  moveDimensionEndpointAlongAxis,
  offsetDimensionForSlide,
  setDimensionLengthCentered,
  snapDimensionSlideToParallel,
} from '@/core/fml/offset-dimension-line'
import type { FloorDimension } from '@/core/fml/types'

function dim(id: string, ax: number, ay: number, bx: number, by: number): FloorDimension {
  return { id, type: 'custom_dimension', a: { x: ax, y: ay }, b: { x: bx, y: by } }
}

describe('offsetDimensionForSlide', () => {
  it('horizontale lijn schuift alleen in Y; lengte blijft', () => {
    const line = dim('h', 10, 50, 390, 50)
    expect(dimensionSlideAxis(line.a, line.b)).toBe('y')
    const next = offsetDimensionForSlide(line, { x: 80, y: -40 })
    expect(next.a).toEqual({ x: 10, y: 10 })
    expect(next.b).toEqual({ x: 390, y: 10 })
    expect(Math.hypot(next.b.x - next.a.x, next.b.y - next.a.y)).toBe(380)
  })

  it('verticale lijn schuift alleen in X; lengte blijft', () => {
    const line = dim('v', 0, 10, 0, 290)
    expect(dimensionSlideAxis(line.a, line.b)).toBe('x')
    const next = offsetDimensionForSlide(line, { x: -50, y: 120 })
    expect(next.a).toEqual({ x: -50, y: 10 })
    expect(next.b).toEqual({ x: -50, y: 290 })
    expect(Math.hypot(next.b.x - next.a.x, next.b.y - next.a.y)).toBe(280)
  })

  it('hit-test pakt de dichtstbijzijnde lijn binnen tolerantie', () => {
    const dims = [dim('h', 0, 0, 100, 0), dim('v', 40, 10, 40, 80)]
    expect(hitTestDimensionAtCm({ x: 50, y: 1 }, dims, 4)).toBe('h')
    expect(hitTestDimensionAtCm({ x: 41, y: 40 }, dims, 4)).toBe('v')
    expect(hitTestDimensionAtCm({ x: 80, y: 80 }, dims, 4)).toBeNull()
  })
})

describe('setDimensionLengthCentered', () => {
  it('groeit evenredig naar beide zijden (4,00 → 4,01 m)', () => {
    const line = dim('h', 0, 20, 400, 20)
    const next = setDimensionLengthCentered(line, 401)
    expect(dimensionLengthCm(next.a, next.b)).toBeCloseTo(401)
    expect(next.a.x).toBeCloseTo(-0.5)
    expect(next.b.x).toBeCloseTo(400.5)
    expect(next.a.y).toBe(20)
    expect(next.b.y).toBe(20)
  })

  it('krimpt evenredig naar het midden', () => {
    const line = dim('h', 0, 0, 400, 0)
    const next = setDimensionLengthCentered(line, 200)
    expect(next.a.x).toBeCloseTo(100)
    expect(next.b.x).toBeCloseTo(300)
  })
})

describe('moveDimensionEndpointAlongAxis', () => {
  it('verlengt alleen het gesleepte eind; de andere kant blijft', () => {
    const line = dim('h', 0, 10, 200, 10)
    const next = moveDimensionEndpointAlongAxis(line, 'b', { x: 401, y: 80 })
    expect(next.a).toEqual({ x: 0, y: 10 })
    expect(next.b.x).toBeCloseTo(401)
    expect(next.b.y).toBeCloseTo(10)
  })

  it('houdt minstens 1 cm over', () => {
    const line = dim('h', 0, 0, 200, 0)
    const next = moveDimensionEndpointAlongAxis(line, 'b', { x: 0.2, y: 0 })
    expect(dimensionLengthCm(next.a, next.b)).toBe(MIN_DIMENSION_LENGTH_CM)
  })
})

describe('hitTestDimensionEndpointAtCm', () => {
  it('pakt het dichtstbijzijnde eindpunt', () => {
    const dims = [dim('h', 0, 0, 100, 0)]
    expect(hitTestDimensionEndpointAtCm({ x: 1, y: 1 }, dims, 4)).toEqual({ id: 'h', end: 'a' })
    expect(hitTestDimensionEndpointAtCm({ x: 99, y: -1 }, dims, 4)).toEqual({ id: 'h', end: 'b' })
    expect(hitTestDimensionEndpointAtCm({ x: 50, y: 0 }, dims, 4)).toBeNull()
  })
})

describe('snapDimensionSlideToParallel', () => {
  it('snapt een horizontale slide op een evenwijdige maatlijn', () => {
    const line = dim('h', 0, 52, 200, 52)
    const others = [dim('other', 10, 50, 80, 50)]
    const next = snapDimensionSlideToParallel(line, others, 8)
    expect(next.a.y).toBe(50)
    expect(next.b.y).toBe(50)
    expect(next.a.x).toBe(0)
    expect(next.b.x).toBe(200)
  })

  it('negeert de lijn zelf', () => {
    const line = dim('h', 0, 52, 200, 52)
    const next = snapDimensionSlideToParallel(line, [line], 8, 'h')
    expect(next.a.y).toBe(52)
  })
})
