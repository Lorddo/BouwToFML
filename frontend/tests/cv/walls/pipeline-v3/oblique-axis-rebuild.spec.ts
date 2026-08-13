import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import {
  countJunctionKindsFromSegments,
  withTopologyGuard,
} from '@/cv/walls/rooms/pipeline-v3/engines/collapse'
import {
  collectObliqueAxes,
  OBLIQUE_STUB_MAX_PX,
  rebuildObliqueChains,
  type RidgeField,
} from '@/cv/walls/rooms/pipeline-v3/engines/oblique'
import { dropZeroLengthSegments } from '@/cv/walls/rooms/pipeline-v3/engines/segment-ops'
import { resolveLayer10FmlPolicy } from '@/cv/walls/rooms/pipeline-v3/policies/layer-10'
import { resolveObliquePolicy } from '@/cv/walls/rooms/pipeline-v3/policies/oblique'
import { buildSyntheticField, type SyntheticBand } from './oblique-synthetic-field'

const WIDTH = 400
const HEIGHT = 400
const REF_THICKNESS_PX = 30

/** Gevel van (300,40) naar (268,360): 5,7 graden uit lood. */
const TOP_Y = 40
const BOTTOM_Y = 360
const TOP_X = 300
const SLOPE = 0.1

function trueLineX(y: number): number {
  return TOP_X - SLOPE * (y - TOP_Y)
}

/** Punt op de ware hartlijn, optioneel loodrecht verschoven. */
function onTrueLine(y: number, jitterPx = 0): { x: number; y: number } {
  const len = Math.hypot(SLOPE, 1)
  const nx = -1 / len
  const ny = SLOPE / len
  return { x: trueLineX(y) + nx * jitterPx, y: y + ny * jitterPx }
}

const OBLIQUE_BAND: SyntheticBand = {
  a: { x: TOP_X, y: TOP_Y },
  b: { x: trueLineX(BOTTOM_Y), y: BOTTOM_Y },
  thicknessPx: REF_THICKNESS_PX,
}

const CROSS_BANDS: SyntheticBand[] = [
  { a: { x: TOP_X, y: TOP_Y }, b: { x: 120, y: TOP_Y }, thicknessPx: REF_THICKNESS_PX },
  { a: { x: 284, y: 200 }, b: { x: 120, y: 200 }, thicknessPx: REF_THICKNESS_PX },
  {
    a: { x: trueLineX(BOTTOM_Y), y: BOTTOM_Y },
    b: { x: 120, y: BOTTOM_Y },
    thicknessPx: REF_THICKNESS_PX,
  },
]

const FOREIGN_WALLS: Segment[] = [
  { a: { x: 296, y: 40 }, b: { x: 120, y: 40 } },
  { a: { x: 288, y: 200 }, b: { x: 120, y: 200 } },
  { a: { x: 268, y: 360 }, b: { x: 120, y: 360 } },
]

/** Wat laag 4 van de gevel maakt: verticale runs met stootborden ertussen. */
const STAIRCASE: Segment[] = [
  { a: { x: 296, y: 40 }, b: { x: 296, y: 120 } },
  { a: { x: 296, y: 120 }, b: { x: 288, y: 120 } },
  { a: { x: 288, y: 120 }, b: { x: 288, y: 200 } },
  { a: { x: 288, y: 200 }, b: { x: 280, y: 200 } },
  { a: { x: 280, y: 200 }, b: { x: 280, y: 280 } },
  { a: { x: 280, y: 280 }, b: { x: 272, y: 280 } },
  { a: { x: 272, y: 280 }, b: { x: 272, y: 360 } },
  { a: { x: 272, y: 360 }, b: { x: 268, y: 360 } },
]

/** Wat laag 3 nog heeft: brokken op de hartlijn met sub-pixel jitter. */
const LAYER3_OBLIQUE: Segment[] = [
  { a: onTrueLine(40, 0.4), b: onTrueLine(110, -0.6) },
  { a: onTrueLine(110, -0.6), b: onTrueLine(175, 0.5) },
  { a: onTrueLine(175, 0.5), b: onTrueLine(250, -0.3) },
  { a: onTrueLine(250, -0.3), b: onTrueLine(305, 0.7) },
  { a: onTrueLine(305, 0.7), b: onTrueLine(360, 0) },
]

const policy = resolveObliquePolicy(REF_THICKNESS_PX)

