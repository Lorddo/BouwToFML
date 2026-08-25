import { describe, expect, it } from 'vitest'
import {
  dimensionSlideAxis,
  hitTestDimensionAtCm,
  offsetDimensionForSlide,
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
