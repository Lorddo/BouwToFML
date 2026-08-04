import { basename } from 'node:path'
import { summarizeRunJournal } from '@/core/diagnostics'
import { extractionToPlanWithOrigin } from '@/core/fml/extractionToPlan'
import { harmonizeFmlWallThickness } from '@/core/fml/harmonize-fml-wall-thickness'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { toLayer12DoorForFml, toLayer14WindowsForFml } from '@/core/fml/layer-openings-to-fml'
import { decodeMaskRle } from '@/cv/util/binary-mask-rle'
import { snapDoorsToWalls, orientBoundDoors } from '@/cv/doors'
import { bindWindowsToWalls } from '@/cv/windows'
import { bootstrapCv } from './bootstrap-cv'
import { ledgerFromJournal } from './escalation-ledger-types'
import {
  computeReferenceMetrics,
  loadReferencePlan,
  resolveReferenceFmlPath,
} from './reference-report'
import {
  buildFmlSnapshot,
  type FmlSnapshot,
  type LayersSnapshot,
  type WallsHarnessResult,
} from './run-walls'

export type OpeningsHarnessResult = {
  walls: WallsHarnessResult
  boundDoorCount: number
  orientedDoorCount: number
  boundWindowCount: number
  rejectedWindowCount: number
  fmlSnapshot: FmlSnapshot
  layersSnapshot: LayersSnapshot
  journalDegraded: boolean
}

/**
 * Op een walls-resultaat: L11/L12 + L14 → FML met openingen.
 * Geen journal-reset: D/R-cascade-tellers lopen door op de walls-run (`e2e:<slug>`).
 */
export async function runOpenings(walls: WallsHarnessResult): Promise<OpeningsHarnessResult> {
  const { loaded, wallsOutput } = walls
  const { fixture, labelsData, rawLabelsData, parentMap, classificationByLabel } = loaded
  const slug = fixture.slug
  const fixtureSlug = basename(loaded.dir)
  const cv = await bootstrapCv()
  const graph = wallsOutput.semanticWallGraph
  if (!graph?.segments.length) {
    throw new Error('runOpenings: semanticWallGraph ontbreekt')
  }

  const wallMask = decodeMaskRle(fixture.maskRle)
  const boundDoors = snapDoorsToWalls({
    doors: fixture.resolvedDoors,
    wallMask,
    width: fixture.width,
    height: fixture.height,
    labelsData,
    parentMap,
    segments: graph.segments,
    referenceWallThicknessPx: fixture.referenceWallThicknessPx,
    classificationByLabel,
  })

  const orientedDoors = orientBoundDoors({
    cv,
    boundDoors,
    resolvedDoors: fixture.resolvedDoors,
    segments: graph.segments,
    whiteLabelsData: rawLabelsData,
    whiteParentMap: parentMap,
    width: fixture.width,
    height: fixture.height,
  })

  const windowBind = bindWindowsToWalls({
    windows: fixture.stage4ResolvedWindows,
    refBands: [],
    segments: graph.segments,
    junctions: graph.junctions,
  })
  const boundWindows = windowBind.bound

  const layer12Doors = orientedDoors
    .map((door) => toLayer12DoorForFml(door, fixture.pxPerMmX, fixture.pxPerMmY))
    .filter((door): door is NonNullable<typeof door> => !!door)
  const layer14Windows = toLayer14WindowsForFml(boundWindows)

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
    layer12Doors,
    layer14Windows,
  })

  const harmonized = harmonizeFmlWallThickness(
    plan,
    fixture.fml.thicknessLimits,
    fixture.fml.bandBoundaries,
  )
  buildFmlV3(harmonized, { name: slug })

  let reference = undefined
  if (resolveReferenceFmlPath(fixtureSlug)) {
    const { plan: referencePlan } = loadReferencePlan(fixtureSlug)
    reference = computeReferenceMetrics({
      detected: harmonized,
      reference: referencePlan,
    })
  }

  const journal = summarizeRunJournal()
  const layersSnapshot: LayersSnapshot = {
    layers: walls.layersSnapshot.layers,
    escalations: ledgerFromJournal(journal),
  }

  return {
    walls,
    boundDoorCount: boundDoors.length,
    orientedDoorCount: orientedDoors.length,
    boundWindowCount: boundWindows.length,
    rejectedWindowCount: windowBind.rejected.length,
    fmlSnapshot: buildFmlSnapshot(harmonized, fixture.fml.bandBoundaries, reference),
    layersSnapshot,
    journalDegraded: journal.degraded,
  }
}
