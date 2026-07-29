import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractionToPlan } from '@/core/fml/extractionToPlan'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { CONCEPT_WINDOW_REFID } from '@/core/fml/types'
import type { ExtractionOutput } from '@/core/extraction'

describe('extractionToPlan', () => {
  it('gebruikt wallGraph-edges voor walls-only plan', () => {
    const output: ExtractionOutput = {
      candidates: [],
      wallGraph: {
        nodes: [
          { id: 'n0', x: 0, y: 10, kind: 'I', angleDeg: 0 },
          { id: 'n1', x: 100, y: 10, kind: 'I', angleDeg: 0 },
        ],
        edges: [
          {
            id: 'e0',
            a: 'n0',
            b: 'n1',
            segment: { a: { x: 0, y: 10 }, b: { x: 100, y: 10 }, templateIndex: 0 },
          },
        ],
      },
      meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [10] },
    }

    const plan = extractionToPlan(output, {
      pxPerMmX: 1,
      pxPerMmY: 1,
      planName: 'Test',
      floorName: 'F0',
    })

    expect(plan.floors[0].walls).toHaveLength(1)
    const wall = plan.floors[0].walls[0]
    expect(wall.a.y).toBeCloseTo(0, 4)
    expect(wall.b.x).toBeCloseTo(10, 4)
    expect(wall.openings).toHaveLength(0)
  })

  it('roundtript met fallback graph en importeert bestaand voorbeeldbestand', () => {
    const output: ExtractionOutput = {
      candidates: [],
      segments: [
        { type: 'wall', a: { x: 0, y: 0 }, b: { x: 80, y: 0 }, templateIndex: 0 },
        { type: 'wall', a: { x: 80, y: 0 }, b: { x: 80, y: 60 }, templateIndex: 0 },
      ],
      meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [12] },
    }
    const plan = extractionToPlan(output, {
      pxPerMmX: 1,
      pxPerMmY: 1,
      planName: 'Fallback',
    })
    const fmlText = buildFmlV3(plan)
    const parsed = importFmlV3(fmlText)
    expect(parsed.plan.floors[0].walls.length).toBeGreaterThan(0)

    const existingPath = fileURLToPath(
      new URL(
        '../../examples/FML(current)/Benedendorpsweg 51, Oosterbeek.json.fml',
        import.meta.url,
      ),
    )
    const existingRaw = readFileSync(existingPath, 'utf-8')
    const existingParsed = importFmlV3(existingRaw)
    expect(existingParsed.plan.floors.length).toBeGreaterThan(0)
    expect(existingParsed.plan.floors[0].walls.length).toBeGreaterThan(0)
  })

  it('gebruikt semantic segment thickness voor FML muurbreedte', () => {
    const output: ExtractionOutput = {
      candidates: [],
      semanticWallGraph: {
        segments: [
          {
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thicknessPxMax: 24,
            balancePx: 0.79,
          },
        ],
        junctions: [],
        meta: {
          rawJunctionCount: 0,
          semanticJunctionCount: 0,
          cornerClustersMerged: 0,
          collinearSegmentsMerged: 0,
          angleAtLeast25Count: 0,
        },
      },
      meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [8] },
    }
    const plan = extractionToPlan(output, {
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    const wall = plan.floors[0].walls[0]
    const thickness = wall?.thickness ?? 0
    expect(thickness).toBeCloseTo(1.2, 1)
    expect(wall?.balance).toBe(0.79)
  })

  it('valt terug op balance 0.5 als semantic balance ontbreekt', () => {
    const output: ExtractionOutput = {
      candidates: [],
      semanticWallGraph: {
        segments: [
          {
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thicknessPxMax: 20,
          },
        ],
        junctions: [],
        meta: {
          rawJunctionCount: 0,
          semanticJunctionCount: 0,
          cornerClustersMerged: 0,
          collinearSegmentsMerged: 0,
          angleAtLeast25Count: 0,
        },
      },
      meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [8] },
    }
    const plan = extractionToPlan(output, {
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    expect(plan.floors[0].walls[0]?.balance).toBe(0.5)
  })

  it('clamped balance blijft binnen Floorplanner bereik', () => {
    const output: ExtractionOutput = {
      candidates: [],
      semanticWallGraph: {
        segments: [
          {
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thicknessPxMax: 20,
            balancePx: 0.94,
          },
        ],
        junctions: [],
        meta: {
          rawJunctionCount: 0,
          semanticJunctionCount: 0,
          cornerClustersMerged: 0,
          collinearSegmentsMerged: 0,
          angleAtLeast25Count: 0,
        },
      },
      meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [8] },
    }
    const plan = extractionToPlan(output, {
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    expect(plan.floors[0].walls[0]?.balance).toBe(0.8)
  })

  it('vertaalt laag-12 deuren naar FML-openings met mirrored op muurrichting', () => {
    const output: ExtractionOutput = {
      candidates: [],
      semanticWallGraph: {
        segments: [
          {
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thicknessPxMax: 20,
          },
        ],
        junctions: [],
        meta: {
          rawJunctionCount: 0,
          semanticJunctionCount: 0,
          cornerClustersMerged: 0,
          collinearSegmentsMerged: 0,
          angleAtLeast25Count: 0,
        },
      },
      meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [8] },
    }
    const plan = extractionToPlan(output, {
      pxPerMmX: 1,
      pxPerMmY: 1,
      layer12Doors: [
        {
          doorId: 'door-1',
          segmentIndex: 0,
          fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
          mirrored: [0, 1],
          snappedBBox: { x: 20, y: -8, width: 40, height: 16 },
          openingStartPx: { x: 20, y: 0 },
          openingEndPx: { x: 60, y: 0 },
        },
      ],
    })
    const wall = plan.floors[0].walls[0]
    expect(wall).toBeTruthy()
    expect(wall.openings).toHaveLength(1)
    const door = wall.openings[0]
    const forward = wall.b.x >= wall.a.x
    expect(door.type).toBe('door')
    expect(door.refid).toBe('0434246537840a3326e305dbe7b9c355743e6e93')
    expect(door.width).toBeCloseTo(4, 2)
    expect(door.guid).toBe('door-1')
    expect(door.t).toBeCloseTo(forward ? 0.4 : 0.6, 2)
    expect(door.mirrored).toEqual(forward ? [0, 1] : [1, 0])
    expect(door.z_height).toBe(220)
  })

  it('gebruikt floorHeightCm en defaultDoorHeightCm uit options', () => {
    const output: ExtractionOutput = {
      candidates: [],
      semanticWallGraph: {
        segments: [
          {
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thicknessPxMax: 20,
          },
        ],
        junctions: [],
        meta: {
          rawJunctionCount: 0,
          semanticJunctionCount: 0,
          cornerClustersMerged: 0,
          collinearSegmentsMerged: 0,
          angleAtLeast25Count: 0,
        },
      },
      meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [8] },
    }
    const plan = extractionToPlan(output, {
      pxPerMmX: 1,
      pxPerMmY: 1,
      floorHeightCm: 270,
      defaultDoorHeightCm: 210,
      layer12Doors: [
        {
          doorId: 'door-1',
          segmentIndex: 0,
          fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
          mirrored: [0, 0],
          openingStartPx: { x: 20, y: 0 },
          openingEndPx: { x: 60, y: 0 },
        },
      ],
    })
    expect(plan.floors[0].height).toBe(270)
    expect(plan.floors[0].walls[0].openings[0].z_height).toBe(210)
  })

  it('smelt twee aangrenzende standaarddeuren naar één dubbele deur in FML', () => {
    const output: ExtractionOutput = {
      candidates: [],
      semanticWallGraph: {
        segments: [
          {
            a: { x: 0, y: 0 },
            b: { x: 120, y: 0 },
            thicknessPxMax: 20,
          },
        ],
        junctions: [],
        meta: {
          rawJunctionCount: 0,
          semanticJunctionCount: 0,
          cornerClustersMerged: 0,
          collinearSegmentsMerged: 0,
          angleAtLeast25Count: 0,
        },
      },
      meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [8] },
    }
    const plan = extractionToPlan(output, {
      pxPerMmX: 1,
      pxPerMmY: 1,
      layer12Doors: [
        {
          doorId: 'door-left',
          segmentIndex: 0,
          fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
          mirrored: [0, 1],
          snappedBBox: { x: 20, y: -8, width: 30, height: 16 },
          openingStartPx: { x: 20, y: 0 },
          openingEndPx: { x: 50, y: 0 },
        },
        {
          doorId: 'door-right',
          segmentIndex: 0,
          fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
          mirrored: [1, 1],
          snappedBBox: { x: 50, y: -8, width: 30, height: 16 },
          openingStartPx: { x: 50, y: 0 },
          openingEndPx: { x: 80, y: 0 },
        },
      ],
    })
    const wall = plan.floors[0].walls[0]
    expect(wall).toBeTruthy()
    expect(wall.openings).toHaveLength(1)
    const merged = wall.openings[0]
    expect(merged.refid).toBe('5ae0ee3c682e32c8c7ac15a6136d692df5737b22')
    expect(merged.width).toBeCloseTo(6, 2)
    // Hart = midden van gecombineerde span 20..80 → t=50/120
    expect(merged.t).toBeCloseTo(50 / 120, 3)
    expect(merged.guid).toContain('door-left__door-right')
    expect(merged.mirrored?.[1]).toBe(1)
  })

  it('smelt standaarddeuren met klein gat tussen bladen (zonder bbox-touch)', () => {
    const output: ExtractionOutput = {
      candidates: [],
      semanticWallGraph: {
        segments: [
          {
            a: { x: 0, y: 0 },
            b: { x: 200, y: 0 },
            thicknessPxMax: 20,
          },
        ],
        junctions: [],
        meta: {
          rawJunctionCount: 0,
          semanticJunctionCount: 0,
          cornerClustersMerged: 0,
          collinearSegmentsMerged: 0,
          angleAtLeast25Count: 0,
        },
      },
      meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [8] },
    }
    const plan = extractionToPlan(output, {
      pxPerMmX: 1,
      pxPerMmY: 1,
      layer12Doors: [
        {
          doorId: 'leaf-a',
          segmentIndex: 0,
          fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
          mirrored: [0, 0],
          // Bboxes raken elkaar niet (10px gat) — oude merge faalde hierop.
          snappedBBox: { x: 40, y: -10, width: 40, height: 20 },
          openingStartPx: { x: 40, y: 0 },
          openingEndPx: { x: 80, y: 0 },
        },
        {
          doorId: 'leaf-b',
          segmentIndex: 0,
          fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
          mirrored: [1, 0],
          snappedBBox: { x: 90, y: -10, width: 40, height: 20 },
          openingStartPx: { x: 90, y: 0 },
          openingEndPx: { x: 130, y: 0 },
        },
      ],
    })
    const allDoors = plan.floors[0].walls.flatMap((wall) => wall.openings)
    expect(allDoors).toHaveLength(1)
    expect(allDoors[0].refid).toBe('5ae0ee3c682e32c8c7ac15a6136d692df5737b22')
    expect(allDoors[0].width).toBeCloseTo(9, 2) // 40..130
    expect(allDoors[0].t).toBeCloseTo(85 / 200, 3) // hart (40+130)/2
  })

  it('plaatst een deurpaar niet opnieuw als singles op een tweede muur-edge', () => {
    const output: ExtractionOutput = {
      candidates: [],
      semanticWallGraph: {
        segments: [
          {
            a: { x: 0, y: 0 },
            b: { x: 120, y: 0 },
            thicknessPxMax: 20,
          },
          {
            // Bijna dezelfde muur (andere y) — mag deuren niet nogmaals claimen.
            a: { x: 0, y: 1 },
            b: { x: 120, y: 1 },
            thicknessPxMax: 20,
          },
        ],
        junctions: [],
        meta: {
          rawJunctionCount: 0,
          semanticJunctionCount: 0,
          cornerClustersMerged: 0,
          collinearSegmentsMerged: 0,
          angleAtLeast25Count: 0,
        },
      },
      meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [8] },
    }
    const doors = [
      {
        doorId: 'door-left',
        segmentIndex: 0,
        fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
        mirrored: [0, 1] as [number, number],
        snappedBBox: { x: 20, y: -8, width: 30, height: 16 },
        openingStartPx: { x: 20, y: 0 },
        openingEndPx: { x: 50, y: 0 },
      },
      {
        doorId: 'door-right',
        segmentIndex: 0,
        fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
        mirrored: [1, 1] as [number, number],
        snappedBBox: { x: 50, y: -8, width: 30, height: 16 },
        openingStartPx: { x: 50, y: 0 },
        openingEndPx: { x: 80, y: 0 },
      },
      // Zelfde deuren ook gekoppeld aan segment 1 (foutieve dubbele snap).
      {
        doorId: 'door-left',
        segmentIndex: 1,
        fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
        mirrored: [0, 1] as [number, number],
        snappedBBox: { x: 20, y: -8, width: 30, height: 16 },
        openingStartPx: { x: 20, y: 1 },
        openingEndPx: { x: 50, y: 1 },
      },
      {
        doorId: 'door-right',
        segmentIndex: 1,
        fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
        mirrored: [1, 1] as [number, number],
        snappedBBox: { x: 50, y: -8, width: 30, height: 16 },
        openingStartPx: { x: 50, y: 1 },
        openingEndPx: { x: 80, y: 1 },
      },
    ]
    const plan = extractionToPlan(output, {
      pxPerMmX: 1,
      pxPerMmY: 1,
      layer12Doors: doors,
    })
    const allDoors = plan.floors[0].walls.flatMap((wall) => wall.openings)
    expect(allDoors).toHaveLength(1)
    expect(allDoors[0].refid).toBe('5ae0ee3c682e32c8c7ac15a6136d692df5737b22')
    expect(allDoors[0].guid).toContain('door-left__door-right')
  })

  it('plaatst layer14Windows als Opening type window op de juiste muur', () => {
    const output: ExtractionOutput = {
      candidates: [],
      semanticWallGraph: {
        segments: [
          {
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thicknessPxMax: 20,
          },
        ],
        junctions: [],
        meta: {
          rawJunctionCount: 0,
          semanticJunctionCount: 0,
          cornerClustersMerged: 0,
          collinearSegmentsMerged: 0,
          angleAtLeast25Count: 0,
        },
      },
      meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [8] },
    }
    const plan = extractionToPlan(output, {
      pxPerMmX: 1,
      pxPerMmY: 1,
      layer14Windows: [
        {
          windowId: 'window-1',
          segmentIndex: 0,
          fmlRefId: CONCEPT_WINDOW_REFID,
          openingStartPx: { x: 20, y: 0 },
          openingEndPx: { x: 60, y: 0 },
        },
      ],
    })
    const wall = plan.floors[0].walls[0]
    expect(wall.openings).toHaveLength(1)
    const opening = wall.openings[0]
    expect(opening.type).toBe('window')
    expect(opening.refid).toBe(CONCEPT_WINDOW_REFID)
    expect(opening.guid).toBe('window-1')
    expect(opening.width).toBeCloseTo(4, 2)
    const forward = wall.b.x >= wall.a.x
    expect(opening.t).toBeCloseTo(forward ? 0.4 : 0.6, 2)
  })
})
