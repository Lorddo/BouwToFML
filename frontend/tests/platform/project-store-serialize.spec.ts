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
import { PERSISTED_PROJECT_SCHEMA_VERSION } from '@/platform/project-store/types'
import { createEmptyProjectState } from '@/ui/composables/project/defaults'
import type { FloorOrientPersist, ProjectState } from '@/ui/composables/project/types'
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

describe('project-store serialize (schema v2 plan+cv)', () => {
  it('uses schema version 2', () => {
    expect(PERSISTED_PROJECT_SCHEMA_VERSION).toBe(2)
  })

  it('roundtrips data-url png and base64 masks', () => {
    const png = minimalPngDataUrl()
    const bytes = dataUrlToPngBytes(png)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes!.length).toBeGreaterThan(20)
    expect(pngBytesToDataUrl(bytes!)).toBe(png)

    const mask = new Uint8Array([0, 255, 128, 1])
    expect(Array.from(base64ToBytes(bytesToBase64(mask)))).toEqual([0, 255, 128, 1])
  })

  it('roundtrips ProjectState with plan half + converter sidecar', () => {
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
          sourceUnderlay: {
            src: png,
            name: 'floor-src.png',
            pdf: {
              pageNumber: 1,
              fileName: 'plan.pdf',
              pageRenderScale: 2,
              pageWidthPx: 3000,
              pageHeightPx: 2000,
            },
            inputRotation: { rotationDeg: 3.5, rotate180: false },
            scaleSpace: 'source',
          },
          sourcePdfUnderlay: {
            bytes: new Uint8Array([1, 2, 3]),
            pageNumber: 1,
            fileName: 'plan.pdf',
            pageRenderScale: 2,
            pageWidthPx: 3000,
            pageHeightPx: 2000,
          },
        },
      },
    }

    const persisted = toPersistedProject(state, '2026-08-05T12:00:00.000Z')
    expect(isPersistedProject(persisted)).toBe(true)
    expect(persisted.schemaVersion).toBe(2)

    const floorBlob = persisted.blobs[floorId]
    expect(floorBlob?.plan).toBeTruthy()
    expect(floorBlob?.cv).toBeTruthy()
    // Schaal op plan-helft; CV-sidecar zonder scale.
    expect(floorBlob?.plan.scale?.confirmed).toBe(true)
    expect(floorBlob?.plan.scale?.distanceMmX).toBe(1000)
    expect(floorBlob?.cv && 'scale' in floorBlob.cv).toBe(false)
    expect(floorBlob?.cv?.workingImagePngBytes).toBeInstanceOf(Uint8Array)
    expect(floorBlob?.cv?.eraserMaskBytes).toBeInstanceOf(Uint8Array)
    expect(floorBlob?.cv?.inkOverlayRle).toEqual([0, 4])
    // Legacy project-level source weggelaten als floors al een bron hebben (quota).
    expect(persisted.sourceUnderlay).toBeNull()
    expect(floorBlob?.plan.sourceUnderlay?.pngBytes).toBeInstanceOf(Uint8Array)
    expect(floorBlob?.plan.sourceUnderlay?.name).toBe('floor-src.png')
    expect(floorBlob?.plan.sourceUnderlay?.pdf?.fileName).toBe('plan.pdf')
    expect(floorBlob?.plan.sourceUnderlay?.inputRotation).toEqual({
      rotationDeg: 3.5,
      rotate180: false,
    })
    expect(floorBlob?.plan.sourceUnderlay?.scaleSpace).toBe('source')
    expect('workingImagePng' in (floorBlob?.cv ?? {})).toBe(false)
    expect('session' in (floorBlob ?? {})).toBe(false)
    expect('pdfUnderlaySource' in (floorBlob?.plan ?? {})).toBe(false)
    expect('sourcePdfUnderlay' in (floorBlob?.plan ?? {})).toBe(false)

    const restored = fromPersistedProject(persisted)
    expect(restored.meta.name).toBe('Test')
    expect(restored.blobs[floorId]?.session?.workingImagePng).toBe(png)
    expect(restored.blobs[floorId]?.session?.scale.confirmed).toBe(true)
    expect(restored.blobs[floorId]?.session?.eraserMaskBase64).toBe(
      bytesToBase64(new Uint8Array([0, 1, 0, 1])),
    )
    expect(restored.sourceUnderlay).toBeNull()
    expect(restored.blobs[floorId]?.sourceUnderlay?.src).toBe(png)
    expect(restored.blobs[floorId]?.sourceUnderlay?.name).toBe('floor-src.png')
    expect(restored.blobs[floorId]?.sourceUnderlay?.pdf?.fileName).toBe('plan.pdf')
    expect(restored.blobs[floorId]?.sourceUnderlay?.inputRotation).toEqual({
      rotationDeg: 3.5,
      rotate180: false,
    })
    expect(restored.blobs[floorId]?.sourceUnderlay?.scaleSpace).toBe('source')
    expect(restored.blobs[floorId]?.pdfUnderlaySource).toBeNull()
    expect(restored.blobs[floorId]?.sourcePdfUnderlay).toBeNull()

    const index = toProjectIndexEntry(persisted)
    expect(index).toEqual({
      id: 'proj-1',
      name: 'Test',
      address: 'Street 1',
      floorCount: 1,
      updatedAt: '2026-08-05T12:00:00.000Z',
    })
  })

  it('roundtrips planUnderlay sameAsSource + sourceToWorking zonder tweede PNG', () => {
    const png = minimalPngDataUrl()
    const empty = createEmptyProjectState({ id: 'proj-plate', name: 'Plate', address: '' })
    const floorId = empty.floors[0].id
    const state: ProjectState = {
      ...empty,
      blobs: {
        [floorId]: {
          session: sessionStub(png),
          generatedFloor: null,
          previewPlan: null,
          previewUnderlayLayout: null,
          sourceUnderlay: { src: png, name: 'src.png' },
          planUnderlay: { src: png, width: 400, height: 200 },
          sourceToWorking: {
            sourceWidthPx: 400,
            sourceHeightPx: 200,
            workingWidthPx: 200,
            workingHeightPx: 100,
            offsetX: 10,
            offsetY: 5,
            scale: 0.5,
            rotationDeg: 0,
            rotate180: false,
          },
        },
      },
    }

    const persisted = toPersistedProject(state, '2026-09-17T12:00:00.000Z')
    const plan = persisted.blobs[floorId]!.plan
    expect(plan.planUnderlay?.sameAsSource).toBe(true)
    expect(plan.planUnderlay?.pngBytes).toBeUndefined()
    expect(plan.planUnderlay?.width).toBe(400)
    expect(plan.sourceToWorking?.offsetX).toBe(10)

    const restored = fromPersistedProject(persisted)
    expect(restored.blobs[floorId]?.planUnderlay?.src).toBe(png)
    expect(restored.blobs[floorId]?.planUnderlay?.width).toBe(400)
    expect(restored.blobs[floorId]?.sourceToWorking?.workingWidthPx).toBe(200)
    expect(restored.blobs[floorId]?.sourceToWorking?.offsetY).toBe(5)
  })

  it('schrijft planNulpuntImageCm/planOrient en leest de oude fml*-sleutels nog (rename fase 5)', () => {
    const empty = createEmptyProjectState({ id: 'proj-2', name: 'Alias', address: 'Street 2' })
    const floorId = empty.floors[0].id
    const orient: FloorOrientPersist = { quarterTurnsCw: 1, flipX: true }
    const state: ProjectState = {
      ...empty,
      blobs: {
        [floorId]: {
          session: null,
          generatedFloor: null,
          previewPlan: null,
          previewUnderlayLayout: null,
          planNulpuntImageCm: { x: 12, y: 34 },
          planOrient: orient,
        },
      },
    }

    // Schrijfkant: alleen de nieuwe sleutels gaan naar IDB.
    const persisted = toPersistedProject(state, '2026-09-14T12:00:00.000Z')
    const plan = persisted.blobs[floorId]!.plan
    expect(plan.planNulpuntImageCm).toEqual({ x: 12, y: 34 })
    expect(plan.planOrient).toEqual(orient)
    expect('fmlNulpuntImageCm' in plan).toBe(false)
    expect('fmlOrient' in plan).toBe(false)

    // Leeskant: een record van vóór de rename draagt alleen de oude sleutels.
    const legacy = structuredClone(persisted)
    const legacyPlan = legacy.blobs[floorId]!.plan as Record<string, unknown>
    delete legacyPlan.planNulpuntImageCm
    delete legacyPlan.planOrient
    legacyPlan.fmlNulpuntImageCm = { x: 12, y: 34 }
    legacyPlan.fmlOrient = orient

    const restored = fromPersistedProject(legacy)
    expect(restored.blobs[floorId]?.planNulpuntImageCm).toEqual({ x: 12, y: 34 })
    expect(restored.blobs[floorId]?.planOrient).toEqual(orient)
  })

  it('omits detectionExact from sidecar for result floors with previewPlan', () => {
    const png = minimalPngDataUrl()
    const empty = createEmptyProjectState({ id: 'proj-2', name: 'Test', address: 'Street 1' })
    const floorId = empty.floors[0].id
    const session = sessionStub(png)
    const withDetection: DevWorkspaceSessionV2 = {
      ...session,
      flow: {
        ...session.flow,
        targetFlowStep: 'result',
        restoreMode: 'exact',
      },
      detectionExact: {
        tabOutputs: {
          walls: null,
        },
        roomPhase: 'done',
        wallsDetectionComplete: true,
      },
    }
    const state: ProjectState = {
      ...empty,
      sourceUnderlay: { src: png, name: 'legacy.png' },
      blobs: {
        [floorId]: {
          session: withDetection,
          generatedFloor: null,
          previewPlan: {
            name: 'Test',
            floors: [
              {
                name: 'F0',
                level: 0,
                height: 260,
                walls: [],
              },
            ],
          },
          previewUnderlayLayout: null,
          sourceUnderlay: { src: png, name: 'floor-src.png' },
        },
      },
    }

    const persisted = toPersistedProject(state)
    const cv = persisted.blobs[floorId]?.cv
    expect(cv).toBeTruthy()
    // detectionExact alleen op V2; na omitResultDetection mag de key niet meer aanwezig zijn.
    expect(cv != null && 'detectionExact' in cv).toBe(false)
    expect(persisted.blobs[floorId]?.plan.previewPlan).toBeTruthy()
    expect(persisted.blobs[floorId]?.plan.scale?.confirmed).toBe(true)
    // Legacy project source weggelaten als floors al een bron hebben.
    expect(persisted.sourceUnderlay).toBeNull()
  })

  it('roundtrips project-level PDF bytes; omitSourcePdf drops them', () => {
    const png = minimalPngDataUrl()
    const empty = createEmptyProjectState({ id: 'proj-pdf', name: 'Test', address: 'Street 1' })
    const floorId = empty.floors[0].id
    const pdfBytes = new Uint8Array([37, 80, 68, 70])
    const state: ProjectState = {
      ...empty,
      sourcePdfUnderlay: {
        bytes: pdfBytes,
        pageNumber: 2,
        fileName: 'plan.pdf',
        pageRenderScale: 1.5,
        pageWidthPx: 3000,
        pageHeightPx: 2000,
      },
      blobs: {
        [floorId]: {
          session: sessionStub(png),
          generatedFloor: null,
          previewPlan: null,
          previewUnderlayLayout: null,
          sourceUnderlay: { src: png, name: 'plan.pdf' },
        },
      },
    }

    const persisted = toPersistedProject(state)
    expect(persisted.sourcePdfUnderlay?.fileName).toBe('plan.pdf')
    expect(persisted.sourcePdfUnderlay?.pageNumber).toBe(2)
    expect(Array.from(persisted.sourcePdfUnderlay?.bytes ?? [])).toEqual([37, 80, 68, 70])

    const restored = fromPersistedProject(persisted)
    expect(restored.sourcePdfUnderlay?.fileName).toBe('plan.pdf')
    expect(restored.sourcePdfUnderlay?.pageNumber).toBe(2)
    expect(Array.from(restored.sourcePdfUnderlay?.bytes ?? [])).toEqual([37, 80, 68, 70])

    const omitted = toPersistedProject(state, undefined, { omitSourcePdf: true })
    expect(omitted.sourcePdfUnderlay).toBeNull()
  })

  it('omitStampRasters drops stamp mask bytes and keeps inject metadata', () => {
    const png = minimalPngDataUrl()
    const empty = createEmptyProjectState({ id: 'proj-stamp', name: 'Test', address: 'Street 1' })
    const floorId = empty.floors[0].id
    const session = sessionStub(png)
    const withStamp: DevWorkspaceSessionV2 = {
      ...session,
      wallStamp: {
        donorFloorId: 'donor-1',
        bands: { min: false, mid: true, max: true },
        baseBounds: { x: 0, y: 0, width: 10, height: 10 },
        bounds: { x: 0, y: 0, width: 10, height: 10 },
        wallsCm: [],
        originCm: { x: 0, y: 0 },
        baked: true,
        stampBwBase64: bytesToBase64(new Uint8Array([1, 0, 1, 0])),
        stampMaskBase64: bytesToBase64(new Uint8Array([1, 1, 0, 0])),
        eraseMaskBase64: bytesToBase64(new Uint8Array([0, 0, 0, 1])),
        injectWalls: [
          {
            id: 'stamp-w1',
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thickness: 10,
            openings: [],
          },
        ],
      },
    }
    const state: ProjectState = {
      ...empty,
      blobs: {
        [floorId]: {
          session: withStamp,
          generatedFloor: null,
          previewPlan: null,
          previewUnderlayLayout: null,
        },
      },
    }

    const kept = toPersistedProject(state)
    expect(kept.blobs[floorId]?.cv?.wallStamp?.stampBwBytes).toBeTruthy()
    expect(kept.blobs[floorId]?.cv?.wallStamp?.injectWalls).toHaveLength(1)

    const omitted = toPersistedProject(state, undefined, { omitStampRasters: true })
    expect(omitted.blobs[floorId]?.cv?.wallStamp?.stampBwBytes).toBeUndefined()
    expect(omitted.blobs[floorId]?.cv?.wallStamp?.stampMaskBytes).toBeUndefined()
    expect(omitted.blobs[floorId]?.cv?.wallStamp?.eraseMaskBytes).toBeUndefined()
    expect(omitted.blobs[floorId]?.cv?.wallStamp?.baked).toBe(true)
    expect(omitted.blobs[floorId]?.cv?.wallStamp?.injectWalls).toHaveLength(1)
  })

  it('strips stamp rasters by default on result floors with previewPlan', () => {
    const png = minimalPngDataUrl()
    const empty = createEmptyProjectState({ id: 'proj-stamp-result', name: 'Test', address: 'Street 1' })
    const floorId = empty.floors[0].id
    const session = sessionStub(png)
    const withStamp: DevWorkspaceSessionV2 = {
      ...session,
      flow: { ...session.flow, targetFlowStep: 'result', restoreMode: 'exact' },
      wallStamp: {
        donorFloorId: 'donor-1',
        bands: { min: false, mid: true, max: true },
        baseBounds: { x: 0, y: 0, width: 10, height: 10 },
        bounds: { x: 0, y: 0, width: 10, height: 10 },
        wallsCm: [],
        originCm: { x: 0, y: 0 },
        baked: true,
        stampBwBase64: bytesToBase64(new Uint8Array([1, 0, 1, 0])),
        injectWalls: [
          {
            id: 'stamp-w1',
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thickness: 10,
            openings: [],
          },
        ],
      },
    }
    const state: ProjectState = {
      ...empty,
      blobs: {
        [floorId]: {
          session: withStamp,
          generatedFloor: null,
          previewPlan: {
            name: 'Test',
            floors: [{ name: 'F0', level: 0, height: 260, walls: [] }],
          },
          previewUnderlayLayout: null,
        },
      },
    }

    const persisted = toPersistedProject(state)
    expect(persisted.blobs[floorId]?.cv?.wallStamp?.stampBwBytes).toBeUndefined()
    expect(persisted.blobs[floorId]?.cv?.wallStamp?.baked).toBe(true)
    expect(persisted.blobs[floorId]?.cv?.wallStamp?.injectWalls).toHaveLength(1)
  })

  it('rejects schema v1 records via isPersistedProject', () => {
    const png = minimalPngDataUrl()
    const empty = createEmptyProjectState({ id: 'proj-old', name: 'Old', address: '' })
    const floorId = empty.floors[0].id
    const v2 = toPersistedProject({
      ...empty,
      blobs: {
        [floorId]: {
          session: sessionStub(png),
          generatedFloor: null,
          previewPlan: null,
          previewUnderlayLayout: null,
        },
      },
    })
    expect(isPersistedProject({ ...v2, schemaVersion: 1 })).toBe(false)
    expect(isPersistedProject(v2)).toBe(true)
  })
})
