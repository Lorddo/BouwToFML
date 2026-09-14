import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { writeBovenlichtPacked } from '@/core/plan/bovenlicht'
import { writePlanSlices } from '@/core/plan/plan-slices'
import { setElevationProjection, setElevationViewDrawing } from '@/core/plan/elevation-views'
import { assignWallsToGroup, createFacadeGroup, listFacadeGroups } from '@/core/plan/facade-groups'
import { writeDimensionSettings } from '@/core/plan/plan-dimension-settings'
import { setNokThicknessCm, setSlabThicknessCm } from '@/core/plan/floor-stack'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { markStampOwned } from '@/core/plan/stamp-owned'
import type { FloorPlan, Opening, Wall } from '@/core/plan/types'
import {
  CURRENT_PLG_VERSION,
  DEFAULT_PLG_GENERATOR,
  PLG_FORMAT,
  createPlgDocument,
  isPlgDocumentJson,
  readPlg,
  writePlg,
  type PlgDocument,
  type PlgSettings,
} from '@/core/plg/plg-document'
import { migratePlg, PlgMigrationError } from '@/core/plg/plg-migrations'

const KINDERDIJK = resolve(
  __dirname,
  '../../../examples/FML(current)/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam.json.fml',
)

const FACTORY_PLG_SETTINGS: PlgSettings = {
  unitSystem: 'metric',
  scaleInputUnit: 'mm',
  planDisplayStyle: 'editor',
  showCanvasGrid: true,
  defaults: {
    wallHeightCm: 280,
    doorHeightCm: 220,
    windowHeightCm: 120,
    windowSillZCm: 100,
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

function sampleDoc(overrides?: Partial<PlgDocument>): PlgDocument {
  return {
    format: PLG_FORMAT,
    version: CURRENT_PLG_VERSION,
    generator: DEFAULT_PLG_GENERATOR,
    savedAt: '2026-09-10T12:00:00.000Z',
    project: {
      id: 'proj-test',
      name: 'Testproject',
      address: 'Teststraat 1',
    },
    settings: structuredClone(FACTORY_PLG_SETTINGS),
    plan: {
      name: 'Testplan',
      floors: [
        {
          name: 'Begane grond',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'w0',
              a: { x: 0, y: 0 },
              b: { x: 300, y: 0 },
              thickness: 20,
              openings: [],
            },
          ],
        },
      ],
    },
    ...overrides,
  }
}

describe('plg-document roundtrip', () => {
  it('isPlgDocumentJson herkent format, niet een kale FML', () => {
    expect(isPlgDocumentJson(sampleDoc())).toBe(true)
    expect(isPlgDocumentJson({ format: PLG_FORMAT })).toBe(true)
    expect(isPlgDocumentJson({ name: 'FML', floors: [] })).toBe(false)
    expect(isPlgDocumentJson('{"format":"plg-plan"}')).toBe(false)
  })

  it('writePlg(readPlg(x)) is byte-identiek', () => {
    const original = writePlg(sampleDoc())
    const roundtrip = writePlg(readPlg(original))
    expect(roundtrip).toBe(original)
  })

  it('writePlg is stabiel ondanks gemuteerde key-insert-order', () => {
    const base = sampleDoc()
    const mutatedSettings = {
      defaults: base.settings.defaults,
      showCanvasGrid: base.settings.showCanvasGrid,
      planDisplayStyle: base.settings.planDisplayStyle,
      scaleInputUnit: base.settings.scaleInputUnit,
      unitSystem: base.settings.unitSystem,
    }
    const a = writePlg(base)
    const b = writePlg({ ...base, settings: mutatedSettings })
    expect(b).toBe(a)
  })
})

describe('plg-migrations', () => {
  it('migratePlg op een v1-document is een no-op', () => {
    const raw = {
      format: PLG_FORMAT,
      version: 1,
      generator: DEFAULT_PLG_GENERATOR,
      savedAt: '2026-09-10T12:00:00.000Z',
      project: { id: 'p', name: 'n', address: 'a' },
      settings: sampleDoc().settings,
      plan: sampleDoc().plan,
    }
    const migrated = migratePlg(raw)
    expect(migrated).toBe(raw)
    expect((migrated as { version: number }).version).toBe(CURRENT_PLG_VERSION)
  })

  it('migratePlg op version 99 gooit een leesbare fout', () => {
    expect(() => migratePlg({ format: PLG_FORMAT, version: 99 })).toThrow(PlgMigrationError)
    expect(() => migratePlg({ format: PLG_FORMAT, version: 99 })).toThrow(
      /newer than this app supports/,
    )
  })
})

