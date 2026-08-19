import { describe, expect, it } from 'vitest'
import { scaleFloorPlan, scaleUnderlayLayout } from '@/core/fml/scale-floor-plan'
import type { FloorPlan } from '@/core/fml/types'
import {
  fmlRescaleStateFromImageHandles,
  initFmlRescaleStateFromWalls,
  resolveFmlRescaleState,
  resolveRescaleFactorsFromRulers,
  resolveRescaleGeometryFactor,
  scaleNulpuntImageCm,
} from '@/ui/composables/workspace/fml-rescale-from-measure'

describe('fml-rescale-from-measure', () => {
  it('berekent geometryFactor = true / measured', () => {
    expect(resolveRescaleGeometryFactor(100, 102)).toBeCloseTo(1.02)
  })

  it('weigerte korte maatlijn (< 50 cm)', () => {
    expect(resolveRescaleGeometryFactor(49, 50)).toBeNull()
  })

  it('weigerfactor buiten [0.5, 2]', () => {
    expect(resolveRescaleGeometryFactor(100, 250)).toBeNull()
    expect(resolveRescaleGeometryFactor(100, 40)).toBeNull()
  })

  it('weigerfactor ≈ 1 (no-op)', () => {
    expect(resolveRescaleGeometryFactor(100, 100)).toBeNull()
  })

  it('aparte H/V-factoren uit linialen (mm → cm)', () => {
    expect(
      resolveRescaleFactorsFromRulers({
        measuredCmX: 100,
        measuredCmY: 100,
        trueMmX: 1100,
        trueMmY: 1000,
      }),
    ).toEqual({ x: 1.1, y: 1 })
    expect(
      resolveRescaleFactorsFromRulers({
        measuredCmX: 100,
        measuredCmY: 100,
        trueMmX: 1000,
        trueMmY: 1000,
      }),
    ).toBeNull()
  })

  it('weiger Herschalen als één as < 50 cm', () => {
    expect(
      resolveRescaleFactorsFromRulers({
        measuredCmX: 49,
        measuredCmY: 100,
        trueMmX: 500,
        trueMmY: 1000,
      }),
    ).toBeNull()
  })

  it('init linialen binnen muur-bbox', () => {
    const state = initFmlRescaleStateFromWalls([
      { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } },
      { a: { x: 1000, y: 0 }, b: { x: 1000, y: 800 } },
    ])
    expect(state).not.toBeNull()
    expect(state!.xLeft).toBeGreaterThan(0)
    expect(state!.xRight).toBeLessThan(1000)
    expect(state!.yTop).toBeGreaterThan(0)
    expect(state!.yBottom).toBeLessThan(800)
  })

  it('zet stap-1 pixel-handles om naar FML-cm via layout', () => {
    const state = fmlRescaleStateFromImageHandles(
      {
        xLeft: 200,
        xRight: 1200,
        xGuideY: 400,
        yTop: 100,
        yBottom: 900,
        yGuideX: 500,
      },
      { origin: { x: 10, y: 20 }, pxPerMmX: 2, pxPerMmY: 4 },
    )
    expect(state).toEqual({
      xLeft: 200 / 20 - 10,
      xRight: 1200 / 20 - 10,
      xGuideY: 400 / 40 - 20,
      yTop: 100 / 40 - 20,
      yBottom: 900 / 40 - 20,
      yGuideX: 500 / 20 - 10,
    })
  })

  it('nulpunt verschuift FML-getallen, niet de scan-plek', () => {
    const handles = {
      xLeft: 300,
      xRight: 800,
      xGuideY: 250,
      yTop: 50,
      yBottom: 450,
      yGuideX: 400,
    }
    const before = fmlRescaleStateFromImageHandles(handles, {
      origin: { x: 0, y: 0 },
      pxPerMmX: 1,
      pxPerMmY: 1,
    })!
    const afterNulpunt = fmlRescaleStateFromImageHandles(handles, {
      origin: { x: 15, y: 8 },
      pxPerMmX: 1,
      pxPerMmY: 1,
    })!
    expect(afterNulpunt.xLeft).toBeCloseTo(before.xLeft - 15)
    expect(afterNulpunt.xRight).toBeCloseTo(before.xRight - 15)
    expect(afterNulpunt.yTop).toBeCloseTo(before.yTop - 8)
    expect(afterNulpunt.yBottom).toBeCloseTo(before.yBottom - 8)
    expect(afterNulpunt.xLeft + 15).toBeCloseTo(before.xLeft)
    expect(afterNulpunt.yTop + 8).toBeCloseTo(before.yTop)
  })

  it('weiger omzetting zonder geldige px/mm', () => {
    expect(
      fmlRescaleStateFromImageHandles(
        {
          xLeft: 0,
          xRight: 10,
          xGuideY: 0,
          yTop: 0,
          yBottom: 10,
          yGuideX: 0,
        },
        { origin: { x: 0, y: 0 }, pxPerMmX: 0, pxPerMmY: 1 },
      ),
    ).toBeNull()
  })

  it('resolve: stap-1 handles winnen van muur-bbox', () => {
    const fromStep1 = resolveFmlRescaleState({
      walls: [
        { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } },
        { a: { x: 1000, y: 0 }, b: { x: 1000, y: 800 } },
      ],
      imageState: {
        xLeft: 100,
        xRight: 300,
        xGuideY: 50,
        yTop: 20,
        yBottom: 80,
        yGuideX: 40,
      },
      layout: { origin: { x: 0, y: 0 }, pxPerMmX: 1, pxPerMmY: 1 },
    })
    expect(fromStep1).toEqual({
      xLeft: 10,
      xRight: 30,
      xGuideY: 5,
      yTop: 2,
      yBottom: 8,
      yGuideX: 4,
    })
  })

  it('resolve: bbox-fallback zonder stap-1 state', () => {
    const walls = [
      { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } },
      { a: { x: 1000, y: 0 }, b: { x: 1000, y: 800 } },
    ]
    expect(resolveFmlRescaleState({ walls, imageState: null, layout: null })).toEqual(
      initFmlRescaleStateFromWalls(walls),
    )
  })

  it('schaalt nulpuntImageCm anisotroop', () => {
    expect(scaleNulpuntImageCm({ x: 120, y: -40 }, { x: 1.02, y: 1.1 })).toEqual({
      x: 122.4,
      y: -44,
    })
  })
})

