/**
 * V3 Laag 6 — CURRENT chamfer-group orchestrator with KIND-based accept.
 * No connectivity rollback (validateLayer5Connectivity / validateConnectivity).
 *
 * Face-accept: bij I-explosie na junction niet de hele face naar L5 terugrollen —
 * behoud laatste connector-only state die wél face-ok is (2D_3E top-chamfers).
 */
import type { Segment } from '@/cv/port/wallGraph'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import type { RoomWallFaceSkeleton, RoomWallJunction } from '../room-wall-skeleton-types'
import {
  repairLandingChamferConnectors,
  repairLayer6ConnectorCandidates,
} from './engines/connector/connector-repair'
import { repairLayer6JunctionNodes } from './engines/connector/junction-repair'
import {
  acceptLayer6FaceKinds,
  validateJunctionKindsPreserved,
} from './engines/connector/kind-accept'
import {
  cloneSegments,
  dedupeExactSegments,
  dropZeroLengthSegments,
  rebuildFaceFromSegments,
  segmentSetSignature,
} from './engines/segment-ops'
import { resolveLayer6RepairPolicy } from './policies/layer-6'
import type { Layer6RepairPolicy } from './engines/policy-types'
import type { PipelineV3Layer5Result, PipelineV3Layer6Result } from './types'

function sanitizeLayer6Segments(
  segments: Segment[],
  policy: Layer6RepairPolicy,
): { segments: Segment[]; zeroLengthRemoved: number } {
  const eps = policy.weld.endpointEpsPx
  const compacted = dropZeroLengthSegments(segments, eps)
  const deduped = dedupeExactSegments(compacted.segments, eps)
  const finalPass = dropZeroLengthSegments(deduped.segments, eps)
  return {
    segments: finalPass.segments,
    zeroLengthRemoved: compacted.removed + finalPass.removed,
  }
}

function segmentsUnchanged(baseSegments: Segment[], work: Segment[]): boolean {
  if (baseSegments.length !== work.length) return false
  return baseSegments.every((seg, index) => {
    const other = work[index]
    if (!other) return false
    return (
      Math.abs(seg.a.x - other.a.x) < 1e-6
      && Math.abs(seg.a.y - other.a.y) < 1e-6
      && Math.abs(seg.b.x - other.b.x) < 1e-6
      && Math.abs(seg.b.y - other.b.y) < 1e-6
    )
  })
}

/**
 * Sub-pixel raster om twee iteraties op de segment-SET te vergelijken (grid ≈ 0.1px).
 * Repairs herordenen/splicen segmenten, dus een index-vergelijking ziet een identieke
 * set (andere volgorde of ~1e-9 float-jitter) ten onrechte als "gewijzigd" → loop bleef
 * 16× draaien. Signature via shared `segmentSetSignature` (default 0.1px).
 */

