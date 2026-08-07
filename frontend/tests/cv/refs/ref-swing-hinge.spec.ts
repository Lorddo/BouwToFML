import { describe, expect, it } from 'vitest'
import {
  resolveMinAxisSeparationDeg,
  resolveSwingHingeFromPolygon,
} from '@/cv/refs/ref-swing-hinge'
import type { RefPoint } from '@/cv/refs/types'

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function pushIfNew(points: RefPoint[], point: RefPoint) {
  const last = points[points.length - 1]
  if (last && last.x === point.x && last.y === point.y) return
  points.push(point)
}

function buildQuarterSectorPolygon(params: {
  hinge: RefPoint
  radius: number
  arcStepDeg: number
  staircase: boolean
}): RefPoint[] {
  const points: RefPoint[] = []
  pushIfNew(points, params.hinge)

  if (params.staircase) {
    const notchX = params.hinge.x + Math.round(params.radius * 0.35)
    pushIfNew(points, { x: notchX, y: params.hinge.y })
    pushIfNew(points, { x: notchX, y: params.hinge.y + 1 })
    pushIfNew(points, { x: notchX + 1, y: params.hinge.y + 1 })
    pushIfNew(points, { x: notchX + 1, y: params.hinge.y })
    pushIfNew(points, { x: params.hinge.x + params.radius, y: params.hinge.y })
  } else {
    pushIfNew(points, { x: params.hinge.x + params.radius, y: params.hinge.y })
  }

  for (let deg = params.arcStepDeg; deg <= 90; deg += params.arcStepDeg) {
    const r = degToRad(deg)
    pushIfNew(points, {
      x: Math.round(params.hinge.x + params.radius * Math.cos(r)),
      y: Math.round(params.hinge.y + params.radius * Math.sin(r)),
    })
  }

  if (params.staircase) {
    const notchY = params.hinge.y + Math.round(params.radius * 0.4)
    pushIfNew(points, { x: params.hinge.x, y: notchY + 1 })
    pushIfNew(points, { x: params.hinge.x + 1, y: notchY + 1 })
    pushIfNew(points, { x: params.hinge.x + 1, y: notchY })
    pushIfNew(points, { x: params.hinge.x, y: notchY })
    pushIfNew(points, { x: params.hinge.x, y: params.hinge.y })
  } else {
    pushIfNew(points, { x: params.hinge.x, y: params.hinge.y + params.radius })
  }

  return points
}

function hasHorizontalAndVerticalAxes(angles: number[], toleranceDeg: number): boolean {
  const hasHorizontal = angles.some((deg) => Math.min(deg, 180 - deg) <= toleranceDeg)
  const hasVertical = angles.some((deg) => Math.abs(90 - deg) <= toleranceDeg)
  return hasHorizontal && hasVertical
}

