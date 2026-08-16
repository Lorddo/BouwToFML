import { describe, expect, it } from 'vitest'
import { encodeMaskRle } from '@/cv/util/binary-mask-rle'
import {
  estimateMedianThicknessPx,
  groupWallLineIndices,
  harmonizeThicknessPerWallLine,
  JUNCTION_THICKNESS_MARGIN_PX,
  measureSegmentThicknessMax,
  segmentsOnSameWallLine,
} from '@/cv/walls/rooms/room-wall-segment-thickness'

describe('room-wall-segment-thickness', () => {
  it('meet thicknessPxMax op rechthoekige muurband', () => {
    const width = 100
    const height = 60
    const bandY0 = 20
    const bandY1 = 30
    const data = new Uint8Array(width * height)
    for (let y = bandY0; y <= bandY1; y += 1) {
      for (let x = 10; x < 90; x += 1) {
        data[y * width + x] = 255
      }
    }
    const maskRle = encodeMaskRle(data, width, height)
    const graph = {
      segments: [
        {
          a: { x: 10, y: 25 },
          b: { x: 90, y: 25 },
          thicknessPxMax: 0,
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
    }
    const measured = measureSegmentThicknessMax({ graph, maskRle })
    const thickness = measured.segments[0]?.thicknessPxMax ?? 0
    const balance = measured.segments[0]?.balancePx ?? 0
    expect(thickness).toBeGreaterThanOrEqual(8)
    expect(thickness).toBeLessThanOrEqual(14)
    expect(balance).toBeGreaterThan(0.45)
    expect(balance).toBeLessThan(0.55)
  })

  it('schat mediane dikte uit ruwe skeleton-segmenten', () => {
    const width = 80
    const height = 40
    const data = new Uint8Array(width * height)
    for (let y = 14; y <= 22; y += 1) {
      for (let x = 5; x < 75; x += 1) data[y * width + x] = 255
    }
    const maskRle = encodeMaskRle(data, width, height)
    const median = estimateMedianThicknessPx({
      maskRle,
      segments: [{ a: { x: 10, y: 18 }, b: { x: 70, y: 18 } }],
    })
    expect(median).toBeGreaterThan(6)
    expect(median).toBeLessThan(14)
  })

  it('past 30px junction-marge toe bij diktemeting', () => {
    const width = 100
    const height = 60
    const data = new Uint8Array(width * height)
    for (let y = 14; y <= 22; y += 1) {
      for (let x = 10; x < 90; x += 1) data[y * width + x] = 255
    }
    const maskRle = encodeMaskRle(data, width, height)
    const segment = {
      a: { x: 10, y: 18 },
      b: { x: 90, y: 18 },
      thicknessPxMax: 0,
    }
    const graph = {
      segments: [segment],
      junctions: [],
      meta: {
        rawJunctionCount: 0,
        semanticJunctionCount: 0,
        cornerClustersMerged: 0,
        collinearSegmentsMerged: 0,
        angleAtLeast25Count: 0,
      },
    }
    const measured = measureSegmentThicknessMax({ graph, maskRle })
    expect(measured.segments[0]?.thicknessPxMax ?? 0).toBeGreaterThanOrEqual(6)
    expect(JUNCTION_THICKNESS_MARGIN_PX).toBe(30)
  })

  it('meet asymmetrische balance op off-center muurband', () => {
    const width = 140
    const height = 80
    const data = new Uint8Array(width * height)
    // a→b naar rechts; inkt loopt verder naar +Y = visueel rechts → balance (links-fractie) laag.
    for (let y = 26; y <= 42; y += 1) {
      for (let x = 15; x < 125; x += 1) data[y * width + x] = 255
    }
    const maskRle = encodeMaskRle(data, width, height)
    const graph = {
      segments: [
        {
          a: { x: 15, y: 30 },
          b: { x: 125, y: 30 },
          thicknessPxMax: 0,
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
    }
    const measured = measureSegmentThicknessMax({ graph, maskRle })
    const balance = measured.segments[0]?.balancePx ?? 0
    expect(balance).toBeGreaterThan(0.15)
    expect(balance).toBeLessThan(0.35)
  })

  it('harmoniseert dikte over collineaire segmenten op één muurlijn', () => {
    const width = 120
    const height = 60
    const data = new Uint8Array(width * height)
    // Eerste helft: smalle band; tweede helft: bredere band op dezelfde centerline.
    for (let y = 23; y <= 27; y += 1) {
      for (let x = 10; x < 55; x += 1) data[y * width + x] = 255
    }
    for (let y = 18; y <= 26; y += 1) {
      for (let x = 55; x < 110; x += 1) data[y * width + x] = 255
    }
    const maskRle = encodeMaskRle(data, width, height)
    const segments = [
      {
        a: { x: 10, y: 25 },
        b: { x: 55, y: 25 },
        thicknessPxMax: 0,
      },
      {
        a: { x: 55, y: 25 },
        b: { x: 110, y: 25 },
        thicknessPxMax: 0,
      },
    ]
    expect(segmentsOnSameWallLine(segments[0], segments[1])).toBe(true)
    expect(groupWallLineIndices(segments)).toEqual([[0, 1]])

    const graph = {
      segments,
      junctions: [],
      meta: {
        rawJunctionCount: 0,
        semanticJunctionCount: 0,
        cornerClustersMerged: 0,
        collinearSegmentsMerged: 0,
        angleAtLeast25Count: 0,
      },
    }
    const measured = measureSegmentThicknessMax({ graph, maskRle })
    const first = measured.segments[0]?.thicknessPxMax ?? 0
    const second = measured.segments[1]?.thicknessPxMax ?? 0
    expect(first).toBe(second)
    expect(second).toBeGreaterThanOrEqual(8)
  })

  it('harmoniseert niet over loodrechte hoeksegmenten', () => {
    const horizontal = {
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      thicknessPxMax: 12,
    }
    const vertical = {
      a: { x: 0, y: 0 },
      b: { x: 0, y: 80 },
      thicknessPxMax: 6,
    }
    expect(segmentsOnSameWallLine(horizontal, vertical)).toBe(false)
    const harmonized = harmonizeThicknessPerWallLine([horizontal, vertical])
    expect(harmonized[0]?.thicknessPxMax).toBe(12)
    expect(harmonized[1]?.thicknessPxMax).toBe(6)
  })

  it('typical (mediaan) negeert knoopblob op T-stub; max blijft hoog', () => {
    const width = 120
    const height = 80
    const data = new Uint8Array(width * height)
    // Horizontale muur y=30..40, x=10..110
    for (let y = 30; y <= 40; y += 1) {
      for (let x = 10; x < 110; x += 1) data[y * width + x] = 255
    }
    // Verticale stub x=55..65, y=40..70 — T-knoop maakt dikke blob
    for (let y = 40; y <= 70; y += 1) {
      for (let x = 55; x <= 65; x += 1) data[y * width + x] = 255
    }
    const maskRle = encodeMaskRle(data, width, height)
    // Korte stub die in de T-knoop eindigt (zou zonder kern-trim max oppikken)
    const graph = {
      segments: [
        {
          a: { x: 60, y: 42 },
          b: { x: 60, y: 68 },
          thicknessPxMax: 0,
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
    }
    const measured = measureSegmentThicknessMax({ graph, maskRle })
    const typical = measured.segments[0]?.thicknessPxTypical ?? 0
    const max = measured.segments[0]?.thicknessPxMax ?? 0
    // Stub-breedte ~10px; typical moet dichtbij blijven, max mag knoopblob meenemen.
    expect(typical).toBeGreaterThanOrEqual(8)
    expect(typical).toBeLessThanOrEqual(14)
    expect(max).toBeGreaterThanOrEqual(typical)
  })

  it('typical negeert schuine-gevelhoek-blob; max explodeert', () => {
    const width = 200
    const height = 100
    const data = new Uint8Array(width * height)
    // Horizontale band y=40..52, x=10..160 (dikte ~12)
    for (let y = 40; y <= 52; y += 1) {
      for (let x = 10; x <= 160; x += 1) data[y * width + x] = 255
    }
    // Grote blob bij x≈140 (binnen sample-venster na 30px trim van x=160)
    for (let y = 20; y <= 72; y += 1) {
      for (let x = 125; x <= 155; x += 1) {
        if ((x - 140) * (x - 140) + (y - 46) * (y - 46) < 26 * 26) {
          data[y * width + x] = 255
        }
      }
    }
    const maskRle = encodeMaskRle(data, width, height)
    const graph = {
      segments: [
        {
          a: { x: 20, y: 46 },
          b: { x: 160, y: 46 },
          thicknessPxMax: 0,
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
    }
    const measured = measureSegmentThicknessMax({
      graph,
      maskRle,
      referenceWallThicknessPx: 30,
    })
    const typical = measured.segments[0]?.thicknessPxTypical ?? 0
    const max = measured.segments[0]?.thicknessPxMax ?? 0
    const p90 = measured.segments[0]?.thicknessPxP90 ?? 0
    expect(typical).toBeGreaterThanOrEqual(10)
    expect(typical).toBeLessThanOrEqual(16)
    expect(max).toBeGreaterThan(typical)
    expect(p90).toBeGreaterThanOrEqual(typical)
  })

  it('korte stub gebruikt kern-sampling i.p.v. volle knoopmeting', () => {
    const width = 80
    const height = 80
    const data = new Uint8Array(width * height)
    // Dunne verticale muur x=35..41
    for (let y = 10; y < 70; y += 1) {
      for (let x = 35; x <= 41; x += 1) data[y * width + x] = 255
    }
    // Dikke horizontale blob bij y=10 (knoop)
    for (let y = 5; y <= 25; y += 1) {
      for (let x = 20; x <= 55; x += 1) data[y * width + x] = 255
    }
    const maskRle = encodeMaskRle(data, width, height)
    // Segment korter dan 2×marge → vroeger: geen trim → max=blob
    const graph = {
      segments: [
        {
          a: { x: 38, y: 10 },
          b: { x: 38, y: 50 },
          thicknessPxMax: 0,
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
    }
    const measured = measureSegmentThicknessMax({
      graph,
      maskRle,
      referenceWallThicknessPx: 30,
    })
    const typical = measured.segments[0]?.thicknessPxTypical ?? 0
    expect(typical).toBeGreaterThanOrEqual(4)
    expect(typical).toBeLessThanOrEqual(10)
  })
})
