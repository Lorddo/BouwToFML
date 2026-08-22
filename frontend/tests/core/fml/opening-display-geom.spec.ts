import { describe, expect, it } from 'vitest'
import {
  BTF_FRAME_EXTRA,
  clampFramePair,
  insetOpeningRect,
  resolveOpeningFrame,
} from '@/core/fml/opening-display-geom'
import {
  elevationOpeningHolePoints,
  glyphFromElevationRect,
} from '@/core/fml/elevation-opening-symbol'
import { defaultOpeningFrame, resolveOpeningCatalog } from '@/core/fml/opening-refid-catalog'
import {
  ARCHWAY_DOOR_REFID,
  CONCEPT_DOOR_REFID,
  CONCEPT_WINDOW_REFID,
  PASSAGE_DOOR_REFID,
  WINDOW_BLIND_REFID,
  WINDOW_DOUBLE_REFID,
  WINDOW_HALF_ROUND_REFID,
  WINDOW_TRIANGLE_REFID,
  WINDOW_TRIPLE_REFID,
} from '@/core/fml/types'

describe('opening-display-geom', () => {
  it('kind-defaults: draaideur dorpel 0, schuif 5, passage 0, raam 5 rondom', () => {
    const door = resolveOpeningCatalog(CONCEPT_DOOR_REFID, 'door')
    expect(door.swingInsetCm).toBe(5)
    expect(door.frame).toEqual({ leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 0 })

    const sliding = resolveOpeningCatalog('1cdb4e6092e998630e7881667f2ddedafa3b0eb9', 'door')
    expect(sliding.swingInsetCm).toBe(0)
    expect(sliding.frame.leftCm).toBe(5)
    expect(sliding.frame.bottomCm).toBe(0)

    expect(resolveOpeningCatalog('deadbeef', 'window').frame).toEqual({
      leftCm: 5,
      rightCm: 5,
      topCm: 5,
      bottomCm: 5,
    })
  })

  it('passage kind heeft geen kozijn', () => {
    expect(defaultOpeningFrame('door', 'passage')).toEqual({
      leftCm: 0,
      rightCm: 0,
      topCm: 0,
      bottomCm: 0,
    })
    expect(defaultOpeningFrame('door', 'archway')).toEqual({
      leftCm: 0,
      rightCm: 0,
      topCm: 0,
      bottomCm: 0,
    })
  })

  it('leaf: dubbel glas vs vol, garage paneled, concept-raam glass', () => {
    expect(resolveOpeningCatalog('5ae0ee3c682e32c8c7ac15a6136d692df5737b22', 'door').leaf).toBe(
      'glass',
    )
    expect(resolveOpeningCatalog('9c1479d9dfc482859aea10b9dd67f5e7773fff6d', 'door').leaf).toBe(
      'solid',
    )
    expect(resolveOpeningCatalog('37bb0bbe45ba0a5efda34f3f1e0b7ace63084e7f', 'door').leaf).toBe(
      'paneled',
    )
    expect(resolveOpeningCatalog('df95e84f01163fe9983d43d088551813e40e3e2f', 'door').leaf).toBe(
      'solid',
    )
    expect(resolveOpeningCatalog(CONCEPT_WINDOW_REFID, 'window').leaf).toBe('glass')
  })

  it('clamp: 8 cm hoog raam + 5+5 → inner 1 cm', () => {
    const inset = insetOpeningRect(
      { width: 100, height: 8 },
      { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 },
    )
    expect(inset.inner.height).toBeCloseTo(1, 5)
    expect(inset.frame.topCm + inset.frame.bottomCm).toBeCloseTo(7, 5)
    expect(inset.inner.width).toBeCloseTo(90, 5)
  })

  it('clampFramePair: te smal → geen kozijn', () => {
    expect(clampFramePair(5, 5, 0.5)).toEqual([0, 0])
  })

  it('extras.btfFrame wint van catalogus', () => {
    const catalog = resolveOpeningCatalog(CONCEPT_WINDOW_REFID, 'window')
    const frame = resolveOpeningFrame(
      { extras: { [BTF_FRAME_EXTRA]: { leftCm: 8, rightCm: 8, topCm: 3, bottomCm: 3 } } },
      catalog,
    )
    expect(frame).toEqual({ leftCm: 8, rightCm: 8, topCm: 3, bottomCm: 3 })
  })
})

