import { describe, expect, it } from 'vitest'
import {
  buildOpeningFramePatch,
  buildSkylightFramePatch,
  clampFramePair,
  effectiveSkylightFrame,
  insetOpeningRect,
  resolveOpeningFrame,
} from '@/core/plan/opening-display-geom'
import {
  elevationOpeningHolePoints,
  glyphFromElevationRect,
} from '@/core/plan/elevation-opening-symbol'
import { defaultOpeningFrame, resolveOpeningCatalog } from '@/core/plan/opening-refid-catalog'

describe('opening-display-geom', () => {
  it('kind-defaults: draaideur dorpel 0, schuif 5, passage 0, raam 5 rondom', () => {
    const door = resolveOpeningCatalog('door.single', 'door')
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
    expect(resolveOpeningCatalog('window.single', 'window').leaf).toBe('glass')
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

  it('zonder frame valt terug op catalogus', () => {
    const catalog = resolveOpeningCatalog('window.single', 'window')
    const frame = resolveOpeningFrame({}, catalog)
    expect(frame).toEqual(catalog.frame)
  })

  it('opening.frame wint van catalogus', () => {
    const catalog = resolveOpeningCatalog('window.single', 'window')
    const frame = resolveOpeningFrame(
      {
        frame: { leftCm: 9, rightCm: 9, topCm: 2, bottomCm: 2 },
      },
      catalog,
    )
    expect(frame).toEqual({ leftCm: 9, rightCm: 9, topCm: 2, bottomCm: 2 })
  })

  it('buildOpeningFramePatch schrijft alle vier en clampt binnenwerk ≥ 1 cm', () => {
    const patched = buildOpeningFramePatch(
      {
        kind: 'window.single',
        width: 100,
        z_height: 8,
        type: 'window',
      },
      { topCm: 5 },
    )
    expect(patched.leftCm).toBeGreaterThanOrEqual(0)
    expect(patched.rightCm).toBeGreaterThanOrEqual(0)
    expect(patched.topCm).toBeGreaterThanOrEqual(0)
    expect(patched.bottomCm).toBeGreaterThanOrEqual(0)
    const inset = insetOpeningRect({ width: 100, height: 8 }, patched)
    expect(inset.inner.height).toBeGreaterThanOrEqual(1)
    expect(inset.inner.width).toBeGreaterThanOrEqual(1)
  })

  it('dakraam zonder frame valt terug op 5 cm rondom', () => {
    expect(effectiveSkylightFrame({})).toEqual({
      leftCm: 5,
      rightCm: 5,
      topCm: 5,
      bottomCm: 5,
    })
  })

  it('buildSkylightFramePatch schrijft instance en clampt binnenwerk', () => {
    const patched = buildSkylightFramePatch(
      { width: 80, height: 8, frame: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 } },
      { topCm: 6 },
    )
    expect(patched.topCm + patched.bottomCm).toBeLessThanOrEqual(7)
    expect(patched.leftCm).toBe(5)
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
      kind: 'window.single',
      widthCm: 100,
    })
    expect(glyph.inner.x0).toBeCloseTo(5, 5)
    expect(glyph.inner.x1).toBeCloseTo(95, 5)
    expect(glyph.inner.y0).toBeCloseTo(-35, 5)
    expect(glyph.inner.y1).toBeCloseTo(-5, 5)
    expect(glyph.polys.some((poly) => poly.role === 'frame')).toBe(true)
    expect(glyph.polys.some((poly) => poly.role === 'glass')).toBe(true)
  })

  it('typed opening.frame wint van catalogus-5 (20/20/20/100)', () => {
    const glyph = glyphFromElevationRect({
      x0: 0,
      x1: 200,
      y0: -200,
      y1: 0,
      type: 'window',
      kind: 'window.single',
      widthCm: 200,
      frame: { leftCm: 20, rightCm: 20, topCm: 20, bottomCm: 100 },
    })
    expect(glyph.inner.x0).toBeCloseTo(20, 5)
    expect(glyph.inner.x1).toBeCloseTo(180, 5)
    expect(glyph.inner.y0).toBeCloseTo(-180, 5)
    expect(glyph.inner.y1).toBeCloseTo(-100, 5)
  })

  it('dubbel/driedelig raam heeft tussenstijl als kozijnband', () => {
    const double = glyphFromElevationRect({
      x0: 0,
      x1: 200,
      y0: -140,
      y1: 0,
      type: 'window',
      kind: 'window.double',
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
      kind: 'window.triple',
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
      kind: 'window.half_round',
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
    const hole = elevationOpeningHolePoints(outer, 'window', 'window.half_round')
    expect(hole.length).toBeGreaterThan(4)
    expect(Math.min(...hole.map((p) => p.y))).toBeCloseTo(outer.y0, 0)
    expect(Math.max(...hole.map((p) => p.y))).toBeCloseTo(outer.y1, 0)
  })

  it('rond raam heeft cirkel-gat, geen rechthoek', () => {
    const hole = elevationOpeningHolePoints(
      { x0: 0, y0: -100, x1: 100, y1: 0 },
      'window',
      'window.round',
    )
    expect(hole.length).toBeGreaterThan(8)
    const xs = hole.map((p) => p.x)
    const ys = hole.map((p) => p.y)
    expect(Math.min(...xs)).toBeCloseTo(0, 0)
    expect(Math.max(...xs)).toBeCloseTo(100, 0)
    expect(Math.min(...ys)).toBeCloseTo(-100, 0)
    expect(Math.max(...ys)).toBeCloseTo(0, 0)
  })

  it('passage heeft geen frame-polys', () => {
    const glyph = glyphFromElevationRect({
      x0: 0,
      x1: 90,
      y0: -220,
      y1: 0,
      type: 'door',
      kind: 'door.single',
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
      kind: 'door.passage',
      widthCm: 90,
    })
    expect(entry.polys).toHaveLength(0)
    const arch = glyphFromElevationRect({
      x0: 0,
      x1: 90,
      y0: -220,
      y1: 0,
      type: 'door',
      kind: 'door.archway',
      widthCm: 90,
    })
    expect(arch.polys).toHaveLength(0)
    const hole = elevationOpeningHolePoints(
      { x0: 0, y0: -220, x1: 90, y1: 0 },
      'door',
      'door.archway',
    )
    expect(hole.length).toBeGreaterThan(4)
    const ys = hole.map((p) => p.y)
    expect(Math.min(...ys)).toBeCloseTo(-220, 0)
    const roundHole = elevationOpeningHolePoints(
      { x0: 0, y0: -180, x1: 180, y1: 0 },
      'door',
      'door.round',
    )
    expect(roundHole.length).toBeGreaterThan(8)
  })

  it('driehoekraam heeft driehoek-frame + glas; blind is solid blad', () => {
    const triangle = glyphFromElevationRect({
      x0: 0,
      x1: 110,
      y0: -110,
      y1: 0,
      type: 'window',
      kind: 'window.triangle',
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
      kind: 'window.triangle',
      widthCm: 110,
      mirrored: [1, 0],
    })
    expect(apexX(flipped)).toBeGreaterThan(55)
    const hole = elevationOpeningHolePoints(
      { x0: 0, y0: -110, x1: 110, y1: 0 },
      'window',
      'window.triangle',
    )
    expect(hole).toHaveLength(3)
    expect(hole.some((p) => p.x === 0 && p.y === -110)).toBe(true)
    const holeFlip = elevationOpeningHolePoints(
      { x0: 0, y0: -110, x1: 110, y1: 0 },
      'window',
      'window.triangle',
      { mirrored: [1, 0] },
    )
    expect(holeFlip.some((p) => p.x === 110 && p.y === -110)).toBe(true)

    const blind = glyphFromElevationRect({
      x0: 0,
      x1: 110,
      y0: -150,
      y1: 0,
      type: 'window',
      kind: 'window.blind',
      widthCm: 110,
    })
    expect(blind.polys.some((poly) => poly.role === 'frame')).toBe(true)
    expect(blind.polys.some((poly) => poly.role === 'leaf')).toBe(true)
    expect(blind.polys.some((poly) => poly.role === 'glass')).toBe(false)
  })
})