/** Verrijk Kinderdijkstraat zodat alle acht Fase-B-concepten aanwezig zijn. */
function enrichWithPhaseBConcepts(plan: FloorPlan): FloorPlan {
  let next = structuredClone(plan)

  // B3 roof.stack (floorStack) — FML-export stript dit; .plg moet het houden.
  next = setSlabThicknessCm(setNokThicknessCm(next, 40), 0, 25)

  // B8 bovenlichtPacked expliciet (niet alleen default).
  next = writeBovenlichtPacked(next, false)

  // B5 slices + autoDimensions
  next = writePlanSlices(next, [
    { m: { x: 0, y: 0 }, p: { x: 100, y: 0 } },
    { m: { x: 50, y: 0 }, p: { x: 50, y: 100 } },
  ])
  next = writeDimensionSettings(next, { engineAutoDims: true })

  // B2 facadeGroups + B4 elevations (view hangt aan groep-id)
  const group = createFacadeGroup(next, { name: 'Voor', code: 'VOOR' })
  const firstWallId = next.floors[0]?.walls[0]?.id
  if (firstWallId) {
    assignWallsToGroup(next, group.id, [firstWallId])
  }
  next = setElevationProjection(next, 'projective')
  next = setElevationViewDrawing(next, group.id, {
    x: 10,
    y: 20,
    width: 400,
    height: 280,
    rotation: 0,
    url: 'https://cdn.example.com/elev-kind.png',
    alpha: 40,
  })

  // B6 opening.frame op eerste opening
  outer: for (const floor of next.floors) {
    for (const wall of floor.walls) {
      const op = wall.openings[0] as Opening | undefined
      if (!op) continue
      op.frame = { leftCm: 5, rightCm: 5, topCm: 4, bottomCm: 0 }
      break outer
    }
  }

  // B7 stampOwned — moet bij writePlg verdwijnen (sessie-only)
  const seedWall = next.floors[0]?.walls[0]
  if (seedWall) {
    next.floors[0].walls[0] = markStampOwned(seedWall, true)
  }

  return next
}

function wallElevationFingerprint(plan: FloorPlan): Array<{ id: string; a?: unknown; b?: unknown }> {
  const out: Array<{ id: string; a?: unknown; b?: unknown }> = []
  for (const floor of plan.floors) {
    for (const wall of floor.walls) {
      if (!wall.elevation) continue
      out.push({ id: wall.id, a: wall.elevation.a, b: wall.elevation.b })
    }
  }
  return out.sort((x, y) => x.id.localeCompare(y.id))
}

