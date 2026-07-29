import { describe, expect, it } from 'vitest'
import {
  applyDrawnInkToStoredTopology,
  carveWallInkIntoLabels,
  splitDisconnectedFaceLabels,
} from '@/cv/walls/rooms/room-ink-topology-update'

describe('room-ink-topology-update', () => {
  it('carveWallInkIntoLabels snijdt door vlak', () => {
    const labelsData = new Int32Array([
      1, 1, 1,
      1, 1, 1,
      1, 1, 1,
    ])
    const wallInkData = Uint8Array.from([
      255, 255, 255,
      0, 0, 0,
      255, 255, 255,
    ])

    const carved = carveWallInkIntoLabels({ labelsData, wallInkData })
    expect(carved).toBe(3)
    expect(labelsData[3]).toBe(0)
    expect(labelsData[0]).toBe(1)
    expect(labelsData[6]).toBe(1)
  })

  it('splitDisconnectedFaceLabels maakt nieuw label voor afgesneden helft', () => {
    const width = 5
    const height = 3
    const labelsData = new Int32Array([
      1, 1, 0, 1, 1,
      1, 1, 0, 1, 1,
      1, 1, 0, 1, 1,
    ])

    const { splitMap, splitCount } = splitDisconnectedFaceLabels(labelsData, width, height)
    expect(splitCount).toBe(1)
    expect(splitMap.get(1)?.length).toBe(2)
    expect(new Set(labelsData.filter((v) => v > 0)).size).toBe(2)
  })

  it('applyDrawnInkToStoredTopology splitst vlak zonder classificatie-mutatie', () => {
    const width = 5
    const height = 3
    const rawLabelsData = new Int32Array([
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
    ])
    const wallInkData = Uint8Array.from([
      255, 255, 0, 255, 255,
      255, 255, 0, 255, 255,
      255, 255, 0, 255, 255,
    ])

    const updated = applyDrawnInkToStoredTopology({
      rawLabelsData,
      wallInkData,
      width,
      height,
    })

    expect(updated.carvedPx).toBe(3)
    expect(updated.splitCount).toBe(1)
    const labels = [...new Set(updated.rawLabelsData.filter((v) => v > 0))]
    expect(labels.length).toBe(2)
  })
})