describe('scaleFloorPlan', () => {
  it('schaalt geometry; houdt muurdikte, z en t', () => {
    const plan: FloorPlan = {
      name: 't',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'w1',
              a: { x: 0, y: 0 },
              b: { x: 1000, y: 0 },
              thickness: 10,
              openings: [
                {
                  refid: 'door',
                  t: 0.5,
                  width: 90,
                  type: 'door',
                  z: 0,
                  z_height: 220,
                },
              ],
            },
          ],
        },
      ],
    }
    const scaled = scaleFloorPlan(plan, 1.1, 0)
    const wall = scaled.floors[0].walls[0]
    expect(wall.b.x).toBeCloseTo(1100)
    expect(wall.thickness).toBe(10)
    expect(wall.openings[0].width).toBeCloseTo(99)
    expect(wall.openings[0].t).toBe(0.5)
    expect(wall.openings[0].z_height).toBe(220)
    expect(scaled.floors[0].height).toBe(280)
  })

  it('schaalt H en V onafhankelijk; dikte blijft', () => {
    const plan: FloorPlan = {
      name: 't',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'h',
              a: { x: 0, y: 0 },
              b: { x: 1000, y: 0 },
              thickness: 12,
              openings: [],
            },
            {
              id: 'v',
              a: { x: 0, y: 0 },
              b: { x: 0, y: 800 },
              thickness: 15,
              openings: [
                {
                  refid: 'door',
                  t: 0.5,
                  width: 80,
                  type: 'door',
                  z: 0,
                  z_height: 220,
                },
              ],
            },
          ],
        },
      ],
    }
    const scaled = scaleFloorPlan(plan, { x: 1, y: 1.25 }, 0)
    const h = scaled.floors[0].walls.find((w) => w.id === 'h')!
    const v = scaled.floors[0].walls.find((w) => w.id === 'v')!
    expect(h.b.x).toBeCloseTo(1000)
    expect(h.thickness).toBe(12)
    expect(v.b.y).toBeCloseTo(1000)
    expect(v.thickness).toBe(15)
    expect(v.openings[0].width).toBeCloseTo(100)
  })

  it('schaalt underlay origin en px/mm per as', () => {
    const layout = scaleUnderlayLayout(
      { origin: { x: 100, y: 50 }, pxPerMmX: 0.2, pxPerMmY: 0.3 },
      { x: 1.1, y: 1.25 },
    )
    expect(layout.origin.x).toBeCloseTo(110)
    expect(layout.origin.y).toBeCloseTo(62.5)
    expect(layout.pxPerMmX).toBeCloseTo(0.2 / 1.1)
    expect(layout.pxPerMmY).toBeCloseTo(0.3 / 1.25)
  })
})
