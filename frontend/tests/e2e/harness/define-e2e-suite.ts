/**
 * Gedeelde E2E-suite: muren + openingen + optionele referentie-metrics.
 *
 * @vitest-environment node
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { runWalls, type WallsHarnessResult } from './run-walls'
import { runOpenings, type OpeningsHarnessResult } from './run-openings'
import {
  assertLengthWithinQuarter,
  loadReferencePlan,
  resolveReferenceFmlPath,
} from './reference-report'
import { computeObliqueReport } from './oblique-metrics'

/** Poort op schuine muren — alleen voor fixtures die er een hebben. */
export type E2eObliqueGate = {
  /** Ondergrens: schuine detectielengte / schuine referentielengte. */
  minLengthRatio: number
  /** Ondergrens: dekking van de schuine referentiemuren op strakke afstand. */
  minCoveragePct: number
  /** Bovengrens: grootste afwijking detectie → referentie in cm. */
  maxDeviationCm: number
  minOffAxisDeg?: number
  tightMatchDistCm?: number
}

export type E2eSuiteOptions = {
  /** Hard: reference.fml verplicht (default true als file bestaat). */
  requireReference?: boolean
  /** Ondergrens gebonden openingen (deuren + ramen). */
  minOpenings?: number
  /** Tekening zonder ramen → geen raam-ondergrens. */
  expectWindows?: boolean
  oblique?: E2eObliqueGate
}

export function defineE2eSuite(slug: string, options: E2eSuiteOptions = {}): void {
  const hasReference = !!resolveReferenceFmlPath(slug)
  const requireReference = options.requireReference ?? hasReference
  const minOpenings = options.minOpenings ?? 5
  const expectWindows = options.expectWindows ?? true

  describe(`E2E ${slug}`, () => {
    let walls: WallsHarnessResult
    let openings: OpeningsHarnessResult

    beforeAll(async () => {
      walls = await runWalls(slug)
      openings = await runOpenings(walls)
    }, 180_000)

    it('muren: L2–L10 + FML-poort (zonder openingen)', async () => {
      expect(walls.journalDegraded).toBe(false)
      expect(walls.pipeline.fmlReady).toBe(true)
      expect(walls.fmlSnapshot.wallCount).toBeGreaterThan(10)
      expect(walls.layersSnapshot.layers.layer10?.segments).toBeGreaterThan(0)
      expect(walls.layersSnapshot.layers.layer4?.invariantReport?.ok).toBe(true)

      await expect(walls.fmlSnapshot).toMatchFileSnapshot(
        `./fixtures/${slug}/snapshot/${slug}.walls.fml.json`,
      )
    })

    it('openingen: L11/L12 + L14 + escalatie-grootboek', async () => {
      expect(openings.journalDegraded).toBe(false)
      expect(openings.orientedDoorCount).toBeGreaterThan(0)
      if (expectWindows) expect(openings.boundWindowCount).toBeGreaterThan(0)
      expect(openings.orientedDoorCount + openings.boundWindowCount).toBeGreaterThanOrEqual(
        minOpenings,
      )

      if (requireReference) {
        const ref = openings.fmlSnapshot.reference
        expect(ref).toBeDefined()
        expect(ref!.referenceLengthCm).toBeGreaterThan(0)
        expect(ref!.referenceDoorCount + ref!.referenceWindowCount).toBeGreaterThanOrEqual(
          minOpenings,
        )
        const lengthFloor = assertLengthWithinQuarter(
          openings.fmlSnapshot.totalLengthCm,
          ref!.referenceLengthCm,
        )
        expect(lengthFloor.ok).toBe(true)
      } else {
        expect(openings.fmlSnapshot.reference).toBeUndefined()
      }

      await expect(openings.fmlSnapshot).toMatchFileSnapshot(
        `./fixtures/${slug}/snapshot/${slug}.fml.json`,
      )
      await expect(openings.layersSnapshot).toMatchFileSnapshot(
        `./fixtures/${slug}/snapshot/${slug}.layers.json`,
      )
    })

    const gate = options.oblique
    if (gate) {
      const obliqueReport = () =>
        computeObliqueReport({
          detected: walls.plan,
          reference: loadReferencePlan(slug).plan,
          minOffAxisDeg: gate.minOffAxisDeg,
          tightMatchDistCm: gate.tightMatchDistCm,
        })

      it('schuine muren: rapport', async () => {
        await expect(obliqueReport()).toMatchFileSnapshot(
          `./fixtures/${slug}/snapshot/${slug}.oblique.json`,
        )
      })

      it('schuine muren: poort t.o.v. referentie', () => {
        const report = obliqueReport()
        expect(report.lengthRatio).toBeGreaterThanOrEqual(gate.minLengthRatio)
        expect(report.referenceObliqueCoveragePct).toBeGreaterThanOrEqual(gate.minCoveragePct)
        expect(report.maxDeviationCm).toBeLessThanOrEqual(gate.maxDeviationCm)
      })
    }
  })
}
