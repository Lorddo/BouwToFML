import { describe, expect, it } from 'vitest'
import { buildLabelAdjacency } from '@/cv/walls/rooms/label-adjacency'

describe('label-adjacency', () => {
  it('bouwt 8-connect adjacency op root-niveau (incl. diagonaal-rakende puntjes)', () => {
    const width = 4
    const height = 3
    const labels = new Int32Array([
      1, 1, 0, 4,
      1, 2, 2, 0,
      0, 2, 3, 0,
    ])
    const parentMap = new Map<number, number>([
      [1, 10],
      [2, 20],
      [3, 30],
      [4, 40],
    ])

    const adjacency = buildLabelAdjacency({
      labelsData: labels,
      width,
      height,
      parentMap,
    })

    expect([...adjacency.get(10) ?? []].sort((a, b) => a - b)).toEqual([20])
    expect([...adjacency.get(20) ?? []].sort((a, b) => a - b)).toEqual([10, 30, 40])
    expect([...adjacency.get(30) ?? []].sort((a, b) => a - b)).toEqual([20])
    // 40 raakt 20 alleen diagonaal (down-left) → 8-connect vindt het, 4-connect niet
    expect([...adjacency.get(40) ?? []].sort((a, b) => a - b)).toEqual([20])
  })
})