function openingFramesFingerprint(plan: FloorPlan): Array<{ id: string; frame: unknown }> {
  const out: Array<{ id: string; frame: unknown }> = []
  for (const floor of plan.floors) {
    for (const wall of floor.walls) {
      for (const op of wall.openings) {
        if (!op.frame) continue
        out.push({ id: op.id || `${wall.id}@${op.t}`, frame: op.frame })
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

function countStampOwned(plan: FloorPlan): number {
  let n = 0
  const visit = (walls: Wall[] | undefined) => {
    for (const wall of walls ?? []) {
      if (wall.stampOwned === true) n += 1
    }
  }
  for (const floor of plan.floors) {
    visit(floor.walls)
    for (const design of floor.designs ?? []) visit(design.walls)
  }
  return n
}

function semanticFmlExportFingerprint(raw: Record<string, unknown>) {
  const floors = (raw.floors as Array<Record<string, unknown>>) ?? []
  const floor0 = floors[0] ?? {}
  const designs = (floor0.designs as Array<Record<string, unknown>>) ?? []
  const design0 = designs[0] ?? {}
  const walls = (design0.walls as Array<Record<string, unknown>>) ?? []
  const openings = walls.flatMap((w) => (w.openings as unknown[]) ?? [])
  const settings = (raw.settings as Record<string, unknown>) ?? {}

  const azHs = walls
    .map((w) => (w.az as { h?: number } | undefined)?.h)
    .filter((h): h is number => typeof h === 'number')
    .sort((a, b) => a - b)

  return {
    id: raw.id,
    name: raw.name,
    features: raw.features,
    floorCount: floors.length,
    wallCount: walls.length,
    openingCount: openings.length,
    areaCount: Array.isArray(design0.areas) ? design0.areas.length : 0,
    surfaceCount: Array.isArray(design0.surfaces) ? design0.surfaces.length : 0,
    dimensionCount: Array.isArray(design0.dimensions) ? design0.dimensions.length : 0,
    labelCount: Array.isArray(design0.labels) ? design0.labels.length : 0,
    lineCount: Array.isArray(design0.lines) ? design0.lines.length : 0,
    drawingUrl: (floor0.drawing as { url?: string } | undefined)?.url,
    azHSample: azHs.includes(266),
    azHCount: azHs.length,
    bovenlichtPacked: settings.bovenlichtPacked,
    // Gestript bij FML-export — mogen niet terugkomen
    strippedFloorStack: settings.floorStack,
    strippedElevationViews: settings.elevationViews,
    strippedElevationProjection: settings.elevationProjection,
  }
}

describe('plg Fase C3 — Kinderdijkstraat FML ↔ .plg', () => {
  it('importFmlV3 → .plg → buildFmlV3 is semantisch gelijk; Fase-B concepten roundtrippen', () => {
    const raw = JSON.parse(readFileSync(KINDERDIJK, 'utf8'))
    const { plan: imported } = importFmlV3(raw)
    const enriched = enrichWithPhaseBConcepts(imported)

    // Fixture-baseline (zoals fml-roundtrip.spec.ts)
    expect(enriched.floors[0]?.areas?.length).toBe(12)
    expect(enriched.floors[0]?.surfaces?.length).toBe(1)
    expect(enriched.floors[0]?.labels?.length).toBe(2)
    expect(enriched.source?.id).toBe(186515206)
    expect(wallElevationFingerprint(enriched).some((w) => (w.a as { h?: number })?.h === 266)).toBe(
      true,
    )
    expect(countStampOwned(enriched)).toBeGreaterThanOrEqual(1)
    const stampedId = enriched.floors[0]?.walls[0]?.id
    expect(enriched.floors[0]?.walls[0]?.stampOwned).toBe(true)

    const foreign =
      imported.source?.leftover && Object.keys(imported.source.leftover).length > 0
        ? { fml: imported.source.leftover }
        : undefined

    const doc = createPlgDocument({
      project: {
        id: String(imported.source?.id ?? 'kinderdijk'),
        name: imported.name,
        address: 'Kinderdijkstraat 53 1, Amsterdam',
      },
      settings: structuredClone(FACTORY_PLG_SETTINGS),
      plan: enriched,
      foreign,
      savedAt: '2026-09-10T12:00:00.000Z',
    })

    const roundPlan = readPlg(writePlg(doc)).plan

    // —— Getypte Fase-B-velden op het plan (inclusief FML-gestripte keys) ——
    // B1 wall.elevation
    expect(wallElevationFingerprint(roundPlan)).toEqual(wallElevationFingerprint(enriched))
    // B2 facadeGroups
    expect(listFacadeGroups(roundPlan)).toEqual(listFacadeGroups(enriched))
    expect(roundPlan.facadeGroups?.length).toBeGreaterThan(0)
    // B3 roof (stack / ridge / planes)
    expect(roundPlan.roof).toEqual(enriched.roof)
    expect(roundPlan.roof?.stack).toMatchObject({
      nokThicknessCm: 40,
      floors: expect.arrayContaining([{ level: 0, thicknessCm: 25 }]),
    })
    // B4 elevations (FML-export stript; .plg houdt)
    expect(roundPlan.elevations).toEqual(enriched.elevations)
    expect(roundPlan.elevations?.projection).toBe('projective')
    expect(roundPlan.elevations?.views?.[0]?.drawing?.url).toContain('elev-kind.png')
    // B5 slices + autoDimensions
    const enrichedDesign = enriched.floors[0]?.designs?.[enriched.floors[0].activeDesignIndex ?? 0]
    const roundDesign = roundPlan.floors[0]?.designs?.[roundPlan.floors[0].activeDesignIndex ?? 0]
    expect(roundDesign?.slices).toEqual(enrichedDesign?.slices)
    expect(roundDesign?.autoDimensions).toBe(true)
    // B6 opening.frame
    expect(openingFramesFingerprint(roundPlan)).toEqual(openingFramesFingerprint(enriched))
    expect(openingFramesFingerprint(roundPlan).length).toBeGreaterThan(0)
    // B7 stampOwned — bewust NIET in .plg
    expect(countStampOwned(roundPlan)).toBe(0)
    if (stampedId) {
      const roundWall = roundPlan.floors[0]?.walls.find((w) => w.id === stampedId)
      expect(roundWall?.stampOwned).toBeUndefined()
    }
    // B8 bovenlichtPacked
    expect(roundPlan.settings?.bovenlichtPacked).toBe(false)

    // —— FML-schrijver: zelfde semantiek vóór/na .plg (niet byte-identiek) ——
    const baselineExport = JSON.parse(buildFmlV3(enriched)) as Record<string, unknown>
    const roundExport = JSON.parse(buildFmlV3(roundPlan)) as Record<string, unknown>
    expect(semanticFmlExportFingerprint(roundExport)).toEqual(
      semanticFmlExportFingerprint(baselineExport),
    )

    // Labels / openingen / tekening blijven herkenbaar
    expect(
      ((roundExport.floors as Array<{ designs: Array<{ labels: Array<{ text: string }> }> }>)[0]
        .designs[0].labels ?? []
      ).some((l) => l.text.includes('H=2.70m')),
    ).toBe(true)
  })
})
