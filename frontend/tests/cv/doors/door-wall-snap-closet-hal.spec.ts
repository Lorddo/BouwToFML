import { describe, expect, it } from 'vitest'
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
  faceIds: number[]
}): ResolvedDoorCandidate {
  return {
    id: params.id,
    source: 'single',
    score: 0.96,
    matchedRefIndex: 1,
    faceIds: params.faceIds,
    bbox: params.bbox,
    centroidPx: {
      x: params.bbox.x + params.bbox.width / 2,
      y: params.bbox.y + params.bbox.height / 2,
    },
    swingSpanPx: Math.max(params.bbox.width, params.bbox.height),
    framingPx: 28,
    overhangAlongPx: 93,
    overhangOppositePx: 44,
    framingAlongPx: 14,
    framingOppositePx: 14,
    ratioBlade: 1.35,
    widthPx: 137,
    widthCm: 55,
    fmlRefId: 'd34e31c31ba6e6bd4e0d67096ec1b31e9035c7d9',
    kind: 'closet45',
  }
}

describe('2D_3E Hal/kast closet snap (L11 unbound repro)', () => {
  it('snapt ondiepe kast-deuren naar L10 H-muur @ y=1224', () => {
    // Geometrie uit 2D_3E-layer-debug-v2: L10 #2 H (1388,1224)→(1159,1224),
    // unbound door-swing-single-8/9 closet45 @ y=1237.
    const width = 1734
    const height = 3000
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)

    // Muurstrook boven de deuren (faces 185/188 e.d. ~y=1214–1230)
    fillRect(wallMask, width, { x0: 1159, y0: 1214, x1: 1388, y1: 1230 }, 255)
    // Deur-faces
    fillRect(labels, width, { x0: 1209, y0: 1237, x1: 1253, y1: 1263 }, 198)
    fillRect(labels, width, { x0: 1292, y0: 1237, x1: 1337, y1: 1263 }, 199)

    const segments: SemanticWallSegment[] = [
      {
        a: { x: 1388, y: 1503 },
        b: { x: 1388, y: 1224 },
        thicknessPxMax: 10,
      },
      {
        a: { x: 1388, y: 1224 },
        b: { x: 1159, y: 1224 },
        thicknessPxMax: 10,
      },
      {
        a: { x: 1159, y: 1224 },
        b: { x: 1159, y: 989 },
        thicknessPxMax: 10,
      },
    ]

    const doors = [
      makeDoor({
        id: 'door-swing-single-8',
        bbox: { x: 1209, y: 1237, width: 44, height: 26 },
        faceIds: [198],
      }),
      makeDoor({
        id: 'door-swing-single-9',
        bbox: { x: 1292, y: 1237, width: 45, height: 26 },
        faceIds: [199],
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
      referenceWallThicknessPx: 77,
    })

    expect(snapped.map((d) => d.doorId).sort()).toEqual([
      'door-swing-single-8',
      'door-swing-single-9',
    ])
    expect(snapped.every((d) => d.segmentIndex === 1)).toBe(true)
    expect(snapped.every((d) => d.openingAxis === 'h')).toBe(true)
  })

  it('snapt ook wanneer faceIds detached zijn maar parentMap nog merged is', () => {
    // Productie: Stage-2 detacht enclosed children → faceIds=[198], maar
    // snapResolvedDoorsToWalls gebruikt roomClassifyState.parentMap (198→14).
    const width = 1734
    const height = 3000
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    fillRect(wallMask, width, { x0: 1159, y0: 1214, x1: 1388, y1: 1230 }, 255)
    fillRect(labels, width, { x0: 1209, y0: 1237, x1: 1253, y1: 1263 }, 198)

    const segments: SemanticWallSegment[] = [
      {
        a: { x: 1388, y: 1224 },
        b: { x: 1159, y: 1224 },
        thicknessPxMax: 10,
      },
    ]

    const snapped = snapDoorsToWalls({
      doors: [
        makeDoor({
          id: 'door-swing-single-8',
          bbox: { x: 1209, y: 1237, width: 44, height: 26 },
          faceIds: [198],
        }),
      ],
      wallMask,
      width,
      height,
      labelsData: labels,
      parentMap: new Map([[198, 14]]),
      segments,
      referenceWallThicknessPx: 77,
    })

    expect(snapped).toHaveLength(1)
    expect(snapped[0]?.doorId).toBe('door-swing-single-8')
    expect(snapped[0]?.segmentIndex).toBe(0)
  })

  it('faalt wanneer muurmasker de kaststrook mist (hypothese productie)', () => {
    const width = 1734
    const height = 3000
    const wallMask = new Uint8Array(width * height)
    const labels = new Int32Array(width * height)
    // Alleen labels, geen mask-inkt op de kastmuur
    fillRect(labels, width, { x0: 1209, y0: 1237, x1: 1253, y1: 1263 }, 198)
    fillRect(labels, width, { x0: 1292, y0: 1237, x1: 1337, y1: 1263 }, 199)
    // Verre muur elders wél in mask
    fillRect(wallMask, width, { x0: 90, y0: 420, x1: 680, y1: 430 }, 255)

    const segments: SemanticWallSegment[] = [
      {
        a: { x: 1388, y: 1224 },
        b: { x: 1159, y: 1224 },
        thicknessPxMax: 10,
      },
      {
        a: { x: 91, y: 425 },
        b: { x: 675, y: 425 },
        thicknessPxMax: 20,
      },
    ]

    const doors = [
      makeDoor({
        id: 'door-swing-single-8',
        bbox: { x: 1209, y: 1237, width: 44, height: 26 },
        faceIds: [198],
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
      referenceWallThicknessPx: 77,
    })

    // Zonder lokale mask-inkt én zonder ink-wall adjacency: unbound
    expect(snapped).toHaveLength(0)
  })
})
