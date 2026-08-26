import { describe, expect, it } from 'vitest'
import { compressPolylinePoints, downsampleBinaryMaskNearest } from '@/cv/port/wallSkeletonTrace'

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
    expect(
      compressPolylinePoints([
        [1, 2],
        [4, 5],
      ]),
    ).toEqual([
      [1, 2],
      [4, 5],
    ])
  })
})

describe('downsampleBinaryMaskNearest', () => {
  it('houdt kleine mask 1:1', () => {
    const mask = new Uint8Array([0, 255, 255, 0])
    const out = downsampleBinaryMaskNearest({ mask, width: 2, height: 2, maxEdgePx: 8 })
    expect(out.scale).toBe(1)
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    expect([...out.binary]).toEqual([0, 1, 1, 0])
  })

  it('schaalt grote mask naar max-edge', () => {
    const width = 8
    const height = 4
    const mask = new Uint8Array(width * height).fill(255)
    const out = downsampleBinaryMaskNearest({ mask, width, height, maxEdgePx: 4 })
    expect(out.scale).toBe(0.5)
    expect(out.width).toBe(4)
    expect(out.height).toBe(2)
    expect(out.binary.every((v) => v === 1)).toBe(true)
  })
})
