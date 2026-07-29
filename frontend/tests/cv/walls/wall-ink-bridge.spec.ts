import { describe, expect, it } from 'vitest'
import {
  areLinkedViaWallInkBridge,
  collectNeighborsViaWallInkBridge,
} from '@/cv/walls/rooms/wall-ink-bridge'

describe('wall-ink-bridge', () => {
  const wallInkAdjacency = new Map<number, Set<number>>([
    [10, new Set([99])],
    [99, new Set([10, 11])],
    [11, new Set([99])],
  ])

  it('areLinkedViaWallInkBridge: true bij wall mid', () => {
    expect(
      areLinkedViaWallInkBridge({
        rootA: 10,
        rootB: 11,
        wallInkAdjacency,
        classificationByLabel: new Map([
          [10, 'unknown'],
          [11, 'unknown'],
          [99, 'wall'],
        ]),
      }),
    ).toBe(true)
  })

  it('areLinkedViaWallInkBridge: true bij window/doorframe mid (wall-mask)', () => {
    expect(
      areLinkedViaWallInkBridge({
        rootA: 10,
        rootB: 11,
        wallInkAdjacency,
        classificationByLabel: new Map([
          [10, 'unknown'],
          [11, 'unknown'],
          [99, 'window'],
        ]),
      }),
    ).toBe(true)
    expect(
      areLinkedViaWallInkBridge({
        rootA: 10,
        rootB: 11,
        wallInkAdjacency,
        classificationByLabel: new Map([
          [10, 'unknown'],
          [11, 'unknown'],
          [99, 'doorframe'],
        ]),
      }),
    ).toBe(true)
  })

  it('areLinkedViaWallInkBridge: false bij non-wall mid', () => {
    expect(
      areLinkedViaWallInkBridge({
        rootA: 10,
        rootB: 11,
        wallInkAdjacency,
        classificationByLabel: new Map([
          [10, 'unknown'],
          [11, 'unknown'],
          [99, 'unknown'],
        ]),
      }),
    ).toBe(false)
  })

  it('areLinkedViaWallInkBridge: false bij missing adjacency', () => {
    expect(
      areLinkedViaWallInkBridge({
        rootA: 10,
        rootB: 12,
        wallInkAdjacency,
        classificationByLabel: new Map([
          [10, 'unknown'],
          [99, 'wall'],
        ]),
      }),
    ).toBe(false)
    expect(
      areLinkedViaWallInkBridge({
        rootA: 10,
        rootB: 11,
        wallInkAdjacency: new Map(),
        classificationByLabel: new Map([[99, 'wall']]),
      }),
    ).toBe(false)
  })

  it('collectNeighborsViaWallInkBridge: hop over wall mid wanneer bridgeViaInk', () => {
    const neighbors = collectNeighborsViaWallInkBridge({
      roots: [10],
      adjacency: wallInkAdjacency,
      seen: new Set(),
      classificationByLabel: new Map([
        [10, 'unknown'],
        [11, 'unknown'],
        [99, 'wall'],
      ]),
      bridgeViaInk: true,
    })
    expect(neighbors.sort((a, b) => a - b)).toEqual([11])
  })

  it('collectNeighborsViaWallInkBridge: directe buur wanneer bridgeViaInk uit', () => {
    const neighbors = collectNeighborsViaWallInkBridge({
      roots: [10],
      adjacency: wallInkAdjacency,
      seen: new Set(),
      classificationByLabel: new Map([
        [10, 'unknown'],
        [11, 'unknown'],
        [99, 'wall'],
      ]),
      bridgeViaInk: false,
    })
    expect(neighbors).toEqual([99])
  })

  it('collectNeighborsViaWallInkBridge: slaat seen over', () => {
    const neighbors = collectNeighborsViaWallInkBridge({
      roots: [10],
      adjacency: wallInkAdjacency,
      seen: new Set([11]),
      classificationByLabel: new Map([
        [10, 'unknown'],
        [11, 'unknown'],
        [99, 'wall'],
      ]),
      bridgeViaInk: true,
    })
    expect(neighbors).toEqual([])
  })
})
