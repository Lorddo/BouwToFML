import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildInkEaterLabels, resolveInkBetweenFaces } from '@/cv/walls/rooms/room-ink-resolve'
import { buildEnclosedFaceParentMap } from '@/cv/walls/rooms/room-raster-merge'
import {
  classifyFacesByInkCoverage,
  applyFaceClassificationOverrides,
} from '@/cv/walls/rooms/room-ink-classify'
import { buildMergedWallFaceMaskData } from '@/cv/walls/rooms/room-wall-face-mask'
import { isFinalizeTabOutput } from '@/cv/workspace/layer-flow'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import type { Segment } from '@/cv/port/wallGraph'

vi.mock('@/cv/port/wallSkeletonTrace', () => ({
  traceSkeletonSegments: vi.fn(),
}))

import { traceSkeletonSegments } from '@/cv/port/wallSkeletonTrace'

function component(
  label: number,
  bbox: { x: number; y: number; width: number; height: number },
  touchesBorder = false,
): RasterRoomComponent {
  const areaPx = bbox.width * bbox.height
  return { label, areaPx, bbox, touchesBorder }
}

describe('room-first ink-resolve E2E', () => {
  beforeEach(() => {
    vi.mocked(traceSkeletonSegments).mockReset()
  })

  it('classify → mask → skeleton op arcering-fixture zonder label-0 tussen faces', async () => {
    const width = 21
    const height = 9
    const components: RasterRoomComponent[] = [
      component(1, { x: 1, y: 1, width: 6, height: 7 }),
      component(2, { x: 14, y: 1, width: 6, height: 7 }, true),
    ]
    const rawLabels = new Int32Array(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x >= 1 && x <= 6 && y >= 1 && y <= 7) rawLabels[y * width + x] = 1
        else if (x >= 14 && x <= 19 && y >= 1 && y <= 7) rawLabels[y * width + x] = 2
      }
    }

    const referenceDataForEaters = new Uint8Array(width * height).fill(255)
    for (let y = 1; y <= 7; y += 1) {
      for (let x = 7; x <= 13; x += 1) {
        referenceDataForEaters[y * width + x] = 0
      }
    }
    for (let y = 1; y <= 7; y += 1) {
      for (let x = 1; x <= 6; x += 1) {
        referenceDataForEaters[y * width + x] = 0
      }
    }
    const inkEaters = buildInkEaterLabels({
      components,
      labelsData: rawLabels,
      referenceData: referenceDataForEaters,
      inkCoverageThreshold: 0.5,
    })
    const resolved = resolveInkBetweenFaces({
      labelsData: rawLabels,
      components,
      width,
      height,
      labelClass: inkEaters.labelClass,
    })
    expect(resolved.assignedPx).toBeGreaterThan(0)

    for (let y = 1; y <= 7; y += 1) {
      for (let x = 7; x <= 13; x += 1) {
        expect(resolved.labelsData[y * width + x]).toBeGreaterThan(0)
      }
    }

    const labelAt = (x: number, y: number) => resolved.labelsData[y * width + x] ?? 0
    const parentMap = buildEnclosedFaceParentMap(components, width, height, { labelAt })

    const referenceData = new Uint8Array(width * height).fill(255)
    for (let y = 1; y <= 7; y += 1) {
      for (let x = 7; x <= 13; x += 1) {
        referenceData[y * width + x] = 0
      }
    }

    const classified = classifyFacesByInkCoverage({
      labelsData: resolved.labelsData,
      referenceData,
      components,
      parentMap,
      threshold: 0.5,
      groupBy: 'merged',
    })
    const classificationByLabel = applyFaceClassificationOverrides(
      classified.classificationByLabel,
      new Map([[1, 'wall']]),
    )

    const mergedMask = buildMergedWallFaceMaskData({
      labelsData: resolved.labelsData,
      parentMap,
      classificationByLabel,
      width,
      height,
      groupBy: 'merged',
    })

    for (let y = 1; y <= 7; y += 1) {
      expect(mergedMask[7 + y * width]).toBe(255)
      // Face 2 raakt rand → outside; inkt met label 2 hoort niet in muurmasker
      expect(mergedMask[13 + y * width]).toBe(0)
    }

    vi.mocked(traceSkeletonSegments).mockResolvedValueOnce([
      { a: { x: 1, y: 4 }, b: { x: 19, y: 4 } },
    ] satisfies Segment[])

    expect(
      isFinalizeTabOutput({
        candidates: [],
        meta: {
          extractorId: 'geometry-lbe',
          elapsedMs: 10,
          roomPipelinePhase: 'finalize',
          roomClassifyState: {
            width,
            height,
            labelsData: resolved.labelsData,
            parentMap: [...parentMap.entries()],
            classificationByLabel: [...classificationByLabel.entries()],
            threshold: 0.5,
            mergedFaceCount: 2,
            inkResolveStats: {
              assignedPx: resolved.assignedPx,
              unresolvedPx: resolved.unresolvedPx,
            },
          },
        },
        pipelineV3Debug: {
          pipelineVersion: 'v3',
          layers: {
            layer1: {
              segments: [{ type: 'wall', a: { x: 1, y: 4 }, b: { x: 19, y: 4 }, confidence: 1 }],
              junctions: [],
            },
          },
        },
      }),
    ).toBe(true)
  })
})
