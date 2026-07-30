/**
 * Fase 0 go/no-go voor E2E-fixtures: bewijs dat OpenCV + skeleton-tracing-wasm
 * in vitest onder Node werken (geen jsdom, geen canvas, geen imread).
 *
 * @see .cursor/plans/e2e_fixtures_fml_current_1c7d845e.plan.md
 */
/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import TraceSkeleton from 'skeleton-tracing-wasm'
import { waitForOpenCV, type OpenCV } from '@/cv/loadOpenCV'
import { encodeMaskRle } from '@/cv/util/binary-mask-rle'
import {
  releaseConnectedWallBlobs,
  splitConnectedWallBlobs,
} from '@/cv/walls/rooms/room-wall-connected-blobs'
import { runPipelineV3 } from '@/cv/walls/rooms/pipeline-v3'

const WIDTH = 320
const HEIGHT = 240
const WALL = 12

/** Eenvoudige plattegrond-contour (rechthoek + tussenmuur) als binair muurmasker. */
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
  // Buitencontour
  paint(40, 40, 280, 40 + WALL)
  paint(40, 180, 280, 180 + WALL)
  paint(40, 40, 40 + WALL, 180 + WALL)
  paint(280 - WALL, 40, 280, 180 + WALL)
  // Tussenmuur + deuropening-achtige inkeping (muur blijft contiguous)
  paint(40, 110, 200, 110 + WALL)
  return data
}

describe('E2E fase 0 — OpenCV + skeleton in Node', () => {
  let cv: OpenCV

  it('laadt @opencvjs/web en draait distanceTransform / connectedComponentsWithStats / bitwise_not', async () => {
    const t0 = performance.now()
    cv = await waitForOpenCV()
    const loadMs = performance.now() - t0

    console.log(`[spike] OpenCV load: ${loadMs.toFixed(0)} ms`)

    expect(typeof cv.distanceTransform).toBe('function')
    expect(typeof cv.connectedComponentsWithStats).toBe('function')
    expect(typeof cv.bitwise_not).toBe('function')
    expect(typeof cv.matFromArray).toBe('function')

    const w = 40
    const h = 30
    const pixels = new Uint8Array(w * h)
    for (let y = 10; y < 20; y += 1) {
      for (let x = 5; x < 35; x += 1) {
        pixels[y * w + x] = 255
      }
    }

    const src = cv.matFromArray(h, w, cv.CV_8UC1, pixels)
    const dist = new cv.Mat()
    const inverted = new cv.Mat()
    const labels = new cv.Mat()
    const stats = new cv.Mat()
    const centroids = new cv.Mat()
    try {
      cv.distanceTransform(src, dist, cv.DIST_L2 ?? 2, cv.DIST_MASK_3 ?? 3)
      expect(dist.rows).toBe(h)
      expect(dist.cols).toBe(w)
      expect(dist.floatAt(15, 20)).toBeGreaterThan(1)

      cv.bitwise_not(src, inverted)
      expect(inverted.ucharAt(15, 20)).toBe(0)
      expect(inverted.ucharAt(0, 0)).toBe(255)

      const count = cv.connectedComponentsWithStats(src, labels, stats, centroids, 8, cv.CV_32S)
      expect(count).toBe(2) // achtergrond + 1 component
      expect(stats.intAt(1, cv.CC_STAT_AREA)).toBe(300)
    } finally {
      src.delete()
      dist.delete()
      inverted.delete()
      labels.delete()
      stats.delete()
      centroids.delete()
    }
  }, 30_000)

  it('laadt skeleton-tracing-wasm en traceert een kruis', async () => {
    type SkeletonTracer = {
      fromBoolArray: (
        data: ArrayLike<number | boolean>,
        w: number,
        h: number,
      ) => { polylines: number[][][] }
    }
    const t0 = performance.now()
    const tracer = await (
      TraceSkeleton as unknown as { load: () => Promise<SkeletonTracer> }
    ).load()
    const loadMs = performance.now() - t0

    console.log(`[spike] skeleton-tracing-wasm load: ${loadMs.toFixed(0)} ms`)

    const w = 60
    const h = 40
    const binary = new Uint8Array(w * h)
    for (let y = 18; y <= 22; y += 1) {
      for (let x = 5; x < 55; x += 1) binary[y * w + x] = 1
    }
    for (let x = 28; x <= 32; x += 1) {
      for (let y = 5; y < 35; y += 1) binary[y * w + x] = 1
    }

    const traced = tracer.fromBoolArray(binary, w, h)
    expect(traced.polylines.length).toBeGreaterThan(0)
    expect(traced.polylines[0].length).toBeGreaterThanOrEqual(2)
  }, 15_000)

  it('draait volle L1–L10 pipeline op synthetisch masker (runtime-meting)', async () => {
    if (!cv) cv = await waitForOpenCV()

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
      expect(blobs.length).toBe(1)

      const maskRle = encodeMaskRle(split.keptWallMaskData, WIDTH, HEIGHT)
      const t0 = performance.now()
      const result = await runPipelineV3({
        cv,
        blobs,
        maskRle,
        referenceWallThicknessPx: WALL,
      })
      const elapsedMs = performance.now() - t0

      console.log(
        `[spike] L1–L10: ${elapsedMs.toFixed(0)} ms | ` +
          `L1 segs=${result.layer1.allSegmentsRaw.length} | ` +
          `L10 segs=${result.layer10.allSegmentsReady.length} | ` +
          `fmlReady=${result.fmlReady}`,
      )

      expect(result.fmlReady).toBe(true)
      expect(result.layer1.allSegmentsRaw.length).toBeGreaterThan(0)
      expect(result.layer10.allSegmentsReady.length).toBeGreaterThan(0)
      // Synthetisch 320×240: moet ruim onder CI-budget blijven
      expect(elapsedMs).toBeLessThan(15_000)
    } finally {
      closedMask.delete()
      releaseConnectedWallBlobs(blobs)
    }
  }, 30_000)
})
