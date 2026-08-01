import { describe, expect, it } from 'vitest'
import { decodeInt32Rle, encodeInt32Rle, fnv1aHex } from '@/platform/e2e-fixture/rle-codec'
import {
  buildE2eFixture,
  layer1FromPipelineDebug,
  slugFromImageName,
} from '@/platform/e2e-fixture/build-fixture'
import { DEFAULT_FML_WALL_THICKNESS_LIMITS } from '@/core/fml/fml-wall-thickness-limits'
import { DEFAULT_FML_BAND_BOUNDARIES } from '@/core/fml/fml-wall-thickness-tiers'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import { encodeMaskRle } from '@/cv/util/binary-mask-rle'

describe('e2e-fixture rle-codec', () => {
  it('round-trips an Int32 label raster', () => {
    const width = 4
    const height = 3
    const data = Int32Array.from([0, 0, 1, 1, 1, 2, 2, 2, 2, 0, 0, 3])
    const encoded = encodeInt32Rle(data, width, height)
    const decoded = decodeInt32Rle(encoded, width, height)
    expect(Array.from(decoded)).toEqual(Array.from(data))
  })

  it('fnv1a is stable', () => {
    expect(fnv1aHex([new Uint8Array([1, 2, 3])])).toBe(fnv1aHex([new Uint8Array([1, 2, 3])]))
    expect(fnv1aHex([new Uint8Array([1, 2, 3])])).not.toBe(fnv1aHex([new Uint8Array([1, 2, 4])]))
  })
})

describe('e2e-fixture build', () => {
  it('builds a fixture with checksum and elapsedMs=0', () => {
    const width = 8
    const height = 4
    const maskData = new Uint8Array(width * height)
    for (let i = 0; i < maskData.length; i += 1) maskData[i] = i % 3 === 0 ? 255 : 0
    const maskRle = encodeMaskRle(maskData, width, height)
    const labels = Int32Array.from({ length: width * height }, (_, i) => (i < 8 ? 1 : 0))
    const rawLabels = Int32Array.from(labels)

    const layer1 = layer1FromPipelineDebug({
      faces: [
        {
          rootLabel: 1,
          bbox: { x: 0, y: 0, width: 4, height: 4 },
          areaPx: 16,
          inkCoverageRatio: 1,
          segmentStart: 0,
          segmentEnd: 1,
          junctionStart: 0,
          junctionEnd: 2,
        },
      ],
      segments: [{ type: 'wall', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }],
      junctions: [
        { x: 0, y: 0, kind: 'I', angleDeg: 0 },
        { x: 4, y: 0, kind: 'I', angleDeg: 0 },
      ],
    })

    const fixture = buildE2eFixture({
      slug: 'demo',
      maskRle,
      layer1,
      labelsData: labels,
      rawLabelsData: rawLabels,
      width,
      height,
      parentMap: [[1, 0]],
      classificationByLabel: [[1, 'wall']],
      resolvedDoors: [],
      stage4ResolvedWindows: [],
      pxPerMmX: 0.5,
      pxPerMmY: 0.5,
      referenceWallThicknessPx: 12,
      fml: {
        thicknessLimits: { ...DEFAULT_FML_WALL_THICKNESS_LIMITS },
        bandBoundaries: { ...DEFAULT_FML_BAND_BOUNDARIES },
        wallHeightCm: DEFAULT_FML_WALL_HEIGHT_CM,
        doorHeightCm: DEFAULT_FML_DOOR_HEIGHT_CM,
        windowHeightCm: DEFAULT_FML_WINDOW_HEIGHT_CM,
        windowSillZCm: DEFAULT_FML_WINDOW_SILL_Z_CM,
      },
    })

    expect(fixture.version).toBe(1)
    expect(fixture.slug).toBe('demo')
    expect(fixture.checksum).toMatch(/^[0-9a-f]{8}$/)
    expect(fixture.layer1.facesRaw[0].stats.elapsedMs).toBe(0)
    expect(fixture.layer1.totalSegmentsRaw).toBe(1)
    expect(fixture.labelsRle.width).toBe(width)
  })

  it('slugFromImageName sanitizes', () => {
    expect(slugFromImageName('2D_3E.jpg')).toBe('2d-3e')
    expect(slugFromImageName(null)).toBe('fixture')
  })
})
