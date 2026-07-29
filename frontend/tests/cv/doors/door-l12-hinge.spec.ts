import { describe, expect, it, vi } from 'vitest'
import {
  closeClusterSwingMaskGaps,
  countUniqueSwingFaceIds,
  orientSwingMaskToBottom,
  roundtripStraightenedPoint,
  rotateSwingMaskExpand,
  trimMaskToContent,
  wallAlignUiDegrees,
  type L12HingeStraightenMeta,
} from '@/cv/doors/door-l12-hinge'

function makeCloseCv(kernelCapture: number[]) {
  let morphCall = 0
  const cv = {
    CV_8UC1: 0,
    MORPH_CLOSE: 3,
    MORPH_RECT: 0,
    Size: class {
      constructor(
        public width: number,
        public height: number,
      ) {}
    },
    getStructuringElement: vi.fn((_shape: number, size: { width: number; height: number }) => {
      kernelCapture.push(size.width === 1 ? size.height : size.width)
      return { delete: vi.fn() }
    }),
    morphologyEx: vi.fn(
      (
        src: { data: Uint8Array; cols: number; rows: number },
        dst: { data: Uint8Array; cols: number; rows: number },
      ) => {
        morphCall += 1
        // directionalClose: eerst H-kernel, dan V-kernel (beide structs al gemaakt).
        const k = kernelCapture[Math.min(morphCall, kernelCapture.length) - 1] ?? 5
        const radius = Math.max(1, Math.floor(k / 2))
        const out = new Uint8Array(src.cols * src.rows)
        const isHorizontal = morphCall === 1
        for (let y = 0; y < src.rows; y += 1) {
          for (let x = 0; x < src.cols; x += 1) {
            const i = y * src.cols + x
            if ((src.data[i] ?? 0) >= 128) {
              out[i] = 255
              continue
            }
            let a = false
            let b = false
            for (let d = 1; d <= radius; d += 1) {
              if (isHorizontal) {
                if (x - d >= 0 && (src.data[i - d] ?? 0) >= 128) a = true
                if (x + d < src.cols && (src.data[i + d] ?? 0) >= 128) b = true
              } else {
                if (y - d >= 0 && (src.data[(y - d) * src.cols + x] ?? 0) >= 128) a = true
                if (y + d < src.rows && (src.data[(y + d) * src.cols + x] ?? 0) >= 128) b = true
              }
            }
            out[i] = a && b ? 255 : 0
          }
        }
        dst.data = out
        dst.cols = src.cols
        dst.rows = src.rows
      },
    ),
    Mat: class {
      data: Uint8Array
      cols: number
      rows: number
      delete = vi.fn()
      constructor(rows?: number, cols?: number, _type?: number) {
        this.rows = rows ?? 0
        this.cols = cols ?? 0
        this.data = new Uint8Array(Math.max(0, this.rows * this.cols))
      }
    },
  }
  return cv
}