function buildField(bands: SyntheticBand[]): RidgeField {
  return buildSyntheticField({
    bands,
    width: WIDTH,
    height: HEIGHT,
    maxSearchPx: policy.ridgeMaxSearchPx,
    sampleStepPx: policy.ridgeSampleStepPx,
  })
}

function offsetToAxis(
  point: { x: number; y: number },
  axis: { line: { anchor: { x: number; y: number }; direction: { x: number; y: number } } },
): number {
  return Math.abs(
    -(point.x - axis.line.anchor.x) * axis.line.direction.y +
      (point.y - axis.line.anchor.y) * axis.line.direction.x,
  )
}

function offAxisDegOf(seg: Segment): number {
  const deg = (Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180) / Math.PI
  const a = ((deg % 180) + 180) % 180
  return Math.min(a, Math.abs(a - 90), 180 - a)
}

describe('schuine as — inventaris op laag 3', () => {
  const field = buildField([OBLIQUE_BAND, ...CROSS_BANDS])

  it('vindt één as met de hoek van de gevel', () => {
    const axes = collectObliqueAxes({
      segments: [...LAYER3_OBLIQUE, ...FOREIGN_WALLS],
      policy,
      field,
    })
    expect(axes).toHaveLength(1)
    const axis = axes[0]
    const expectedDeg = 180 + (Math.atan2(1, -SLOPE) * 180) / Math.PI - 180
    expect(axis.angleDeg).toBeCloseTo(expectedDeg, 0)
    expect(axis.memberCount).toBe(LAYER3_OBLIQUE.length)
    expect(axis.evidencePx).toBeGreaterThan(300)
    expect(axis.ridge.offsetMedianPx).toBeLessThanOrEqual(policy.maxRidgeOffsetMedianPx)
    // De span dekt de hele gevel, niet slechts een deel.
    expect(axis.tMax - axis.tMin).toBeGreaterThan(310)
  })

  it('een orthogonale tekening levert geen as op', () => {
    const orthogonal: Segment[] = [
      { a: { x: 100, y: 100 }, b: { x: 300, y: 100 } },
      { a: { x: 300, y: 100 }, b: { x: 300, y: 300 } },
      { a: { x: 300, y: 300 }, b: { x: 100, y: 300 } },
      { a: { x: 100, y: 300 }, b: { x: 100, y: 100 } },
    ]
    const orthogonalField = buildField(
      orthogonal.map((seg) => ({ a: seg.a, b: seg.b, thicknessPx: REF_THICKNESS_PX })),
    )
    expect(collectObliqueAxes({ segments: orthogonal, policy, field: orthogonalField })).toEqual([])
  })

  it('restscheefheid binnen de dodezone blijft H/V', () => {
    // 1,4 graden uit lood: typische scanrest, geen gevel.
    const skewed: Segment[] = [0, 1, 2, 3, 4].map((i) => ({
      a: { x: 300 - i * 1.6, y: 40 + i * 64 },
      b: { x: 300 - (i + 1) * 1.6, y: 40 + (i + 1) * 64 },
    }))
    const skewedField = buildField([
      { a: skewed[0].a, b: skewed[4].b, thicknessPx: REF_THICKNESS_PX },
    ])
    expect(collectObliqueAxes({ segments: skewed, policy, field: skewedField })).toEqual([])
  })

  it('te weinig bewijs levert geen as op', () => {
    const stub: Segment[] = [
      { a: onTrueLine(40), b: onTrueLine(70) },
      { a: onTrueLine(70), b: onTrueLine(95) },
      { a: onTrueLine(95), b: onTrueLine(120) },
    ]
    expect(collectObliqueAxes({ segments: stub, policy, field })).toEqual([])
  })
})

