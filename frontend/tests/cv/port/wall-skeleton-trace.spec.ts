import { describe, expect, it } from 'vitest'
import { compressPolylinePoints } from '@/cv/port/wallSkeletonTrace'

function horizontalRun(x0: number, x1: number, y: number): number[][] {
  const points: number[][] = []
  const step = x1 >= x0 ? 1 : -1
  for (let x = x0; x !== x1 + step; x += step) {
    points.push([x, y])
  }
  return points
}

describe('compressPolylinePoints', () => {
  it('vouwt rechte pixel-keten samen tot start+eind', () => {
    const run = horizontalRun(10, 110, 50)
    expect(compressPolylinePoints(run)).toEqual([
      [10, 50],
      [110, 50],
    ])
  })

  it('behoudt hoek op richtingswissel (L-vorm)', () => {
    const run = [...horizontalRun(0, 5, 0), ...[1, 2, 3, 4, 5].map((y) => [5, y])]
    expect(compressPolylinePoints(run)).toEqual([
      [0, 0],
      [5, 0],
      [5, 5],
    ])
  })

  it('behoudt meerdere hoeken op één polyline', () => {
    const run = [
      ...horizontalRun(0, 3, 0),
      ...[1, 2, 3].map((y) => [3, y]),
      ...horizontalRun(3, 6, 3),
      ...[4, 5, 6].map((y) => [6, y]),
    ]
    expect(compressPolylinePoints(run)).toEqual([
      [0, 0],
      [3, 0],
      [3, 3],
      [6, 3],
      [6, 6],
    ])
  })

  it('laat korte polyline ongemoeid', () => {
    expect(compressPolylinePoints([[1, 2], [4, 5]])).toEqual([
      [1, 2],
      [4, 5],
    ])
  })
})
