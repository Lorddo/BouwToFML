import { describe, expect, it } from 'vitest'
import { refineWallClassificationByKeptMask } from '@/cv/walls/rooms/room-ink-classify'

describe('refineWallClassificationByKeptMask', () => {
  it('degradeert wall-roots zonder overlap met kept mask naar unknown', () => {
    const labelsData = new Int32Array([1, 1, 2, 2, 1, 1, 2, 2])
    const parentMap = new Map<number, number>([
      [1, 1],
      [2, 2],
    ])
    const classificationByLabel = new Map<number, 'wall' | 'surface' | 'unknown' | 'outside'>([
      [1, 'wall'],
      [2, 'wall'],
    ])
    const keptWallMask = new Uint8Array([255, 255, 0, 0, 255, 255, 0, 0])

    const refined = refineWallClassificationByKeptMask({
      classificationByLabel,
      labelsData,
      parentMap,
      keptWallMask,
    })

    expect(refined.classificationByLabel.get(1)).toBe('wall')
    expect(refined.classificationByLabel.get(2)).toBe('unknown')
    expect(refined.wallCount).toBe(1)
    expect(refined.unknownCount).toBe(1)
    expect(refined.demotedWallRootCount).toBe(1)
  })
})
