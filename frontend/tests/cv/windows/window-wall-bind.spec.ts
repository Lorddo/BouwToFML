import { describe, expect, it } from 'vitest'
import { CONCEPT_WINDOW_REFID } from '@/core/fml/types'
import { bindWindowsToWalls } from '@/cv/windows/window-wall-bind'
import type { ResolvedWindowCandidate, WindowAxelRefBand } from '@/cv/windows/types'
import type { SemanticWallJunction, SemanticWallSegment } from '@/core/extraction/types'

function makeWindow(partial: Partial<ResolvedWindowCandidate> & Pick<ResolvedWindowCandidate, 'id' | 'bbox' | 'centroidPx'>): ResolvedWindowCandidate {
  return {
    sourceHypothesisId: partial.sourceHypothesisId ?? 'hyp-1',
    matchedRefIndex: partial.matchedRefIndex ?? 0,
    orientation: partial.orientation ?? 'horizontal',
    evidence: partial.evidence ?? 'framing',
    faceIds: partial.faceIds ?? [1],
    evidenceFaceIds: partial.evidenceFaceIds ?? [2],
    widthPx: partial.widthPx ?? partial.bbox.width,
    widthCm: partial.widthCm ?? 100,
    heightPx: partial.heightPx ?? partial.bbox.height,
    heightCm: partial.heightCm ?? 20,
    score: partial.score ?? 1,
    ...partial,
  }
}

const horizontalRef: WindowAxelRefBand = {
  refIndex: 0,
  stripCount: 2,
  stripHeightsPx: [8, 8],
  targetStripHeightPx: 8,
  axisBandHeightPx: 20,
  orientation: 'horizontal',
  fullStripCount: 4,
  fullStripHeightsPx: [8, 8, 8, 8],
  framingSizeRange: null,
  topRailRange: null,
  bottomRailRange: null,
}

describe('bindWindowsToWalls', () => {
  it('bindt horizontaal raam op segment zonder bbox te verschuiven', () => {
    const segments: SemanticWallSegment[] = [
      {
        a: { x: 0, y: 50 },
        b: { x: 200, y: 50 },
        thicknessPxMax: 20,
        junctionAId: 'jA',
        junctionBId: 'jB',
      },
    ]
    const junctions: SemanticWallJunction[] = [
      { id: 'jA', x: 0, y: 50, kind: 'I', anglesDeg: [0] },
      { id: 'jB', x: 200, y: 50, kind: 'I', anglesDeg: [180] },
    ]
    const candidate = makeWindow({
      id: 'window:1',
      bbox: { x: 40, y: 40, width: 60, height: 20 },
      centroidPx: { x: 70, y: 50 },
      widthPx: 60,
      widthCm: 120,
    })

    const result = bindWindowsToWalls({
      windows: [candidate],
      refBands: [horizontalRef],
      segments,
      junctions,
    })

    expect(result.rejected).toHaveLength(0)
    expect(result.bound).toHaveLength(1)
    const bound = result.bound[0]!
    expect(bound.segmentIndex).toBe(0)
    expect(bound.openingBBox).toEqual(candidate.bbox)
    expect(bound.fmlRefId).toBe(CONCEPT_WINDOW_REFID)
    expect(bound.openingAxis).toBe('h')
    expect(bound.t).toBeGreaterThan(0.2)
    expect(bound.t).toBeLessThan(0.6)
    expect(bound.openingStartPx.x).toBeLessThan(bound.openingEndPx.x)
  })

  it('keurt raam af bij junction in bbox', () => {
    const segments: SemanticWallSegment[] = [
      {
        a: { x: 0, y: 50 },
        b: { x: 200, y: 50 },
        thicknessPxMax: 20,
        junctionAId: 'jMid',
        junctionBId: 'jB',
      },
    ]
    const junctions: SemanticWallJunction[] = [
      { id: 'jMid', x: 70, y: 50, kind: 'T', anglesDeg: [0, 90] },
      { id: 'jB', x: 200, y: 50, kind: 'I', anglesDeg: [180] },
    ]
    const candidate = makeWindow({
      id: 'window:junction',
      bbox: { x: 40, y: 40, width: 60, height: 20 },
      centroidPx: { x: 70, y: 50 },
    })

    const result = bindWindowsToWalls({
      windows: [candidate],
      refBands: [horizontalRef],
      segments,
      junctions,
    })

    expect(result.bound).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0]!.reason).toBe('junction_in_window')
  })

  it('houdt raam met junction alleen op segment-eind buiten bbox', () => {
    const segments: SemanticWallSegment[] = [
      {
        a: { x: 0, y: 50 },
        b: { x: 200, y: 50 },
        thicknessPxMax: 20,
        junctionAId: 'jA',
        junctionBId: 'jB',
      },
    ]
    const junctions: SemanticWallJunction[] = [
      { id: 'jA', x: 0, y: 50, kind: 'L', anglesDeg: [0, 90] },
      { id: 'jB', x: 200, y: 50, kind: 'L', anglesDeg: [180, 270] },
    ]
    const candidate = makeWindow({
      id: 'window:ok',
      bbox: { x: 80, y: 40, width: 40, height: 20 },
      centroidPx: { x: 100, y: 50 },
    })

    const result = bindWindowsToWalls({
      windows: [candidate],
      refBands: [horizontalRef],
      segments,
      junctions,
    })

    expect(result.rejected).toHaveLength(0)
    expect(result.bound).toHaveLength(1)
  })

  it('reject no_segment als geen nabij passend segment', () => {
    const segments: SemanticWallSegment[] = [
      {
        a: { x: 0, y: 0 },
        b: { x: 200, y: 0 },
        thicknessPxMax: 10,
      },
    ]
    const candidate = makeWindow({
      id: 'window:far',
      bbox: { x: 40, y: 80, width: 60, height: 20 },
      centroidPx: { x: 70, y: 90 },
    })

    const result = bindWindowsToWalls({
      windows: [candidate],
      refBands: [horizontalRef],
      segments,
      junctions: [],
    })

    expect(result.bound).toHaveLength(0)
    expect(result.rejected[0]!.reason).toBe('no_segment')
  })

  it('bindt verticaal raam op verticale muur', () => {
    const verticalRef: WindowAxelRefBand = { ...horizontalRef, orientation: 'vertical' }
    const segments: SemanticWallSegment[] = [
      {
        a: { x: 50, y: 0 },
        b: { x: 50, y: 200 },
        thicknessPxMax: 20,
      },
    ]
    const candidate = makeWindow({
      id: 'window:v',
      matchedRefIndex: 0,
      orientation: 'vertical',
      bbox: { x: 40, y: 60, width: 20, height: 50 },
      centroidPx: { x: 50, y: 85 },
      widthPx: 50,
      widthCm: 100,
    })

    const result = bindWindowsToWalls({
      windows: [candidate],
      refBands: [verticalRef],
      segments,
      junctions: [],
    })

    expect(result.rejected).toHaveLength(0)
    expect(result.bound[0]!.openingAxis).toBe('v')
    expect(result.bound[0]!.openingBBox).toEqual(candidate.bbox)
  })
})
