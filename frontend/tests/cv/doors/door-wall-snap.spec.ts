import { afterEach, describe, expect, it } from 'vitest'
import { clearEscalationOff } from '@/core/diagnostics'
import type { SemanticWallSegment } from '@/core/extraction/types'
import { snapDoorsToWalls, type ResolvedDoorCandidate } from '@/cv/doors'

function fillRect(
  data: Uint8Array | Int32Array,
  width: number,
  rect: { x0: number; y0: number; x1: number; y1: number },
  value: number,
): void {
  for (let y = rect.y0; y < rect.y1; y += 1) {
    for (let x = rect.x0; x < rect.x1; x += 1) {
      data[y * width + x] = value
    }
  }
}

function makeDoor(params: {
  id: string
  bbox: { x: number; y: number; width: number; height: number }
  faceIds?: number[]
}): ResolvedDoorCandidate {
  return {
    id: params.id,
    source: 'single',
    score: 0.9,
    matchedRefIndex: 0,
    faceIds: params.faceIds ?? [1],
    bbox: params.bbox,
    centroidPx: {
      x: params.bbox.x + params.bbox.width / 2,
      y: params.bbox.y + params.bbox.height / 2,
    },
    swingSpanPx: params.bbox.width,
    framingPx: 0,
    overhangAlongPx: params.bbox.width,
    overhangOppositePx: 0,
    framingAlongPx: 0,
    framingOppositePx: 0,
    ratioBlade: 1,
    widthPx: params.bbox.width,
    widthCm: params.bbox.width / 10,
    fmlRefId: '04342465-a4f2-4f98-b06e-72e85f4dbbd0',
    kind: 'single',
  }
}

function makeSegment(params: {
  a: { x: number; y: number }
  b: { x: number; y: number }
  thicknessPxMax?: number
}): SemanticWallSegment {
  return {
    a: params.a,
    b: params.b,
    thicknessPxMax: params.thicknessPxMax ?? 6,
  }
}

