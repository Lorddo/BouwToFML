import { describe, expect, it } from 'vitest'
import {
  classifyFaceStepEvidence,
  resolveChainFaceStepVerdict,
} from '@/core/fml/wall-face-step-evidence'

describe('classifyFaceStepEvidence', () => {
  it('detects flush_minus when minus is continuous and plus jumps by Δt', () => {
    // Shared CL: thick centered 15/15; thin flush to minus → 0/10 (t=10), Δt=20
    expect(
      classifyFaceStepEvidence({ plusCm: 15, minusCm: 15 }, { plusCm: 0, minusCm: 10 }, 30, 10),
    ).toBe('flush_minus')
  })

  it('detects flush_plus when plus is continuous and minus jumps by Δt', () => {
    expect(
      classifyFaceStepEvidence({ plusCm: 15, minusCm: 15 }, { plusCm: 10, minusCm: 0 }, 30, 10),
    ).toBe('flush_plus')
  })

  it('detects centered when both faces shift by ≈ Δt/2', () => {
    expect(
      classifyFaceStepEvidence({ plusCm: 15, minusCm: 15 }, { plusCm: 5, minusCm: 5 }, 30, 10),
    ).toBe('centered')
  })

  it('returns no_evidence for unrelated face noise', () => {
    expect(
      classifyFaceStepEvidence({ plusCm: 15, minusCm: 15 }, { plusCm: 12, minusCm: 8 }, 30, 10),
    ).toBe('no_evidence')
  })
})

describe('resolveChainFaceStepVerdict', () => {
  it('votes flush_minus across a two-wall chain', () => {
    const evidence = [
      { plusCm: 15, minusCm: 15 },
      { plusCm: 0, minusCm: 10 },
    ]
    const verdict = resolveChainFaceStepVerdict({
      indices: [0, 1],
      thicknessCm: (i) => (i === 0 ? 30 : 10),
      evidence: (i) => evidence[i],
      lengthCm: () => 100,
    })
    expect(verdict).toBe('flush_minus')
  })

  it('returns no_evidence when extents are missing', () => {
    const verdict = resolveChainFaceStepVerdict({
      indices: [0, 1],
      thicknessCm: (i) => (i === 0 ? 30 : 10),
      evidence: () => undefined,
      lengthCm: () => 100,
    })
    expect(verdict).toBe('no_evidence')
  })
})
