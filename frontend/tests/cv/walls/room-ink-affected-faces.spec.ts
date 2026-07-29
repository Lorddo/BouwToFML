import { describe, expect, it } from 'vitest'
import {
  collectAffectedFaceLabels,
  dilateDiffMask,
  pruneStaleLabelMaps,
} from '@/cv/walls/rooms/room-ink-affected-faces'

describe('dilateDiffMask', () => {
  it('breidt diff 1px uit per pass', () => {
    const width = 3
    const height = 1
    const diffMask = Uint8Array.from([0, 1, 0])
    const impact = dilateDiffMask({ diffMask, width, height, marginPx: 1 })
    expect([...impact]).toEqual([1, 1, 1])
  })

  it('BFS schaalt met diff-grootte niet met heel beeld', () => {
    const width = 200
    const height = 200
    const diffMask = new Uint8Array(width * height)
    diffMask[100 * width + 100] = 1
    const started = performance.now()
    const impact = dilateDiffMask({ diffMask, width, height, marginPx: 32 })
    const elapsed = performance.now() - started
    expect(impact[100 * width + 100]).toBe(1)
    expect(impact[0]).toBe(0)
    expect(elapsed).toBeLessThan(50)
  })
})

describe('collectAffectedFaceLabels', () => {
  it('markeert label dat diff overlapt', () => {
    const width = 3
    const height = 1
    const priorLabels = new Int32Array([1, 1, 2])
    const labelsData = new Int32Array([1, 0, 2])
    const diffMask = Uint8Array.from([0, 1, 0])

    const affected = collectAffectedFaceLabels({
      labelsData,
      priorLabels,
      diffMask,
      marginPx: 0,
      width,
      height,
    })

    expect(affected.has(1)).toBe(true)
    expect(affected.has(2)).toBe(false)
  })

  it('markeert nieuw label als geraakt', () => {
    const width = 2
    const height = 1
    const priorLabels = new Int32Array([1, 1])
    const labelsData = new Int32Array([1, 3])
    const diffMask = Uint8Array.from([0, 1])

    const affected = collectAffectedFaceLabels({
      labelsData,
      priorLabels,
      diffMask,
      marginPx: 0,
      width,
      height,
    })

    expect(affected.has(3)).toBe(true)
  })

  it('markeert verdwenen label als geraakt', () => {
    const width = 2
    const height = 1
    const priorLabels = new Int32Array([1, 2])
    const labelsData = new Int32Array([1, 1])
    const diffMask = Uint8Array.from([0, 1])

    const affected = collectAffectedFaceLabels({
      labelsData,
      priorLabels,
      diffMask,
      marginPx: 0,
      width,
      height,
    })

    expect(affected.has(2)).toBe(true)
  })
})

describe('pruneStaleLabelMaps', () => {
  it('verwijdert maps voor niet-bestaande labels', () => {
    const labelsData = new Int32Array([1, 1, 0])
    const classificationByLabel = new Map([
      [1, 'wall'],
      [2, 'surface'],
    ])
    const faceOverrides = new Map([[2, 'surface']])
    const pinnedRoots = new Set([2])

    pruneStaleLabelMaps({ labelsData, classificationByLabel, faceOverrides, pinnedRoots })

    expect(classificationByLabel.has(2)).toBe(false)
    expect(faceOverrides.has(2)).toBe(false)
    expect(pinnedRoots.has(2)).toBe(false)
    expect(classificationByLabel.get(1)).toBe('wall')
  })
})
