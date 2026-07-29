import { describe, expect, it } from 'vitest'
import {
  facesTouchDoorArc,
  filterWindowsTouchingDoorArcs,
  shouldRetargetAcceptedWindowToDoorframe,
  type WindowAxelHypothesis,
} from '@/cv/windows'

function hypothesis(params: {
  id: string
  faceIds: number[]
  x?: number
  y?: number
  width?: number
  height?: number
  orientation?: 'horizontal' | 'vertical'
}): WindowAxelHypothesis {
  return {
    id: params.id,
    matchedRefIndex: 0,
    orientation: params.orientation ?? 'horizontal',
    faceIds: params.faceIds,
    unionBBox: {
      x: params.x ?? 0,
      y: params.y ?? 0,
      width: params.width ?? 10,
      height: params.height ?? 6,
    },
    axisSpanPx: params.width ?? 10,
    score: 1,
  }
}

describe('window-door-arc-filter', () => {
  it('facesTouchDoorArc: share of 1-hop wall-ink buur', () => {
    expect(
      facesTouchDoorArc({
        faceIds: [195, 196],
        doorArcFaceIds: new Set([198]),
        wallInkAdjacency: new Map([[195, new Set([198])]]),
      }),
    ).toBe(true)
    expect(
      facesTouchDoorArc({
        faceIds: [185],
        doorArcFaceIds: new Set([198]),
        wallInkAdjacency: new Map([[185, new Set([191])]]),
      }),
    ).toBe(false)
  })

  it('markeert hypotheses met gedeelde deurboog-face als doorframe', () => {
    const result = filterWindowsTouchingDoorArcs({
      hypotheses: [hypothesis({ id: 'w1', faceIds: [10, 11] })],
      doorArcFaceIds: new Set([11, 99]),
    })

    expect(result.kept).toHaveLength(0)
    expect(result.doorframeCandidates).toHaveLength(1)
    expect(result.doorframeCandidates[0]?.reason).toBe('shares_door_arc_face')
    expect(result.stats.rejectedShare).toBe(1)
    expect(result.stats.rejectedAdjacent).toBe(0)
  })

  it('markeert hypotheses die via wall-ink aan deurboog grenzen als doorframe', () => {
    const wallInkAdjacency = new Map<number, Set<number>>([
      [20, new Set([77])],
      [77, new Set([20])],
    ])
    const result = filterWindowsTouchingDoorArcs({
      hypotheses: [hypothesis({ id: 'w2', faceIds: [20] })],
      doorArcFaceIds: new Set([77]),
      wallInkAdjacency,
    })

    expect(result.kept).toHaveLength(0)
    expect(result.doorframeCandidates).toHaveLength(1)
    expect(result.doorframeCandidates[0]?.reason).toBe('adjacent_to_door_arc')
    expect(result.stats.rejectedShare).toBe(0)
    expect(result.stats.rejectedAdjacent).toBe(1)
  })

  it('detecteert wit–inkt–wit via wall-ink adjacency (opening-wit zou missen)', () => {
    // Opening-wit: 20 en 77 zijn NIET 1-hop (inkt-pixel 0 ertussen).
    // Wall-ink: 20 ↔ 50 (wall/ink) ↔ 77 — hyp grenst via ink-brug aan deurboog.
    const openingWhiteAdjacency = new Map<number, Set<number>>([
      [20, new Set([50])],
      [50, new Set([20, 77])],
      [77, new Set([50])],
    ])
    const wallInkAdjacency = new Map<number, Set<number>>([
      [20, new Set([50, 77])],
      [50, new Set([20, 77])],
      [77, new Set([50, 20])],
    ])

    const withoutInkBridge = filterWindowsTouchingDoorArcs({
      hypotheses: [hypothesis({ id: 'kozijn', faceIds: [20] })],
      doorArcFaceIds: new Set([77]),
      // Fout pad: opening-wit zou 20 alleen aan 50 koppelen, niet aan 77
      wallInkAdjacency: openingWhiteAdjacency,
    })
    // Met alleen 20→50 (geen directe 20→77) is adjacent false tenzij 50 in doorArcFaceIds
    expect(withoutInkBridge.kept.map((h) => h.id)).toEqual(['kozijn'])
    expect(withoutInkBridge.doorframeCandidates).toHaveLength(0)

    const withInkBridge = filterWindowsTouchingDoorArcs({
      hypotheses: [hypothesis({ id: 'kozijn', faceIds: [20] })],
      doorArcFaceIds: new Set([77]),
      wallInkAdjacency,
    })
    expect(withInkBridge.kept).toHaveLength(0)
    expect(withInkBridge.doorframeCandidates[0]?.reason).toBe('adjacent_to_door_arc')
  })

  it('behoudt hypotheses zonder share of adjacency met deurboog-faces', () => {
    const wallInkAdjacency = new Map<number, Set<number>>([
      [30, new Set([31])],
      [31, new Set([30])],
    ])
    const w3 = hypothesis({ id: 'w3', faceIds: [30] })
    const result = filterWindowsTouchingDoorArcs({
      hypotheses: [w3],
      doorArcFaceIds: new Set([200]),
      wallInkAdjacency,
    })

    expect(result.kept.map((hyp) => hyp.id)).toEqual(['w3'])
    expect(result.doorframeCandidates).toHaveLength(0)
    expect(result.stats.acceptedCount).toBe(1)
    expect(result.stats.rejectedShare).toBe(0)
    expect(result.stats.rejectedAdjacent).toBe(0)
    expect(result.stats.rejectedDirectional).toBe(0)
  })

  it('propageert doorframe langs dezelfde richting vanaf een direct geraakte hypothese', () => {
    const wallInkAdjacency = new Map<number, Set<number>>([
      [20, new Set([77])],
      [77, new Set([20])],
    ])
    const result = filterWindowsTouchingDoorArcs({
      hypotheses: [
        hypothesis({ id: 'seed-adj', faceIds: [20], x: 680, y: 300, width: 30, height: 18 }),
        hypothesis({ id: 'w4', faceIds: [201], x: 686, y: 302, width: 20, height: 16 }),
      ],
      doorArcFaceIds: new Set([77]),
      wallInkAdjacency,
      wallThicknessPx: 20,
    })

    expect(result.kept).toHaveLength(0)
    expect(result.doorframeCandidates).toHaveLength(2)
    expect(result.doorframeCandidates.find((row) => row.hypothesis.id === 'seed-adj')?.reason).toBe(
      'adjacent_to_door_arc',
    )
    expect(result.doorframeCandidates.find((row) => row.hypothesis.id === 'w4')?.reason).toBe(
      'aligned_with_rejected_arc_band',
    )
    expect(result.stats.rejectedDirectional).toBe(1)
  })

  it('wijst geen zij-ramen als doorframe bij richting-mismatch', () => {
    const result = filterWindowsTouchingDoorArcs({
      hypotheses: [
        hypothesis({ id: 'w5', faceIds: [301], x: 1000, y: 980, width: 20, height: 120 }),
      ],
      doorArcFaceIds: new Set([214]),
      wallThicknessPx: 20,
    })

    expect(result.kept.map((hyp) => hyp.id)).toEqual(['w5'])
    expect(result.doorframeCandidates).toHaveLength(0)
  })

  it('propageert niet naar parallelle buren zonder as-overlap', () => {
    const wallInkAdjacency = new Map<number, Set<number>>([
      [20, new Set([77])],
      [77, new Set([20])],
    ])
    const result = filterWindowsTouchingDoorArcs({
      hypotheses: [
        hypothesis({ id: 'seed-adj', faceIds: [20], x: 394, y: 1113, width: 109, height: 7 }),
        hypothesis({ id: 'side-strip', faceIds: [63], x: 513, y: 1105, width: 335, height: 13 }),
      ],
      doorArcFaceIds: new Set([77]),
      wallInkAdjacency,
      wallThicknessPx: 20,
    })

    expect(result.doorframeCandidates.find((row) => row.hypothesis.id === 'seed-adj')?.reason).toBe(
      'adjacent_to_door_arc',
    )
    expect(result.kept.map((hyp) => hyp.id)).toContain('side-strip')
    expect(
      result.doorframeCandidates.find((row) => row.hypothesis.id === 'side-strip'),
    ).toBeUndefined()
  })

  it('propageert wel naar direct aansluitende strook van hetzelfde kozijn', () => {
    const wallInkAdjacency = new Map<number, Set<number>>([
      [88, new Set([91])],
      [91, new Set([88])],
    ])
    const result = filterWindowsTouchingDoorArcs({
      hypotheses: [
        hypothesis({ id: 'seed-adj', faceIds: [88], x: 815, y: 1285, width: 109, height: 8 }),
        hypothesis({ id: 'strip-above', faceIds: [85], x: 814, y: 1278, width: 112, height: 7 }),
      ],
      doorArcFaceIds: new Set([91]),
      wallInkAdjacency,
      wallThicknessPx: 13,
    })

    expect(result.doorframeCandidates.find((row) => row.hypothesis.id === 'seed-adj')?.reason).toBe(
      'adjacent_to_door_arc',
    )
    expect(
      result.doorframeCandidates.find((row) => row.hypothesis.id === 'strip-above')?.reason,
    ).toBe('aligned_with_rejected_arc_band')
    expect(result.kept.find((hyp) => hyp.id === 'strip-above')).toBeUndefined()
  })
})

