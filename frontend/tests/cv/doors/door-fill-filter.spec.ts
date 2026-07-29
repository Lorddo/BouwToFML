import { describe, expect, it } from 'vitest'
import { runDoorFillFilter, type DoorSwingHypothesis, type DoorSwingRefBand } from '@/cv/doors'

function hypothesis(params: {
  id: string
  filledAreaPx: number
  width: number
  height: number
  faceIds?: number[]
  matchedRefIndex?: number
}): DoorSwingHypothesis {
  return {
    id: params.id,
    faceIds: params.faceIds ?? [1],
    unionBBox: { x: 0, y: 0, width: params.width, height: params.height },
    filledAreaPx: params.filledAreaPx,
    score: 0.9,
    source: 'single',
    matchedRefIndex: params.matchedRefIndex ?? 0,
  }
}

describe('door-fill-filter', () => {
  it('rejectt een massief vierkant als too_full t.o.v. ref-fill', () => {
    const refs: DoorSwingRefBand[] = [{ aspectRef: 1, swingWpx: 100, swingHpx: 100, areaPx: 7800 }]
    const result = runDoorFillFilter({
      hypotheses: [hypothesis({ id: 'h1', filledAreaPx: 10000, width: 100, height: 100 })],
      refBands: refs,
    })

    expect(result.accepted).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0]?.reason).toBe('too_full')
    expect(result.stats.rejectedTooFull).toBe(1)
  })

  it('accepteert een kwartboog-achtige vulling dicht bij de ref-fill', () => {
    const refs: DoorSwingRefBand[] = [{ aspectRef: 1, swingWpx: 100, swingHpx: 100, areaPx: 7800 }]
    const result = runDoorFillFilter({
      hypotheses: [hypothesis({ id: 'h1', filledAreaPx: 7750, width: 100, height: 100 })],
      refBands: refs,
    })

    expect(result.accepted.map((hyp) => hyp.id)).toEqual(['h1'])
    expect(result.rejected).toHaveLength(0)
  })

  it('werkt per-ref: ondiepe ref accepteert passende candidate en reject te volle candidate', () => {
    const refs: DoorSwingRefBand[] = [
      { aspectRef: 1.25, swingWpx: 100, swingHpx: 80, areaPx: 3000 },
    ]
    const result = runDoorFillFilter({
      hypotheses: [
        hypothesis({ id: 'ok', filledAreaPx: 3200, width: 100, height: 80 }),
        hypothesis({ id: 'too-full', filledAreaPx: 4800, width: 100, height: 80 }),
      ],
      refBands: refs,
    })

    expect(result.accepted.map((hyp) => hyp.id)).toEqual(['ok'])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0]?.hypothesis.id).toBe('too-full')
    expect(result.rejected[0]?.reason).toBe('too_full')
  })

  it('hanteert bandgrenzen inclusief randwaarden en reject net buiten de band', () => {
    const refs: DoorSwingRefBand[] = [{ aspectRef: 1, swingWpx: 100, swingHpx: 100, areaPx: 5000 }]
    const result = runDoorFillFilter({
      hypotheses: [
        hypothesis({ id: 'lower-edge', filledAreaPx: 4000, width: 100, height: 100 }),
        hypothesis({ id: 'upper-edge', filledAreaPx: 6000, width: 100, height: 100 }),
        hypothesis({ id: 'below', filledAreaPx: 3999, width: 100, height: 100 }),
        hypothesis({ id: 'above', filledAreaPx: 6001, width: 100, height: 100 }),
      ],
      refBands: refs,
    })

    expect(result.accepted.map((hyp) => hyp.id)).toEqual(['lower-edge', 'upper-edge'])
    const rejected = result.rejected.map((row) => [row.hypothesis.id, row.reason])
    expect(rejected).toContainEqual(['below', 'too_empty'])
    expect(rejected).toContainEqual(['above', 'too_full'])
  })

  it('beoordeelt multi-face cluster op totale hypothese-vulling (niet per face)', () => {
    const refs: DoorSwingRefBand[] = [{ aspectRef: 1, swingWpx: 100, swingHpx: 100, areaPx: 5000 }]
    const result = runDoorFillFilter({
      hypotheses: [
        hypothesis({
          id: 'cluster',
          faceIds: [10, 11],
          width: 100,
          height: 100,
          filledAreaPx: 5500,
        }),
      ],
      refBands: refs,
    })

    expect(result.accepted.map((hyp) => hyp.id)).toEqual(['cluster'])
    expect(result.rejected).toHaveLength(0)
  })
})