describe('door-wall-snap', () => {
  afterEach(() => {
    clearEscalationOff()
  })

  it('kiest de zijde met beste contact en snapt naar parallel segment', () => {
    const width = 120
    const height = 120
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    fillRect(wallMask, width, { x0: 19, y0: 0, x1: 22, y1: 120 }, 255)
    fillRect(labels, width, { x0: 23, y0: 30, x1: 43, y1: 50 }, 1)
    const doors = [makeDoor({ id: 'door-a', bbox: { x: 23, y: 30, width: 20, height: 20 } })]
    const segments = [makeSegment({ a: { x: 20, y: 0 }, b: { x: 20, y: 100 }, thicknessPxMax: 8 })]

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 8,
    })

    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.segmentIndex).toBe(0)
    expect(snapped[0]?.openingAxis).toBe('v')
    expect(snapped[0]?.outwardSign).toBe(-1)
    expect(snapped[0]?.t).toBeCloseTo(0.4, 1)
    expect(snapped[0]?.snappedBBox.x).toBeCloseTo(20, 1)
  })

  it('hoekdeur: sterkste aansluiting wint wanneer twee zijdes contact hebben', () => {
    const width = 140
    const height = 140
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    fillRect(labels, width, { x0: 40, y0: 40, x1: 60, y1: 60 }, 1)
    fillRect(wallMask, width, { x0: 38, y0: 35, x1: 40, y1: 65 }, 255) // links, lang
    fillRect(wallMask, width, { x0: 40, y0: 38, x1: 50, y1: 40 }, 255) // boven, kort
    const doors = [makeDoor({ id: 'door-corner', bbox: { x: 40, y: 40, width: 20, height: 20 } })]
    const segments = [
      makeSegment({ a: { x: 39, y: 10 }, b: { x: 39, y: 90 }, thicknessPxMax: 6 }),
      makeSegment({ a: { x: 20, y: 39 }, b: { x: 90, y: 39 }, thicknessPxMax: 6 }),
    ]

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 6,
    })

    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.segmentIndex).toBe(0)
    expect(snapped[0]?.openingAxis).toBe('v')
    expect(snapped[0]?.outwardSign).toBe(-1)
    expect((snapped[0]?.contactScore ?? 0) > (snapped[0]?.secondaryContactScore ?? 0)).toBe(true)
  })

  it('wijst loodrechte segmenten af bij side-axis mapping', () => {
    const width = 120
    const height = 120
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    fillRect(wallMask, width, { x0: 19, y0: 0, x1: 22, y1: 120 }, 255)
    fillRect(labels, width, { x0: 23, y0: 30, x1: 43, y1: 50 }, 1)
    const doors = [makeDoor({ id: 'door-b', bbox: { x: 23, y: 30, width: 20, height: 20 } })]
    const segments = [makeSegment({ a: { x: 0, y: 20 }, b: { x: 80, y: 20 }, thicknessPxMax: 8 })]

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 8,
    })

    expect(snapped).toHaveLength(0)
  })

  it('snapt naar dichtstbijzijnde mask wanneer direct contact ontbreekt', () => {
    const width = 120
    const height = 120
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    fillRect(wallMask, width, { x0: 18, y0: 0, x1: 20, y1: 120 }, 255)
    fillRect(labels, width, { x0: 23, y0: 30, x1: 43, y1: 50 }, 1)
    const doors = [makeDoor({ id: 'door-near', bbox: { x: 23, y: 30, width: 20, height: 20 } })]
    const segments = [makeSegment({ a: { x: 19, y: 0 }, b: { x: 19, y: 100 }, thicknessPxMax: 8 })]

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 6,
    })

    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.segmentIndex).toBe(0)
    expect(snapped[0]?.openingAxis).toBe('v')
  })

  it('probeert tweede contact-zijde wanneer beste zijde geen segmentmatch heeft', () => {
    const width = 140
    const height = 140
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    fillRect(labels, width, { x0: 40, y0: 40, x1: 60, y1: 60 }, 1)
    fillRect(wallMask, width, { x0: 38, y0: 35, x1: 40, y1: 65 }, 255) // links: sterk contact
    fillRect(wallMask, width, { x0: 40, y0: 38, x1: 60, y1: 40 }, 255) // boven: ook contact
    const doors = [
      makeDoor({ id: 'door-side-fallback', bbox: { x: 40, y: 40, width: 20, height: 20 } }),
    ]
    const segments = [makeSegment({ a: { x: 20, y: 39 }, b: { x: 90, y: 39 }, thicknessPxMax: 6 })]

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 6,
    })

    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.segmentIndex).toBe(0)
    expect(snapped[0]?.openingAxis).toBe('h')
  })

  it('kiest hogere contactratio boven langere rand bij touch-op-twee-zijden', () => {
    const width = 140
    const height = 140
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)

    // Deur linksboven met volledige linker-contact en gedeeltelijke top-contact.
    fillRect(labels, width, { x0: 40, y0: 40, x1: 80, y1: 80 }, 1)
    fillRect(wallMask, width, { x0: 38, y0: 40, x1: 40, y1: 80 }, 255) // links: volledig
    fillRect(wallMask, width, { x0: 40, y0: 38, x1: 80, y1: 40 }, 255) // boven: basis volledig
    fillRect(wallMask, width, { x0: 66, y0: 38, x1: 80, y1: 40 }, 0) // boven rechts deels weg -> lagere ratio

    const doors = [
      makeDoor({ id: 'door-ratio-priority', bbox: { x: 40, y: 40, width: 40, height: 40 } }),
    ]
    const segments = [
      makeSegment({ a: { x: 39, y: 20 }, b: { x: 39, y: 100 }, thicknessPxMax: 6 }), // links
      makeSegment({ a: { x: 20, y: 39 }, b: { x: 110, y: 39 }, thicknessPxMax: 6 }), // boven
    ]

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 6,
    })

    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.segmentIndex).toBe(0)
    expect(snapped[0]?.openingAxis).toBe('v')
  })

  it('dunne horizontale bbox beperkt kandidaat-zijden tot top/bottom', () => {
    const width = 180
    const height = 120
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)

    fillRect(labels, width, { x0: 40, y0: 40, x1: 120, y1: 56 }, 1) // dun en breed
    fillRect(wallMask, width, { x0: 40, y0: 38, x1: 120, y1: 40 }, 255) // top contact
    fillRect(wallMask, width, { x0: 38, y0: 40, x1: 40, y1: 56 }, 255) // left contact (moet genegeerd worden)

    const doors = [
      makeDoor({ id: 'door-thin-horizontal', bbox: { x: 40, y: 40, width: 80, height: 16 } }),
    ]
    const segments = [
      makeSegment({ a: { x: 39, y: 20 }, b: { x: 39, y: 90 }, thicknessPxMax: 6 }), // verticaal (left/right)
      makeSegment({ a: { x: 10, y: 39 }, b: { x: 160, y: 39 }, thicknessPxMax: 6 }), // horizontaal (top/bottom)
    ]

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 6,
    })

    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.segmentIndex).toBe(1)
    expect(snapped[0]?.openingAxis).toBe('h')
  })

  it('Path B zonder D-49 bindt niet bij same-axis span-gap (legacy uit)', () => {
    const width = 220
    const height = 140
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    fillRect(labels, width, { x0: 40, y0: 40, x1: 100, y1: 70 }, 1)
    fillRect(wallMask, width, { x0: 40, y0: 38, x1: 100, y1: 40 }, 255)
    const doors = [
      makeDoor({ id: 'door-no-relaxed-span-gap', bbox: { x: 40, y: 40, width: 60, height: 30 } }),
    ]
    const segments = [
      makeSegment({ a: { x: 110, y: 39 }, b: { x: 170, y: 39 }, thicknessPxMax: 6 }),
    ]

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 6,
    })

    expect(snapped).toHaveLength(0)
  })

  it('Path B (D-48): kiest swing-zijde met beste wallMask-dekking', () => {
    // Face is klein; wallMask moet de swing-face raken (niet alleen de deur-bbox — D-52 weg).
    const width = 140
    const height = 140
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)

    fillRect(labels, width, { x0: 54, y0: 54, x1: 66, y1: 66 }, 1)
    fillRect(wallMask, width, { x0: 52, y0: 54, x1: 54, y1: 66 }, 255) // links: volle face-hoogte
    fillRect(wallMask, width, { x0: 54, y0: 52, x1: 60, y1: 54 }, 255) // boven: deels (kortere dekking)

    const doors = [
      makeDoor({ id: 'door-swing-coverage', bbox: { x: 40, y: 40, width: 40, height: 40 } }),
    ]
    const segments = [
      makeSegment({ a: { x: 53, y: 20 }, b: { x: 53, y: 100 }, thicknessPxMax: 6 }),
      makeSegment({ a: { x: 20, y: 53 }, b: { x: 110, y: 53 }, thicknessPxMax: 6 }),
    ]

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 6,
    })

    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.segmentIndex).toBe(0)
    expect(snapped[0]?.openingAxis).toBe('v')
  })

  it('bindt meerdere kleine near-wall deuren op dezelfde horizontale muur', () => {
    const width = 1384
    const height = 2456
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)

    fillRect(wallMask, width, { x0: 220, y0: 1218, x1: 644, y1: 1221 }, 255)
    const doorBBoxes = [
      { x: 267, y: 1180, width: 52, height: 30 },
      { x: 351, y: 1180, width: 52, height: 30 },
      { x: 466, y: 1180, width: 52, height: 30 },
      { x: 550, y: 1180, width: 52, height: 30 },
    ]
    const doors = doorBBoxes.map((bbox, idx) => {
      const label = idx + 1
      fillRect(
        labels,
        width,
        { x0: bbox.x, y0: bbox.y, x1: bbox.x + bbox.width, y1: bbox.y + bbox.height },
        label,
      )
      return makeDoor({ id: `door-small-${idx + 1}`, bbox, faceIds: [label] })
    })
    const segments = [
      makeSegment({
        a: { x: 222.97, y: 1219.45 },
        b: { x: 643.12, y: 1219.45 },
        thicknessPxMax: 8,
      }),
    ]

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 8,
    })

    expect(snapped).toHaveLength(4)
    for (const door of snapped) {
      expect(door.segmentIndex).toBe(0)
      expect(door.openingAxis).toBe('h')
    }
  })

  it('kiest segment-ondersteunde zijde bij meerdere mask-touch kandidaten', () => {
    const width = 260
    const height = 220
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)

    // Deur met twee geldige touches (top + links); verticaal ligt dichter bij hinge/normal.
    fillRect(labels, width, { x0: 120, y0: 120, x1: 180, y1: 180 }, 1)
    fillRect(wallMask, width, { x0: 120, y0: 105, x1: 180, y1: 109 }, 255) // top op 15px afstand
    fillRect(wallMask, width, { x0: 112, y0: 120, x1: 116, y1: 200 }, 255) // links op 8px afstand
    const doors = [
      makeDoor({
        id: 'door-segment-supported-side',
        bbox: { x: 120, y: 120, width: 60, height: 60 },
      }),
    ]
    const segments = [
      makeSegment({ a: { x: 114, y: 90 }, b: { x: 114, y: 210 }, thicknessPxMax: 8 }), // verticaal (verwacht)
      makeSegment({ a: { x: 90, y: 107 }, b: { x: 220, y: 107 }, thicknessPxMax: 8 }), // horizontaal
    ]

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 30,
    })

    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.segmentIndex).toBe(0)
    expect(snapped[0]?.openingAxis).toBe('v')
  })

  it('weigert opposite-side relaxed snap die deur over muur zou trekken', () => {
    const width = 240
    const height = 220
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)

    fillRect(labels, width, { x0: 120, y0: 120, x1: 160, y1: 160 }, 1)
    fillRect(wallMask, width, { x0: 118, y0: 120, x1: 120, y1: 160 }, 255) // alleen links touch
    const doors = [
      makeDoor({ id: 'door-no-opposite-relaxed', bbox: { x: 120, y: 120, width: 40, height: 40 } }),
    ]
    const segments = [
      makeSegment({ a: { x: 170, y: 100 }, b: { x: 170, y: 190 }, thicknessPxMax: 8 }),
    ] // alleen rechts

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 8,
    })

    expect(snapped).toHaveLength(0)
  })

  it('houdt t-projectie gelijk bij schaal x2 (schaal-invariant)', () => {
    function run(scale: number): number {
      const width = 300 * scale
      const height = 300 * scale
      const wallMask = new Uint8Array(width * height)
      const labels = new Int32Array(width * height)
      fillRect(
        wallMask,
        width,
        { x0: 40 * scale, y0: 20 * scale, x1: 43 * scale, y1: 260 * scale },
        255,
      )
      fillRect(
        labels,
        width,
        { x0: 43 * scale, y0: 90 * scale, x1: 63 * scale, y1: 130 * scale },
        1,
      )
      const doors = [
        makeDoor({
          id: `door-scale-${scale}`,
          bbox: { x: 43 * scale, y: 90 * scale, width: 20 * scale, height: 40 * scale },
        }),
      ]
      const segments = [
        makeSegment({
          a: { x: 41 * scale, y: 20 * scale },
          b: { x: 41 * scale, y: 260 * scale },
          thicknessPxMax: 8 * scale,
        }),
      ]
      const snapped = snapDoorsToWalls({
        doors,
        wallMask,
        width,
        height,
        labelsData: labels,
        parentMap: new Map(),
        segments,
        referenceWallThicknessPx: 8 * scale,
      })
      return snapped[0]?.t ?? 0
    }

    const t1 = run(1)
    const t2 = run(2)
    expect(t1).toBeGreaterThan(0)
    expect(t2).toBeGreaterThan(0)
    expect(t1).toBeCloseTo(t2, 2)
  })

  it('geeft lege output voor lege input', () => {
    const snapped = snapDoorsToWalls({
      doors: [],
      wallMask: new Uint8Array(100),
      width: 10,
      height: 10,
      labelsData: new Int32Array(100),
      parentMap: new Map(),
      segments: [],
      referenceWallThicknessPx: 6,
    })
    expect(snapped).toEqual([])
  })

  it('Path A: snapt via adjacent doorframe wanneer swing-bbox geen segment matcht', () => {
    const width = 120
    const height = 140
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    fillRect(labels, width, { x0: 40, y0: 90, x1: 58, y1: 120 }, 1)
    fillRect(labels, width, { x0: 32, y0: 10, x1: 40, y1: 120 }, 2)
    fillRect(wallMask, width, { x0: 32, y0: 10, x1: 40, y1: 120 }, 255)
    const segments = [makeSegment({ a: { x: 36, y: 8 }, b: { x: 36, y: 35 }, thicknessPxMax: 6 })]
    const doors = [
      makeDoor({
        id: 'door-angle-rescue-like',
        bbox: { x: 40, y: 90, width: 18, height: 30 },
        faceIds: [1],
      }),
    ]
    const classificationByLabel = new Map([
      [1, 'door' as const],
      [2, 'doorframe' as const],
    ])

    const withoutClass = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 6,
    })
    expect(withoutClass).toHaveLength(0)

    const withDoorframe = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 6,
      classificationByLabel,
    })
    expect(withDoorframe).toHaveLength(1)
    expect(withDoorframe[0]?.doorId).toBe('door-angle-rescue-like')
  })

  it('Path A: Project4 twin top angle-rescue-32 vs L10 vertical @1097', () => {
    const width = 1200
    const height = 800
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    // Crop: x' = x - 1000, y' = y - 150
    // doorframe 1090-1106 → 90-106; door 1106-1128 → 106-128
    fillRect(labels, width, { x0: 90, y0: 135, x1: 106, y1: 278 }, 28)
    fillRect(labels, width, { x0: 106, y0: 161, x1: 128, y1: 272 }, 32)
    // Geen wallMask-ink bij kozijn — segment-first Path A moet toch binden.
    // (Runtime: dunne doorframe soms weg uit mask na close/blob.)

    const doors = [
      makeDoor({
        id: 'door-swing-angle-rescue-32',
        bbox: { x: 106, y: 161, width: 22, height: 111 },
        faceIds: [32],
      }),
    ]
    const segments = [
      makeSegment({ a: { x: 96.63, y: 529 }, b: { x: 96.63, y: 38 }, thicknessPxMax: 16 }),
    ]
    const classificationByLabel = new Map([
      [32, 'door' as const],
      [28, 'doorframe' as const],
    ])

    const withoutMaskContact = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 16,
      classificationByLabel,
    })
    expect(withoutMaskContact).toHaveLength(1)
    expect(withoutMaskContact[0]?.segmentIndex).toBe(0)
    expect(withoutMaskContact[0]?.openingAxis).toBe('v')
    expect(withoutMaskContact[0]?.outwardSign).toBe(-1)
  })

  it('Path A: ink-gap zonder pixel-adjacency → geen discovery (geen bbox-near)', () => {
    const width = 120
    const height = 140
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    // Gap: doorframe x=32-38, door x=41-58 (3px gap) — alleen explicit IDs mogen binden.
    fillRect(labels, width, { x0: 32, y0: 40, x1: 38, y1: 100 }, 2)
    fillRect(labels, width, { x0: 41, y0: 50, x1: 58, y1: 90 }, 1)
    const segments = [makeSegment({ a: { x: 35, y: 10 }, b: { x: 35, y: 120 }, thicknessPxMax: 8 })]
    const doors = [
      makeDoor({
        id: 'door-gap',
        bbox: { x: 41, y: 50, width: 17, height: 40 },
        faceIds: [1],
      }),
    ]
    const classificationByLabel = new Map([
      [1, 'door' as const],
      [2, 'doorframe' as const],
    ])
    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 8,
      classificationByLabel,
    })
    expect(snapped).toHaveLength(0)
  })

  it('Path A: explicit doorframeFaceIds bindt zonder pixel-adjacency', () => {
    const width = 120
    const height = 140
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    // Door en doorframe met gap > expand (geen discovery); explicit IDs moeten genoeg zijn.
    fillRect(labels, width, { x0: 32, y0: 20, x1: 40, y1: 110 }, 2)
    fillRect(labels, width, { x0: 55, y0: 70, x1: 75, y1: 100 }, 1)
    const segments = [makeSegment({ a: { x: 36, y: 10 }, b: { x: 36, y: 120 }, thicknessPxMax: 8 })]
    const door = makeDoor({
      id: 'door-explicit-df',
      bbox: { x: 55, y: 70, width: 20, height: 30 },
      faceIds: [1],
    })
    door.doorframeFaceIds = [2]
    door.framingAlongPx = 5
    door.framingOppositePx = 5
    const classificationByLabel = new Map([
      [1, 'door' as const],
      [2, 'doorframe' as const],
    ])
    const snapped = snapDoorsToWalls({
      doors: [door],
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 8,
      classificationByLabel,
    })
    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.doorframeClearOpening).toBeTruthy()
    const clear = snapped[0].doorframeClearOpening!
    const clearLen = Math.hypot(clear.endPx.x - clear.startPx.x, clear.endPx.y - clear.startPx.y)
    expect(clearLen).toBeGreaterThan(80)
    // snappedBBox langs muur ≈ deurblad + REF framing
    expect(snapped[0].snappedBBox.height).toBeCloseTo(clearLen + 10, 0)
  })

  it('Path A: as-grow bereikt doorframe achter 1 wall-hop', () => {
    const width = 100
    const height = 120
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    // doorframe | wall | door — 1-hop discovery faalt (wall ertussen), grow via adjacency.
    fillRect(labels, width, { x0: 20, y0: 20, x1: 28, y1: 100 }, 2)
    fillRect(labels, width, { x0: 28, y0: 20, x1: 36, y1: 100 }, 3)
    fillRect(labels, width, { x0: 36, y0: 50, x1: 54, y1: 80 }, 1)
    const segments = [makeSegment({ a: { x: 24, y: 10 }, b: { x: 24, y: 110 }, thicknessPxMax: 8 })]
    const doors = [
      makeDoor({
        id: 'door-grow',
        bbox: { x: 36, y: 50, width: 18, height: 30 },
        faceIds: [1],
      }),
    ]
    const classificationByLabel = new Map([
      [1, 'door' as const],
      [2, 'doorframe' as const],
      [3, 'wall' as const],
    ])
    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 8,
      classificationByLabel,
    })
    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.doorId).toBe('door-grow')
    expect(snapped[0]?.doorframeClearOpening).toBeTruthy()
  })

  it('Path B: geen doorframeClearOpening zonder doorframe', () => {
    const width = 120
    const height = 120
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    fillRect(wallMask, width, { x0: 19, y0: 0, x1: 22, y1: 120 }, 255)
    fillRect(labels, width, { x0: 23, y0: 30, x1: 43, y1: 50 }, 1)
    const doors = [makeDoor({ id: 'door-path-b', bbox: { x: 23, y: 30, width: 20, height: 20 } })]
    const segments = [makeSegment({ a: { x: 20, y: 0 }, b: { x: 20, y: 100 }, thicknessPxMax: 8 })]
    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 8,
      classificationByLabel: new Map([[1, 'door' as const]]),
    })
    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.doorframeClearOpening).toBeUndefined()
  })

  it('Path B: snapt via ink-adjacent wall zonder wallMask-touch op swing', () => {
    // Swing zit in opening-wit (geen mask-inkt); muur-face ink-adjacent → segment-first.
    const width = 120
    const height = 140
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    fillRect(labels, width, { x0: 40, y0: 90, x1: 58, y1: 120 }, 1) // door swing
    fillRect(labels, width, { x0: 32, y0: 10, x1: 40, y1: 120 }, 2) // wall (ink)
    // Geen wallMask bij swing of wall — dual Path B moet toch binden.
    const segments = [makeSegment({ a: { x: 36, y: 8 }, b: { x: 36, y: 130 }, thicknessPxMax: 6 })]
    const doors = [
      makeDoor({
        id: 'door-path-b-ink',
        bbox: { x: 40, y: 90, width: 18, height: 30 },
        faceIds: [1],
      }),
    ]
    const classificationByLabel = new Map([
      [1, 'door' as const],
      [2, 'wall' as const],
    ])

    const withoutWallClass = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 6,
      classificationByLabel: new Map([[1, 'door' as const]]),
    })
    expect(withoutWallClass).toHaveLength(0)

    const withWall = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 6,
      classificationByLabel,
    })
    expect(withWall).toHaveLength(1)
    expect(withWall[0]?.doorId).toBe('door-path-b-ink')
    expect(withWall[0]?.openingAxis).toBe('v')
    expect(withWall[0]?.doorframeClearOpening).toBeUndefined()
  })

  it('Path B: hoek-cluster kiest horizontale muur (niet hoge verticale wall-union)', () => {
    // Twin-achtig: swing-stroken tegen onder-muur + hoge verticale muur links.
    // Oude Path B (dfH≥dfW) koos v → ver segment; swing-mask-contact moet h kiezen.
    const width = 200
    const height = 200
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    // Gestapelde swing-stroken (cluster) tegen onderkant.
    fillRect(labels, width, { x0: 40, y0: 40, x1: 100, y1: 55 }, 1)
    fillRect(labels, width, { x0: 40, y0: 60, x1: 110, y1: 75 }, 2)
    fillRect(labels, width, { x0: 40, y0: 80, x1: 120, y1: 95 }, 3)
    fillRect(labels, width, { x0: 40, y0: 100, x1: 130, y1: 115 }, 4)
    // Horizontale muur onder de cluster.
    fillRect(labels, width, { x0: 20, y0: 116, x1: 160, y1: 124 }, 10)
    fillRect(wallMask, width, { x0: 20, y0: 116, x1: 160, y1: 124 }, 255)
    // Hoge verticale muur links (zou oude aspect-keuze winnen).
    fillRect(labels, width, { x0: 28, y0: 20, x1: 36, y1: 160 }, 11)
    fillRect(wallMask, width, { x0: 28, y0: 20, x1: 36, y1: 160 }, 255)

    const segments = [
      makeSegment({ a: { x: 20, y: 120 }, b: { x: 160, y: 120 }, thicknessPxMax: 8 }), // correct h
      makeSegment({ a: { x: 32, y: 20 }, b: { x: 32, y: 160 }, thicknessPxMax: 8 }), // lokale v
      makeSegment({ a: { x: 50, y: 180 }, b: { x: 80, y: 140 }, thicknessPxMax: 8 }), // verre diagonaal
    ]
    const doors = [
      makeDoor({
        id: 'door-corner-cluster',
        bbox: { x: 40, y: 40, width: 90, height: 75 },
        faceIds: [1, 2, 3, 4],
      }),
    ]
    const classificationByLabel = new Map([
      [1, 'door' as const],
      [2, 'door' as const],
      [3, 'door' as const],
      [4, 'door' as const],
      [10, 'wall' as const],
      [11, 'wall' as const],
    ])

    const snapped = snapDoorsToWalls({
      doors,
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map(),
      segments,
      referenceWallThicknessPx: 8,
      classificationByLabel,
    })
    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.openingAxis).toBe('h')
    expect(snapped[0]?.segmentIndex).toBe(0)
  })
})
