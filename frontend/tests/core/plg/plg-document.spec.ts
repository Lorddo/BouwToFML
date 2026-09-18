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
    dakThicknessCm: 30,
    slabThicknessCm: 20,
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

  it('writePlg schrijft alleen https-drawing.url, geen data-URL', () => {
    const https = sampleDoc()
    https.plan.floors[0]!.drawing = {
      x: 1,
      y: 2,
      width: 10,
      height: 8,
      rotation: 0,
      url: 'https://pub.example.com/v1/p/f/scan.png',
    }
    const httpsWritten = JSON.parse(writePlg(https)) as {
      plan: { floors: Array<{ drawing?: { url?: string; width: number } }> }
    }
    expect(httpsWritten.plan.floors[0]?.drawing?.url).toBe(
      'https://pub.example.com/v1/p/f/scan.png',
    )
    expect(httpsWritten.plan.floors[0]?.drawing?.width).toBe(10)

    const data = sampleDoc()
    data.plan.floors[0]!.drawing = {
      x: 1,
      y: 2,
      width: 10,
      height: 8,
      rotation: 0,
      url: 'data:image/png;base64,AAA',
    }
    const dataWritten = JSON.parse(writePlg(data)) as {
      plan: { floors: Array<{ drawing?: { url?: string; width: number } }> }
    }
    expect(dataWritten.plan.floors[0]?.drawing?.url).toBeUndefined()
    expect(dataWritten.plan.floors[0]?.drawing?.width).toBe(10)
  })

  it('writePlg stript FML-extras plg* uit openings/items/surfaces/design.settings', () => {
    const doc = sampleDoc()
    const wall = doc.plan.floors[0]?.walls[0]
    if (!wall) throw new Error('expected wall')
    wall.openings = [
      {
        id: 'o1',
        kind: 'door.single',
        type: 'door',
        t: 0.5,
        width: 90,
        z: 0,
        z_height: 220,
        frame: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 0 },
        extras: { plgFrame: { leftCm: 9, rightCm: 9, topCm: 9, bottomCm: 9 } },
      },
    ]
    doc.plan.floors[0].items = [
      {
        id: 'sky1',
        kind: 'skylight',
        x: 100,
        y: 100,
        width: 80,
        height: 80,
        roofSurfaceId: 'roof-1',
        pitchDeg: 14,
        frame: { leftCm: 6, rightCm: 6, topCm: 4, bottomCm: 4 },
        extras: { plgRoofSurfaceId: 'should-not-persist' },
      },
    ]
    doc.plan.floors[0].designs = [
      {
        name: 'A',
        walls: [],
        slices: [{ m: { x: 0, y: 0 }, p: { x: 100, y: 0 } }],
        surfaces: [
          {
            id: 'roof-1',
            poly: [
              { x: 0, y: 0, z: 300 },
              { x: 100, y: 0, z: 300 },
              { x: 100, y: 100, z: 300 },
              { x: 0, y: 100, z: 300 },
            ],
            color: '#ccc',
            showAreaLabel: false,
            isRoof: true,
            origin: 'manual',
            extras: { plgOrigin: 'generated' },
          },
        ],
        source: {
          settings: {
            plgSlices: [{ m: { x: 1, y: 1 }, p: { x: 2, y: 2 } }],
            plgRole: 'ridge',
          },
        },
      },
    ]

    const written = JSON.parse(writePlg(doc)) as {
      plan: {
        floors: Array<{
          walls: Array<{ openings: Array<{ extras?: Record<string, unknown>; frame?: unknown }> }>
          items?: Array<{
            extras?: Record<string, unknown>
            roofSurfaceId?: string
            pitchDeg?: number
            frame?: unknown
          }>
          designs?: Array<{
            slices?: unknown
            source?: { settings?: Record<string, unknown> }
            surfaces?: Array<{ extras?: Record<string, unknown>; origin?: string }>
          }>
        }>
      }
    }
    const floor = written.plan.floors[0]
    expect(floor.walls[0]?.openings[0]?.frame).toEqual({
      leftCm: 5,
      rightCm: 5,
      topCm: 5,
      bottomCm: 0,
    })
    expect(floor.walls[0]?.openings[0]?.extras?.plgFrame).toBeUndefined()
    expect(floor.items?.[0]?.roofSurfaceId).toBe('roof-1')
    expect(floor.items?.[0]?.pitchDeg).toBe(14)
    expect(floor.items?.[0]?.frame).toEqual({ leftCm: 6, rightCm: 6, topCm: 4, bottomCm: 4 })
    expect(floor.items?.[0]?.extras?.plgRoofSurfaceId).toBeUndefined()
    expect(floor.designs?.[0]?.slices).toEqual([{ m: { x: 0, y: 0 }, p: { x: 100, y: 0 } }])
    expect(floor.designs?.[0]?.source?.settings?.plgSlices).toBeUndefined()
    expect(floor.designs?.[0]?.source?.settings?.plgRole).toBeUndefined()
    expect(floor.designs?.[0]?.surfaces?.[0]?.origin).toBe('manual')
    expect(floor.designs?.[0]?.surfaces?.[0]?.extras?.plgOrigin).toBeUndefined()
  })

  it('writePlg laat converter-banden en min/mid/max weg; read slikt oude keys', () => {
    const doc = sampleDoc()
    const written = JSON.parse(writePlg(doc)) as {
      settings: { defaults: Record<string, unknown> }
    }
    expect(written.settings.defaults.thicknessCms).toEqual([10, 20, 30])
    expect(written.settings.defaults.thicknessMinCm).toBeUndefined()
    expect(written.settings.defaults.bandMidBoundaryCm).toBeUndefined()

    const withLegacy = {
      ...JSON.parse(writePlg(doc)),
      settings: {
        ...doc.settings,
        defaults: {
          ...doc.settings.defaults,
          thicknessMinCm: 8,
          thicknessMidCm: 16,
          thicknessMaxCm: 32,
          bandMidBoundaryCm: 11,
          bandMaxBoundaryCm: 22,
        },
      },
    }
    const read = readPlg(withLegacy)
    expect(read.settings.defaults.thicknessCms).toEqual([10, 20, 30])
    expect(
      (read.settings.defaults as unknown as Record<string, unknown>).thicknessMinCm,
    ).toBeUndefined()
  })

  it('writePlg bewaart bovenlicht-override + maten op de opening', () => {
    const doc = sampleDoc()
    const wall = doc.plan.floors[0]?.walls[0]
    if (!wall) throw new Error('expected wall')
    wall.openings = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'door.single',
        type: 'door',
        t: 0.5,
        width: 90,
        z: 0,
        z_height: 220,
        bovenlicht: true,
        bovenlichtHeightCm: 45,
        bovenlichtGapCm: 12,
      },
    ]
    const round = readPlg(writePlg(doc)).plan.floors[0]?.walls[0]?.openings[0]
    expect(round?.bovenlicht).toBe(true)
    expect(round?.bovenlichtHeightCm).toBe(45)
    expect(round?.bovenlichtGapCm).toBe(12)
  })

  it('readPlg zaait floor.defaults en schrijft ze terug; plan.settings.openingFrameDefaults verdwijnt', () => {
    const doc = sampleDoc()
    doc.plan.settings = {
      ...(doc.plan.settings ?? {}),
      openingFrameDefaults: {
        door: { leftCm: 12, rightCm: 5, topCm: 5, bottomCm: 0 },
        window: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 },
      },
    }
    const read = readPlg(doc)
    expect(read.plan.floors[0]?.defaults?.openingFrameDefaults.door.leftCm).toBe(12)
    expect(read.plan.settings?.openingFrameDefaults).toBeUndefined()
    const written = JSON.parse(writePlg(read)) as {
      plan: { floors: Array<{ defaults?: { doorHeightCm: number } }>; settings?: { openingFrameDefaults?: unknown } }
    }
    expect(written.plan.floors[0]?.defaults?.doorHeightCm).toBeGreaterThan(0)
    expect(written.plan.settings?.openingFrameDefaults).toBeUndefined()
  })

  it('readPlg promoveert source.settings → typed en wist de keys', () => {
    const doc = sampleDoc()
    doc.plan.source = {
      settings: {
        bovenlichtPacked: false,
        floorStack: {
          nokThicknessCm: 42,
          floors: [{ level: 0, thicknessCm: 18, ridgeZCm: 250 }],
        },
        ridgeWalls: { wallGuids: ['w0'], displayWidthCm: 12 },
        roofPlanes: { surfaceGuids: ['s1'] },
        facadeGroups: [{ id: 'front', code: 'front', name: 'Front', wallGuids: ['w0'] }],
      },
    }
    const read = readPlg(doc)
    expect(read.plan.settings?.bovenlichtPacked).toBe(false)
    expect(read.plan.roof?.stack).toMatchObject({
      nokThicknessCm: 42,
      floors: [{ level: 0, thicknessCm: 18, ridgeZCm: 250 }],
    })
    expect(read.plan.roof?.ridge.wallIds).toEqual(['w0'])
    expect(read.plan.roof?.ridge.displayWidthCm).toBe(12)
    expect(read.plan.roof?.planes.surfaceIds).toEqual(['s1'])
    expect(read.plan.facadeGroups?.[0]?.wallIds).toEqual(['w0'])
    expect(read.plan.source?.settings?.floorStack).toBeUndefined()
    expect(read.plan.source?.settings?.ridgeWalls).toBeUndefined()
    expect(read.plan.source?.settings?.roofPlanes).toBeUndefined()
    expect(read.plan.source?.settings?.facadeGroups).toBeUndefined()
    expect(read.plan.source?.settings?.bovenlichtPacked).toBeUndefined()
  })

  it('writePlg schrijft wallIds en stript extras.fmlRefid; oude wallGuids worden gelezen', () => {
    const doc = sampleDoc()
    const wall = doc.plan.floors[0]?.walls[0]
    if (!wall) throw new Error('expected wall')
    wall.openings = [
      {
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'door.single',
        type: 'window',
        t: 0.4,
        width: 90,
        extras: { fmlRefid: 'deadbeef' },
      },
    ]
    doc.plan.facadeGroups = [
      { id: 'front', code: 'front', name: 'Front', wallIds: ['w0'] },
    ]
    doc.plan.roof = {
      ridge: { wallIds: ['w0'], displayWidthCm: 10 },
      planes: { surfaceIds: [] },
      stack: { nokThicknessCm: 30, floors: [] },
    }

    const written = JSON.parse(writePlg(doc)) as {
      plan: {
        facadeGroups?: Array<{ wallIds?: string[]; wallGuids?: string[] }>
        roof?: { ridge?: { wallIds?: string[]; wallGuids?: string[] } }
        floors: Array<{
          walls: Array<{
            openings: Array<{ extras?: { fmlRefid?: string }; type?: string }>
          }>
        }>
      }
    }
    expect(written.plan.facadeGroups?.[0]?.wallIds).toEqual(['w0'])
    expect(written.plan.facadeGroups?.[0]?.wallGuids).toBeUndefined()
    expect(written.plan.roof?.ridge?.wallIds).toEqual(['w0'])
    expect(written.plan.roof?.ridge?.wallGuids).toBeUndefined()
    expect(written.plan.floors[0]?.walls[0]?.openings[0]?.extras?.fmlRefid).toBeUndefined()
    expect(readPlg(written).plan.floors[0]?.walls[0]?.openings[0]?.type).toBe('door')

    const legacy = structuredClone(written)
    if (legacy.plan.facadeGroups?.[0]) {
      legacy.plan.facadeGroups[0].wallGuids = ['w0']
      delete legacy.plan.facadeGroups[0].wallIds
    }
    if (legacy.plan.roof?.ridge) {
      legacy.plan.roof.ridge.wallGuids = ['w0']
      delete legacy.plan.roof.ridge.wallIds
    }
    const fromLegacy = readPlg(legacy)
    expect(fromLegacy.plan.facadeGroups?.[0]?.wallIds).toEqual(['w0'])
    expect(fromLegacy.plan.roof?.ridge.wallIds).toEqual(['w0'])
  })

  it('importFmlV3 waarschuwt bij onbekende opening-refid en zet geen fmlRefid', () => {
    const { plan, warnings } = importFmlV3({
      name: 'Unmapped',
      floors: [
        {
          name: 'Begane grond',
          designs: [
            {
              name: 'Begane grond',
              walls: [
                {
                  guid: 'w-unmapped',
                  a: { x: 0, y: 0 },
                  b: { x: 200, y: 0 },
                  openings: [
                    {
                      guid: 'o-unmapped',
                      refid: 'not-a-catalog-hash',
                      type: 'door',
                      t: 0.5,
                      width: 90,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    const opening = plan.floors[0]?.walls[0]?.openings[0]
    expect(opening?.kind).toBe('door.unmapped')
    expect(opening?.type).toBe('door')
    expect(opening?.extras?.fmlRefid).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('Onbekende FML-opening'))).toBe(true)
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
