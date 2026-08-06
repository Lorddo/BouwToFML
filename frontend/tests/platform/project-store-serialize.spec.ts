import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  bytesToBase64,
  dataUrlToPngBytes,
  fromPersistedProject,
  isPersistedProject,
  pngBytesToDataUrl,
  toPersistedProject,
  toProjectIndexEntry,
} from '@/platform/project-store/serialize'
import { createEmptyProjectState } from '@/ui/composables/project/defaults'
import type { ProjectState } from '@/ui/composables/project/types'
import type { DevWorkspaceSessionV2 } from '@/platform/dev-workspace/types'
import { DEFAULT_PREPROCESS } from '@/platform/image'

function minimalPngDataUrl(): string {
  // 1x1 transparent PNG
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ])
  return pngBytesToDataUrl(bytes)
}

function sessionStub(png: string): DevWorkspaceSessionV2 {
  return {
    schemaVersion: 2,
    createdAt: '2026-08-05T00:00:00.000Z',
    imageName: 'floor.png',
    imageWidth: 100,
    imageHeight: 100,
    workingImagePng: png,
    preprocess: { ...DEFAULT_PREPROCESS },
    drawingProfileId: 'open',
    scale: {
      distanceMmX: 1000,
      distanceMmY: 1000,
      confirmed: true,
      confirmedPixelsPerMillimeterX: 1,
      confirmedPixelsPerMillimeterY: 1,
    },
    eraserTouched: true,
    eraserMaskBase64: bytesToBase64(new Uint8Array([0, 1, 0, 1])),
    inkOverlayRle: [0, 4],
    flow: {
      targetFlowStep: 'preprocess',
      restoreMode: 'exact',
      profileConfirmed: false,
    },
  }
}

describe('project-store serialize', () => {
  it('roundtrips data-url png and base64 masks', () => {
    const png = minimalPngDataUrl()
    const bytes = dataUrlToPngBytes(png)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes!.length).toBeGreaterThan(20)
    expect(pngBytesToDataUrl(bytes!)).toBe(png)

    const mask = new Uint8Array([0, 255, 128, 1])
    expect(Array.from(base64ToBytes(bytesToBase64(mask)))).toEqual([0, 255, 128, 1])
  })

  it('roundtrips ProjectState with session bytes', () => {
    const png = minimalPngDataUrl()
    const empty = createEmptyProjectState({ id: 'proj-1', name: 'Test', address: 'Street 1' })
    const floorId = empty.floors[0].id
    const state: ProjectState = {
      ...empty,
      sourceUnderlay: { src: png, name: 'src.png' },
      blobs: {
        [floorId]: {
          session: sessionStub(png),
          generatedFloor: null,
          previewPlan: null,
          previewUnderlayLayout: null,
          sourceUnderlay: { src: png, name: 'floor-src.png' },
        },
      },
    }

    const persisted = toPersistedProject(state, '2026-08-05T12:00:00.000Z')
    expect(isPersistedProject(persisted)).toBe(true)
    expect(persisted.blobs[floorId]?.session?.workingImagePngBytes).toBeInstanceOf(Uint8Array)
    expect(persisted.blobs[floorId]?.session?.eraserMaskBytes).toBeInstanceOf(Uint8Array)
    expect(persisted.sourceUnderlay?.pngBytes).toBeInstanceOf(Uint8Array)
    expect(persisted.blobs[floorId]?.sourceUnderlay?.pngBytes).toBeInstanceOf(Uint8Array)
    expect(persisted.blobs[floorId]?.sourceUnderlay?.name).toBe('floor-src.png')
    expect('workingImagePng' in (persisted.blobs[floorId]?.session ?? {})).toBe(false)

    const restored = fromPersistedProject(persisted)
    expect(restored.meta.name).toBe('Test')
    expect(restored.blobs[floorId]?.session?.workingImagePng).toBe(png)
    expect(restored.blobs[floorId]?.session?.eraserMaskBase64).toBe(
      bytesToBase64(new Uint8Array([0, 1, 0, 1])),
    )
    expect(restored.sourceUnderlay?.src).toBe(png)
    expect(restored.blobs[floorId]?.sourceUnderlay?.src).toBe(png)
    expect(restored.blobs[floorId]?.sourceUnderlay?.name).toBe('floor-src.png')

    const index = toProjectIndexEntry(persisted)
    expect(index).toEqual({
      id: 'proj-1',
      name: 'Test',
      address: 'Street 1',
      floorCount: 1,
      updatedAt: '2026-08-05T12:00:00.000Z',
    })
  })

  it('rejects wrong schemaVersion', () => {
    expect(isPersistedProject({ schemaVersion: 99, id: 'x' })).toBe(false)
  })
})
