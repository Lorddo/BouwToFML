import { describe, expect, it } from 'vitest'
import { glyphFromElevationRect } from '@/core/plan/elevation-opening-symbol'

function doorRect(params: {
  kind: string
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
    kind: params.kind,
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
    const hingeStart = doorRect({ kind: 'door.single', mirrored: [0, 0] })
    const hingeEnd = doorRect({ kind: 'door.single', mirrored: [1, 0] })
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
      kind: 'door.single',
      mirrored: [0, 0],
      startOnLeft: false,
    })
    expect(handleXs(hingeStart)[0]).toBeLessThan(45)
  })

  it('dubbele deur: twee krukken bij het midden', () => {
    const glyph = doorRect({ kind: 'door.double', widthCm: 180, x1: 180 })
    const xs = handleXs(glyph).sort((a, b) => a - b)
    expect(xs).toHaveLength(2)
    expect(xs[0]).toBeLessThan(90)
    expect(xs[1]).toBeGreaterThan(90)
  })

  it('schuifpui 1 schuivend: kruk op het schuivende deel', () => {
    const defaultSlide = doorRect({
      kind: 'door.sliding_single',
      mirrored: [0, 0],
      widthCm: 180,
      x1: 180,
    })
    const flipped = doorRect({
      kind: 'door.sliding_single',
      mirrored: [1, 0],
      widthCm: 180,
      x1: 180,
    })
    expect(handleXs(defaultSlide)).toHaveLength(1)
    expect(handleXs(flipped)).toHaveLength(1)
    expect(handleXs(defaultSlide)[0]).toBeGreaterThan(90)
    expect(handleXs(flipped)[0]).toBeLessThan(90)
  })

  it('schuifpui 1 schuivend gespiegeld: kruk op de andere helft', () => {
    const mirroredKind = doorRect({
      kind: 'door.sliding_single_mirror',
      mirrored: [0, 0],
      widthCm: 180,
      x1: 180,
    })
    const base = doorRect({
      kind: 'door.sliding_single',
      mirrored: [0, 0],
      widthCm: 180,
      x1: 180,
    })
    expect(handleXs(mirroredKind)).toHaveLength(1)
    expect(handleXs(mirroredKind)[0]).toBeLessThan(90)
    expect(handleXs(base)[0]).toBeGreaterThan(90)
  })

  it('schuifpui 2 schuivend: kruk op beide delen', () => {
    const glyph = doorRect({
      kind: 'door.sliding',
      widthCm: 180,
      x1: 180,
    })
    expect(handleXs(glyph)).toHaveLength(2)
  })

  it('pocketdeur: kruk op de grijpkant (niet de pocket)', () => {
    const pocketAtStart = doorRect({ kind: 'door.pocket', mirrored: [0, 0] })
    const pocketAtEnd = doorRect({ kind: 'door.pocket', mirrored: [1, 0] })
    expect(handleXs(pocketAtStart)[0]).toBeGreaterThan(45)
    expect(handleXs(pocketAtEnd)[0]).toBeLessThan(45)
  })

  it('vouwdeur: 2 of 4 panelen met scharnier tussen de delen', () => {
    const two = doorRect({ kind: 'door.bifold', widthCm: 160, x1: 160 })
    const twoHinges = two.polys.filter((poly) => poly.role === 'hinge')
    expect(twoHinges.length).toBeGreaterThanOrEqual(6)
    expect(handleXs(two)).toHaveLength(1)
    const four = doorRect({ kind: 'door.bifold_double', widthCm: 240, x1: 240 })
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
      kind: 'window.single',
      widthCm: 120,
    })
    expect(handleXs(glyph)).toHaveLength(0)
    expect(glyph.polys.some((p) => p.role === 'handle')).toBe(false)
  })

  it('ronde opening: geen kozijn, geen glas, geen kruk', () => {
    const glyph = doorRect({ kind: 'door.round' })
    expect(handleXs(glyph)).toHaveLength(0)
    expect(glyph.polys.some((p) => p.role === 'glass' || p.role === 'frame')).toBe(false)
  })

  it('flush: geen kruk, geen scharnier', () => {
    const glyph = doorRect({ kind: 'door.flush' })
    expect(handleXs(glyph)).toHaveLength(0)
    expect(glyph.polys.some((p) => p.role === 'hinge')).toBe(false)
  })

  it('voordeur: glas in de bovenste helft, 10 cm hout rondom', () => {
    const glyph = doorRect({ kind: 'door.half_glass' })
    const glass = glyph.polys.find((p) => p.role === 'glass')
    expect(glass).toBeTruthy()
    expect(glyph.polys.some((p) => p.role === 'leaf')).toBe(true)
    const xs = (glass!.points ?? []).filter((_, i) => i % 2 === 0)
    const ys = (glass!.points ?? []).filter((_, i) => i % 2 === 1)
    const midY = (glyph.inner.y0 + glyph.inner.y1) / 2
    expect(Math.min(...xs)).toBeCloseTo(glyph.inner.x0 + 10, 5)
    expect(Math.max(...xs)).toBeCloseTo(glyph.inner.x1 - 10, 5)
    expect(Math.min(...ys)).toBeCloseTo(glyph.inner.y0 + 10, 5)
    expect(Math.max(...ys)).toBeCloseTo(midY - 10, 5)
  })

  it('liftdeuren: middennaad, geen kruk', () => {
    const glyph = doorRect({ kind: 'door.elevator' })
    expect(handleXs(glyph)).toHaveLength(0)
    expect(glyph.polys.some((p) => p.role === 'mullion' || p.role === 'leaf')).toBe(true)
    expect(glyph.circles.some((c) => c.role === 'panel')).toBe(true)
  })

  it('Frans balkon: glas 80% van het paneel + railing', () => {
    const glyph = doorRect({ kind: 'door.french_balcony' })
    const glass = glyph.polys.find((p) => p.role === 'glass')
    expect(glass).toBeTruthy()
    const ys = glass!.points.filter((_, i) => i % 2 === 1)
    const glassH = Math.max(...ys) - Math.min(...ys)
    expect(glassH / (glyph.inner.y1 - glyph.inner.y0)).toBeCloseTo(0.8, 5)
    expect(glyph.polys.some((p) => p.role === 'railing')).toBe(true)
  })

  it('dubbele standaarddeur: twee glasvlakken met 10 cm hout, twee krukken', () => {
    const glyph = doorRect({ kind: 'door.double_standard', widthCm: 180, x1: 180 })
    const glasses = glyph.polys.filter((p) => p.role === 'glass')
    expect(glasses).toHaveLength(2)
    expect(handleXs(glyph)).toHaveLength(2)
    const mid = (glyph.inner.x0 + glyph.inner.x1) / 2
    const leftXs = (glasses[0]!.points ?? []).filter((_, i) => i % 2 === 0)
    const rightXs = (glasses[1]!.points ?? []).filter((_, i) => i % 2 === 0)
    expect(Math.min(...leftXs)).toBeCloseTo(glyph.inner.x0 + 10, 5)
    expect(Math.max(...leftXs)).toBeCloseTo(mid - 10, 5)
    expect(Math.min(...rightXs)).toBeCloseTo(mid + 10, 5)
    expect(Math.max(...rightXs)).toBeCloseTo(glyph.inner.x1 - 10, 5)
  })

  it('balkondeur: glas met 10 cm hout rondom, kruk, geen railing', () => {
    const glyph = doorRect({ kind: 'door.balcony' })
    const glass = glyph.polys.find((p) => p.role === 'glass')
    expect(glass).toBeTruthy()
    expect(glyph.polys.some((p) => p.role === 'leaf')).toBe(true)
    expect(glyph.polys.some((p) => p.role === 'railing')).toBe(false)
    expect(handleXs(glyph)).toHaveLength(1)
    const xs = (glass!.points ?? []).filter((_, i) => i % 2 === 0)
    const ys = (glass!.points ?? []).filter((_, i) => i % 2 === 1)
    expect(Math.min(...xs)).toBeCloseTo(glyph.inner.x0 + 10, 5)
    expect(Math.max(...xs)).toBeCloseTo(glyph.inner.x1 - 10, 5)
    expect(Math.min(...ys)).toBeCloseTo(glyph.inner.y0 + 10, 5)
    expect(Math.max(...ys)).toBeCloseTo(glyph.inner.y1 - 10, 5)
  })
})
