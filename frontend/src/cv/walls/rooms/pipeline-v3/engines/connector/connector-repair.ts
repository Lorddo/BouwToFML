/**
 * L6 connector repair: uniforme chamfer-groep (assen → H×V → weld → drop).
 * Nooit diagonalen verwijderen zonder weld (geen chamferRemovalOnly).
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { cloneSegments, dropZeroLengthSegments } from '../segment-ops'
import { resolveLandingChamferGeometry } from './chamfer-chain'
import { tryRepairChamferGroup } from './chamfer-group'
import { LAYER6_MIN_SEGMENT_LEN_PX, resolveLayer6Scale } from './constants'
import { detectLayer6ConnectorCandidates } from './connector-detect'
import type { Layer6ConnectorCandidate } from './connector-detect'
import { classifyLayer6Segment } from './segment-classify'

export type { Layer6ConnectorCandidate }

export interface Layer6ConnectorRepairStats {
  candidates: number
  repaired: number
  removed: number
  skippedNoIntersection: number
  skippedShiftLimit: number
  skippedGuard: number
}

export function repairLayer6ConnectorCandidates(params: {
  segments: Segment[]
  referenceWallThicknessPx?: number
  onlyLandingChamfers?: boolean
  maxCandidates?: number
  onlyCandidateIndex?: number
  validateCandidate?: (
    before: Segment[],
    after: Segment[],
    candidate: Layer6ConnectorCandidate,
  ) => boolean
}): { segments: Segment[]; stats: Layer6ConnectorRepairStats } {
  let work = cloneSegments(params.segments)
  const scale = resolveLayer6Scale(params.referenceWallThicknessPx)
  const hvBandPx = scale.hvBandPx
  const candidates = detectLayer6ConnectorCandidates({
    segments: work,
    referenceWallThicknessPx: scale.refPx,
  }).filter((candidate) => {
    if (!params.onlyLandingChamfers) return true
    if (candidate.syntheticVSegment) return false
    const connector = work[candidate.connectorIndex]
    if (!connector) return false
    return (
      resolveLandingChamferGeometry({
        segments: work,
        diagonal: connector,
        referenceWallThicknessPx: scale.refPx,
        hvBandPx,
      }) != null
    )
  })

  const stats: Layer6ConnectorRepairStats = {
    candidates: candidates.length,
    repaired: 0,
    removed: 0,
    skippedNoIntersection: 0,
    skippedShiftLimit: 0,
    skippedGuard: 0,
  }

  const landingScore = (candidate: Layer6ConnectorCandidate): number => {
    if (candidate.syntheticVSegment) return 0
    const connector = work[candidate.connectorIndex]
    if (!connector) return 0
    return resolveLandingChamferGeometry({
      segments: work,
      diagonal: connector,
      referenceWallThicknessPx: scale.refPx,
      hvBandPx,
    })
      ? 2
      : 1
  }

  const orderedCandidates = [...candidates]
    .sort((a, b) => {
      const score = landingScore(b) - landingScore(a)
      if (score !== 0) return score
      return b.lengthPx - a.lengthPx
    })
    .slice(0, params.maxCandidates ?? Number.POSITIVE_INFINITY)

  // Alleen bij volledige pass: korte diagonalen die detect mist (niet bij landing-only).
  if (!params.onlyLandingChamfers && params.onlyCandidateIndex == null) {
    const maxConnectorPx = scale.connectorMaxPx
    const seenDiag = new Set(orderedCandidates.map((c) => c.connectorIndex))
    const extras: typeof orderedCandidates = []
    for (let i = 0; i < work.length; i += 1) {
      if (seenDiag.has(i)) continue
      if (classifyLayer6Segment(work[i], i, hvBandPx).kind !== 'D') continue
      const len = segmentLength(work[i])
      if (len < LAYER6_MIN_SEGMENT_LEN_PX || len > maxConnectorPx) continue
      extras.push({
        connectorIndex: i,
        hSegmentIndex: i,
        vSegmentIndex: i,
        lengthPx: len,
      })
      seenDiag.add(i)
    }
    extras.sort((a, b) => b.lengthPx - a.lengthPx)
    orderedCandidates.push(...extras.slice(0, 64))
  }

  const repairedSeeds = new Set<number>()

  for (const candidate of orderedCandidates) {
    if (
      params.onlyCandidateIndex != null &&
      candidate.connectorIndex !== params.onlyCandidateIndex
    ) {
      continue
    }

    // Indexen verschuiven na eerdere repairs — zoek seed opnieuw op geometrie.
    let seedIndex = candidate.connectorIndex
    if (
      seedIndex >= work.length ||
      classifyLayer6Segment(work[seedIndex], seedIndex, hvBandPx).kind !== 'D'
    ) {
      const orig = params.segments[candidate.connectorIndex]
      if (!orig) {
        stats.skippedNoIntersection += 1
        continue
      }
      seedIndex = work.findIndex((seg) => {
        return (
          Math.hypot(seg.a.x - orig.a.x, seg.a.y - orig.a.y) < 0.5 &&
          Math.hypot(seg.b.x - orig.b.x, seg.b.y - orig.b.y) < 0.5
        )
      })
      if (seedIndex < 0) {
        stats.skippedNoIntersection += 1
        continue
      }
    }
    if (repairedSeeds.has(seedIndex)) continue
    if (classifyLayer6Segment(work[seedIndex], seedIndex, hvBandPx).kind !== 'D') continue

    const result = tryRepairChamferGroup({
      segments: work,
      connectorIndex: seedIndex,
      referenceWallThicknessPx: scale.refPx,
      validate: params.validateCandidate
        ? (before, after) => params.validateCandidate!(before, after, candidate)
        : undefined,
    })

    if (!result) {
      stats.skippedNoIntersection += 1
      continue
    }
    if (!result.repaired) {
      stats.skippedGuard += 1
      continue
    }

    work = result.segments
    repairedSeeds.add(seedIndex)
    stats.repaired += 1
    stats.removed += result.removed
  }

  const sanitized = dropZeroLengthSegments(work)
  stats.removed += sanitized.removed
  return { segments: sanitized.segments, stats }
}

/** Through-T landing-chamfers: één per pass, compact + opnieuw detecteren. */
export function repairLandingChamferConnectors(params: {
  segments: Segment[]
  referenceWallThicknessPx?: number
  validateCandidate?: (
    before: Segment[],
    after: Segment[],
    candidate: Layer6ConnectorCandidate,
  ) => boolean
}): { segments: Segment[]; repaired: number } {
  let segments = cloneSegments(params.segments)
  const scale = resolveLayer6Scale(params.referenceWallThicknessPx)
  const hvBandPx = scale.hvBandPx
  let repaired = 0
  const skipped = new Set<number>()
  const maxIter = Math.max(8, Math.round(scale.axisChainPx / 8))
  for (let iter = 0; iter < maxIter; iter += 1) {
    const landingLeft = detectLayer6ConnectorCandidates({
      segments,
      referenceWallThicknessPx: scale.refPx,
    }).filter((candidate) => {
      if (skipped.has(candidate.connectorIndex)) return false
      if (candidate.syntheticVSegment) return false
      const connector = segments[candidate.connectorIndex]
      if (!connector) return false
      return (
        resolveLandingChamferGeometry({
          segments,
          diagonal: connector,
          referenceWallThicknessPx: scale.refPx,
          hvBandPx,
        }) != null
      )
    })
    if (landingLeft.length === 0) break
    const pick = [...landingLeft].sort((a, b) => b.lengthPx - a.lengthPx)[0]

    const pass = repairLayer6ConnectorCandidates({
      segments,
      referenceWallThicknessPx: scale.refPx,
      onlyLandingChamfers: true,
      onlyCandidateIndex: pick.connectorIndex,
      validateCandidate: params.validateCandidate,
    })
    if (pass.stats.repaired === 0) {
      skipped.add(pick.connectorIndex)
      continue
    }
    repaired += pass.stats.repaired
    segments = pass.segments
  }
  return { segments, repaired }
}
