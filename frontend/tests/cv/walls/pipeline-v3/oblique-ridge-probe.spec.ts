import { describe, expect, it } from 'vitest'
import type { Segment } from '@/cv/port/wallGraph'
import { probeSegmentRidge } from '@/cv/walls/rooms/pipeline-v3/engines/oblique'
import { buildSyntheticField, type SyntheticBand } from './oblique-synthetic-field'

const WIDTH = 400
const HEIGHT = 400

/** Schuine gevel: ruim 5 graden uit lood, dik. */
const OBLIQUE_BAND: SyntheticBand = {
  a: { x: 300, y: 40 },
  b: { x: 268, y: 360 },
  thicknessPx: 60,
}

function shiftAlongNormal(seg: Segment, px: number): Segment {
  const dx = seg.b.x - seg.a.x
  const dy = seg.b.y - seg.a.y
  const len = Math.hypot(dx, dy)
  const nx = -dy / len
  const ny = dx / len
  return {
    a: { x: seg.a.x + nx * px, y: seg.a.y + ny * px },
    b: { x: seg.b.x + nx * px, y: seg.b.y + ny * px },
  }
}

describe('oblique ridge-probe', () => {
  const field = buildSyntheticField({ bands: [OBLIQUE_BAND], width: WIDTH, height: HEIGHT })
  const centerline: Segment = { a: { ...OBLIQUE_BAND.a }, b: { ...OBLIQUE_BAND.b } }

  it('hartlijn van een schuine muur ligt op de rug', () => {
    const probe = probeSegmentRidge(centerline, field)
    expect(probe).not.toBeNull()
    expect(probe!.offsetMedianPx).toBeLessThanOrEqual(1)
    expect(probe!.offsetP90Px).toBeLessThanOrEqual(2)
    expect(probe!.dtMedianPx).toBeGreaterThan(OBLIQUE_BAND.thicknessPx / 2 - 2)
    expect(probe!.inInkRatio).toBe(1)
  })

  it('zijwaarts verschoven lijn meet zijn eigen verschuiving', () => {
    const probe = probeSegmentRidge(shiftAlongNormal(centerline, 20), field)!
    expect(probe.offsetMedianPx).toBeGreaterThanOrEqual(18)
    expect(probe.offsetMedianPx).toBeLessThanOrEqual(22)
    expect(probe.dtDeficitMedianPx).toBeGreaterThanOrEqual(15)
  })

  it('trap-trede door een schuine muur wijkt meetbaar meer af dan de hartlijn', () => {
    // Zuiver verticaal stuk dat de schuine band diagonaal doorsnijdt. De trede
    // kruist de rug in het midden, dus de mediaan blijft laag; de staart verraadt hem.
    const tread: Segment = { a: { x: 284, y: 100 }, b: { x: 284, y: 300 } }
    const probe = probeSegmentRidge(tread, field)!
    const trueLine = probeSegmentRidge(centerline, field)!
    expect(probe.offsetMedianPx).toBeGreaterThan(trueLine.offsetP90Px + 2)
    expect(probe.offsetMaxPx).toBeGreaterThan(trueLine.offsetMaxPx + 5)
  })

  it('stootbord loodrecht op een schuine muur wijkt maximaal af', () => {
    const riser: Segment = { a: { x: 270, y: 200 }, b: { x: 300, y: 200 } }
    const probe = probeSegmentRidge(riser, field)!
    expect(probe.offsetMedianPx).toBeGreaterThan(20)
  })

  it('dunne muur naast een dikke muur blijft op zijn eigen rug', () => {
    // Zonder bergopwaarts klimmen pakt de sonde hier de rug van de dikke muur:
    // dat was de valse 70 px op controlemuur (837,1585)->(970,1585).
    const nearby = buildSyntheticField({
      bands: [
        { a: { x: 200, y: 20 }, b: { x: 200, y: 380 }, thicknessPx: 96 },
        { a: { x: 300, y: 20 }, b: { x: 300, y: 380 }, thicknessPx: 22 },
      ],
      width: WIDTH,
      height: HEIGHT,
    })
    const thinCenter: Segment = { a: { x: 300, y: 60 }, b: { x: 300, y: 340 } }
    const probe = probeSegmentRidge(thinCenter, nearby)!
    expect(probe.offsetMedianPx).toBeLessThanOrEqual(1)
    expect(probe.offsetMaxPx).toBeLessThanOrEqual(2)
    expect(probe.dtMedianPx).toBeLessThan(15)
  })

  it('segment korter dan een pixel levert geen meting', () => {
    expect(probeSegmentRidge({ a: { x: 10, y: 10 }, b: { x: 10.2, y: 10 } }, field)).toBeNull()
  })
})
