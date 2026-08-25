import { describe, expect, it } from 'vitest'
import {
  collectThinDoorMaskFaceIds,
  doorHypothesisDepthPx,
  isDoorHypothesisEligibleForMask,
} from '@/cv/doors/door-thin-mask'
import { isThinHypBetweenWalls } from '@/cv/doors/door-thin-mask-between-walls'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import type { Segment } from '@/cv/port/wallGraph'

/**
 * Beeld: oranje deurveld direct tegen L+R muur (geen surface in de march).
 * Muurref 54px — depth 39/29 beide eligible.
 */
describe('D-63 kozijn direct tussen muren (ref 54)', () => {
  const width = 200
  const height = 100

  function paint() {
    const labelsData = new Int32Array(width * height)
    const components: RasterRoomComponent[] = []
    const classificationByLabel = new Map<number, RoomRasterClass>()
    const faces: Array<{
      label: number
      x: number
      y: number
      w: number
      h: number
      cls: RoomRasterClass
    }> = [
      { label: 10, x: 20, y: 20, w: 30, h: 45, cls: 'wall' },
      { label: 20, x: 150, y: 20, w: 30, h: 45, cls: 'wall' },
      { label: 30, x: 20, y: 5, w: 160, h: 15, cls: 'surface' },
      { label: 31, x: 20, y: 80, w: 160, h: 15, cls: 'surface' },
      // kozijn: direct tegen muren (x=50..150)
      { label: 182, x: 50, y: 35, w: 100, h: 30, cls: 'door' },
      // swing eronder (kamer)
      { label: 195, x: 60, y: 65, w: 80, h: 15, cls: 'door' },
    ]
    for (const f of [
      ...faces.filter((x) => x.cls === 'surface'),
      ...faces.filter((x) => x.cls === 'wall'),
      ...faces.filter((x) => x.cls === 'door'),
    ]) {
      classificationByLabel.set(f.label, f.cls)
      components.push({
        label: f.label,
        areaPx: f.w * f.h,
        bbox: { x: f.x, y: f.y, width: f.w, height: f.h },
        touchesBorder: false,
      })
      for (let y = f.y; y < f.y + f.h; y += 1) {
        for (let x = f.x; x < f.x + f.w; x += 1) {
          labelsData[y * width + x] = f.label
        }
      }
    }
    return {
      labelsData,
      width,
      height,
      parentMap: new Map<number, number>(),
      components,
      classificationByLabel,
      classificationGroupBy: 'component' as const,
      referenceWallThicknessPx: 54,
    }
  }

  const frame = { faceIds: [182], unionBBox: { x: 50, y: 35, width: 100, height: 30 } }
  const swing = { faceIds: [195], unionBBox: { x: 60, y: 65, width: 80, height: 15 } }
  const segments: Segment[] = [{ a: { x: 20, y: 50 }, b: { x: 180, y: 50 } }]

  it('ref 54: beide depth-OK; L1 houdt kozijn (direct L+R wall), niet swing', () => {
    const ctx = paint()
    const ref = 54
    expect(doorHypothesisDepthPx(frame.unionBBox)).toBe(30)
    expect(isDoorHypothesisEligibleForMask(30, ref)).toBe(true)
    expect(isDoorHypothesisEligibleForMask(39, ref)).toBe(true)

    expect(isThinHypBetweenWalls(frame, ctx)).toBe(true)
    expect(isThinHypBetweenWalls(swing, ctx)).toBe(false)

    const ids = collectThinDoorMaskFaceIds([frame, swing], ref, {
      betweenWalls: ctx,
      polylineKeep: {
        segments,
        labelsData: ctx.labelsData,
        width,
        height,
        parentMap: ctx.parentMap,
        referenceWallThicknessPx: ref,
      },
    })
    expect(ids).toContain(182)
    expect(ids).not.toContain(195)

    const clustered = collectThinDoorMaskFaceIds(
      [
        {
          faceIds: [182, 195],
          unionBBox: { x: 50, y: 35, width: 100, height: 45 },
        },
      ],
      ref,
      {
        betweenWalls: ctx,
        polylineKeep: {
          segments,
          labelsData: ctx.labelsData,
          width,
          height,
          parentMap: ctx.parentMap,
          referenceWallThicknessPx: ref,
        },
      },
    )
    expect(clustered).toEqual([182])
    expect(clustered).not.toContain(195)
  })
})
