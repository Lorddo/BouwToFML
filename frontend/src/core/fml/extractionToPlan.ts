import { tally } from '@/core/diagnostics'
import type { ExtractionOutput } from '@/core/extraction'
import type { WallGraph } from '@/cv/port/wallJunctionGraph'
import type { FloorPlan, Wall } from './types'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
  type ExtractionToPlanOptions,
} from './extraction-to-plan-types'
import { resolveBalance, toCmX, toCmY } from './extraction-to-plan-geom'
import {
  matchSemanticSegmentByEdge,
  resolveGraph,
  resolveThicknessCm,
} from './extraction-to-plan-walls'
import { mapLayer12DoorsToOpenings } from './extraction-to-plan-doors'
import { mapLayer14WindowsToOpenings } from './extraction-to-plan-windows'
import type { WallFaceExtentsCm } from './wall-face-step-evidence'

export type {
  ExtractionToPlanOptions,
  Layer12DoorForFml,
  Layer14WindowForFml,
} from './extraction-to-plan-types'

export {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from './extraction-to-plan-types'

export type FaceEvidenceByWallId = Map<string, WallFaceExtentsCm>

/** CM-origin from een al-opgeloste graph (geen tweede resolveGraph). */
export function resolveExtractionCmOriginFromGraph(
  graph: WallGraph,
  pxPerMmX: number,
  pxPerMmY: number,
): { x: number; y: number } {
  const pointsCmRaw = graph.nodes.map((node) => ({
    x: toCmX(node.x, pxPerMmX),
    y: toCmY(node.y, pxPerMmY),
  }))
  return {
    x: pointsCmRaw.length ? Math.min(...pointsCmRaw.map((p) => p.x)) : 0,
    y: pointsCmRaw.length ? Math.min(...pointsCmRaw.map((p) => p.y)) : 0,
  }
}

/** CM-origin subtracted in {@link extractionToPlan} — nodig om onderlegger uit te lijnen. */
export function resolveExtractionCmOrigin(
  output: ExtractionOutput,
  pxPerMmX: number,
  pxPerMmY: number,
): { x: number; y: number } {
  return resolveExtractionCmOriginFromGraph(resolveGraph(output), pxPerMmX, pxPerMmY)
}

/** Plan + origin uit één resolveGraph — generate/underlay delen dezelfde pass. */
export function extractionToPlanWithOrigin(
  output: ExtractionOutput,
  options: ExtractionToPlanOptions,
): {
  plan: FloorPlan
  origin: { x: number; y: number }
  faceEvidenceById: FaceEvidenceByWallId
} {
  const defaultThicknessCm = options.defaultThicknessCm ?? 10
  const floorHeightCm =
    Number.isFinite(options.floorHeightCm) && (options.floorHeightCm ?? 0) > 0
      ? Math.round(options.floorHeightCm!)
      : DEFAULT_FML_WALL_HEIGHT_CM
  const defaultDoorHeightCm =
    Number.isFinite(options.defaultDoorHeightCm) && (options.defaultDoorHeightCm ?? 0) > 0
      ? Math.round(options.defaultDoorHeightCm!)
      : DEFAULT_FML_DOOR_HEIGHT_CM
  const defaultWindowHeightCm =
    Number.isFinite(options.defaultWindowHeightCm) && (options.defaultWindowHeightCm ?? 0) > 0
      ? Math.round(options.defaultWindowHeightCm!)
      : DEFAULT_FML_WINDOW_HEIGHT_CM
  const defaultWindowSillZCm =
    Number.isFinite(options.defaultWindowSillZCm) && (options.defaultWindowSillZCm ?? 0) >= 0
      ? Math.round(options.defaultWindowSillZCm!)
      : DEFAULT_FML_WINDOW_SILL_Z_CM
  if (options.pxPerMmX <= 0 || options.pxPerMmY <= 0) {
    throw new Error('Schaal ontbreekt: pixelsPerMillimeterX/Y moeten groter zijn dan 0.')
  }

  const graph = resolveGraph(output)
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const origin = resolveExtractionCmOriginFromGraph(graph, options.pxPerMmX, options.pxPerMmY)
  const { x: minX, y: minY } = origin
  const consumedDoorIds = new Set<string>()
  const consumedWindowIds = new Set<string>()
  const faceEvidenceById: FaceEvidenceByWallId = new Map()
  const pxPerMmAvg = (options.pxPerMmX + options.pxPerMmY) / 2

  const walls: Wall[] = graph.edges.map((edge, index) => {
    const aNode = nodeById.get(edge.a)
    const bNode = nodeById.get(edge.b)
    // ESC:X-08 (E)
    if (!aNode || !bNode) tally('X-08', 'edge_fallback')
    const aSource = aNode ?? edge.segment.a
    const bSource = bNode ?? edge.segment.b
    const a = {
      x: toCmX(aSource.x, options.pxPerMmX) - minX,
      y: toCmY(aSource.y, options.pxPerMmY) - minY,
    }
    const b = {
      x: toCmX(bSource.x, options.pxPerMmX) - minX,
      y: toCmY(bSource.y, options.pxPerMmY) - minY,
    }
    const semanticMatch = matchSemanticSegmentByEdge({
      semanticSegments: output.semanticWallGraph?.segments,
      edgeSegment: edge.segment,
    })
    const semanticSegment = semanticMatch?.segment
    // Prefer robust typical (median); fall back to max for legacy graphs without typical.
    const semanticThicknessPx =
      (semanticSegment?.thicknessPxTypical ?? 0) > 0
        ? semanticSegment?.thicknessPxTypical
        : semanticSegment?.thicknessPxMax
    // ESC:X-22 — thicknessPx≤0 telt niet als meting (zero-fallback weg); dan resolveThicknessCm.
    const semanticThicknessCm =
      Number.isFinite(semanticThicknessPx) &&
      (semanticThicknessPx ?? 0) > 0 &&
      Number.isFinite(pxPerMmAvg) &&
      pxPerMmAvg > 0
        ? Math.max(1, (semanticThicknessPx as number) / pxPerMmAvg / 10)
        : null
    const doorOpenings = mapLayer12DoorsToOpenings({
      layer12Doors: options.layer12Doors ?? [],
      semanticSegmentIndex: semanticMatch?.index ?? null,
      fallbackEdgeIndex: index,
      edgeSegment: edge.segment,
      pxPerMmX: options.pxPerMmX,
      pxPerMmY: options.pxPerMmY,
      defaultDoorHeightCm,
      consumedDoorIds,
      mergeDoubleDoors: options.mergeDoubleDoors,
    })
    const windowOpenings = mapLayer14WindowsToOpenings({
      layer14Windows: options.layer14Windows ?? [],
      semanticSegmentIndex: semanticMatch?.index ?? null,
      fallbackEdgeIndex: index,
      edgeSegment: edge.segment,
      pxPerMmX: options.pxPerMmX,
      pxPerMmY: options.pxPerMmY,
      defaultWindowHeightCm,
      defaultWindowSillZCm,
      consumedWindowIds,
    })
    const wallId = edge.id || `wall-${index}`
    const plusPx = semanticSegment?.facePlusPx
    const minusPx = semanticSegment?.faceMinusPx
    if (
      pxPerMmAvg > 0 &&
      Number.isFinite(plusPx) &&
      Number.isFinite(minusPx) &&
      (plusPx ?? 0) >= 0 &&
      (minusPx ?? 0) >= 0
    ) {
      faceEvidenceById.set(wallId, {
        plusCm: (plusPx as number) / pxPerMmAvg / 10,
        minusCm: (minusPx as number) / pxPerMmAvg / 10,
      })
    }
    return {
      id: wallId,
      a,
      b,
      // ESC:X-07 (E)
      thickness:
        semanticThicknessCm ??
        resolveThicknessCm(
          output,
          edge.segment.templateIndex,
          options.pxPerMmX,
          options.pxPerMmY,
          defaultThicknessCm,
        ),
      balance: resolveBalance(semanticSegment?.balancePx),
      c: null,
      openings: [...doorOpenings, ...windowOpenings],
    }
  })

  return {
    plan: {
      name: options.planName ?? 'Detectie-export',
      floors: [
        {
          name: options.floorName ?? 'Begane grond',
          level: options.level ?? 0,
          height: floorHeightCm,
          walls,
        },
      ],
    },
    origin,
    faceEvidenceById,
  }
}

export function extractionToPlan(
  output: ExtractionOutput,
  options: ExtractionToPlanOptions,
): FloorPlan {
  return extractionToPlanWithOrigin(output, options).plan
}