describe('door-l12-hinge straighten', () => {
  it('wallAlignUiDegrees: +X wall → 0°', () => {
    expect(wallAlignUiDegrees({ x: 1, y: 0 })).toBeCloseTo(0, 5)
  })

  it('wallAlignUiDegrees: +Y wall → −90° UI (wall → +X)', () => {
    expect(wallAlignUiDegrees({ x: 0, y: 1 })).toBeCloseTo(-90, 5)
  })

  it('orientSwingMaskToBottom: roteert 180 als massa bovenaan zit', () => {
    const w = 20
    const h = 40
    const mask = new Uint8Array(w * h)
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < w; x += 1) mask[y * w + x] = 255
    }
    const oriented = orientSwingMaskToBottom(mask, w, h)
    expect(oriented.rotated180).toBe(true)
    let bottom = 0
    for (let y = Math.floor(h * 0.55); y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if ((oriented.data[y * w + x] ?? 0) >= 128) bottom += 1
      }
    }
    expect(bottom).toBeGreaterThan(100)
  })

  it('trimMaskToContent: snijdt lege cluster-ruimte weg', () => {
    const w = 28
    const h = 100
    const mask = new Uint8Array(w * h)
    // Swing alleen onderin (zoals peeled face in oude cluster-bbox).
    for (let y = 22; y < 100; y += 1) {
      for (let x = 4; x < 23; x += 1) mask[y * w + x] = 255
    }
    const trimmed = trimMaskToContent({
      maskData: mask,
      width: w,
      height: h,
      offsetX: 839,
      offsetY: 880,
    })
    expect(trimmed).not.toBeNull()
    expect(trimmed!.width).toBe(19)
    expect(trimmed!.height).toBe(78)
    expect(trimmed!.offsetX).toBe(843)
    expect(trimmed!.offsetY).toBe(902)
  })

  it('roundtripStraightenedPoint: ortho 0° + geen 180 ≈ identity', () => {
    const meta: L12HingeStraightenMeta = {
      wallAlignUiDeg: 0,
      expandedWidth: 40,
      expandedHeight: 30,
      offsetX: 0,
      offsetY: 0,
      centerX: 20,
      centerY: 15,
      rotated180: false,
      offsetFloorX: 100,
      offsetFloorY: 200,
    }
    const local = { x: 12.5, y: 8.25 }
    const back = roundtripStraightenedPoint(local, meta)
    expect(back.x).toBeCloseTo(local.x, 5)
    expect(back.y).toBeCloseTo(local.y, 5)
  })

  it('roundtripStraightenedPoint: 90° wall-align behoudt punt', () => {
    const srcW = 40
    const srcH = 30
    const uiDeg = -90
    const rotated = rotateSwingMaskExpand(new Uint8Array(srcW * srcH), srcW, srcH, uiDeg)
    const meta: L12HingeStraightenMeta = {
      wallAlignUiDeg: uiDeg,
      expandedWidth: rotated.width,
      expandedHeight: rotated.height,
      offsetX: rotated.offsetX,
      offsetY: rotated.offsetY,
      centerX: srcW / 2,
      centerY: srcH / 2,
      rotated180: false,
      offsetFloorX: 0,
      offsetFloorY: 0,
    }
    const local = { x: 10, y: 5 }
    const back = roundtripStraightenedPoint(local, meta)
    expect(back.x).toBeCloseTo(local.x, 0)
    expect(back.y).toBeCloseTo(local.y, 0)
  })
})

describe('door-l12-hinge cluster close', () => {
  it('countUniqueSwingFaceIds negeert ≤0', () => {
    expect(countUniqueSwingFaceIds([3, 3, 7, 0, -1])).toBe(2)
  })

  it('closeClusterSwingMaskGaps vult verticale 2px-gap tussen stroken', () => {
    const w = 20
    const h = 30
    const mask = new Uint8Array(w * h)
    // Bovenstrook y=2..8, onderstrook y=11..17 — gap y=9,10 (2px).
    for (let y = 2; y <= 8; y += 1) {
      for (let x = 2; x < 18; x += 1) mask[y * w + x] = 255
    }
    for (let y = 11; y <= 17; y += 1) {
      for (let x = 2; x < 18; x += 1) mask[y * w + x] = 255
    }
    expect(mask[9 * w + 10]).toBe(0)
    expect(mask[10 * w + 10]).toBe(0)

    const kernels: number[] = []
    const cv = makeCloseCv(kernels)
    const closed = closeClusterSwingMaskGaps({
      cv: cv as never,
      maskData: mask,
      width: w,
      height: h,
      offsetX: 100,
      offsetY: 200,
      kernelPx: 5,
    })

    // Gap moet dicht zijn (V-close). Offsets kunnen trimmen; map floor→local.
    const localY9 = 9 - (closed.offsetY - 200)
    const localY10 = 10 - (closed.offsetY - 200)
    const localX = 10 - (closed.offsetX - 100)
    expect(closed.maskData[localY9 * closed.width + localX]).toBe(255)
    expect(closed.maskData[localY10 * closed.width + localX]).toBe(255)
    expect(kernels.length).toBeGreaterThanOrEqual(2)
  })
})
