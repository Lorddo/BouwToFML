import { describe, expect, it } from 'vitest'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import type { DevWorkspaceSessionV2 } from '@/platform/dev-workspace/types'
import type { Floor } from '@/core/plan/types'
import type { FloorWorkspaceBlob } from '@/ui/composables/project/types'
import {
  attachWorkspaceUnderlayToFloor,
  drawingFromWorkspaceBlob,
  resolveBlobSourceToWorking,
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

  it('planUnderlay wint van workingImagePng', () => {
    const plate = 'data:image/png;base64,plate'
    const drawing = drawingFromWorkspaceBlob(
      blob({
        planUnderlay: { src: plate, width: 4000, height: 2000 },
        sourceToWorking: {
          sourceWidthPx: 4000,
          sourceHeightPx: 2000,
          workingWidthPx: 2000,
          workingHeightPx: 1000,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
          rotationDeg: 0,
          rotate180: false,
        },
      }),
    )
    expect(drawing!.url).toBe(plate)
    expect(drawing!.width).toBeCloseTo(200)
    expect(drawing!.height).toBeCloseTo(100)
  })

  it('schrijft bake-rotatie naar drawing.rotation', () => {
    const drawing = drawingFromWorkspaceBlob(
      blob({
        sourceUnderlay: { src: 'data:image/png;base64,source', name: 'scan.png' },
        sourceToWorking: {
          sourceWidthPx: 1000,
          sourceHeightPx: 800,
          workingWidthPx: 800,
          workingHeightPx: 1000,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
          rotationDeg: 90,
          rotate180: false,
        },
      }),
    )
    expect(drawing!.rotation).toBe(90)
  })

  it('identity-transform + sourceUnderlay.inputRotation → drawing.rotation', () => {
    const next = blob({
      sourceUnderlay: {
        src: 'data:image/png;base64,source',
        name: 'scan.png',
        inputRotation: { rotationDeg: 12, rotate180: false },
      },
      sourceToWorking: {
        sourceWidthPx: 2000,
        sourceHeightPx: 1000,
        workingWidthPx: 2000,
        workingHeightPx: 1000,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        rotationDeg: 0,
        rotate180: false,
      },
    })
    expect(drawingFromWorkspaceBlob(next)!.rotation).toBe(12)
    expect(resolveBlobSourceToWorking(next)?.rotationDeg).toBe(12)
  })

  it('bake-rotatie wint van sourceUnderlay.inputRotation', () => {
    const transform = resolveBlobSourceToWorking(
      blob({
        sourceUnderlay: {
          src: 'data:image/png;base64,source',
          name: 'scan.png',
          inputRotation: { rotationDeg: 12, rotate180: false },
        },
        sourceToWorking: {
          sourceWidthPx: 1000,
          sourceHeightPx: 800,
          workingWidthPx: 800,
          workingHeightPx: 1000,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
          rotationDeg: 90,
          rotate180: false,
        },
      }),
    )
    expect(transform?.rotationDeg).toBe(90)
  })

  it('sourceUnderlay + transform wint van workingImagePng', () => {
    const source = 'data:image/png;base64,source'
    const drawing = drawingFromWorkspaceBlob(
      blob({
        sourceUnderlay: {
          src: source,
          name: 'scan.png',
        },
        sourceToWorking: {
          sourceWidthPx: 4000,
          sourceHeightPx: 2000,
          workingWidthPx: 2000,
          workingHeightPx: 1000,
          offsetX: 200,
          offsetY: 0,
          scale: 1,
          rotationDeg: 0,
          rotate180: false,
        },
      }),
    )
    expect(drawing!.url).toBe(source)
    expect(drawing!.width).toBeCloseTo(200)
    expect(drawing!.height).toBeCloseTo(100)
  })
})

describe('attachWorkspaceUnderlayToFloor', () => {
  it('plakt drawing op een floor zonder onderlegger', () => {
    const next = attachWorkspaceUnderlayToFloor(emptyFloor(), blob())
    expect(next.drawing?.url).toBe(PNG)
    expect(next.drawing?.flipX).toBe(true)
  })

  it('houdt https-drawing als de blob geen plaat heeft', () => {
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
    const next = attachWorkspaceUnderlayToFloor(
      floor,
      blob({ session: null, previewUnderlayLayout: null }),
    )
    expect(next.drawing?.url).toBe('https://cdn.example.com/scan.png')
    expect(next.drawing?.x).toBe(1)
  })
})
