import { describe, expect, it } from 'vitest'
import {
  assembleFaceDualSpace,
  buildFaceSpaceFromComponents,
  type FaceDualSpace,
} from '@/cv/walls/rooms/face-dual-space'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import {
  resolveWindowCandidates,
  type WindowAxelRefBand,
  type WindowEvidenceAcceptance,
} from '@/cv/windows'

function makeRefBand(refIndex: number, orientation: 'horizontal' | 'vertical'): WindowAxelRefBand {
  return {
    refIndex,
    stripCount: 1,
    stripHeightsPx: [8],
    targetStripHeightPx: 8,
    targetStripHeightRatio: 1,
    axisBandHeightPx: 8,
    orientation,
    fullStripCount: 1,
    fullStripHeightsPx: [8],
    framingSizeRange: null,
    topRailRange: null,
    bottomRailRange: null,
  }
}

function component(
  label: number,
  bbox: { x: number; y: number; width: number; height: number },
): RasterRoomComponent {
  return {
    label,
    areaPx: Math.max(1, bbox.width * bbox.height),
    bbox,
    touchesBorder: false,
  }
}

function dualFrom(params: {
  white: RasterRoomComponent[]
  ink?: RasterRoomComponent[]
}): FaceDualSpace {
  const white = buildFaceSpaceFromComponents({
    kind: 'opening-white',
    components: params.white,
    parentMap: new Map(),
  })
  const ink = buildFaceSpaceFromComponents({
    kind: 'wall-ink',
    components: params.ink ?? params.white,
    parentMap: new Map(),
  })
  return assembleFaceDualSpace(white, ink)
}

