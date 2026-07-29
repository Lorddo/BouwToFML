import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import type {
  WindowAxelFilterResult,
  WindowAxelHypothesis,
  WindowAxelOrientation,
  WindowAxelRefBand,
  WindowAxelRejectReason,
  WindowAxelRejection,
  WindowAxelRefMatchStats,
} from './types'
import { enumerateLinkedTuples, scoreStage1Tuple } from './window-axel-cluster'
import { rootFacesFromSpace } from './window-dual-faces'
import { WINDOW_SPACE_POLICY } from './window-space-policy'
import {
  type RectLike,
  axisSpan,
  denormalizeTargetStripHeightPx,
  resolveAxisBandFromTargetStripHeightPx,
  resolveMaxStage1StripHeightPx,
  resolveReferenceTargetStripHeightPx,
  resolveStripSample,
  resolveTargetStripHeightRatio,
  unionBbox,
} from './window-axel-strip-geometry'

/**
 * Stage 1 axel/strip filter.
 * Meet op white (WINDOW_SPACE_POLICY.stage1Measure); cluster-brug via ink adjacency.
 */
export function runWindowAxelFilter(params: {
  dual: FaceDualSpace
  refBands: WindowAxelRefBand[]
  minSpanPxByOrientation?: Partial<Record<WindowAxelOrientation, number>>
  refRects?: Array<{ refIndex: number; rect: RectLike }>
}): WindowAxelFilterResult {
  assertSpacePolicy('window Stage 1 measure', WINDOW_SPACE_POLICY.stage1Measure, 'white')
  assertSpacePolicy('window Stage 1 cluster bridge', WINDOW_SPACE_POLICY.stage1ClusterBridge, 'ink')
  const measure = params.dual.space(WINDOW_SPACE_POLICY.stage1Measure)
  const bridge = params.dual.space(WINDOW_SPACE_POLICY.stage1ClusterBridge)
  const roots = rootFacesFromSpace(measure)
  const adjacency = measure.adjacency
  const wallInkAdjacency = bridge.adjacency
  const wallInkClassificationByLabel = bridge.classificationByLabel
  const rootsByRef = [...params.refBands].sort((a, b) => b.axisBandHeightPx - a.axisBandHeightPx)
  const hypotheses: WindowAxelHypothesis[] = []
  const rejections: WindowAxelRejection[] = []
  const byRef: WindowAxelRefMatchStats[] = []
  const refRectByIndex = new Map<number, RectLike>(
    (params.refRects ?? []).map((entry) => [entry.refIndex, entry.rect]),
  )

  for (const ref of rootsByRef) {
    const rejectedByReason: Partial<Record<WindowAxelRejectReason, number>> = {}
    const orientations: WindowAxelOrientation[] =
      ref.orientation === 'horizontal' ? ['horizontal', 'vertical'] : ['vertical', 'horizontal']
    let effectiveTargetStripHeightPx = denormalizeTargetStripHeightPx(
      ref,
      ref.axisBandHeightPx,
    )
    let acceptedCount = 0
    let rejectedCount = 0
    let clusterCount = 0
    const candidateRoots = new Set<number>()
    const acceptedByFaceKey = new Map<string, WindowAxelHypothesis>()

    for (let orientationIndex = 0; orientationIndex < orientations.length; orientationIndex += 1) {
      const orientation = orientations[orientationIndex]!
      const orientedRefBase =
        orientation === ref.orientation ? ref : { ...ref, orientation }
      const baseTargetStripHeightPx = denormalizeTargetStripHeightPx(
        orientedRefBase,
        orientedRefBase.axisBandHeightPx,
      )
      const minSpanFromRef = Math.max(
        baseTargetStripHeightPx * 1.4,
        orientedRefBase.axisBandHeightPx * 1.4,
      )
      const minSpanFromScale = Math.max(
        0,
        params.minSpanPxByOrientation?.[orientedRefBase.orientation] ?? 0,
      )
      const minSpan = Math.max(minSpanFromRef, minSpanFromScale)
      // Per-strip vs target (±tolerance) — NIET as-band×1.8.
      const maxStripHeightPx = resolveMaxStage1StripHeightPx(baseTargetStripHeightPx)
      const calibratedTarget = resolveReferenceTargetStripHeightPx({
        roots,
        ref: {
          ...orientedRefBase,
          targetStripHeightPx: baseTargetStripHeightPx,
        },
        refRect: refRectByIndex.get(ref.refIndex) ?? null,
        minSpanPx: minSpan,
        maxHeightPx: maxStripHeightPx,
      })
      if (orientationIndex === 0) {
        effectiveTargetStripHeightPx = calibratedTarget
      }
      const fallbackToPrimaryTarget =
        orientationIndex > 0 &&
        calibratedTarget === baseTargetStripHeightPx &&
        effectiveTargetStripHeightPx > 0
      const resolvedTarget = fallbackToPrimaryTarget ? effectiveTargetStripHeightPx : calibratedTarget
      const resolvedAxisBandPx = resolveAxisBandFromTargetStripHeightPx(
        orientedRefBase,
        resolvedTarget,
      )
      const effectiveRef =
        resolvedTarget === baseTargetStripHeightPx &&
          resolvedAxisBandPx === orientedRefBase.axisBandHeightPx
          ? {
              ...orientedRefBase,
              targetStripHeightPx: baseTargetStripHeightPx,
            }
          : {
              ...orientedRefBase,
              targetStripHeightPx: resolvedTarget,
              targetStripHeightRatio: resolveTargetStripHeightRatio(orientedRefBase),
              axisBandHeightPx: resolvedAxisBandPx,
            }
      const maxStripHeightForCandidates = resolveMaxStage1StripHeightPx(
        effectiveRef.targetStripHeightPx,
      )
      const candidates = roots.filter((face) => {
        const span = axisSpan(face.bbox, effectiveRef.orientation)
        const sample = resolveStripSample({
          cluster: [face],
          orientation: effectiveRef.orientation,
        })
        const height = sample.stripHeightsPx[0] ?? 0
        if (!(span >= minSpan)) return false
        if (!(height > 0) || height > maxStripHeightForCandidates) return false
        return true
      })
      for (const candidate of candidates) candidateRoots.add(candidate.root)
      // Generatief: alle linked k-tuples (één face mag in meerdere hyps).
      const tuples = enumerateLinkedTuples({
        candidates,
        orientation: effectiveRef.orientation,
        targetStripHeightPx: effectiveRef.targetStripHeightPx,
        axisBandHeightPx: effectiveRef.axisBandHeightPx,
        expectedStripCount: effectiveRef.stripCount,
        adjacency,
        wallInkAdjacency,
        wallInkClassificationByLabel,
      })
      clusterCount += tuples.length
      for (const variant of tuples) {
        const scored = scoreStage1Tuple({ cluster: variant, ref: effectiveRef })
        if (!scored.accepted) {
          rejectedCount += 1
          rejectedByReason[scored.reason] = (rejectedByReason[scored.reason] ?? 0) + 1
          const faceIds = variant.map((face) => face.root).sort((a, b) => a - b)
          rejections.push({
            refIndex: ref.refIndex,
            orientation: effectiveRef.orientation,
            faceIds,
            unionBBox: unionBbox(variant),
            reason: scored.reason,
            expectedStripCount: effectiveRef.stripCount,
            actualStripCount: scored.actualStripCount,
            expectedStripHeightPx: effectiveRef.targetStripHeightPx,
            actualStripHeightsPx: scored.actualStripHeightsPx,
            axisSpanPx: scored.axisSpanPx,
          })
          continue
        }
          const faceIds = variant.map((face) => face.root).sort((a, b) => a - b)
          // Orientatie in key: H- en V-match van dezelfde faces mogen naast elkaar bestaan.
          const faceKey = `${effectiveRef.orientation}:${faceIds.join('_')}`
          const next: WindowAxelHypothesis = {
            id: `window-${ref.refIndex}-${effectiveRef.orientation}-${faceIds.join('_')}`,
            matchedRefIndex: ref.refIndex,
            orientation: effectiveRef.orientation,
            faceIds,
            unionBBox: unionBbox(variant),
            axisSpanPx: scored.axisSpanPx,
            score: scored.score,
          }
          const existing = acceptedByFaceKey.get(faceKey)
          if (!existing || next.score > existing.score) {
            acceptedByFaceKey.set(faceKey, next)
          }
      }
    }
    for (const hypothesis of acceptedByFaceKey.values()) {
      acceptedCount += 1
      hypotheses.push(hypothesis)
    }
    byRef.push({
      refIndex: ref.refIndex,
      effectiveTargetStripHeightPx,
      candidateRoots: candidateRoots.size,
      clusterCount,
      acceptedCount,
      rejectedCount,
      rejectedByReason,
    })
  }

  hypotheses.sort((a, b) => b.score - a.score)

  return {
    hypotheses,
    rejections,
    stats: {
      refBandCount: params.refBands.length,
      candidateRootCount: roots.length,
      acceptedCount: hypotheses.length,
      rejectedCount: rejections.length,
      byRef,
    },
  }
}
