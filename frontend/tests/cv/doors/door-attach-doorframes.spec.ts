import { describe, expect, it } from 'vitest'
import { attachDoorframesToResolvedDoors, type ResolvedDoorCandidate } from '@/cv/doors'

function fillRect(
  data: Int32Array,
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
  doorframeFaceIds?: number[]
}): ResolvedDoorCandidate {
  return {
    id: params.id,
    source: 'single',
    score: 0.9,
    matchedRefIndex: 0,
    faceIds: params.faceIds ?? [1],
    doorframeFaceIds: params.doorframeFaceIds,
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

describe('attachDoorframesToResolvedDoors', () => {
  it('koppelt 1-hop ink-adjacent doorframe (links)', () => {
    const width = 80
    const height = 80
    const labels = new Int32Array(width * height)
    fillRect(labels, width, { x0: 10, y0: 10, x1: 18, y1: 60 }, 2)
    fillRect(labels, width, { x0: 18, y0: 20, x1: 40, y1: 55 }, 1)
    const doors = [
      makeDoor({
        id: 'door-a',
        bbox: { x: 18, y: 20, width: 22, height: 35 },
        faceIds: [1],
      }),
    ]
    const enriched = attachDoorframesToResolvedDoors({
      doors,
      labelsData: labels,
      width,
      height,
      parentMap: new Map(),
      classificationByLabel: new Map([
        [1, 'door'],
        [2, 'doorframe'],
      ]),
    })
    expect(enriched[0]?.doorframeFaceIds).toEqual([2])
  })

  it('peelt class=doorframe uit faceIds naar doorframeFaceIds (cluster-kozijn)', () => {
    const width = 80
    const height = 80
    const labels = new Int32Array(width * height)
    fillRect(labels, width, { x0: 10, y0: 10, x1: 18, y1: 60 }, 2)
    fillRect(labels, width, { x0: 10, y0: 10, x1: 14, y1: 60 }, 3)
    fillRect(labels, width, { x0: 18, y0: 20, x1: 40, y1: 55 }, 1)
    const doors = [
      makeDoor({
        id: 'door-cluster',
        bbox: { x: 10, y: 10, width: 30, height: 50 },
        faceIds: [1, 2, 3],
      }),
    ]
    const enriched = attachDoorframesToResolvedDoors({
      doors,
      labelsData: labels,
      width,
      height,
      parentMap: new Map(),
      classificationByLabel: new Map([
        [1, 'door'],
        [2, 'doorframe'],
        [3, 'doorframe'],
      ]),
    })
    expect(enriched[0]?.faceIds).toEqual([1])
    expect(enriched[0]?.doorframeFaceIds).toEqual([2, 3])
  })

  it('groeit alleen verder in dezelfde richting (links→links twin-helft)', () => {
    const width = 80
    const height = 80
    const labels = new Int32Array(width * height)
    // df 3 | df 2 | deur 1 — eerste hop links naar 2, grow links naar 3
    fillRect(labels, width, { x0: 4, y0: 10, x1: 10, y1: 60 }, 3)
    fillRect(labels, width, { x0: 10, y0: 10, x1: 16, y1: 60 }, 2)
    fillRect(labels, width, { x0: 16, y0: 20, x1: 40, y1: 55 }, 1)
    const doors = [
      makeDoor({
        id: 'door-twin-df',
        bbox: { x: 16, y: 20, width: 24, height: 35 },
        faceIds: [1],
      }),
    ]
    const enriched = attachDoorframesToResolvedDoors({
      doors,
      labelsData: labels,
      width,
      height,
      parentMap: new Map(),
      classificationByLabel: new Map([
        [1, 'door'],
        [2, 'doorframe'],
        [3, 'doorframe'],
      ]),
    })
    expect(enriched[0]?.doorframeFaceIds).toEqual([2, 3])
  })

  it('groeit niet omhoog/omlaag naar buur-twin kozijn', () => {
    const width = 80
    const height = 200
    const labels = new Int32Array(width * height)
    // Boven: df27 | deur32 ; onder: df77 (raakt 27 verticaal — mag NIET via grow)
    fillRect(labels, width, { x0: 10, y0: 20, x1: 18, y1: 80 }, 27)
    fillRect(labels, width, { x0: 18, y0: 30, x1: 40, y1: 70 }, 32)
    fillRect(labels, width, { x0: 10, y0: 80, x1: 18, y1: 140 }, 77)
    const doors = [
      makeDoor({
        id: 'door-upper',
        bbox: { x: 18, y: 30, width: 22, height: 40 },
        faceIds: [32],
        doorframeFaceIds: [27, 77], // stale fout — moet weg
      }),
    ]
    const enriched = attachDoorframesToResolvedDoors({
      doors,
      labelsData: labels,
      width,
      height,
      parentMap: new Map(),
      classificationByLabel: new Map([
        [32, 'door'],
        [27, 'doorframe'],
        [77, 'doorframe'],
      ]),
    })
    expect(enriched[0]?.doorframeFaceIds).toEqual([27])
  })

  it('laat deuren zonder adjacent doorframe ongemoeid', () => {
    const width = 80
    const height = 80
    const labels = new Int32Array(width * height)
    fillRect(labels, width, { x0: 50, y0: 50, x1: 70, y1: 70 }, 1)
    fillRect(labels, width, { x0: 5, y0: 5, x1: 12, y1: 20 }, 2)
    const doors = [
      makeDoor({
        id: 'door-far',
        bbox: { x: 50, y: 50, width: 20, height: 20 },
        faceIds: [1],
      }),
    ]
    const enriched = attachDoorframesToResolvedDoors({
      doors,
      labelsData: labels,
      width,
      height,
      parentMap: new Map(),
      classificationByLabel: new Map([
        [1, 'door'],
        [2, 'doorframe'],
      ]),
    })
    expect(enriched[0]?.doorframeFaceIds).toBeUndefined()
  })
})