export function runLayer6JunctionRepair(params: {
  layer5: PipelineV3Layer5Result
  referenceWallThicknessPx?: number
}): PipelineV3Layer6Result {
  reportPipelineProgress('Skeleton Laag 6…')
  const policy = resolveLayer6RepairPolicy(params.referenceWallThicknessPx)
  const maxIter = policy.maxIterations

  const facesRepaired: RoomWallFaceSkeleton[] = []
  const allSegmentsRepaired: Segment[] = []
  const allJunctionsRepaired: RoomWallJunction[] = []

  let connectorsRemoved = 0
  let connectorCandidates = 0
  let connectorRepaired = 0
  let lRepaired = 0
  let tRepaired = 0
  let xRepaired = 0
  let junctionsRepaired = 0
  let junctionsSkipped = 0
  let facesRolledBack = 0
  let facesUnchanged = 0
  let zeroLengthRemoved = 0
  let iterationsRun = 0
  let lastRollBackReason: string | undefined

  // Per-candidate: L/T/X kind+positie (interview); face: I/X aggregate (T mag consolideren).
  const validateCandidate = (before: Segment[], after: Segment[]) =>
    validateJunctionKindsPreserved(before, after, policy.thicknessMarginPx).ok

  for (const face of params.layer5.facesCleaned) {
    const baseSegments = cloneSegments(face.segments)
    let work = cloneSegments(face.segments)
    /** Laatste state die face kind-gate haalt t.o.v. L5 (connector of volledige iter). */
    let bestFaceOk = cloneSegments(baseSegments)

    /**
     * Fase-accept t.o.v. L5. Sanitize (drop ≤eps) kan I's maken door micro-stubs
     * te verwijderen — dan behouden we raw (face-ok) i.p.v. hele face terug te rollen.
     */
    const keepIfFaceOk = (raw: Segment[], reason: string): boolean => {
      const sanitized = sanitizeLayer6Segments(raw, policy)
      zeroLengthRemoved += sanitized.zeroLengthRemoved

      if (acceptLayer6FaceKinds(baseSegments, sanitized.segments).ok) {
        bestFaceOk = cloneSegments(sanitized.segments)
        work = cloneSegments(sanitized.segments)
        return true
      }
      if (acceptLayer6FaceKinds(baseSegments, raw).ok) {
        bestFaceOk = cloneSegments(raw)
        work = cloneSegments(raw)
        lastRollBackReason = `${reason}: sanitize skipped (would I-explode)`
        return true
      }
      work = cloneSegments(bestFaceOk)
      const gate = acceptLayer6FaceKinds(baseSegments, sanitized.segments)
      lastRollBackReason = reason + (gate.reason ? `: ${gate.reason}` : '')
      return false
    }

    for (let repairIter = 0; repairIter < maxIter; repairIter += 1) {
      iterationsRun += 1
      const beforeSig = segmentSetSignature(work)
      const bestBeforeIter = cloneSegments(bestFaceOk)
      const repairedBefore = connectorRepaired + junctionsRepaired

      const connectorPass = repairLayer6ConnectorCandidates({
        segments: work,
        referenceWallThicknessPx: params.referenceWallThicknessPx,
        validateCandidate,
      })
      connectorsRemoved += connectorPass.stats.removed
      connectorCandidates += connectorPass.stats.candidates
      connectorRepaired += connectorPass.stats.repaired
      if (!keepIfFaceOk(connectorPass.segments, 'connector face-gate')) {
        break
      }

      const landingPass = repairLandingChamferConnectors({
        segments: work,
        referenceWallThicknessPx: params.referenceWallThicknessPx,
        validateCandidate,
      })
      connectorRepaired += landingPass.repaired
      if (!keepIfFaceOk(landingPass.segments, 'landing face-gate')) {
        // Landing regressie: connector-winst behouden, junction nog proberen op bestFaceOk.
      }

      const junctionPass = repairLayer6JunctionNodes({
        segments: work,
        referenceWallThicknessPx: params.referenceWallThicknessPx,
        validateCandidate,
      })
      lRepaired += junctionPass.stats.lRepaired
      tRepaired += junctionPass.stats.tRepaired
      xRepaired += junctionPass.stats.xRepaired
      junctionsRepaired += junctionPass.stats.repaired
      junctionsSkipped += junctionPass.stats.skipped
      connectorsRemoved += junctionPass.stats.removedDiagonals
      if (!keepIfFaceOk(junctionPass.segments, 'junction face-gate')) {
        break
      }

      // Netto-0: segment-set (volgorde/jitter-onafhankelijk) stabiel → klaar.
      // Blijft itereren bij echte vervolg-chamfers (set verandert) tot convergentie.
      const noGeomChange = segmentSetSignature(work) === beforeSig
      const noBestChange = segmentsUnchanged(bestBeforeIter, bestFaceOk)
      const noRepairs = connectorRepaired + junctionsRepaired === repairedBefore
      if (noGeomChange || (noBestChange && noRepairs)) break
    }

    // Geen agressieve end-sanitize die I's maakt als raw face-ok was.
    if (!acceptLayer6FaceKinds(baseSegments, work).ok) {
      if (
        acceptLayer6FaceKinds(baseSegments, bestFaceOk).ok
        && !segmentsUnchanged(baseSegments, bestFaceOk)
      ) {
        work = cloneSegments(bestFaceOk)
        lastRollBackReason = 'final gate → keep best face-ok'
      } else if (!segmentsUnchanged(baseSegments, work)) {
        work = baseSegments
        facesRolledBack += 1
        lastRollBackReason =
          acceptLayer6FaceKinds(baseSegments, work).reason ?? 'kind-accept rejected'
      }
    } else if (segmentsUnchanged(baseSegments, work)) {
      facesUnchanged += 1
    }

    const repairedFace = rebuildFaceFromSegments(face, work, policy.weld, policy.junction)
    facesRepaired.push(repairedFace)
    allSegmentsRepaired.push(...repairedFace.segments)
    allJunctionsRepaired.push(...repairedFace.junctions)
  }

  return {
    facesRepaired,
    allSegmentsRepaired,
    allJunctionsRepaired,
    totalSegmentsRepaired: allSegmentsRepaired.length,
    totalJunctionsRepaired: allJunctionsRepaired.length,
    repairStats: {
      connectorsRemoved,
      connectorCandidates,
      connectorRepaired,
      junctionsRepaired,
      junctionsSkipped,
      lRepaired,
      tRepaired,
      xRepaired,
      facesRolledBack,
      facesUnchanged,
      zeroLengthRemoved,
      iterationsRun,
      lastRollBackReason,
    },
  }
}
