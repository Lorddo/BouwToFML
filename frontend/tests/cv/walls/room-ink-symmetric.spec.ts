import { describe, expect, it } from 'vitest'
import {
  applySymmetricInkDiff,
  carveAddedInk,
  computeDiffPatchBounds,
  computeInkDiffMask,
} from '@/cv/walls/rooms/room-ink-symmetric'

describe('room-ink-symmetric', () => {
  it('carveAddedInk zet donkere muurpixels op label 0', () => {
    const labelsData = new Int32Array([1, 1, 1, 1, 1, 1])
    const wallInkData = Uint8Array.from([255, 255, 255, 0, 0, 255])
    const carved = carveAddedInk({ labelsData, wallInkData })
    expect(carved).toBe(2)
    expect(labelsData[3]).toBe(0)
    expect(labelsData[4]).toBe(0)
  })

  it('computeInkDiffMask + bounds markeren alleen gewijzigde zone', () => {
    const oldBw = Uint8Array.from([255, 255, 255, 255, 255, 255])
    const newBw = Uint8Array.from([255, 255, 0, 255, 255, 255])
    const mask = computeInkDiffMask(oldBw, newBw)
    expect(mask).toEqual(Uint8Array.from([0, 0, 1, 0, 0, 0]))
    const bounds = computeDiffPatchBounds({ diffMask: mask, width: 3, height: 2, marginPx: 0 })
    expect(bounds).toEqual({ x0: 2, y0: 0, x1: 2, y1: 0 })
  })

  it('fillRemovedInk merged labels zonder classificatie-mutatie', () => {
    const width = 3
    const height = 1
    const rawLabelsData = new Int32Array([1, 0, 2])
    const oldWallBwData = Uint8Array.from([255, 0, 255])
    const newWallBwData = Uint8Array.from([255, 255, 255])

    const updated = applySymmetricInkDiff({
      rawLabelsData,
      oldWallBwData,
      newWallBwData,
      width,
      height,
    })

    expect(updated.filledPx).toBe(1)
    expect(updated.rawLabelsData[1]).toBeGreaterThan(0)
    expect(updated.rawLabelsData[0]).toBe(updated.rawLabelsData[1])
    expect(updated.rawLabelsData[2]).toBe(updated.rawLabelsData[1])
  })
})