describe('schuine as — keten-herbouw op laag 10', () => {
  const field = buildField([OBLIQUE_BAND, ...CROSS_BANDS])
  const axes = collectObliqueAxes({
    segments: [...LAYER3_OBLIQUE, ...FOREIGN_WALLS],
    policy,
    field,
  })
  const layer10 = [...STAIRCASE, ...FOREIGN_WALLS]

  it('vervangt de trap door rechte segmenten op de as', () => {
    const { segments, stats } = rebuildObliqueChains({ segments: layer10, axes, policy })
    expect(stats.chainsRebuilt).toBe(1)
    expect(stats.segmentsRemoved).toBe(STAIRCASE.length)
    expect(segments).toHaveLength(FOREIGN_WALLS.length + stats.segmentsCreated)

    const oblique = segments.filter((seg) => offAxisDegOf(seg) > policy.deadzoneDeg)
    expect(oblique.length).toBeGreaterThan(0)
    for (const seg of oblique) {
      expect(offAxisDegOf(seg)).toBeCloseTo(5.7, 0)
      expect(offsetToAxis(seg.a, axes[0])).toBeLessThan(0.01)
      expect(offsetToAxis(seg.b, axes[0])).toBeLessThan(0.01)
    }
  })

  it('houdt een T-knoop waar een binnenmuur uitkomt', () => {
    const { segments } = rebuildObliqueChains({ segments: layer10, axes, policy })
    const oblique = segments.filter((seg) => offAxisDegOf(seg) > policy.deadzoneDeg)
    // Boven-, midden- en onderanker: twee stukken, niet één doorlopende lijn.
    expect(oblique).toHaveLength(2)

    const interior = segments.find(
      (seg) =>
        Math.abs(seg.a.y - 200) < 1 &&
        Math.abs(seg.b.y - 200) < 1 &&
        Math.min(seg.a.x, seg.b.x) < 130,
    )
    expect(interior).toBeDefined()
    const attach = interior!.a.x > interior!.b.x ? interior!.a : interior!.b
    expect(offsetToAxis(attach, axes[0])).toBeLessThan(0.01)
    // De binnenmuur is meegeschoven, dus er zit een schuin segment op datzelfde punt.
    expect(
      oblique.some(
        (seg) =>
          Math.hypot(seg.a.x - attach.x, seg.a.y - attach.y) < 0.01 ||
          Math.hypot(seg.b.x - attach.x, seg.b.y - attach.y) < 0.01,
      ),
    ).toBe(true)
  })

  it('vreemde takken blijven verbonden', () => {
    const { segments } = rebuildObliqueChains({ segments: layer10, axes, policy })
    const oblique = segments.filter((seg) => offAxisDegOf(seg) > policy.deadzoneDeg)
    const endpoints = oblique.flatMap((seg) => [seg.a, seg.b])
    for (const wall of FOREIGN_WALLS) {
      const moved = segments.find(
        (seg) => Math.abs(seg.b.x - wall.b.x) < 0.01 && seg.b.y === wall.b.y,
      )
      expect(moved).toBeDefined()
      const near = endpoints.some((p) => Math.hypot(p.x - moved!.a.x, p.y - moved!.a.y) < 0.01)
      expect(near).toBe(true)
    }
  })

  it('zonder as verandert er niets', () => {
    const { segments, stats } = rebuildObliqueChains({ segments: layer10, axes: [], policy })
    expect(stats.chainsRebuilt).toBe(0)
    expect(segments).toEqual(layer10)
  })

  /**
   * Gemeten op `schuine-gevel-1e`: één restje van 0,5 px in een trap-hoek maakte in
   * de guard-graaf een schijn-T plus een losse I, en die twee draaiden de hele
   * gevel terug naar de trap. Daarom prunet laag 10 stubs vóór de guard meet.
   */
  describe('sub-pixel restje in een trap-hoek', () => {
    const STUB: Segment = { a: { x: 280, y: 280 }, b: { x: 280.5, y: 280 } }
    const withStub = [...layer10, STUB]
    const l10Policy = resolveLayer10FmlPolicy(REF_THICKNESS_PX)

    function guard(segments: Segment[]) {
      return withTopologyGuard({
        segments,
        policy: l10Policy.collapse,
        apply: (input) => rebuildObliqueChains({ segments: input, axes, policy }),
      })
    }

    it('maakt een schijn-T die de herbouw zou terugdraaien', () => {
      expect(countJunctionKindsFromSegments(withStub, l10Policy.collapse).T).toBe(
        countJunctionKindsFromSegments(layer10, l10Policy.collapse).T + 1,
      )
      expect(guard(withStub).preserved).toBe(false)
    })

    it('na de stub-prune haalt dezelfde herbouw de guard wel', () => {
      const pruned = dropZeroLengthSegments(withStub, OBLIQUE_STUB_MAX_PX)
      expect(pruned.removed).toBe(1)
      const result = guard(pruned.segments)
      expect(result.preserved).toBe(true)
      expect(result.result.stats.chainsRebuilt).toBe(1)
      for (const seg of result.segments.filter((s) => offAxisDegOf(s) > policy.deadzoneDeg)) {
        expect(offsetToAxis(seg.a, axes[0])).toBeLessThan(0.01)
        expect(offsetToAxis(seg.b, axes[0])).toBeLessThan(0.01)
      }
    })
  })
})
