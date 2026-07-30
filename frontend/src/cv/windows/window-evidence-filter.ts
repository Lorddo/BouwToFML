import { noteCascadeLevel, noteEvidenceMissing } from '@/core/diagnostics'
import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import { rootFacesFromSpace } from './window-dual-faces'
import { selectFramingEvidence } from './window-evidence-framing'
import {
  allowedFullStripCounts,
  growFullStackFromSeedFaces,
  isOrientedStripHypothesis,
  resolveStackExpectedHeightsPx,
  stackMatchesFullStripCount,
} from './window-evidence-stack'
import { WINDOW_SPACE_POLICY } from './window-space-policy'
import type {
  WindowAxelHypothesis,
  WindowAxelRefBand,
  WindowEvidenceAcceptance,
  WindowEvidenceFilterResult,
  WindowEvidenceFilterStats,
  WindowEvidenceKind,
  WindowEvidenceRejectReason,
} from './types'

export { growFullStackFromSeedFaces } from './window-evidence-stack'
export { WINDOW_EVIDENCE_TUNING } from './window-evidence-tuning'

/**
 * Stage-3 stats uit accepted-lijst. Preserve-velden (rejected / strip→framing)
 * blijven raw — na doorframe-retarget niet herberekkenen.
 */
export function buildEvidenceStats(
  accepted: WindowEvidenceAcceptance[],
  preserve: Pick<WindowEvidenceFilterStats, 'rejectedNoEvidence' | 'stripStackFailedBeforeFraming'>,
): WindowEvidenceFilterStats {
  return {
    acceptedCount: accepted.length,
    acceptedByFraming: accepted.filter((row) => row.evidence === 'framing').length,
    acceptedByStripStack: accepted.filter((row) => row.evidence === 'strip_stack').length,
    rejectedNoEvidence: preserve.rejectedNoEvidence,
    stripStackFailedBeforeFraming: preserve.stripStackFailedBeforeFraming,
  }
}

/** REF heeft minstens één echte rail (top en/of bottom) — Stage-3 strip_stack-pad. */
function refHasTopBottomRails(ref: WindowAxelRefBand): boolean {
  return (
    (typeof ref.topRailHeightPx === 'number' && ref.topRailHeightPx > 0) ||
    (typeof ref.bottomRailHeightPx === 'number' && ref.bottomRailHeightPx > 0)
  )
}

/** REF heeft L/R kozijn-framing (Stage-3 framing-pad). */
function refHasFraming(ref: WindowAxelRefBand): boolean {
  return ref.framingSizeRange != null
}

/** Band bij `hypothesis.matchedRefIndex`, of null. */
function resolveMatchedRefBand(
  hypothesis: WindowAxelHypothesis,
  refBands: WindowAxelRefBand[],
): WindowAxelRefBand | null {
  return refBands.find((ref) => ref.refIndex === hypothesis.matchedRefIndex) ?? null
}

/**
 * Stage 3 evidence. `dual` = pipeline FaceDualSpace (na rebind):
 * stack-leden = white (WINDOW_SPACE_POLICY.stage3StackMembers);
 * stack-brug = ink adjacency (stage3StackBridge);
 * framing = either OR (stage3Framing).
 *
 * Split: geom → `window-evidence-geom`, stack → `window-evidence-stack`,
 * framing → `window-evidence-framing`, ratios → `WINDOW_EVIDENCE_TUNING`.
 */
