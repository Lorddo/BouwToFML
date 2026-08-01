import { summarizeRunJournal, tally } from '@/core/diagnostics'
import type { ExtractionOutput } from '@/core/extraction'
import type { BoundDoor, OrientedDoor, ResolvedDoorCandidate } from '@/cv/doors'
import type { BoundWindow, WindowBindRejectReason, WindowBindRejection } from '@/cv/windows'
import { compareWallLayerTransitions } from './compare-wall-transitions'
import {
  LAYER_DEBUG_REPORT_VERSION,
  type LayerDebugDoorBound,
  type LayerDebugDoorOriented,
  type LayerDebugDoorOrientSkipped,
  type LayerDebugDoorUnbound,
  type LayerDebugLayer11,
  type LayerDebugLayer12,
  type LayerDebugLayer14,
  type LayerDebugOpenings,
  type LayerDebugOpeningsInput,
  type LayerDebugOpeningsSummary,
  type LayerDebugReport,
  type LayerDebugWindowRejected,
} from './types'

function countJunctionKinds(
  junctions: Array<{ kind: 'I' | 'L' | 'T' | 'X' }>,
): Record<'I' | 'L' | 'T' | 'X', number> {
  const counts: Record<'I' | 'L' | 'T' | 'X', number> = { I: 0, L: 0, T: 0, X: 0 }
  for (const junction of junctions) counts[junction.kind] += 1
  return counts
}

function toDoorBound(door: BoundDoor): LayerDebugDoorBound {
  return {
    doorId: door.doorId,
    segmentIndex: door.segmentIndex,
    ...(door.junctionAId ? { junctionAId: door.junctionAId } : {}),
    ...(door.junctionBId ? { junctionBId: door.junctionBId } : {}),
    t: door.t,
    openingAxis: door.openingAxis,
    outwardSign: door.outwardSign,
    contactScore: door.contactScore,
    secondaryContactScore: door.secondaryContactScore,
    snappedBBox: { ...door.snappedBBox },
  }
}

function toDoorUnbound(door: ResolvedDoorCandidate): LayerDebugDoorUnbound {
  return {
    doorId: door.id,
    reason: 'no_segment_match',
    kind: door.kind,
    matchedRefIndex: door.matchedRefIndex,
    bbox: { ...door.bbox },
    centroidPx: { ...door.centroidPx },
    fmlRefId: door.fmlRefId,
  }
}

function toDoorOriented(door: OrientedDoor): LayerDebugDoorOriented {
  return {
    doorId: door.doorId,
    segmentIndex: door.segmentIndex,
    ...(door.junctionAId ? { junctionAId: door.junctionAId } : {}),
    ...(door.junctionBId ? { junctionBId: door.junctionBId } : {}),
    t: door.t,
    openingAxis: door.openingAxis,
    outwardSign: door.outwardSign,
    kind: door.kind,
    fmlRefId: door.fmlRefId,
    mirrored: [...door.mirrored] as OrientedDoor['mirrored'],
    snappedBBox: { ...door.snappedBBox },
    hingePx: { ...door.hingePx },
    openingStartPx: { ...door.openingStartPx },
    openingEndPx: { ...door.openingEndPx },
    displayStartPx: { ...door.displayStartPx },
    displayEndPx: { ...door.displayEndPx },
    framingAlongPx: door.framingAlongPx,
    framingOppositePx: door.framingOppositePx,
  }
}

function toWindowRejected(rejection: WindowBindRejection): LayerDebugWindowRejected {
  const { candidate, reason } = rejection
  return {
    windowId: candidate.id,
    reason,
    evidence: candidate.evidence,
    matchedRefIndex: candidate.matchedRefIndex,
    bbox: { ...candidate.bbox },
    widthPx: candidate.widthPx,
    faceIds: [...candidate.faceIds],
  }
}

function buildLayer11(params: {
  resolvedDoors: ResolvedDoorCandidate[]
  boundDoors: BoundDoor[]
}): LayerDebugLayer11 | undefined {
  if (params.resolvedDoors.length <= 0 && params.boundDoors.length <= 0) return undefined
  const boundIds = new Set(params.boundDoors.map((door) => door.doorId))
  return {
    bound: params.boundDoors.map(toDoorBound),
    unbound: params.resolvedDoors.filter((door) => !boundIds.has(door.id)).map(toDoorUnbound),
  }
}

function buildLayer12(params: {
  boundDoors: BoundDoor[]
  orientedDoors: OrientedDoor[]
}): LayerDebugLayer12 | undefined {
  if (params.boundDoors.length <= 0 && params.orientedDoors.length <= 0) return undefined
  const orientedIds = new Set(params.orientedDoors.map((door) => door.doorId))
  // ESC:X-26 (E)
  const skipped: LayerDebugDoorOrientSkipped[] = params.boundDoors
    .filter((door) => !orientedIds.has(door.doorId))
    .map((door) => {
      tally('X-26', 'orient_failed_inferred')
      return {
        doorId: door.doorId,
        reason: 'orient_failed' as const,
        segmentIndex: door.segmentIndex,
      }
    })
  return {
    oriented: params.orientedDoors.map(toDoorOriented),
    skipped,
  }
}

