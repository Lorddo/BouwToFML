import { noteSwallowedError, tally } from '@/core/diagnostics'
import type { ExtractionOutput } from '@/core/extraction'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import {
  buildSemanticGraphFromFmlLayer,
  hasFmlSemanticSource,
  resolveFmlSourceJunctionCount,
  semanticAsSegments,
} from './build-semantic-walls-source'
import { buildWallDistanceMap, measureSegmentThicknessMax } from './room-wall-segment-thickness'

export interface BuildSemanticWallsOutputResult {
  output: ExtractionOutput
  built: boolean
  usedLayerBFallback: boolean
}

/**
 * Bouwt semantic wall graph + segmentdikte op walls-tab-output.
 * Bron: V3 L10 alleen bij `fmlReady` (via `resolveFmlSourceLayer`).
 * Idempotent: slaat over als de graph al past bij het huidige junction-totaal.
 */
export async function buildSemanticWallsForOutput(
  walls: ExtractionOutput,
  options: { force?: boolean } = {},
): Promise<BuildSemanticWallsOutputResult> {
  if (!hasFmlSemanticSource(walls)) {
    return { output: walls, built: false, usedLayerBFallback: false }
  }

  const junctionCount = resolveFmlSourceJunctionCount(walls)
  const existing = walls.semanticWallGraph
  if (
    !options.force &&
    existing?.segments.length &&
    existing.meta.rawJunctionCount === junctionCount
  ) {
    return {
      output: walls,
      built: false,
      usedLayerBFallback: walls.semanticUsedLayerBFallback ?? false,
    }
  }

  let maskCache: Uint8Array | undefined
  let distanceMap: Float32Array | null | undefined

  if (walls.roomWallMaskRle) {
    // ESC:X-23 (E)
    let cv: Awaited<ReturnType<typeof waitForOpenCV>> | undefined
    try {
      cv = await waitForOpenCV()
    } catch (error) {
      noteSwallowedError('X-23', 'build-semantic-walls-output', error, {
        effect: 'geen distance-map → geen diktemeting op L10-segmenten',
      })
      cv = undefined
    }

    if (cv) {
      const cached = buildWallDistanceMap({ cv, maskRle: walls.roomWallMaskRle })
      if (cached) {
        maskCache = cached.mask
        distanceMap = cached.distanceMap
      }
    }
  }

  const built = buildSemanticGraphFromFmlLayer(walls)
  let semantic = built.semantic

  if (walls.roomWallMaskRle) {
    semantic = measureSegmentThicknessMax({
      graph: semantic,
      maskRle: walls.roomWallMaskRle,
      mask: maskCache,
      distanceMap,
      harmonizeByWallLine: false,
      referenceWallThicknessPx: walls.meta?.referenceWallThicknessPx,
    })
  }

  // ESC:X-22 (E) — VERWIJDERD 2026-07-31: zero-fallback. Alleen gemeten dikte telt;
  // thicknessPxMax/typical≤0 → FML-dikte via resolveThicknessCm (X-07), niet via 0→1cm.
  for (const segment of semantic.segments) {
    const measured =
      (segment.thicknessPxTypical ?? 0) > 0 ? segment.thicknessPxTypical : segment.thicknessPxMax
    if ((measured ?? 0) > 0) tally('X-22', 'measured')
  }

  const semanticSegments = semanticAsSegments(semantic)
  // Endpoints wijzigen niet door thickness — hergebruik dezelfde WallGraph (geen 2e buildJunctionGraph).
  const wallGraph = semantic.segments.length > 0 ? built.wallGraph : walls.wallGraph

  // ESC:X-27 (P) — dode vlag: nooit gezet op true, geen setter elders in de codebase.
  tally('X-27', 'dead_flag_false')
  return {
    output: {
      ...walls,
      semanticWallGraph: semantic,
      segments: semanticSegments.length > 0 ? semanticSegments : (walls.segments ?? []),
      wallGraph,
      semanticUsedLayerBFallback: false,
    },
    built: true,
    usedLayerBFallback: false,
  }
}

/**
 * Conversie-helper: schrijft semantic walls terug op `tabOutputs` als de FML-bron klaar is.
 * UI (`useWorkspaceSemanticWalls`) is alleen write-back naar de ref.
 */
export async function ensureSemanticWallsOnTabOutputs(
  outputs: TabDetectionOutputs,
  options: { force?: boolean } = {},
): Promise<{ outputs: TabDetectionOutputs; built: boolean }> {
  const walls = outputs.walls
  if (!walls || !hasFmlSemanticSource(walls)) {
    return { outputs, built: false }
  }

  const { output, built } = await buildSemanticWallsForOutput(walls, options)
  if (!built) return { outputs, built: false }

  return {
    outputs: {
      ...outputs,
      walls: output,
    },
    built: true,
  }
}
