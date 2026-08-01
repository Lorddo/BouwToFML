import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { E2eFixture } from '@/platform/e2e-fixture'
import { computeFixtureChecksum, decodeInt32Rle } from '@/platform/e2e-fixture'
import type { PipelineV3Layer1Result } from '@/cv/walls/rooms/pipeline-v3/types'

const harnessDir = dirname(fileURLToPath(import.meta.url))
export const e2eFixturesRoot = join(harnessDir, '..', 'fixtures')

export type LoadedE2eFixture = {
  fixture: E2eFixture
  dir: string
  labelsData: Int32Array
  rawLabelsData: Int32Array
  layer1: PipelineV3Layer1Result
  parentMap: Map<number, number>
  classificationByLabel: Map<number, import('@/cv/walls/rooms/room-ink-classify').RoomRasterClass>
}

export function fixtureDir(slug: string): string {
  return join(e2eFixturesRoot, slug)
}

export function loadE2eFixture(slug: string): LoadedE2eFixture {
  const dir = fixtureDir(slug)
  const raw = readFileSync(join(dir, 'fixture.json'), 'utf8')
  const fixture = JSON.parse(raw) as E2eFixture

  if (fixture.version !== 1) {
    throw new Error(`Unsupported fixture version: ${String(fixture.version)}`)
  }

  const expected = computeFixtureChecksum({
    maskRuns: fixture.maskRle.runs,
    labelsRleBase64: fixture.labelsRle.rleBase64,
    rawLabelsRleBase64: fixture.rawLabelsRle.rleBase64,
  })
  if (expected !== fixture.checksum) {
    throw new Error(
      `Fixture checksum mismatch (got ${fixture.checksum}, expected ${expected}). ` +
        'OpenCV/export drift — fixture opnieuw exporteren.',
    )
  }

  const labelsData = decodeInt32Rle(
    fixture.labelsRle.rleBase64,
    fixture.labelsRle.width,
    fixture.labelsRle.height,
  )
  const rawLabelsData = decodeInt32Rle(
    fixture.rawLabelsRle.rleBase64,
    fixture.rawLabelsRle.width,
    fixture.rawLabelsRle.height,
  )

  const layer1: PipelineV3Layer1Result = {
    facesRaw: fixture.layer1.facesRaw.map((face) => ({
      rootLabel: face.rootLabel,
      bbox: { ...face.bbox },
      areaPx: face.areaPx,
      inkCoverageRatio: face.inkCoverageRatio,
      segments: face.segments.map((seg) => ({
        a: { ...seg.a },
        b: { ...seg.b },
        ...(seg.templateIndex !== undefined ? { templateIndex: seg.templateIndex } : {}),
      })),
      junctions: face.junctions.map((j) => ({ ...j })),
      stats: { ...face.stats, elapsedMs: 0 },
    })),
    allSegmentsRaw: fixture.layer1.allSegmentsRaw.map((seg) => ({
      a: { ...seg.a },
      b: { ...seg.b },
      ...(seg.templateIndex !== undefined ? { templateIndex: seg.templateIndex } : {}),
    })),
    allJunctionsRaw: fixture.layer1.allJunctionsRaw.map((j) => ({ ...j })),
    totalSegmentsRaw: fixture.layer1.totalSegmentsRaw,
    totalJunctionsRaw: fixture.layer1.totalJunctionsRaw,
  }

  return {
    fixture,
    dir,
    labelsData,
    rawLabelsData,
    layer1,
    parentMap: new Map(fixture.parentMap),
    classificationByLabel: new Map(fixture.classificationByLabel),
  }
}
