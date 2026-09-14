import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import type { FloorPlan } from '@/core/plan/types'
import {
  CURRENT_PLG_VERSION,
  DEFAULT_PLG_GENERATOR,
  PLG_FORMAT,
  writePlg,
  type PlgSettings,
} from '@/core/plg/plg-document'
import { parseEditorPlanFile } from '@/ui/composables/editor/parse-editor-plan-file'

const FACTORY_PLG_SETTINGS: PlgSettings = {
  unitSystem: 'metric',
  scaleInputUnit: 'cm',
  planDisplayStyle: 'architect',
  showCanvasGrid: false,
  defaults: {
    wallHeightCm: 260,
    doorHeightCm: 210,
    windowHeightCm: 120,
    windowSillZCm: 90,
    bovenlichtDefault: false,
    windowBovenlichtDefault: false,
    bovenlichtHeightCm: 40,
    bovenlichtGapCm: 10,
    thicknessCms: [10, 20, 30],
    thicknessMinCm: 10,
    thicknessMidCm: 20,
    thicknessMaxCm: 30,
    dakThicknessCm: 30,
    slabThicknessCm: 20,
    bandMidBoundaryCm: 15,
    bandMaxBoundaryCm: 25,
  },
}

function tinyPlan(): FloorPlan {
  return {
    name: 'Editor-open',
    floors: [
      {
        name: 'Begane grond',
        level: 0,
        height: 260,
        walls: [
          {
            id: 'w0',
            a: { x: 0, y: 0 },
            b: { x: 200, y: 0 },
            thickness: 20,
            openings: [],
          },
        ],
      },
    ],
  }
}

describe('parseEditorPlanFile', () => {
  it('opent een .plg via format, met settings en foreign leftover', () => {
    const plan = tinyPlan()
    const raw = writePlg({
      format: PLG_FORMAT,
      version: CURRENT_PLG_VERSION,
      generator: DEFAULT_PLG_GENERATOR,
      savedAt: '2026-09-11T00:00:00.000Z',
      project: { id: 'p', name: 'Editor-open', address: '' },
      settings: FACTORY_PLG_SETTINGS,
      plan,
      foreign: { fml: { project_id: 42 } },
    })
    const opened = parseEditorPlanFile(raw)
    expect(opened.kind).toBe('plg')
    expect(opened.plan.name).toBe('Editor-open')
    expect(opened.plan.floors[0]?.walls).toHaveLength(1)
    expect(opened.plgSettings?.planDisplayStyle).toBe('architect')
    expect(opened.plgSettings?.defaults.wallHeightCm).toBe(260)
    expect(opened.plan.source?.leftover).toEqual({ project_id: 42 })
    expect(opened.warnings).toEqual([])
  })

  it('opent kale FML nog steeds als FML (geen format-sleutel)', () => {
    const fml = buildFmlV3(tinyPlan(), { name: 'Editor-open' })
    const opened = parseEditorPlanFile(fml)
    expect(opened.kind).toBe('fml')
    expect(opened.plan.floors[0]?.walls.length).toBeGreaterThan(0)
    expect(opened.plgSettings).toBeUndefined()
  })
})
