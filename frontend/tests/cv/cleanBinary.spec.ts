import { describe, expect, it, vi } from 'vitest'
import {
  applyNegative,
  fillHolesByMaxArea,
  smoothBinaryLines,
  thickenLines,
} from '@/cv/port/cleanBinary'

function makeMat(cols = 1000, rows = 1000, data?: Uint8Array) {
  return {
    cols,
    rows,
    data: data ?? new Uint8Array(cols * rows),
    delete: vi.fn(),
    ucharPtr: vi.fn((y: number, x: number) => {
      const offset = y * cols + x
      return { 0: (data ?? new Uint8Array(cols * rows))[offset] ?? 0 }
    }),
  }
}

describe('cleanBinary helpers', () => {
  it('applyNegative draait pixels om met bitwise_not', () => {
    const bitwiseNot = vi.fn()
    const cv = { bitwise_not: bitwiseNot }
    const mat = makeMat()

    applyNegative(cv as never, mat as never)
    expect(bitwiseNot).toHaveBeenCalledWith(mat, mat)
  })

  it('smoothBinaryLines doet directional close op wit zonder open', () => {
    const calls: string[] = []
    const kernelSizes: Array<{ w: number; h: number }> = []
    const copyTo = vi.fn()
    const cv = {
      MORPH_CLOSE: 3,
      MORPH_RECT: 1,
      bitwise_not: vi.fn(() => calls.push('not')),
      morphologyEx: vi.fn((_src, _dst, op) => {
        if (op === 3) calls.push('close')
      }),
      getStructuringElement: vi.fn((_shape, size) => {
        kernelSizes.push({ w: size.width, h: size.height })
        return { delete: vi.fn() }
      }),
      Size: class {
        constructor(
          public width: number,
          public height: number,
        ) {}
      },
      Mat: class {
        cols = 1000
        rows = 1000
        delete = vi.fn()
        copyTo = copyTo
        clone = vi.fn(function clone(this: InstanceType<typeof cv.Mat>) {
          return new cv.Mat()
        })
      },
    }
    const mat = new cv.Mat()

    smoothBinaryLines(cv as never, mat as never, 2)

    expect(calls.filter((c) => c === 'not')).toHaveLength(0)
    expect(calls.filter((c) => c === 'close')).toHaveLength(2)
    expect(kernelSizes).toEqual([
      { w: 4, h: 1 },
      { w: 1, h: 4 },
    ])
    expect(copyTo).toHaveBeenCalledWith(mat)
  })

  it('thickenLines groeit inkt directioneel per pixel', () => {
    const data = new Uint8Array(4 * 4)
    data[5] = 0
    const mat = makeMat(4, 4, data)

    thickenLines({} as never, mat as never, 1)

    expect(mat.data[6]).toBe(0)
  })

  it('fillHolesByMaxArea vult alleen kleine niet-rand gaten', () => {
    const rectangles: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
    const statsRows = [
      [0, 0, 1000, 1000, 900000],
      [0, 10, 5, 5, 8],
      [30, 30, 4, 4, 12],
      [60, 60, 20, 20, 100],
    ]
    const cv = {
      CC_STAT_LEFT: 0,
      CC_STAT_TOP: 1,
      CC_STAT_WIDTH: 2,
      CC_STAT_HEIGHT: 3,
      CC_STAT_AREA: 4,
      CV_32S: 0,
      FILLED: -1,
      connectedComponentsWithStats: vi.fn(() => 4),
      rectangle: vi.fn((_mat, p1, p2) => {
        rectangles.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
      }),
      Point: class {
        constructor(
          public x: number,
          public y: number,
        ) {}
      },
      Scalar: class {
        constructor(..._args: number[]) {}
      },
      Mat: class {
        cols = 1000
        rows = 1000
        delete = vi.fn()
      },
    }
    const labels = {
      ...makeMat(),
      intAt: (y: number, x: number) => (y === 30 && x === 30 ? 2 : 0),
    }
    const centroids = makeMat()
    const stats = {
      ...makeMat(),
      intAt: (row: number, col: number) => statsRows[row][col],
    }
    ;(cv.connectedComponentsWithStats as ReturnType<typeof vi.fn>).mockImplementation(
      (_src, outLabels, outStats, outCentroids) => {
        Object.assign(outLabels, labels)
        Object.assign(outStats, stats)
        Object.assign(outCentroids, centroids)
        return 4
      },
    )

    const mat = makeMat()
    const filled = fillHolesByMaxArea(cv as never, mat as never, 20)

    expect(filled).toBe(1)
    expect(rectangles).toHaveLength(0)
    expect(mat.ucharPtr).toHaveBeenCalled()
  })
})
