/**
 * Bewijs of een collineaire diktewissel een echte gezichtstrap is
 * (één face doorlopend, andere ≈ Δt) of meetruis / gecentreerd.
 *
 * ESC:X-01 — zonder bewijs geen balance-flush.
 */

export type WallFaceExtentsCm = {
  /**
   * Absolute plus-normal extent vanaf centerline (cm).
   * Plus = Floorplanner-links van a→b (Y-down).
   */
  plusCm: number
  /** Absolute minus-normal extent vanaf centerline (cm) — rechts van a→b. */
  minusCm: number
}

export type FaceStepVerdict = 'flush_plus' | 'flush_minus' | 'centered' | 'no_evidence'

/** Relatieve tolerantie t.o.v. Δt voor face-continuïteit / sprong. */
export const FACE_STEP_TOLERANCE_RATIO = 0.25
/** Absolute vloer (cm) zodat dunne Δt niet te streng is. */
export const FACE_STEP_TOLERANCE_MIN_CM = 1.5

export function resolveFaceStepToleranceCm(deltaTCm: number): number {
  return Math.max(FACE_STEP_TOLERANCE_MIN_CM, Math.abs(deltaTCm) * FACE_STEP_TOLERANCE_RATIO)
}

/**
 * Vergelijk twee gemeten gezichtsextents bij een dikteverschil.
 * Extents zijn vanaf elke muur-CL; bij gedeelde CL + echte flush is één zijde
 * asymmetrisch (dun: plus≈0 of minus≈0), bij ridge-gecentreerd allebei ≈ t/2 → centered.
 *
 * - flush_plus: plus-face doorlopend, minus ≈ Δt
 * - flush_minus: minus-face doorlopend, plus ≈ Δt
 * - centered: beide gezichten ≈ Δt/2
 * - no_evidence: geen van bovenstaande
 */
export function classifyFaceStepEvidence(
  a: WallFaceExtentsCm,
  b: WallFaceExtentsCm,
  thicknessACm: number,
  thicknessBCm: number,
): FaceStepVerdict {
  const deltaT = Math.abs(thicknessACm - thicknessBCm)
  if (!(deltaT > 1e-6)) return 'centered'

  const tol = resolveFaceStepToleranceCm(deltaT)
  const dPlus = Math.abs(a.plusCm - b.plusCm)
  const dMinus = Math.abs(a.minusCm - b.minusCm)
  const half = deltaT * 0.5

  const plusContinuous = dPlus <= tol
  const minusContinuous = dMinus <= tol
  const plusJumps = Math.abs(dPlus - deltaT) <= tol
  const minusJumps = Math.abs(dMinus - deltaT) <= tol
  const plusHalf = Math.abs(dPlus - half) <= tol
  const minusHalf = Math.abs(dMinus - half) <= tol

  if (plusContinuous && minusJumps) return 'flush_plus'
  if (minusContinuous && plusJumps) return 'flush_minus'
  if (plusHalf && minusHalf) return 'centered'
  if (plusContinuous && minusContinuous) return 'centered'
  return 'no_evidence'
}

/**
 * Lengte-gewogen verdict over alle diktewissel-paren in een keten.
 * Gelijkspel / geen unaniem bewijs → no_evidence.
 */
export function resolveChainFaceStepVerdict(params: {
  indices: number[]
  thicknessCm: (index: number) => number
  evidence: (index: number) => WallFaceExtentsCm | undefined
  lengthCm: (index: number) => number
}): FaceStepVerdict {
  const { indices } = params
  if (indices.length < 2) return 'no_evidence'

  const votes: Record<FaceStepVerdict, number> = {
    flush_plus: 0,
    flush_minus: 0,
    centered: 0,
    no_evidence: 0,
  }

  for (let i = 0; i < indices.length; i += 1) {
    for (let j = i + 1; j < indices.length; j += 1) {
      const left = indices[i]
      const right = indices[j]
      const tA = params.thicknessCm(left)
      const tB = params.thicknessCm(right)
      if (Math.abs(tA - tB) <= 0.05) continue
      const eA = params.evidence(left)
      const eB = params.evidence(right)
      if (!eA || !eB) {
        votes.no_evidence += params.lengthCm(left) + params.lengthCm(right)
        continue
      }
      const verdict = classifyFaceStepEvidence(eA, eB, tA, tB)
      votes[verdict] += params.lengthCm(left) + params.lengthCm(right)
    }
  }

  const ordered: FaceStepVerdict[] = ['flush_plus', 'flush_minus', 'centered', 'no_evidence']
  let best: FaceStepVerdict = 'no_evidence'
  let bestScore = -1
  for (const key of ordered) {
    if (votes[key] > bestScore) {
      bestScore = votes[key]
      best = key
    }
  }
  if (bestScore <= 0) return 'no_evidence'
  // Uniek winnaar vereist: bij gelijkspel tussen flush-zijden → no_evidence.
  const flushTie =
    votes.flush_plus > 0 &&
    votes.flush_minus > 0 &&
    Math.abs(votes.flush_plus - votes.flush_minus) < 1e-9
  if (flushTie) return 'no_evidence'
  return best
}
