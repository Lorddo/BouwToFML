import { describe, expect, it } from 'vitest'
import { glyphFromElevationRect } from '@/core/fml/elevation-opening-symbol'
import {
  BIFOLD_DOOR_REFID,
  BIFOLD_DOUBLE_DOOR_REFID,
  CONCEPT_DOOR_REFID,
  CONCEPT_WINDOW_REFID,
  DOUBLE_WIDE_DOOR_REFID,
  POCKET_DOOR_REFID,
  SLIDING_DOUBLE_DOOR_REFID,
  SLIDING_SINGLE_DOOR_REFID,
} from '@/core/fml/types'

function doorRect(params: {
  refid: string
  mirrored?: [number, number]
  startOnLeft?: boolean
  x0?: number
  x1?: number
  widthCm?: number
}) {
  const x0 = params.x0 ?? 0
  const x1 = params.x1 ?? 90
  return glyphFromElevationRect({
    x0,
    y0: -220,
    x1,
    y1: 0,
    type: 'door',
    refid: params.refid,
    mirrored: params.mirrored,
    widthCm: params.widthCm ?? x1 - x0,
    startOnLeft: params.startOnLeft,
  })
}

function handleXs(symbol: ReturnType<typeof glyphFromElevationRect>): number[] {
  return symbol.circles.filter((circle) => circle.role === 'handle').map((circle) => circle.cx)
}

describe('elevation-opening-symbol handles', () => {
  it('zet de kruk tegenover het scharnier (mirrored[0])', () => {
    const hingeStart = doorRect({ refid: CONCEPT_DOOR_REFID, mirrored: [0, 0] })
    const hingeEnd = doorRect({ refid: CONCEPT_DOOR_REFID, mirrored: [1, 0] })
    const mid = 45
    expect(handleXs(hingeStart)).toHaveLength(1)
    expect(handleXs(hingeEnd)).toHaveLength(1)
    expect(handleXs(hingeStart)[0]).toBeGreaterThan(mid)
    expect(handleXs(hingeEnd)[0]).toBeLessThan(mid)
    expect(hingeStart.circles.some((c) => c.role === 'handle')).toBe(true)
    expect(hingeStart.polys.some((p) => p.role === 'handle')).toBe(true)
  })

  it('spiegel-muur (start rechts): kruk blijft tegenover muur-a scharnier', () => {
    const hingeStart = doorRect({
      refid: CONCEPT_DOOR_REFID,
      mirrored: [0, 0],
      startOnLeft: false,
    })
    expect(handleXs(hingeStart)[0]).toBeLessThan(45)
  })

  it('dubbele deur: twee krukken bij het midden', () => {
    const glyph = doorRect({ refid: DOUBLE_WIDE_DOOR_REFID, widthCm: 180, x1: 180 })
    const xs = handleXs(glyph).sort((a, b) => a - b)
    expect(xs).toHaveLength(2)
    expect(xs[0]).toBeLessThan(90)
    expect(xs[1]).toBeGreaterThan(90)
  })

  it('schuifpui 1 schuivend: kruk op het schuivende deel', () => {
    const defaultSlide = doorRect({
      refid: SLIDING_SINGLE_DOOR_REFID,
      mirrored: [0, 0],
      widthCm: 180,
      x1: 180,
    })
    const flipped = doorRect({
      refid: SLIDING_SINGLE_DOOR_REFID,
      mirrored: [1, 0],
      widthCm: 180,
      x1: 180,
    })
    expect(handleXs(defaultSlide)).toHaveLength(1)
    expect(handleXs(flipped)).toHaveLength(1)
    expect(handleXs(defaultSlide)[0]).toBeGreaterThan(90)
    expect(handleXs(flipped)[0]).toBeLessThan(90)
  })

  it('schuifpui 2 schuivend: kruk op beide delen', () => {
    const glyph = doorRect({
      refid: SLIDING_DOUBLE_DOOR_REFID,
      widthCm: 180,
      x1: 180,
    })
    expect(handleXs(glyph)).toHaveLength(2)
  })

  it('pocketdeur: kruk op de grijpkant (niet de pocket)', () => {
    const pocketAtStart = doorRect({ refid: POCKET_DOOR_REFID, mirrored: [0, 0] })
    const pocketAtEnd = doorRect({ refid: POCKET_DOOR_REFID, mirrored: [1, 0] })
    expect(handleXs(pocketAtStart)[0]).toBeGreaterThan(45)
    expect(handleXs(pocketAtEnd)[0]).toBeLessThan(45)
  })

  it('vouwdeur: 2 of 4 panelen met scharnier tussen de delen', () => {
    const two = doorRect({ refid: BIFOLD_DOOR_REFID, widthCm: 160, x1: 160 })
    const twoHinges = two.polys.filter((poly) => poly.role === 'hinge')
    expect(twoHinges.length).toBeGreaterThanOrEqual(6)
    expect(handleXs(two)).toHaveLength(1)
    const four = doorRect({ refid: BIFOLD_DOUBLE_DOOR_REFID, widthCm: 240, x1: 240 })
    expect(four.polys.filter((poly) => poly.role === 'hinge').length).toBeGreaterThanOrEqual(12)
    expect(handleXs(four)).toHaveLength(2)
  })

  it('raam krijgt geen kruk', () => {
    const glyph = glyphFromElevationRect({
      x0: 0,
      y0: -140,
      x1: 120,
      y1: -40,
      type: 'window',
      refid: CONCEPT_WINDOW_REFID,
      widthCm: 120,
    })
    expect(handleXs(glyph)).toHaveLength(0)
    expect(glyph.polys.some((p) => p.role === 'handle')).toBe(false)
  })
})
