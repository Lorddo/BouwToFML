/**
 * E2E regressie: begane grond met een werkelijk schuine oostgevel (~5° uit lood).
 *
 * Reden voor deze fixture: L4 snapt de gevelketen naar H/V en laag 10 levert een
 * trap op. `reference.fml` is de handmatig opgepoetste versie met drie rechte
 * schuine muren. De schuine-poort staat op `knownFailing` tot dat pad klopt.
 *
 * @vitest-environment node
 */
import { defineE2eSuite } from './harness/define-e2e-suite'

defineE2eSuite('schuine-gevel-bg', {
  // Vier deuren, geen ramen — dus geen raam-ondergrens.
  minOpenings: 4,
  expectWindows: false,
  oblique: {
    minLengthRatio: 0.9,
    minCoveragePct: 95,
    maxDeviationCm: 10,
  },
})