describe('elevation opening glyph', () => {
  it('bovenlicht-refid = concept-raam; inner kleiner dan outer bij 5 cm', () => {
    const glyph = glyphFromElevationRect({
      x0: 0,
      x1: 100,
      y0: -40,
      y1: 0,
      type: 'window',
      refid: CONCEPT_WINDOW_REFID,
      widthCm: 100,
    })
    expect(glyph.inner.x0).toBeCloseTo(5, 5)
    expect(glyph.inner.x1).toBeCloseTo(95, 5)
    expect(glyph.inner.y0).toBeCloseTo(-35, 5)
    expect(glyph.inner.y1).toBeCloseTo(-5, 5)
    expect(glyph.polys.some((poly) => poly.role === 'frame')).toBe(true)
    expect(glyph.polys.some((poly) => poly.role === 'glass')).toBe(true)
  })

  it('dubbel/driedelig raam heeft tussenstijl als kozijnband', () => {
    const double = glyphFromElevationRect({
      x0: 0,
      x1: 200,
      y0: -140,
      y1: 0,
      type: 'window',
      refid: WINDOW_DOUBLE_REFID,
      widthCm: 200,
    })
    const isTallStile = (poly: { role: string; points: number[] }, cx: number) => {
      if (poly.role !== 'frame' || poly.points.length !== 8) return false
      const xs = [poly.points[0], poly.points[2], poly.points[4], poly.points[6]]
      const ys = [poly.points[1], poly.points[3], poly.points[5], poly.points[7]]
      const mid = (Math.min(...xs) + Math.max(...xs)) / 2
      const w = Math.max(...xs) - Math.min(...xs)
      const h = Math.max(...ys) - Math.min(...ys)
      return w < 16 && h > 80 && Math.abs(mid - cx) < 8
    }
    expect(double.polys.some((poly) => isTallStile(poly, 100))).toBe(true)

    const triple = glyphFromElevationRect({
      x0: 0,
      x1: 240,
      y0: -140,
      y1: 0,
      type: 'window',
      refid: WINDOW_TRIPLE_REFID,
      widthCm: 240,
    })
    expect(triple.polys.some((poly) => isTallStile(poly, 80))).toBe(true)
    expect(triple.polys.some((poly) => isTallStile(poly, 160))).toBe(true)
  })

  it('half-rond: boog vult het vak omhoog, geen punten buiten de AABB', () => {
    const outer = { x0: 0, x1: 120, y0: -80, y1: 0 }
    const glyph = glyphFromElevationRect({
      ...outer,
      type: 'window',
      refid: WINDOW_HALF_ROUND_REFID,
      widthCm: 120,
    })
    const glass = glyph.polys.find((poly) => poly.role === 'glass')
    expect(glass).toBeTruthy()
    const ys = glass!.points.filter((_, i) => i % 2 === 1)
    const xs = glass!.points.filter((_, i) => i % 2 === 0)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(outer.y0 - 0.5)
    expect(Math.max(...ys)).toBeLessThanOrEqual(outer.y1 + 0.5)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(outer.x0 - 0.5)
    expect(Math.max(...xs)).toBeLessThanOrEqual(outer.x1 + 0.5)
    expect(Math.min(...ys)).toBeLessThan(outer.y0 + 12)
  })

  it('passage heeft geen frame-polys', () => {
    const glyph = glyphFromElevationRect({
      x0: 0,
      x1: 90,
      y0: -220,
      y1: 0,
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      widthCm: 90,
    })
    expect(glyph.polys.some((poly) => poly.role === 'hinge')).toBe(true)
  })

  it('entryway is frameless rechthoek; archway is frameless met booggat', () => {
    const entry = glyphFromElevationRect({
      x0: 0,
      x1: 90,
      y0: -220,
      y1: 0,
      type: 'door',
      refid: PASSAGE_DOOR_REFID,
      widthCm: 90,
    })
    expect(entry.polys).toHaveLength(0)
    const arch = glyphFromElevationRect({
      x0: 0,
      x1: 90,
      y0: -220,
      y1: 0,
      type: 'door',
      refid: ARCHWAY_DOOR_REFID,
      widthCm: 90,
    })
    expect(arch.polys).toHaveLength(0)
    const hole = elevationOpeningHolePoints(
      { x0: 0, y0: -220, x1: 90, y1: 0 },
      'door',
      ARCHWAY_DOOR_REFID,
    )
    expect(hole.length).toBeGreaterThan(4)
    const ys = hole.map((p) => p.y)
    expect(Math.min(...ys)).toBeCloseTo(-220, 0)
  })

  it('driehoekraam heeft driehoek-frame + glas; blind is solid blad', () => {
    const triangle = glyphFromElevationRect({
      x0: 0,
      x1: 110,
      y0: -110,
      y1: 0,
      type: 'window',
      refid: WINDOW_TRIANGLE_REFID,
      widthCm: 110,
    })
    expect(triangle.polys.some((poly) => poly.role === 'frame')).toBe(true)
    expect(triangle.polys.some((poly) => poly.role === 'glass')).toBe(true)
    const glass = triangle.polys.find((poly) => poly.role === 'glass')!
    expect(glass.points.length).toBe(6)
    const apexX = (glyph: ReturnType<typeof glyphFromElevationRect>) => {
      const pts = glyph.polys.find((poly) => poly.role === 'glass')!.points
      let bestX = 0
      let bestY = Infinity
      for (let i = 0; i < pts.length; i += 2) {
        const y = pts[i + 1] ?? Infinity
        if (y < bestY) {
          bestY = y
          bestX = pts[i] ?? 0
        }
      }
      return bestX
    }
    expect(apexX(triangle)).toBeLessThan(55)
    const flipped = glyphFromElevationRect({
      x0: 0,
      x1: 110,
      y0: -110,
      y1: 0,
      type: 'window',
      refid: WINDOW_TRIANGLE_REFID,
      widthCm: 110,
      mirrored: [1, 0],
    })
    expect(apexX(flipped)).toBeGreaterThan(55)
    const hole = elevationOpeningHolePoints(
      { x0: 0, y0: -110, x1: 110, y1: 0 },
      'window',
      WINDOW_TRIANGLE_REFID,
    )
    expect(hole).toHaveLength(3)
    expect(hole.some((p) => p.x === 0 && p.y === -110)).toBe(true)
    const holeFlip = elevationOpeningHolePoints(
      { x0: 0, y0: -110, x1: 110, y1: 0 },
      'window',
      WINDOW_TRIANGLE_REFID,
      { mirrored: [1, 0] },
    )
    expect(holeFlip.some((p) => p.x === 110 && p.y === -110)).toBe(true)

    const blind = glyphFromElevationRect({
      x0: 0,
      x1: 110,
      y0: -150,
      y1: 0,
      type: 'window',
      refid: WINDOW_BLIND_REFID,
      widthCm: 110,
    })
    expect(blind.polys.some((poly) => poly.role === 'frame')).toBe(true)
    expect(blind.polys.some((poly) => poly.role === 'leaf')).toBe(true)
    expect(blind.polys.some((poly) => poly.role === 'glass')).toBe(false)
  })
})