describe('ref-swing-hinge', () => {
  it('vindt scharnierpunt op bekende kwart-sector', () => {
    const hinge = { x: 12, y: 14 }
    const polygon = buildQuarterSectorPolygon({
      hinge,
      radius: 44,
      arcStepDeg: 8,
      staircase: false,
    })
    const result = resolveSwingHingeFromPolygon({ polygon })
    expect(result).not.toBeNull()
    expect(result!.hinge.x).toBeCloseTo(hinge.x, 0)
    expect(result!.hinge.y).toBeCloseTo(hinge.y, 0)
    expect(result!.angleDeg).toBeGreaterThan(60)
    expect(result!.angleDeg).toBeLessThan(120)
    expect(
      hasHorizontalAndVerticalAxes(
        result!.axes.map((axis) => axis.angleDeg),
        12,
      ),
    ).toBe(true)
  })

  it('blijft assen vinden bij 1-2px trapjes in radii', () => {
    const hinge = { x: 20, y: 18 }
    const polygon = buildQuarterSectorPolygon({
      hinge,
      radius: 40,
      arcStepDeg: 6,
      staircase: true,
    })
    const result = resolveSwingHingeFromPolygon({
      polygon,
      options: { axisBandPx: 3 },
    })
    expect(result).not.toBeNull()
    expect(Number.isFinite(result!.hinge.x)).toBe(true)
    expect(Number.isFinite(result!.hinge.y)).toBe(true)
    expect(
      hasHorizontalAndVerticalAxes(
        result!.axes.map((axis) => axis.angleDeg),
        15,
      ),
    ).toBe(true)
  })

  it('kiest radii-assen ook bij boog met veel korte segmenten', () => {
    const polygon = buildQuarterSectorPolygon({
      hinge: { x: 16, y: 12 },
      radius: 50,
      arcStepDeg: 1,
      staircase: false,
    })
    const result = resolveSwingHingeFromPolygon({
      polygon,
      options: { axisBandPx: 3 },
    })
    expect(result).not.toBeNull()
    expect(
      hasHorizontalAndVerticalAxes(
        result!.axes.map((axis) => axis.angleDeg),
        14,
      ),
    ).toBe(true)
  })

  it('geeft null terug zonder bruikbaar sector-vlak', () => {
    const result = resolveSwingHingeFromPolygon({
      polygon: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
    })
    expect(result).toBeNull()
  })

  it('weigert bijna-parallelle assen (geen scharnier op 2°)', () => {
    // Twee verticale zijkanten + korte boogkoorden — geen echte H+L radii.
    const polygon: RefPoint[] = [
      { x: 10, y: 10 },
      { x: 12, y: 10 },
      { x: 12, y: 60 },
      { x: 40, y: 58 },
      { x: 42, y: 40 },
      { x: 40, y: 20 },
      { x: 38, y: 10 },
      { x: 10, y: 10 },
    ]
    const result = resolveSwingHingeFromPolygon({
      polygon,
      options: { axisBandPx: 3, minSeedLenPx: 4 },
    })
    if (result) {
      expect(result.angleDeg).toBeGreaterThanOrEqual(8)
    } else {
      expect(result).toBeNull()
    }
  })

  it('vindt scharnier op 30°-sector (kastdeuren)', () => {
    const hinge = { x: 14, y: 16 }
    const radius = 48
    const points: RefPoint[] = [hinge, { x: hinge.x + radius, y: hinge.y }]
    for (let deg = 5; deg <= 30; deg += 5) {
      const rad = (deg * Math.PI) / 180
      points.push({
        x: Math.round(hinge.x + radius * Math.cos(rad)),
        y: Math.round(hinge.y + radius * Math.sin(rad)),
      })
    }
    points.push({
      x: Math.round(hinge.x + radius * Math.cos(Math.PI / 6)),
      y: Math.round(hinge.y + radius * Math.sin(Math.PI / 6)),
    })
    points.push(hinge)
    const result = resolveSwingHingeFromPolygon({
      polygon: points,
      options: { expectedAngleDeg: 30 },
    })
    expect(result).not.toBeNull()
    expect(result!.hinge.x).toBeCloseTo(hinge.x, 0)
    expect(result!.hinge.y).toBeCloseTo(hinge.y, 0)
    expect(result!.angleDeg).toBeGreaterThan(20)
    expect(result!.angleDeg).toBeLessThan(40)
  })

  it('resolveMinAxisSeparationDeg volgt ref-hoek (niet vaste 35°)', () => {
    expect(resolveMinAxisSeparationDeg(90)).toBeCloseTo(36, 5)
    expect(resolveMinAxisSeparationDeg(30)).toBeCloseTo(12, 5)
    expect(resolveMinAxisSeparationDeg(15)).toBe(8)
    expect(resolveMinAxisSeparationDeg(null)).toBe(8)
    expect(resolveMinAxisSeparationDeg(undefined)).toBe(8)
  })

  it('kiest scharnier op sterke radii-hoek, niet op vrije boog-tip', () => {
    // BouwTek11-regressie: oranje sector heeft H-boven + V-links, maar picker
    // zette scharnier rechtsboven (lange muur-as × kort boogkoord bij vrije tip).
    const hinge = { x: 20, y: 18 }
    const radius = 56
    const polygon: RefPoint[] = []
    // Chamfer echte scharnierhoek (contour-approx) + volle top-as
    pushIfNew(polygon, { x: hinge.x + 5, y: hinge.y })
    pushIfNew(polygon, { x: hinge.x + radius, y: hinge.y })
    // Boog: eerste segmenten bijna verticaal = valse "blad"-as aan vrije tip
    for (let deg = 1; deg <= 90; deg += 1) {
      const r = degToRad(deg)
      pushIfNew(polygon, {
        x: Math.round(hinge.x + radius * Math.cos(r)),
        y: Math.round(hinge.y + radius * Math.sin(r)),
      })
    }
    // Sterke linker radius, ook chamfer
    pushIfNew(polygon, { x: hinge.x, y: hinge.y + radius })
    pushIfNew(polygon, { x: hinge.x, y: hinge.y + 5 })
    pushIfNew(polygon, { x: hinge.x + 5, y: hinge.y })

    const freeTip = { x: hinge.x + radius, y: hinge.y }
    const result = resolveSwingHingeFromPolygon({
      polygon,
      options: { axisBandPx: 3, expectedAngleDeg: 90 },
    })
    expect(result).not.toBeNull()
    // Dicht bij echte scharnierhoek, niet bij vrije tip rechtsboven
    expect(result!.hinge.x).toBeLessThan(hinge.x + 12)
    expect(result!.hinge.y).toBeLessThan(hinge.y + 12)
    expect(Math.hypot(result!.hinge.x - freeTip.x, result!.hinge.y - freeTip.y)).toBeGreaterThan(
      radius * 0.6,
    )
    const minReach = Math.min(
      Math.hypot(result!.axes[0].b.x - result!.hinge.x, result!.axes[0].b.y - result!.hinge.y),
      Math.hypot(result!.axes[1].b.x - result!.hinge.x, result!.axes[1].b.y - result!.hinge.y),
    )
    expect(minReach).toBeGreaterThan(radius * 0.55)
  })

  it('verkies gebalanceerde radii boven lange as + kort boogkoord', () => {
    const hinge = { x: 10, y: 10 }
    const polygon = buildQuarterSectorPolygon({
      hinge,
      radius: 48,
      arcStepDeg: 5,
      staircase: false,
    })
    // Extra kort verticaal koordje aan de vrije tip (valse "blad"-as).
    polygon.splice(1, 0, { x: hinge.x + 48, y: hinge.y + 8 })
    const result = resolveSwingHingeFromPolygon({
      polygon,
      options: { axisBandPx: 3, expectedAngleDeg: 90 },
    })
    expect(result).not.toBeNull()
    expect(result!.hinge.x).toBeCloseTo(hinge.x, 0)
    expect(result!.hinge.y).toBeCloseTo(hinge.y, 0)
    const minSupport = Math.min(result!.axes[0].supportLength, result!.axes[1].supportLength)
    expect(minSupport).toBeGreaterThan(30)
  })

  // Face-6 approxPolygon uit bg-referentie-analyse (17) — diagonaal blad vanaf links.
  const project4ShallowLeftPolygon: RefPoint[] = [
    { x: 30, y: 19 },
    { x: 30, y: 20 },
    { x: 32, y: 20 },
    { x: 33, y: 21 },
    { x: 42, y: 21 },
    { x: 44, y: 23 },
    { x: 54, y: 24 },
    { x: 58, y: 26 },
    { x: 64, y: 26 },
    { x: 67, y: 28 },
    { x: 67, y: 30 },
    { x: 68, y: 31 },
    { x: 76, y: 31 },
    { x: 79, y: 33 },
    { x: 86, y: 33 },
    { x: 87, y: 34 },
    { x: 92, y: 34 },
    { x: 95, y: 36 },
    { x: 101, y: 36 },
    { x: 104, y: 38 },
    { x: 104, y: 40 },
    { x: 107, y: 40 },
    { x: 108, y: 41 },
    { x: 110, y: 40 },
    { x: 110, y: 35 },
    { x: 112, y: 33 },
    { x: 112, y: 26 },
    { x: 115, y: 21 },
    { x: 115, y: 19 },
    { x: 114, y: 18 },
    { x: 34, y: 18 },
    { x: 33, y: 19 },
  ]

  function mirrorPolygonX(polygon: RefPoint[]): RefPoint[] {
    let minX = Infinity
    let maxX = -Infinity
    for (const p of polygon) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
    }
    return polygon.map((p) => ({ x: maxX + minX - p.x, y: p.y }))
  }

  it('Project4 bg: scharnier links op muur-as, gemeten ondiepe hoek (~14°)', () => {
    // Geen expectedAngleDeg — hoek moet uit de benen komen, geen 90°-prior.
    const result = resolveSwingHingeFromPolygon({ polygon: project4ShallowLeftPolygon })
    expect(result).not.toBeNull()
    const bbox = result!.sectorBBox
    const t = (result!.hinge.x - bbox.x) / Math.max(1, bbox.width)
    expect(t).toBeLessThan(0.28)
    expect(result!.angleDeg).toBeGreaterThan(8)
    expect(result!.angleDeg).toBeLessThan(35)
    const d0 = {
      x: result!.axes[0].b.x - result!.hinge.x,
      y: result!.axes[0].b.y - result!.hinge.y,
    }
    const d1 = {
      x: result!.axes[1].b.x - result!.hinge.x,
      y: result!.axes[1].b.y - result!.hinge.y,
    }
    // Beide benen dezelfde kant langs de muur (niet L↔R tegengesteld).
    expect(d0.x * d1.x).toBeGreaterThanOrEqual(0)
    const hasHorizontal = [d0, d1].some((d) => Math.abs(d.y) <= Math.abs(d.x) * 0.35)
    const hasIntoSwing = [d0, d1].some((d) => d.y > 5)
    expect(hasHorizontal).toBe(true)
    expect(hasIntoSwing).toBe(true)
  })

  it('met expectedAngleDeg: L en R (spiegel) houden beide de ondiepe hoek', () => {
    // Angle-rescue / twin: beide muur-einden zijn kandidaten; dichtste REF-hoek wint
    // (anders kiest balance soms de vrije tip → ~28° i.p.v. ~16°).
    const expected = 16
    const left = resolveSwingHingeFromPolygon({
      polygon: project4ShallowLeftPolygon,
      options: { expectedAngleDeg: expected, preferredWallAxis: 'h' },
    })
    const right = resolveSwingHingeFromPolygon({
      polygon: mirrorPolygonX(project4ShallowLeftPolygon),
      options: { expectedAngleDeg: expected, preferredWallAxis: 'h' },
    })
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()

    const leftT = (left!.hinge.x - left!.sectorBBox.x) / Math.max(1, left!.sectorBBox.width)
    const rightT = (right!.hinge.x - right!.sectorBBox.x) / Math.max(1, right!.sectorBBox.width)
    expect(leftT).toBeLessThan(0.28)
    expect(rightT).toBeGreaterThan(0.72)

    expect(Math.abs(left!.angleDeg - expected)).toBeLessThanOrEqual(10)
    expect(Math.abs(right!.angleDeg - expected)).toBeLessThanOrEqual(10)
    expect(left!.angleDeg).toBeLessThan(22)
    expect(right!.angleDeg).toBeLessThan(22)
  })

  it('vindt scharnier op schematische wedge met weinig punten (PDF-strak)', () => {
    // Kwart-sector met grove stappen — 3–4 segmenten, geen 6+ “arc-like” trapjes.
    const hinge = { x: 40, y: 20 }
    const polygon = buildQuarterSectorPolygon({
      hinge,
      radius: 60,
      arcStepDeg: 30,
      staircase: false,
    })
    expect(polygon.length).toBeLessThan(8)
    const result = resolveSwingHingeFromPolygon({ polygon })
    expect(result).not.toBeNull()
    expect(result!.hinge.x).toBeCloseTo(hinge.x, 0)
    expect(result!.hinge.y).toBeCloseTo(hinge.y, 0)
    expect(result!.angleDeg).toBeGreaterThan(50)
    expect(result!.angleDeg).toBeLessThan(120)
  })

  it('ondiepe trapjes-wedge blijft hinge leveren (geen arc-punt-gate)', () => {
    // Shallow diagonaal ≈17° — geometrie van het symbool, geen detectie-fout.
    const hinge = { x: 39, y: 24 }
    const polygon: RefPoint[] = [hinge, { x: 39, y: 80 }]
    for (let i = 0; i <= 45; i += 1) {
      polygon.push({
        x: 39 + Math.round(i * 4.2),
        y: 80 - Math.round(i * 1.2),
      })
    }
    polygon.push({ x: 228, y: 24 })
    const result = resolveSwingHingeFromPolygon({ polygon })
    expect(result).not.toBeNull()
    expect(result!.angleDeg).toBeGreaterThanOrEqual(8)
  })
})
