import { describe, expect, it } from 'vitest'
import {
  filterDoorsByKeptWallMaskContact,
  resolveKeptWallMaskSearchRadiusPx,
  type ResolvedDoorCandidate,
} from '@/cv/doors'

function door(params: {
  id: string
  faceIds: number[]
  x: number
  y: number
  w: number
  h: number
}): ResolvedDoorCandidate {
  return {
    id: params.id,
    source: 'single',
    score: 1,
    matchedRefIndex: 0,
    faceIds: params.faceIds,
    bbox: { x: params.x, y: params.y, width: params.w, height: params.h },
    centroidPx: { x: params.x + params.w / 2, y: params.y + params.h / 2 },
    swingSpanPx: params.w,
    framingPx: 0,
    overhangAlongPx: 0,
    overhangOppositePx: 0,
    framingAlongPx: 0,
    framingOppositePx: 0,
    ratioBlade: 1,
    widthPx: params.w,
    widthCm: 80,
    fmlRefId: 'door_single',
    kind: 'single',
  }
}

function paintRect(
  labels: Int32Array,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  label: number,
): void {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      labels[y * width + x] = label
    }
  }
}

function paintMaskRect(
  mask: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): void {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      mask[y * width + x] = 255
    }
  }
}

describe('resolveKeptWallMaskSearchRadiusPx', () => {
  it('floort op 4 px zonder dikte', () => {
    expect(resolveKeptWallMaskSearchRadiusPx(null)).toBe(4)
    expect(resolveKeptWallMaskSearchRadiusPx(0)).toBe(4)
  })

  it('gebruikt 0.2× dikte wanneer groter dan floor', () => {
    expect(resolveKeptWallMaskSearchRadiusPx(50)).toBe(10)
  })
})

describe('filterDoorsByKeptWallMaskContact', () => {
  it('houdt deur die grenst aan kept mask', () => {
    const width = 40
    const height = 30
    const labels = new Int32Array(width * height)
    const mask = new Uint8Array(width * height)
    paintRect(labels, width, 10, 10, 8, 8, 2)
    paintMaskRect(mask, width, 0, 10, 10, 8)

    const result = filterDoorsByKeptWallMaskContact({
      doors: [door({ id: 'touch', faceIds: [2], x: 10, y: 10, w: 8, h: 8 })],
      wallMask: mask,
      labelsData: labels,
      parentMap: new Map(),
      width,
      height,
      referenceWallThicknessPx: 8,
    })
    expect(result.kept.map((d) => d.id)).toEqual(['touch'])
    expect(result.rejected).toHaveLength(0)
  })

  it('rejectt deur in ghost-zone zonder mask', () => {
    const width = 40
    const height = 30
    const labels = new Int32Array(width * height)
    const mask = new Uint8Array(width * height)
    paintRect(labels, width, 20, 10, 8, 8, 2)
    // Mask ver weg links — buiten search-radius (floor 4).
    paintMaskRect(mask, width, 0, 0, 4, 4)

    const result = filterDoorsByKeptWallMaskContact({
      doors: [door({ id: 'orphan', faceIds: [2], x: 20, y: 10, w: 8, h: 8 })],
      wallMask: mask,
      labelsData: labels,
      parentMap: new Map(),
      width,
      height,
      referenceWallThicknessPx: 4,
    })
    expect(result.kept).toHaveLength(0)
    expect(result.rejected[0]?.reason).toBe('no_kept_wall_mask_contact')
    expect(result.rejected[0]?.door.id).toBe('orphan')
  })

  it('houdt deur 1–3 px van mask binnen radius', () => {
    const width = 40
    const height = 30
    const labels = new Int32Array(width * height)
    const mask = new Uint8Array(width * height)
    // Deur starts at x=13; mask ends at x=10 → gap van 3 px.
    paintRect(labels, width, 13, 10, 6, 6, 2)
    paintMaskRect(mask, width, 0, 10, 10, 6)

    const result = filterDoorsByKeptWallMaskContact({
      doors: [door({ id: 'near', faceIds: [2], x: 13, y: 10, w: 6, h: 6 })],
      wallMask: mask,
      labelsData: labels,
      parentMap: new Map(),
      width,
      height,
      referenceWallThicknessPx: 8,
    })
    expect(result.searchRadiusPx).toBe(4)
    expect(result.kept.map((d) => d.id)).toEqual(['near'])
  })

  it('houdt multi-face wanneer één face mask raakt', () => {
    const width = 50
    const height = 30
    const labels = new Int32Array(width * height)
    const mask = new Uint8Array(width * height)
    paintRect(labels, width, 10, 10, 6, 6, 2)
    paintRect(labels, width, 30, 10, 6, 6, 3)
    paintMaskRect(mask, width, 0, 10, 10, 6)

    const result = filterDoorsByKeptWallMaskContact({
      doors: [
        door({
          id: 'cluster',
          faceIds: [2, 3],
          x: 10,
          y: 10,
          w: 26,
          h: 6,
        }),
      ],
      wallMask: mask,
      labelsData: labels,
      parentMap: new Map(),
      width,
      height,
      referenceWallThicknessPx: 8,
    })
    expect(result.kept.map((d) => d.id)).toEqual(['cluster'])
  })
})
