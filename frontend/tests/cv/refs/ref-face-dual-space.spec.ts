import { describe, expect, it } from 'vitest'
import {
  assignInkLabelsToWhiteFacesCrop,
  attachRefFaceDualFromWhiteLabels,
} from '@/cv/refs/ref-face-dual-space'
import { classifyFaceRoles, labelWhiteFaces } from '@/cv/refs/ref-face-profile'

describe('ref-face-dual-space', () => {
  it('ink geom is larger than white when ink borders the face', () => {
    // 5×5: center 3×1 white strip, ink above/below
    const width = 5
    const height = 5
    const bw = new Uint8Array(width * height).fill(0) // ink
    for (let x = 1; x <= 3; x += 1) {
      bw[2 * width + x] = 255 // white row
    }
    const white = labelWhiteFaces(bw, width, height)
    const roles = classifyFaceRoles(white.faces, width, height)
    const dual = attachRefFaceDualFromWhiteLabels({
      data: bw,
      width,
      height,
      labels: white.labels,
      faces: roles,
    })
    const label = roles[0].label
    const w = dual.geom(label, 'white')
    const i = dual.geom(label, 'ink')
    expect(w?.areaPx).toBe(3)
    expect(i?.areaPx).toBeGreaterThan(w!.areaPx)
    expect(i?.bbox.height).toBeGreaterThan(w!.bbox.height)
  })

  it('assignInkLabels hard-fails on size mismatch', () => {
    expect(() =>
      assignInkLabelsToWhiteFacesCrop({
        bwCrop: new Uint8Array(4),
        whiteLabels: new Int32Array(3),
        width: 2,
        height: 2,
      }),
    ).toThrow(/lengte/)
  })
})