describe('window-resolve', () => {
  it('merget strip_stack-leden met dezelfde evidenceFaceIds tot 1 resolved window', () => {
    const evidenceFaceIds = [1, 2, 3]
    const accepted: WindowEvidenceAcceptance[] = [
      {
        hypothesis: {
          id: 'a',
          matchedRefIndex: 0,
          orientation: 'horizontal',
          faceIds: [1],
          unionBBox: { x: 300, y: 120, width: 100, height: 10 },
          axisSpanPx: 100,
          score: 0.5,
        },
        evidence: 'strip_stack',
        evidenceFaceIds,
      },
      {
        hypothesis: {
          id: 'b',
          matchedRefIndex: 0,
          orientation: 'horizontal',
          faceIds: [2],
          unionBBox: { x: 305, y: 132, width: 125, height: 12 },
          axisSpanPx: 125,
          score: 0.92,
        },
        evidence: 'strip_stack',
        evidenceFaceIds,
      },
      {
        hypothesis: {
          id: 'c',
          matchedRefIndex: 0,
          orientation: 'horizontal',
          faceIds: [3],
          unionBBox: { x: 302, y: 146, width: 110, height: 11 },
          axisSpanPx: 110,
          score: 0.7,
        },
        evidence: 'strip_stack',
        evidenceFaceIds,
      },
    ]
    const resolved = resolveWindowCandidates({
      accepted,
      refBands: [makeRefBand(0, 'horizontal')],
      dual: dualFrom({ white: [] }),
      pxPerMmX: 2,
      pxPerMmY: 4,
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.evidence).toBe('strip_stack')
    expect(resolved[0]?.faceIds).toEqual([1, 2, 3])
    expect(resolved[0]?.bbox).toEqual({ x: 300, y: 120, width: 130, height: 37 })
    expect(resolved[0]?.widthPx).toBe(125)
    expect(resolved[0]?.widthCm).toBeCloseTo(4.17, 2)
    expect(resolved[0]?.heightPx).toBe(37)
  })

  it('gebruikt bij framing union van strip+evidence faces met ppm->cm', () => {
    const accepted: WindowEvidenceAcceptance[] = [
      {
        hypothesis: {
          id: 'h-framing',
          matchedRefIndex: 0,
          orientation: 'horizontal',
          faceIds: [10, 11],
          unionBBox: { x: 100, y: 200, width: 80, height: 6 },
          axisSpanPx: 80,
          score: 0.88,
        },
        evidence: 'framing',
        evidenceFaceIds: [12, 13],
      },
    ]
    const components = [
      component(10, { x: 100, y: 200, width: 40, height: 6 }),
      component(11, { x: 140, y: 200, width: 40, height: 6 }),
      component(12, { x: 90, y: 198, width: 10, height: 10 }),
      component(13, { x: 180, y: 198, width: 10, height: 10 }),
    ]
    const resolved = resolveWindowCandidates({
      accepted,
      refBands: [makeRefBand(0, 'horizontal')],
      dual: dualFrom({ white: components }),
      pxPerMmX: 5,
      pxPerMmY: 5,
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.bbox).toEqual({ x: 90, y: 198, width: 100, height: 10 })
    expect(resolved[0]?.widthPx).toBe(100)
    expect(resolved[0]?.widthCm).toBe(2)
    expect(resolved[0]?.heightPx).toBe(10)
    expect(resolved[0]?.heightCm).toBe(0.2)
    expect(resolved[0]?.centroidPx).toEqual({ x: 140, y: 203 })
  })

  it('framing-maat: wall-ink kozijnen meetellen als ze ontbreken in opening-wit', () => {
    // Dual-space: glas in wit; kozijnen alleen in wall-ink (Stage-3 ink-pad).
    const accepted: WindowEvidenceAcceptance[] = [
      {
        hypothesis: {
          id: 'h-ink-frame',
          matchedRefIndex: 0,
          orientation: 'horizontal',
          faceIds: [10, 11],
          unionBBox: { x: 100, y: 200, width: 80, height: 6 },
          axisSpanPx: 80,
          score: 0.9,
        },
        evidence: 'framing',
        evidenceFaceIds: [20, 21],
      },
    ]
    const whiteOnly = [
      component(10, { x: 100, y: 200, width: 40, height: 6 }),
      component(11, { x: 140, y: 200, width: 40, height: 6 }),
    ]
    const wallInk = [
      component(10, { x: 100, y: 199, width: 40, height: 8 }),
      component(11, { x: 140, y: 199, width: 40, height: 8 }),
      component(20, { x: 88, y: 198, width: 12, height: 12 }),
      component(21, { x: 180, y: 198, width: 12, height: 12 }),
    ]
    const withoutInk = resolveWindowCandidates({
      accepted,
      refBands: [makeRefBand(0, 'horizontal')],
      dual: dualFrom({ white: whiteOnly, ink: [] }),
      pxPerMmX: 5,
      pxPerMmY: 5,
    })
    expect(withoutInk[0]?.widthPx).toBe(80)
    expect(withoutInk[0]?.bbox).toEqual({ x: 100, y: 200, width: 80, height: 6 })

    const withInk = resolveWindowCandidates({
      accepted,
      refBands: [makeRefBand(0, 'horizontal')],
      dual: dualFrom({ white: whiteOnly, ink: wallInk }),
      pxPerMmX: 5,
      pxPerMmY: 5,
    })
    expect(withInk[0]?.bbox).toEqual({ x: 88, y: 198, width: 104, height: 12 })
    expect(withInk[0]?.widthPx).toBe(104)
    expect(withInk[0]?.heightPx).toBe(12)
    expect(withInk[0]?.faceIds).toEqual([10, 11])
    expect(withInk[0]?.evidenceFaceIds).toEqual([20, 21])
  })

  it('merget ref0+ref1 strip_stack met dezelfde faces tot 1 window', () => {
    const evidenceFaceIds = [137, 149, 156]
    const accepted: WindowEvidenceAcceptance[] = [
      {
        hypothesis: {
          id: 'window-0-horizontal-137_149',
          matchedRefIndex: 0,
          orientation: 'horizontal',
          faceIds: [137, 149],
          unionBBox: { x: 2043, y: 581, width: 178, height: 14 },
          axisSpanPx: 178,
          score: 80,
        },
        evidence: 'strip_stack',
        evidenceFaceIds,
      },
      {
        hypothesis: {
          id: 'window-0-horizontal-149_156',
          matchedRefIndex: 0,
          orientation: 'horizontal',
          faceIds: [149, 156],
          unionBBox: { x: 2052, y: 593, width: 159, height: 9 },
          axisSpanPx: 159,
          score: 70,
        },
        evidence: 'strip_stack',
        evidenceFaceIds,
      },
      {
        hypothesis: {
          id: 'window-1-horizontal-137_149',
          matchedRefIndex: 1,
          orientation: 'horizontal',
          faceIds: [137, 149],
          unionBBox: { x: 2043, y: 581, width: 178, height: 14 },
          axisSpanPx: 178,
          score: 85,
        },
        evidence: 'strip_stack',
        evidenceFaceIds,
      },
      {
        hypothesis: {
          id: 'window-1-horizontal-149_156',
          matchedRefIndex: 1,
          orientation: 'horizontal',
          faceIds: [149, 156],
          unionBBox: { x: 2052, y: 593, width: 159, height: 9 },
          axisSpanPx: 159,
          score: 75,
        },
        evidence: 'strip_stack',
        evidenceFaceIds,
      },
    ]
    const resolved = resolveWindowCandidates({
      accepted,
      refBands: [makeRefBand(0, 'horizontal'), makeRefBand(1, 'horizontal')],
      dual: dualFrom({ white: [] }),
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.faceIds).toEqual([137, 149, 156])
    expect(resolved[0]?.matchedRefIndex).toBe(1) // hoogste score in group
    expect(resolved[0]?.score).toBe(85)
  })

  it('strip_stack breedte = langste evidence-strip (niet seed-hyp bbox)', () => {
    // Eén seed groeit tot full stack; rails langer dan glas-seed.
    const accepted: WindowEvidenceAcceptance[] = [
      {
        hypothesis: {
          id: 'seed-short',
          matchedRefIndex: 0,
          orientation: 'horizontal',
          faceIds: [10],
          unionBBox: { x: 310, y: 200, width: 80, height: 8 },
          axisSpanPx: 80,
          score: 0.9,
        },
        evidence: 'strip_stack',
        evidenceFaceIds: [10, 11, 12],
      },
    ]
    const strips = [
      component(10, { x: 310, y: 200, width: 80, height: 8 }),
      component(11, { x: 300, y: 210, width: 120, height: 6 }),
      component(12, { x: 305, y: 218, width: 100, height: 7 }),
    ]
    const resolved = resolveWindowCandidates({
      accepted,
      refBands: [makeRefBand(0, 'horizontal')],
      dual: dualFrom({ white: strips }),
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.widthPx).toBe(120)
    expect(resolved[0]?.widthCm).toBe(6)
    expect(resolved[0]?.bbox).toEqual({ x: 300, y: 200, width: 120, height: 25 })
    expect(resolved[0]?.heightPx).toBe(25)
    expect(resolved[0]?.evidenceFaceIds).toEqual([10, 11, 12])
  })

  it('dedupe framing ref0/ref1 op glas-faces; framing-kozijnen mogen gedeeld', () => {
    const accepted: WindowEvidenceAcceptance[] = [
      {
        hypothesis: {
          id: 'window-0-horizontal-8_16',
          matchedRefIndex: 0,
          orientation: 'horizontal',
          faceIds: [8, 16],
          unionBBox: { x: 391, y: 181, width: 156, height: 14 },
          axisSpanPx: 156,
          score: 40,
        },
        evidence: 'framing',
        evidenceFaceIds: [7, 9],
      },
      {
        hypothesis: {
          id: 'window-1-horizontal-8_16',
          matchedRefIndex: 1,
          orientation: 'horizontal',
          faceIds: [8, 16],
          unionBBox: { x: 391, y: 181, width: 156, height: 14 },
          axisSpanPx: 156,
          score: 50,
        },
        evidence: 'framing',
        evidenceFaceIds: [7, 9],
      },
      {
        hypothesis: {
          id: 'window-0-horizontal-10_18',
          matchedRefIndex: 0,
          orientation: 'horizontal',
          faceIds: [10, 18],
          unionBBox: { x: 559, y: 181, width: 158, height: 14 },
          axisSpanPx: 158,
          score: 45,
        },
        evidence: 'framing',
        evidenceFaceIds: [9, 11], // deelt kozijn 9 met buur — OK
      },
    ]
    const components = [
      component(8, { x: 391, y: 181, width: 156, height: 7 }),
      component(16, { x: 392, y: 191, width: 154, height: 4 }),
      component(7, { x: 382, y: 181, width: 8, height: 12 }),
      component(9, { x: 548, y: 181, width: 8, height: 12 }),
      component(10, { x: 559, y: 181, width: 158, height: 7 }),
      component(18, { x: 560, y: 191, width: 157, height: 4 }),
      component(11, { x: 718, y: 181, width: 8, height: 12 }),
    ]
    const resolved = resolveWindowCandidates({
      accepted,
      refBands: [makeRefBand(0, 'horizontal'), makeRefBand(1, 'horizontal')],
      dual: dualFrom({ white: components }),
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    expect(resolved).toHaveLength(2)
    const keys = resolved.map((w) => w.faceIds.join('_')).sort()
    expect(keys).toEqual(['10_18', '8_16'])
    expect(resolved.find((w) => w.faceIds.includes(8))?.score).toBe(50)
  })
})