export function filterWindowsByRefEvidence(params: {
  hypotheses: WindowAxelHypothesis[]
  refBands: WindowAxelRefBand[]
  dual: FaceDualSpace
  /**
   * Welke evidence-paden actief zijn. Default: beide.
   * Doorframe Stage 3: alleen `['framing']`.
   */
  evidenceModes?: ReadonlyArray<WindowEvidenceKind>
}): WindowEvidenceFilterResult {
  assertSpacePolicy('window Stage 3 stack members', WINDOW_SPACE_POLICY.stage3StackMembers, 'white')
  assertSpacePolicy('window Stage 3 stack bridge', WINDOW_SPACE_POLICY.stage3StackBridge, 'ink')
  const modes = new Set<WindowEvidenceKind>(
    params.evidenceModes && params.evidenceModes.length > 0
      ? params.evidenceModes
      : ['strip_stack', 'framing'],
  )
  const allowStripStack = modes.has('strip_stack')
  const allowFraming = modes.has('framing')

  const rootFaces = rootFacesFromSpace(params.dual.white)
  const inkFaces = rootFacesFromSpace(params.dual.ink)
  const inkFacesByRoot = new Map(inkFaces.map((face) => [face.root, face]))
  const wallInkAdjacency = params.dual.ink.adjacency

  const accepted: WindowEvidenceAcceptance[] = []
  const keptIds = new Set<string>()
  const consumedByStripStack = new Set<string>()
  const rejectReasonById = new Map<string, WindowEvidenceRejectReason>()
  const stripStackFailedIds = new Set<string>()

  // ESC:R-16 (A)
  /**
   * Per hyp: matched REF bepaalt pad.
   * - minstens één rail (top en/of bottom) → strip_stack (grow); bij fail → framing als REF die heeft
   * - geen rails, wel framing → framing-only
   * - geen rails, geen framing → passthrough Stage-1 faces (tenzij framing-only modes)
   */
  for (const seed of params.hypotheses) {
    if (keptIds.has(seed.id)) continue
    const matchedRef = resolveMatchedRefBand(seed, params.refBands)
    const hasRails = matchedRef != null && refHasTopBottomRails(matchedRef)
    const hasFraming = matchedRef != null && refHasFraming(matchedRef)

    if (matchedRef != null && hasRails && allowStripStack) {
      if (!isOrientedStripHypothesis(seed, seed.orientation)) {
        rejectReasonById.set(seed.id, 'strip_stack_count')
        stripStackFailedIds.add(seed.id)
      } else {
        const expectedHeightsPx = resolveStackExpectedHeightsPx([matchedRef])
        const allowedCounts = allowedFullStripCounts([matchedRef])
        const maxFaceCount =
          allowedCounts.size > 0 ? Math.max(...allowedCounts) : Number.POSITIVE_INFINITY
        const evidenceFaceIds = growFullStackFromSeedFaces({
          seedFaceIds: seed.faceIds,
          orientation: seed.orientation,
          seedBbox: seed.unionBBox,
          whiteFaces: rootFaces,
          inkFaces,
          wallInkAdjacency,
          expectedHeightsPx,
          maxFaceCount,
        })
        if (stackMatchesFullStripCount({ evidenceFaceIds, allowedCounts })) {
          keptIds.add(seed.id)
          consumedByStripStack.add(seed.id)
          rejectReasonById.delete(seed.id)
          stripStackFailedIds.delete(seed.id)
          noteCascadeLevel('R-16', 'window-evidence-filter', 'strip_stack', {
            hypothesis: seed.id,
            evidenceFaces: evidenceFaceIds.length,
          })
          accepted.push({
            hypothesis: seed,
            evidence: 'strip_stack',
            evidenceFaceIds,
          })
          continue
        }
        rejectReasonById.set(seed.id, 'strip_stack_count')
        stripStackFailedIds.add(seed.id)
      }
    }

    if (matchedRef != null && allowFraming && hasFraming) {
      const framing = selectFramingEvidence({
        hypothesis: seed,
        refBands: [matchedRef],
        whiteFaces: rootFaces,
        inkFacesByRoot,
        inkFaces,
      })
      if (framing.ok) {
        noteCascadeLevel('R-16', 'window-evidence-filter', 'framing', {
          hypothesis: seed.id,
          evidenceFaces: framing.faceIds.length,
        })
        keptIds.add(seed.id)
        accepted.push({
          hypothesis: seed,
          evidence: 'framing',
          evidenceFaceIds: framing.faceIds,
        })
        continue
      }
      rejectReasonById.set(seed.id, framing.reason)
      continue
    }

    // ESC:R-16 (A)
    // Geen top/bottom én geen framing → Stage-1 stack doorlaten (niet bij framing-only modes).
    if (!hasRails && !hasFraming && allowStripStack) {
      noteEvidenceMissing(
        'R-16',
        'window-evidence-filter',
        'raam geaccepteerd zonder rails- of framing-bewijs (passthrough Stage-1)',
        { hypothesis: seed.id, hasMatchedRef: matchedRef != null, faces: seed.faceIds.length },
      )
      keptIds.add(seed.id)
      consumedByStripStack.add(seed.id)
      rejectReasonById.delete(seed.id)
      accepted.push({
        hypothesis: seed,
        evidence: 'strip_stack',
        evidenceFaceIds: [...seed.faceIds].sort((a, b) => a - b),
      })
      continue
    }
  }

  const rejected: WindowEvidenceFilterResult['rejected'] = []
  for (const hypothesis of params.hypotheses) {
    if (consumedByStripStack.has(hypothesis.id) || keptIds.has(hypothesis.id)) continue
    rejected.push({
      hypothesis,
      reason: rejectReasonById.get(hypothesis.id) ?? 'no_evidence',
    })
  }

  const stripStackFailedBeforeFraming = [...stripStackFailedIds].filter((id) =>
    accepted.some((row) => row.hypothesis.id === id && row.evidence === 'framing'),
  ).length
  return {
    kept: accepted.map((row) => row.hypothesis),
    accepted,
    rejected,
    stats: buildEvidenceStats(accepted, {
      rejectedNoEvidence: rejected.length,
      stripStackFailedBeforeFraming,
    }),
  }
}
