import { describe, expect, it } from 'vitest'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import type { DevWorkspaceSessionV2 } from '@/platform/dev-workspace/types'
import type { Floor } from '@/core/plan/types'
import type { FloorWorkspaceBlob } from '@/ui/composables/project/types'
import {
  attachWorkspaceUnderlayToFloor,
  drawingFromWorkspaceBlob,
} from '@/ui/composables/project/attach-workspace-underlay'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function session(partial?: Partial<DevWorkspaceSessionV2>): DevWorkspaceSessionV2 {
  return {
    schemaVersion: 2,
    createdAt: '2026-09-14T00:00:00.000Z',
    imageName: 'bg.png',
    imageWidth: 2000,
    imageHeight: 1000,
    workingImagePng: PNG,
    preprocess: { ...DEFAULT_PREPROCESS },
    drawingProfileId: 'open',
    scale: {
      state: { xLeft: 1, xRight: 9, xGuideY: 5, yTop: 1, yBottom: 9, yGuideX: 5 },
      distanceMmX: 3000,
      distanceMmY: 3000,
      confirmed: true,
      confirmedPixelsPerMillimeterX: 2,
      confirmedPixelsPerMillimeterY: 2,
    },
    eraserTouched: false,
    flow: {
      targetFlowStep: 'result',
      profileConfirmed: true,
      restoreMode: 'exact',
    },
    ...partial,
  }
}

function emptyFloor(): Floor {
  return {
    name: 'Begane grond',
    level: 0,
    height: 260,
    walls: [{ id: 'w0', a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20, openings: [] }],
  }
}

function blob(partial?: Partial<FloorWorkspaceBlob>): FloorWorkspaceBlob {
  return {
    session: session(),
    generatedFloor: emptyFloor(),
    previewPlan: { name: 'p', floors: [emptyFloor()] },
    previewUnderlayLayout: {
      origin: { x: 10, y: 20 },
      pxPerMmX: 2,
      pxPerMmY: 2,
      flipX: true,
    },
    planNulpuntImageCm: null,
    planOrient: null,
    sourceUnderlay: null,
    pdfUnderlaySource: null,
    sourcePdfUnderlay: null,
    ...partial,
  }
}

describe('drawingFromWorkspaceBlob', () => {
  it('zet scan + layout om naar drawing met url en flipX', () => {
    const drawing = drawingFromWorkspaceBlob(blob())
    expect(drawing).not.toBeNull()
    expect(drawing!.url).toBe(PNG)
    expect(drawing!.width).toBeCloseTo(100)
    expect(drawing!.height).toBeCloseTo(50)
    expect(drawing!.x).toBeCloseTo(40)
    expect(drawing!.y).toBeCloseTo(5)
    expect(drawing!.flipX).toBe(true)
  })

  it('zonder session-png → null', () => {
    expect(drawingFromWorkspaceBlob(blob({ session: session({ workingImagePng: '' }) }))).toBeNull()
    expect(drawingFromWorkspaceBlob(blob({ session: null }))).toBeNull()
  })
})

describe('attachWorkspaceUnderlayToFloor', () => {
  it('plakt drawing op een floor zonder onderlegger', () => {
    const next = attachWorkspaceUnderlayToFloor(emptyFloor(), blob())
    expect(next.drawing?.url).toBe(PNG)
    expect(next.drawing?.flipX).toBe(true)
  })

  it('houdt een bestaande herbruikbare drawing', () => {
    const floor: Floor = {
      ...emptyFloor(),
      drawing: {
        x: 1,
        y: 2,
        width: 10,
        height: 8,
        rotation: 0,
        url: 'https://cdn.example.com/scan.png',
      },
    }
    const next = attachWorkspaceUnderlayToFloor(floor, blob())
    expect(next.drawing?.url).toBe('https://cdn.example.com/scan.png')
    expect(next.drawing?.x).toBe(1)
  })
})
