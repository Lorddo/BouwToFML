/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { bwBytesToCanvas, WALL_BW_INK, WALL_BW_WHITE } from '@/cv/preprocess/compose-wall-bw'
import { cropBwBytesFromRect } from '@/cv/refs/ref-crop-bw'
import { classifyWallRefStyleFromBw } from '@/cv/refs/classify-wall-ref-style'

describe('cropBwBytesFromRect / classifyWallRefStyleFromBw', () => {
  it('cropt gray bytes uit full-image B/W', () => {
    const width = 4
    const height = 4
    const bw = new Uint8Array(width * height).fill(WALL_BW_WHITE)
    bw[1 * width + 1] = WALL_BW_INK
    bw[1 * width + 2] = WALL_BW_INK
    bw[2 * width + 1] = WALL_BW_INK
    bw[2 * width + 2] = WALL_BW_INK
    const crop = cropBwBytesFromRect({
      bw,
      width,
      height,
      rect: { id: 'r', x: 1, y: 1, width: 2, height: 2 },
    })
    expect(crop.width).toBe(2)
    expect(crop.height).toBe(2)
    expect(Array.from(crop.data)).toEqual([WALL_BW_INK, WALL_BW_INK, WALL_BW_INK, WALL_BW_INK])
  })

  it('style solid bij één face (border-seal)', () => {
    const width = 20
    const height = 12
    const bw = new Uint8Array(width * height).fill(WALL_BW_WHITE)
    // Horizontale inktband — één aaneengesloten ink-blob.
    for (let y = 4; y < 8; y += 1) {
      for (let x = 2; x < 18; x += 1) {
        bw[y * width + x] = WALL_BW_INK
      }
    }
    const style = classifyWallRefStyleFromBw({
      bw,
      width,
      height,
      rect: { id: 'wall', x: 0, y: 0, width, height },
    })
    expect(style.faceCount).toBeGreaterThanOrEqual(1)
    expect(style.renderStyle === 'solid' || style.renderStyle === 'details').toBe(true)
  })

  it('bwBytesToCanvas schrijft R=G=B', () => {
    const data = new Uint8Array([0, 128, 255])
    const canvas = bwBytesToCanvas(data, 3, 1) as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    expect(ctx).toBeTruthy()
    const rgba = ctx!.getImageData(0, 0, 3, 1).data
    expect([rgba[0], rgba[1], rgba[2], rgba[3]]).toEqual([0, 0, 0, 255])
    expect([rgba[4], rgba[5], rgba[6], rgba[7]]).toEqual([128, 128, 128, 255])
    expect([rgba[8], rgba[9], rgba[10], rgba[11]]).toEqual([255, 255, 255, 255])
  })
})
