import { describe, expect, it } from 'vitest'
import {
  buildLayer1FaceDebugEntries,
  rebuildLayer1FromFaceDebug,
} from '@/cv/walls/rooms/pipeline-v3/run-finalize-v3'
import type { PipelineV3Layer1Result } from '@/cv/walls/rooms/pipeline-v3/types'

function makeLayer1(): PipelineV3Layer1Result {
  const faceA = {
    rootLabel: 1,
    bbox: { x: 0, y: 0, width: 10, height: 10 },
    areaPx: 100,
    inkCoverageRatio: 1,
    segments: [
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { a: { x: 10, y: 0 }, b: { x: 10, y: 10 } },
    ],
    junctions: [
      { rootLabel: 1, x: 0, y: 0, kind: 'I' as const, angleDeg: 0 },
      { rootLabel: 1, x: 10, y: 0, kind: 'L' as const, angleDeg: 90 },
      { rootLabel: 1, x: 10, y: 10, kind: 'I' as const, angleDeg: 0 },
    ],
    stats: { segmentCount: 2, junctionCount: 3, elapsedMs: 12 },
  }
  const faceB = {
    rootLabel: 2,
    bbox: { x: 20, y: 20, width: 5, height: 5 },
    areaPx: 25,
    inkCoverageRatio: 0.9,
    segments: [{ a: { x: 20, y: 20 }, b: { x: 25, y: 20 } }],
    junctions: [
      { rootLabel: 2, x: 20, y: 20, kind: 'I' as const, angleDeg: 0 },
      { rootLabel: 2, x: 25, y: 20, kind: 'I' as const, angleDeg: 0 },
    ],
    stats: { segmentCount: 1, junctionCount: 2, elapsedMs: 4 },
  }
  return {
    facesRaw: [faceA, faceB],
    allSegmentsRaw: [...faceA.segments, ...faceB.segments],
    allJunctionsRaw: [...faceA.junctions, ...faceB.junctions],
    totalSegmentsRaw: 3,
    totalJunctionsRaw: 5,
  }
}

describe('layer1 face debug ranges', () => {
  it('builds contiguous index ranges and round-trips via rebuild', () => {
    const layer1 = makeLayer1()
    const faces = buildLayer1FaceDebugEntries(layer1)

    expect(faces).toEqual([
      {
        rootLabel: 1,
        bbox: { x: 0, y: 0, width: 10, height: 10 },
        areaPx: 100,
        inkCoverageRatio: 1,
        segmentStart: 0,
        segmentEnd: 2,
        junctionStart: 0,
        junctionEnd: 3,
      },
      {
        rootLabel: 2,
        bbox: { x: 20, y: 20, width: 5, height: 5 },
        areaPx: 25,
        inkCoverageRatio: 0.9,
        segmentStart: 2,
        segmentEnd: 3,
        junctionStart: 3,
        junctionEnd: 5,
      },
    ])

    const rebuilt = rebuildLayer1FromFaceDebug({
      faces,
      segments: layer1.allSegmentsRaw,
      junctions: layer1.allJunctionsRaw.map(({ x, y, kind, angleDeg }) => ({
        x,
        y,
        kind,
        angleDeg,
      })),
    })

    expect(rebuilt.totalSegmentsRaw).toBe(3)
    expect(rebuilt.totalJunctionsRaw).toBe(5)
    expect(rebuilt.facesRaw).toHaveLength(2)
    expect(rebuilt.facesRaw[0].segments).toEqual(layer1.facesRaw[0].segments)
    expect(rebuilt.facesRaw[1].junctions).toEqual(layer1.facesRaw[1].junctions)
    expect(rebuilt.facesRaw[0].stats.elapsedMs).toBe(0)
  })
})
