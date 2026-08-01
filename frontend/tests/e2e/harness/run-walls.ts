import { resetRunJournal, summarizeRunJournal } from '@/core/diagnostics'
import { extractionToPlanWithOrigin } from '@/core/fml/extractionToPlan'
import { harmonizeFmlWallThickness } from '@/core/fml/harmonize-fml-wall-thickness'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { classifyFmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import { wallLengthCm } from '@/core/fml/fml-wall-geom'
import type { FloorPlan } from '@/core/fml/types'
import { runPipelineV3 } from '@/cv/walls/rooms/pipeline-v3'
import { buildSemanticWallsForOutput } from '@/cv/walls/rooms/build-semantic-walls-output'
import type { ExtractionOutput } from '@/core/extraction'
import type { PipelineV3Result } from '@/cv/walls/rooms/pipeline-v3/types'
import { bootstrapCv } from './bootstrap-cv'
import { loadE2eFixture, type LoadedE2eFixture } from './load-fixture'
import { extractionFromPipeline, countJunctionKinds } from './pipeline-debug'
import { ledgerFromJournal, type EscalationLedger } from './escalation-ledger-types'
import type { ReferenceMetrics } from './reference-report'

export type LayerSnapshotEntry = {
  segments: number
  junctions: number
  kinds: Record<'I' | 'L' | 'T' | 'X', number>
  invariantReport?: {
    ok: boolean
    errors: string[]
    junctionKindCountsBefore: Record<'I' | 'L' | 'T' | 'X', number>
    junctionKindCountsAfter: Record<'I' | 'L' | 'T' | 'X', number>
  }
}

export type LayersSnapshot = {
  layers: Record<string, LayerSnapshotEntry>
  escalations: EscalationLedger
}

export type FmlWallSnapshot = {
  a: { x: number; y: number }
  b: { x: number; y: number }
  thickness: number
  openings: Array<{
    type: string
    t: number
    width: number
    mirrored?: [number, number]
  }>
}

export type FmlSnapshot = {
  wallCount: number
  totalLengthCm: number
  thicknessBands: Record<'min' | 'mid' | 'max', number>
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
  walls: FmlWallSnapshot[]
  /** Afwijking t.o.v. handgemaakt FML — richting in de diff, geen oordeel. */
  reference?: ReferenceMetrics
}

export type WallsHarnessResult = {
  loaded: LoadedE2eFixture
  pipeline: PipelineV3Result
  wallsOutput: ExtractionOutput
  plan: FloorPlan
  fmlText: string
  fmlSnapshot: FmlSnapshot
  layersSnapshot: LayersSnapshot
  journalDegraded: boolean
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function buildFmlSnapshot(
  plan: FloorPlan,
  bandBoundaries: { midBoundaryCm: number; maxBoundaryCm: number },
  reference?: ReferenceMetrics,
): FmlSnapshot {
  const floor = plan.floors[0]
  const walls = floor?.walls ?? []
  const thicknessBands: Record<'min' | 'mid' | 'max', number> = { min: 0, mid: 0, max: 0 }
  let totalLengthCm = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const wallSnaps: FmlWallSnapshot[] = walls.map((wall) => {
    totalLengthCm += wallLengthCm(wall)
    const band = classifyFmlThicknessBand(wall.thickness, bandBoundaries)
    thicknessBands[band] += 1
    minX = Math.min(minX, wall.a.x, wall.b.x)
    minY = Math.min(minY, wall.a.y, wall.b.y)
    maxX = Math.max(maxX, wall.a.x, wall.b.x)
    maxY = Math.max(maxY, wall.a.y, wall.b.y)
    return {
      a: { x: round1(wall.a.x), y: round1(wall.a.y) },
      b: { x: round1(wall.b.x), y: round1(wall.b.y) },
      thickness: round1(wall.thickness),
      openings: wall.openings.map((op) => ({
        type: op.type ?? 'unknown',
        t: round1(op.t),
        width: round1(op.width),
        ...(op.mirrored ? { mirrored: op.mirrored } : {}),
      })),
    }
  })

  // Stabiele volgorde: eerst x, dan y van midpunt.
  wallSnaps.sort((left, right) => {
    const lx = (left.a.x + left.b.x) / 2
    const rx = (right.a.x + right.b.x) / 2
    if (lx !== rx) return lx - rx
    const ly = (left.a.y + left.b.y) / 2
    const ry = (right.a.y + right.b.y) / 2
    return ly - ry
  })

  return {
    wallCount: walls.length,
    totalLengthCm: round1(totalLengthCm),
    thicknessBands,
    bbox: {
      minX: round1(Number.isFinite(minX) ? minX : 0),
      minY: round1(Number.isFinite(minY) ? minY : 0),
      maxX: round1(Number.isFinite(maxX) ? maxX : 0),
      maxY: round1(Number.isFinite(maxY) ? maxY : 0),
    },
    walls: wallSnaps,
    ...(reference ? { reference } : {}),
  }
}

function buildLayersSnapshot(
  pipeline: PipelineV3Result,
  escalations: EscalationLedger,
): LayersSnapshot {
  const entry = (
    segments: number,
    junctions: Array<{ kind: 'I' | 'L' | 'T' | 'X' }>,
    invariantReport?: LayerSnapshotEntry['invariantReport'],
  ): LayerSnapshotEntry => ({
    segments,
    junctions: junctions.length,
    kinds: countJunctionKinds(junctions),
    ...(invariantReport ? { invariantReport } : {}),
  })

  const layers: Record<string, LayerSnapshotEntry> = {
    layer2: entry(pipeline.layer2.totalSegmentsClean, pipeline.layer2.allJunctionsClean),
  }
  if (pipeline.layer3) {
    layers.layer3 = entry(pipeline.layer3.totalSegmentsPruned, pipeline.layer3.allJunctionsPruned)
  }
  if (pipeline.layer4) {
    layers.layer4 = entry(
      pipeline.layer4.totalSegmentsPositioned,
      pipeline.layer4.allJunctionsPositioned,
      pipeline.layer4.invariantReport,
    )
  }
  if (pipeline.layer5) {
    layers.layer5 = entry(pipeline.layer5.totalSegmentsCleaned, pipeline.layer5.allJunctionsCleaned)
  }
  if (pipeline.layer6) {
    layers.layer6 = entry(
      pipeline.layer6.totalSegmentsRepaired,
      pipeline.layer6.allJunctionsRepaired,
    )
  }
  if (pipeline.layer7) {
    layers.layer7 = entry(pipeline.layer7.totalSegmentsAligned, pipeline.layer7.allJunctionsAligned)
  }
  if (pipeline.layer8) {
    layers.layer8 = entry(
      pipeline.layer8.totalSegmentsFinalized,
      pipeline.layer8.allJunctionsFinalized,
    )
  }
  if (pipeline.layer9) {
    layers.layer9 = entry(
      pipeline.layer9.totalSegmentsCollapsed,
      pipeline.layer9.allJunctionsCollapsed,
    )
  }
  if (pipeline.layer10) {
    layers.layer10 = entry(pipeline.layer10.totalSegmentsReady, pipeline.layer10.allJunctionsReady)
  }

  return { layers, escalations }
}

/**
 * L2–L10 + semantic walls + FML (zonder openingen).
 * Gebakken layer1 + maskRle uit de fixture.
 */
export async function runWalls(slug: string): Promise<WallsHarnessResult> {
  const loaded = loadE2eFixture(slug)
  const { fixture, layer1 } = loaded
  const cv = await bootstrapCv()

  resetRunJournal(`e2e:${slug}`)
  const pipeline = await runPipelineV3({
    cv,
    layer1,
    maskRle: fixture.maskRle,
    referenceWallThicknessPx: fixture.referenceWallThicknessPx,
  })

  if (!pipeline.fmlReady || !pipeline.layer10) {
    throw new Error(`Pipeline niet fmlReady (completedThrough=${pipeline.completedThroughLayer})`)
  }

  let wallsOutput = extractionFromPipeline({
    pipeline,
    maskRle: fixture.maskRle,
  })
  const semantic = await buildSemanticWallsForOutput(wallsOutput, { force: true })
  wallsOutput = semantic.output
  if (!wallsOutput.semanticWallGraph?.segments.length) {
    throw new Error('semanticWallGraph leeg na buildSemanticWallsForOutput')
  }

  const { plan } = extractionToPlanWithOrigin(wallsOutput, {
    pxPerMmX: fixture.pxPerMmX,
    pxPerMmY: fixture.pxPerMmY,
    planName: slug,
    floorName: 'E2E',
    defaultThicknessCm: fixture.fml.thicknessLimits.minCm,
    floorHeightCm: fixture.fml.wallHeightCm,
    defaultDoorHeightCm: fixture.fml.doorHeightCm,
    defaultWindowHeightCm: fixture.fml.windowHeightCm,
    defaultWindowSillZCm: fixture.fml.windowSillZCm,
    layer12Doors: [],
    layer14Windows: [],
  })

  const harmonized = harmonizeFmlWallThickness(
    plan,
    fixture.fml.thicknessLimits,
    fixture.fml.bandBoundaries,
  )
  const fmlText = buildFmlV3(harmonized, { name: slug })
  const journal = summarizeRunJournal()
  const escalations = ledgerFromJournal(journal)

  return {
    loaded,
    pipeline,
    wallsOutput,
    plan: harmonized,
    fmlText,
    fmlSnapshot: buildFmlSnapshot(harmonized, fixture.fml.bandBoundaries),
    layersSnapshot: buildLayersSnapshot(pipeline, escalations),
    journalDegraded: journal.degraded,
  }
}
