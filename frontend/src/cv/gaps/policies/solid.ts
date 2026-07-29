import type { SolidFaceDemotePolicy, SolidWallCutPolicy } from '../types'

/** Solid L1 — face demote. Hoge muurmask-dekking → outside (zelfde 80% als muur Otsu-ink). */
const solidFaceDemotePolicy: SolidFaceDemotePolicy = {
  policyId: 'solid',
  layerId: 1,
  wallCoverageThreshold: 0.8,
}

/** Legacy wall-cut policy (engine blijft beschikbaar). */
const solidWallCutPolicy: SolidWallCutPolicy = {
  policyId: 'solid',
  layerId: 1,
  wallInkMaxValue: 127,
}

export function resolveSolidFaceDemotePolicy(
  overrides?: Partial<Omit<SolidFaceDemotePolicy, 'policyId' | 'layerId'>>,
): SolidFaceDemotePolicy {
  return {
    ...solidFaceDemotePolicy,
    ...overrides,
    policyId: 'solid',
    layerId: 1,
  }
}

export function resolveSolidWallCutPolicy(
  overrides?: Partial<Omit<SolidWallCutPolicy, 'policyId' | 'layerId'>>,
): SolidWallCutPolicy {
  return {
    ...solidWallCutPolicy,
    ...overrides,
    policyId: 'solid',
    layerId: 1,
  }
}