function buildLayer14(params: {
  boundWindows: BoundWindow[]
  windowBindRejections: WindowBindRejection[]
}): LayerDebugLayer14 | undefined {
  if (params.boundWindows.length <= 0 && params.windowBindRejections.length <= 0) return undefined
  return {
    bound: params.boundWindows.map((window) => ({
      ...window,
      openingBBox: { ...window.openingBBox },
      openingStartPx: { ...window.openingStartPx },
      openingEndPx: { ...window.openingEndPx },
      faceIds: [...window.faceIds],
    })),
    rejected: params.windowBindRejections.map(toWindowRejected),
  }
}

function buildOpenings(input: LayerDebugOpeningsInput | undefined): {
  openings?: LayerDebugOpenings
  openingsSummary?: LayerDebugOpeningsSummary
} {
  if (!input) return {}
  const resolvedDoors = input.resolvedDoors ?? []
  const boundDoors = input.boundDoors ?? []
  const orientedDoors = input.orientedDoors ?? []
  const boundWindows = input.boundWindows ?? []
  const windowBindRejections = input.windowBindRejections ?? []

  const layer11 = buildLayer11({ resolvedDoors, boundDoors })
  const layer12 = buildLayer12({ boundDoors, orientedDoors })
  const layer14 = buildLayer14({ boundWindows, windowBindRejections })
  if (!layer11 && !layer12 && !layer14) return {}

  const openings: LayerDebugOpenings = {
    ...(layer11 ? { layer11 } : {}),
    ...(layer12 ? { layer12 } : {}),
    ...(layer14 ? { layer14 } : {}),
  }

  const rejectedByReason: Partial<Record<WindowBindRejectReason, number>> = {}
  for (const rejection of windowBindRejections) {
    rejectedByReason[rejection.reason] = (rejectedByReason[rejection.reason] ?? 0) + 1
  }

  const openingsSummary: LayerDebugOpeningsSummary = {
    ...(layer11
      ? { layer11: { bound: layer11.bound.length, unbound: layer11.unbound.length } }
      : {}),
    ...(layer12
      ? { layer12: { oriented: layer12.oriented.length, skipped: layer12.skipped.length } }
      : {}),
    ...(layer14
      ? {
          layer14: {
            bound: layer14.bound.length,
            rejected: layer14.rejected.length,
            rejectedByReason,
          },
        }
      : {}),
  }

  return { openings, openingsSummary }
}

export function buildLayerDebugReport(params: {
  drawing: string | null
  output: ExtractionOutput | null | undefined
  openings?: LayerDebugOpeningsInput
}): LayerDebugReport {
  const debug = params.output?.pipelineV3Debug
  const junctionKindCounts = debug?.summary?.junctionKindCounts ?? {
    ...(debug?.layers.layer1 ? { layer1: countJunctionKinds(debug.layers.layer1.junctions) } : {}),
    ...(debug?.layers.layer2 ? { layer2: countJunctionKinds(debug.layers.layer2.junctions) } : {}),
    ...(debug?.layers.layer3 ? { layer3: countJunctionKinds(debug.layers.layer3.junctions) } : {}),
    ...(debug?.layers.layer4 ? { layer4: countJunctionKinds(debug.layers.layer4.junctions) } : {}),
    ...(debug?.layers.layer5 ? { layer5: countJunctionKinds(debug.layers.layer5.junctions) } : {}),
    ...(debug?.layers.layer6 ? { layer6: countJunctionKinds(debug.layers.layer6.junctions) } : {}),
    ...(debug?.layers.layer7 ? { layer7: countJunctionKinds(debug.layers.layer7.junctions) } : {}),
    ...(debug?.layers.layer8 ? { layer8: countJunctionKinds(debug.layers.layer8.junctions) } : {}),
    ...(debug?.layers.layer9 ? { layer9: countJunctionKinds(debug.layers.layer9.junctions) } : {}),
    ...(debug?.layers.layer10
      ? { layer10: countJunctionKinds(debug.layers.layer10.junctions) }
      : {}),
  }
  const { openings, openingsSummary } = buildOpenings(params.openings)
  const layers = debug?.layers ?? {}
  const wallTransitions = compareWallLayerTransitions(layers)
  return {
    version: LAYER_DEBUG_REPORT_VERSION,
    drawing: params.drawing,
    exportedAt: new Date().toISOString(),
    pipelineVersion: debug?.pipelineVersion ?? 'v3',
    roomPipelinePhase: params.output?.meta?.roomPipelinePhase,
    layers,
    summary: debug?.summary ? { ...debug.summary, junctionKindCounts } : { junctionKindCounts },
    ...(wallTransitions.length > 0 ? { wallTransitions } : {}),
    ...(openings ? { openings } : {}),
    ...(openingsSummary ? { openingsSummary } : {}),
    journal: summarizeRunJournal(),
  }
}
