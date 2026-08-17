import { describe, expect, it } from 'vitest'
import type { Floor, FloorPlan } from '@/core/fml/types'
import { mirrorFloorBlobVertical } from '@/ui/composables/project/mirror-floor-blob'
import type { FloorWorkspaceBlob } from '@/ui/composables/project/types'

function wallFloor(x: number): Floor {
  return {
    name: 'BG',
    level: 0,
    height: 280,
    walls: [
      {
        id: 'w',
        a: { x, y: 10 },
        b: { x: x + 100, y: 10 },
        thickness: 10,
        openings: [],
      },
    ],
  }
}

function planFromFloor(floor: Floor): FloorPlan {
  return { name: 'P', floors: [floor] }
}

function emptyBlob(overrides: Partial<FloorWorkspaceBlob> = {}): FloorWorkspaceBlob {
  return {
    session: null,
    generatedFloor: null,
    previewPlan: null,
    previewUnderlayLayout: null,
    fmlNulpuntImageCm: null,
    fmlOrient: null,
    sourceUnderlay: null,
    ...overrides,
  }
}

describe('mirrorFloorBlobVertical', () => {
  it('spiegelt previewPlan + generatedFloor; compose fmlOrient; underlay ongemoeid', () => {
    const layout = { origin: { x: 1, y: 2 }, pxPerMmX: 3, pxPerMmY: 4, flipX: true }
    const floor = wallFloor(10)
    const blob = emptyBlob({
      previewPlan: planFromFloor(floor),
      generatedFloor: floor,
      previewUnderlayLayout: layout,
      fmlOrient: { quarterTurnsCw: 0, flipX: false },
    })
    const { blob: next, mirrored } = mirrorFloorBlobVertical(blob)
    expect(mirrored).toBe(true)
    expect(next.previewPlan!.floors[0].walls[0].a.x).toBe(-10)
    expect(next.generatedFloor!.walls[0].a.x).toBe(-10)
    expect(next.fmlOrient).toEqual({ quarterTurnsCw: 0, flipX: true })
    expect(next.previewUnderlayLayout).toEqual(layout)
  })

  it('twee keer = identiteit; floor zonder plan ongewijzigd', () => {
    const floor = wallFloor(10)
    const blob = emptyBlob({
      previewPlan: planFromFloor(floor),
      fmlOrient: null,
    })
    const once = mirrorFloorBlobVertical(blob).blob
    const twice = mirrorFloorBlobVertical(once).blob
    expect(twice.previewPlan!.floors[0].walls[0].a).toEqual(floor.walls[0].a)
    expect(twice.fmlOrient).toBeNull()

    const empty = emptyBlob()
    const skipped = mirrorFloorBlobVertical(empty)
    expect(skipped.mirrored).toBe(false)
    expect(skipped.blob).toBe(empty)
  })

  it('spiegelt generatedFloor zonder previewPlan', () => {
    const floor = wallFloor(20)
    const blob = emptyBlob({ generatedFloor: floor, fmlOrient: { quarterTurnsCw: 1, flipX: true } })
    const { blob: next, mirrored } = mirrorFloorBlobVertical(blob)
    expect(mirrored).toBe(true)
    expect(next.generatedFloor!.walls[0].a.x).toBe(-20)
    expect(next.fmlOrient).toEqual({ quarterTurnsCw: 1, flipX: false })
  })
})
