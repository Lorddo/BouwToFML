import { describe, expect, it } from 'vitest'
import {
  filterSegmentsNearInkBoundary,
  mergeCollinearBoundarySegments,
  segmentNearInkBoundary,
} from '@/cv/port/lineDetect'
import type { Segment } from '@/cv/port/wallGraph'

function seg(x0: number, y0: number, x1: number, y1: number): Segment {
  return { a: { x: x0, y: y0 }, b: { x: x1, y: y1 } }
}

function fillRect(data: Uint8Array, cols: number, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      data[y * cols + x] = 0
    }
  }
}

describe('mergeCollinearBoundarySegments', () => {
  it('voegt collineaire horizontale stukken met 1px gat samen', () => {
    const merged = mergeCollinearBoundarySegments([
      seg(10, 50, 40, 50),
      seg(41, 50, 80, 50),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual({ a: { x: 10, y: 50 }, b: { x: 80, y: 50 } })
  })

  it('bridged niet over 15px wit tussen twee horizontale lijnen', () => {
    const merged = mergeCollinearBoundarySegments([
      seg(10, 50, 40, 50),
      seg(55, 50, 90, 50),
    ])
    expect(merged).toHaveLength(2)
  })
})

describe('segmentNearInkBoundary', () => {
  it('accepteert lijn op muurrand en wijst lijn in wit af', () => {
    const cols = 80
    const rows = 80
    const data = new Uint8Array(cols * rows).fill(255)
    fillRect(data, cols, 20, 10, 34, 60)

    expect(segmentNearInkBoundary(data, cols, rows, seg(20, 10, 20, 60))).toBe(true)
    expect(segmentNearInkBoundary(data, cols, rows, seg(5, 40, 75, 40))).toBe(false)
  })
})

describe('filterSegmentsNearInkBoundary', () => {
  it('filtert verzonnen lijnen in leeg wit weg', () => {
    const cols = 80
    const rows = 80
    const data = new Uint8Array(cols * rows).fill(255)
    fillRect(data, cols, 10, 10, 20, 60)
    fillRect(data, cols, 40, 10, 50, 60)

    const filtered = filterSegmentsNearInkBoundary(cols, rows, data, [
      seg(10, 10, 10, 60),
      seg(15, 40, 35, 40),
    ])
    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toEqual(seg(10, 10, 10, 60))
  })
})
