import { describe, expect, it } from 'vitest'
import { splitConnectedWallBlobs } from '@/cv/walls/rooms/room-wall-connected-blobs'

class FakeMat {
  cols: number
  rows: number
  data: Uint8Array

  constructor(rows: number, cols: number, data: Uint8Array) {
    this.rows = rows
    this.cols = cols
    this.data = data
  }

  intAt(y: number, x: number): number {
    return this.data[y * this.cols + x] ?? 0
  }

  delete() {}
}

function createFakeCv() {
  return {
    CV_8UC1: 0,
    CV_32S: 4,
    CC_STAT_AREA: 4,
    CC_STAT_LEFT: 0,
    CC_STAT_TOP: 1,
    CC_STAT_WIDTH: 2,
    CC_STAT_HEIGHT: 3,
    Mat: FakeMat,
    matFromArray: (rows: number, cols: number, _type: number, data: ArrayLike<number>) =>
      new FakeMat(rows, cols, Uint8Array.from(data)),
    connectedComponentsWithStats: (
      mask: FakeMat,
      labels: FakeMat,
      stats: FakeMat,
      _centroids: FakeMat,
      _connectivity: number,
      _type: number,
    ) => {
      const components: Array<{ id: number; pixels: Array<[number, number]> }> = []
      const visited = new Set<number>()
      const index = (x: number, y: number) => y * mask.cols + x

      for (let y = 0; y < mask.rows; y += 1) {
        for (let x = 0; x < mask.cols; x += 1) {
          const start = index(x, y)
          if ((mask.data[start] ?? 0) < 128 || visited.has(start)) continue
          const pixels: Array<[number, number]> = []
          const stack: Array<[number, number]> = [[x, y]]
          while (stack.length > 0) {
            const [cx, cy] = stack.pop()!
            const idx = index(cx, cy)
            if (cx < 0 || cy < 0 || cx >= mask.cols || cy >= mask.rows) continue
            if (visited.has(idx) || (mask.data[idx] ?? 0) < 128) continue
            visited.add(idx)
            pixels.push([cx, cy])
            stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
          }
          components.push({ id: components.length + 1, pixels })
        }
      }

      labels.rows = mask.rows
      labels.cols = mask.cols
      labels.data = new Int32Array(mask.rows * mask.cols)
      stats.rows = components.length + 1
      stats.cols = 5
      stats.data = new Int32Array(stats.rows * stats.cols)

      for (const component of components) {
        let minX = mask.cols
        let minY = mask.rows
        let maxX = 0
        let maxY = 0
        for (const [px, py] of component.pixels) {
          labels.data[py * mask.cols + px] = component.id
          minX = Math.min(minX, px)
          minY = Math.min(minY, py)
          maxX = Math.max(maxX, px)
          maxY = Math.max(maxY, py)
        }
        const row = component.id
        stats.data[row * stats.cols + 0] = minX
        stats.data[row * stats.cols + 1] = minY
        stats.data[row * stats.cols + 2] = maxX - minX + 1
        stats.data[row * stats.cols + 3] = maxY - minY + 1
        stats.data[row * stats.cols + 4] = component.pixels.length
      }

      return components.length + 1
    },
  }
}

describe('splitConnectedWallBlobs', () => {
  it('keepLargestOnly: één blob + mask voor skeleton en export', () => {
    const width = 20
    const height = 10
    const closedData = new Uint8Array(width * height)
    // Groot blok links
    for (let y = 2; y < 8; y += 1) {
      for (let x = 2; x < 12; x += 1) closedData[y * width + x] = 255
    }
    // Klein blok rechts
    for (let y = 4; y < 6; y += 1) {
      for (let x = 15; x < 18; x += 1) closedData[y * width + x] = 255
    }

    const cv = createFakeCv()
    const closedMask = new FakeMat(height, width, closedData)
    const result = splitConnectedWallBlobs({
      cv: cv as never,
      closedMask: closedMask as never,
      imageWidth: width,
      imageHeight: height,
      keepLargestOnly: true,
    })

    expect(result.componentCount).toBe(2)
    expect(result.blobs).toHaveLength(1)
    expect(result.removedBlobCount).toBe(1)

    const keptInk = result.keptWallMaskData.reduce((sum, v) => sum + (v > 0 ? 1 : 0), 0)
    expect(keptInk).toBeGreaterThan(0)
    expect(result.blobs[0]?.areaPx).toBeGreaterThan(10)

    result.filteredMask.delete()
    for (const blob of result.blobs) blob.maskMat.delete()
  })

  it('keepLargestOnly: kiest globale grootste ook als minBlobAreaPx kleinere blobs zou filteren', () => {
    const width = 30
    const height = 10
    const closedData = new Uint8Array(width * height)
    for (let y = 2; y < 8; y += 1) {
      for (let x = 2; x < 22; x += 1) closedData[y * width + x] = 255
    }
    for (let y = 4; y < 6; y += 1) {
      for (let x = 24; x < 28; x += 1) closedData[y * width + x] = 255
    }

    const cv = createFakeCv()
    const closedMask = new FakeMat(height, width, closedData)
    const result = splitConnectedWallBlobs({
      cv: cv as never,
      closedMask: closedMask as never,
      imageWidth: width,
      imageHeight: height,
      keepLargestOnly: true,
      minBlobAreaPx: 20,
    })

    expect(result.blobs).toHaveLength(1)
    expect(result.blobs[0]?.areaPx).toBeGreaterThan(50)

    result.filteredMask.delete()
    for (const blob of result.blobs) blob.maskMat.delete()
  })
})