describe('shouldRetargetAcceptedWindowToDoorframe', () => {
  it('negeert framing-evidence: alleen hyp-faces tellen (BouwTek11 zij-raam)', () => {
    // Strips raken deur niet; alleen jamb 1789 zou 1-hop zijn — die zit niet in hyp.faceIds.
    const wallInkAdjacency = new Map<number, Set<number>>([
      [1789, new Set([1828])],
      [1828, new Set([1789])],
      [1785, new Set([1788, 1789])],
      [1811, new Set([1788, 1789])],
    ])
    expect(
      shouldRetargetAcceptedWindowToDoorframe({
        hypothesisFaceIds: [1785, 1811],
        hypothesisBBox: { x: 335, y: 2485, width: 154, height: 19 },
        orientation: 'horizontal',
        doorArcFaceIds: new Set([1828, 1829]),
        wallInkAdjacency,
        doorArcBBoxByFaceId: new Map([
          [1828, { x: 509, y: 2508, width: 171, height: 166 }],
          [1829, { x: 684, y: 2509, width: 167, height: 166 }],
        ]),
      }),
    ).toBe(false)
  })

  it('weigert hyp die deur raakt zonder as-overlap (naast elkaar op muur)', () => {
    // Strip-face 1-hop aan deur, maar x-gap → geen horizontale as-overlap.
    const wallInkAdjacency = new Map<number, Set<number>>([
      [1785, new Set([1828])],
      [1828, new Set([1785])],
    ])
    expect(
      shouldRetargetAcceptedWindowToDoorframe({
        hypothesisFaceIds: [1785, 1811],
        hypothesisBBox: { x: 335, y: 2485, width: 154, height: 19 },
        orientation: 'horizontal',
        doorArcFaceIds: new Set([1828]),
        wallInkAdjacency,
        doorArcBBoxByFaceId: new Map([[1828, { x: 509, y: 2508, width: 171, height: 166 }]]),
      }),
    ).toBe(false)
  })

  it('retarget bij hyp-touch + as-overlap (echt deurkozijn)', () => {
    const wallInkAdjacency = new Map<number, Set<number>>([
      [88, new Set([91])],
      [91, new Set([88])],
    ])
    expect(
      shouldRetargetAcceptedWindowToDoorframe({
        hypothesisFaceIds: [88],
        hypothesisBBox: { x: 815, y: 1285, width: 109, height: 8 },
        orientation: 'horizontal',
        doorArcFaceIds: new Set([91]),
        wallInkAdjacency,
        doorArcBBoxByFaceId: new Map([[91, { x: 820, y: 1290, width: 100, height: 160 }]]),
      }),
    ).toBe(true)
  })

  it('retarget bij gedeelde deurboog-face met as-overlap', () => {
    expect(
      shouldRetargetAcceptedWindowToDoorframe({
        hypothesisFaceIds: [10, 11],
        hypothesisBBox: { x: 100, y: 200, width: 80, height: 10 },
        orientation: 'horizontal',
        doorArcFaceIds: new Set([11]),
        doorArcBBoxByFaceId: new Map([[11, { x: 110, y: 205, width: 90, height: 150 }]]),
      }),
    ).toBe(true)
  })
})
