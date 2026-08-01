/**
 * Fase 1: meegegeven layer1 wordt gehonoreerd (geen L1-herberekening / geen blobs).
 *
 * @see .cursor/plans/e2e_fixtures_fml_current_1c7d845e.plan.md
 */
/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { waitForOpenCV, type OpenCV } from '@/cv/loadOpenCV'
import { encodeMaskRle } from '@/cv/util/binary-mask-rle'
import {
  releaseConnectedWallBlobs,
  splitConnectedWallBlobs,
} from '@/cv/walls/rooms/room-wall-connected-blobs'
import { runPipelineV3 } from '@/cv/walls/rooms/pipeline-v3'
import {
  buildLayer1FaceDebugEntries,
  rebuildLayer1FromFaceDebug,
} from '@/cv/walls/rooms/pipeline-v3/run-finalize-v3'
import { asSegmentCandidates } from '@/cv/walls/strategy-utils'

const WIDTH = 320
const HEIGHT = 240
const WALL = 12

function buildSyntheticWallMask(): Uint8Array {
  const data = new Uint8Array(WIDTH * HEIGHT)
  const paint = (x0: number, y0: number, x1: number, y1: number) => {
    const xa = Math.max(0, Math.min(x0, x1))
    const xb = Math.min(WIDTH - 1, Math.max(x0, x1))
    const ya = Math.max(0, Math.min(y0, y1))
    const yb = Math.min(HEIGHT - 1, Math.max(y0, y1))
    for (let y = ya; y <= yb; y += 1) {
      for (let x = xa; x <= xb; x += 1) {
        data[y * WIDTH + x] = 255
      }
    }
  }
  paint(40, 40, 280, 40 + WALL)
  paint(40, 180, 280, 180 + WALL)
  paint(40, 40, 40 + WALL, 180 + WALL)
  paint(280 - WALL, 40, 280, 180 + WALL)
  paint(40, 110, 200, 110 + WALL)
  return data
}

describe('E2E fase 1 — layer1 injectie', () => {
  let cv: OpenCV

  it('honoreert meegegeven layer1 zonder blobs en matcht L10', async () => {
    cv = await waitForOpenCV()
    const maskData = buildSyntheticWallMask()
    const closedMask = cv.matFromArray(HEIGHT, WIDTH, cv.CV_8UC1, maskData)
    let blobs: ReturnType<typeof splitConnectedWallBlobs>['blobs'] = []
    try {
      const split = splitConnectedWallBlobs({
        cv,
        closedMask,
        imageWidth: WIDTH,
        imageHeight: HEIGHT,
        keepLargestOnly: true,
      })
      blobs = split.blobs
      const maskRle = encodeMaskRle(split.keptWallMaskData, WIDTH, HEIGHT)

      const first = await runPipelineV3({
        cv,
        blobs,
        maskRle,
        referenceWallThicknessPx: WALL,
      })

      const faceDebug = buildLayer1FaceDebugEntries(first.layer1)
      const rebuiltLayer1 = rebuildLayer1FromFaceDebug({
        faces: faceDebug,
        segments: asSegmentCandidates(first.layer1.allSegmentsRaw),
        junctions: first.layer1.allJunctionsRaw.map(({ x, y, kind, angleDeg }) => ({
          x,
          y,
          kind,
          angleDeg,
        })),
      })

      expect(rebuiltLayer1.facesRaw).toHaveLength(first.layer1.facesRaw.length)
      expect(rebuiltLayer1.totalSegmentsRaw).toBe(first.layer1.totalSegmentsRaw)

      const injected = await runPipelineV3({
        cv,
        layer1: rebuiltLayer1,
        maskRle,
        referenceWallThicknessPx: WALL,
      })

      expect(injected.fmlReady).toBe(true)
      expect(injected.layer1.totalSegmentsRaw).toBe(first.layer1.totalSegmentsRaw)
      expect(injected.layer10).toBeDefined()
      expect(first.layer10).toBeDefined()
      expect(injected.layer10!.allSegmentsReady.length).toBe(first.layer10!.allSegmentsReady.length)
      expect(injected.layer10!.allJunctionsReady.length).toBe(
        first.layer10!.allJunctionsReady.length,
      )
    } finally {
      closedMask.delete()
      releaseConnectedWallBlobs(blobs)
    }
  }, 30_000)

  it('gooit zonder blobs én zonder layer1', async () => {
    if (!cv) cv = await waitForOpenCV()
    const maskRle = encodeMaskRle(new Uint8Array(4), 2, 2)
    await expect(
      runPipelineV3({
        cv,
        maskRle,
        referenceWallThicknessPx: WALL,
      }),
    ).rejects.toThrow(/blobs is required/)
  }, 15_000)
})
