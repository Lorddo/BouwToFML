import { describe, expect, it } from 'vitest'
import {
  addOpeningToWall,
  buildWindowOpeningId,
  clampOpeningHeight,
  findOpeningById,
  projectPointToWallT,
  updateOpeningById,
} from '@/ui/components/fml-preview-openings'
import {
  BOVENLICHT_MARKER_STROKE,
  BOVENLICHT_MARKER_STROKE_PX,
} from '@/ui/composables/fml-preview/fml-preview-opening-render'

describe('projectPointToWallT', () => {
  it('projects a point onto wall centerline with clamp 0..1', () => {
    const wall = {
      id: 'w1',
      a: { x: 10, y: 10 },
      b: { x: 110, y: 10 },
      thickness: 20,
      openings: [],
    }
    expect(projectPointToWallT(wall, { x: 60, y: 25 })).toBeCloseTo(0.5, 6)
    expect(projectPointToWallT(wall, { x: -40, y: 10 })).toBe(0)
    expect(projectPointToWallT(wall, { x: 200, y: 10 })).toBe(1)
  })
})

describe('addOpeningToWall', () => {
  it('adds an opening with guid and clamps t tot de buitenkant (halve muurdikte)', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]

    const next = addOpeningToWall(walls, 'w1', {
      type: 'door',
      refid: 'door-ref',
      t: 0.1,
      width: 80,
    })

    expect(walls[0]?.openings).toHaveLength(0)
    expect(next[0]?.openings).toHaveLength(1)
    expect(next[0]?.openings[0]?.guid).toBeTruthy()
    expect(next[0]?.openings[0]?.t).toBeCloseTo(0.3, 6)
    expect(next[0]?.openings[0]?.z_height).toBe(220)
  })

  it('laat een raam op een collineaire splitsing staan', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 200, y: 0 },
        thickness: 20,
        openings: [],
      },
      {
        id: 'w2',
        a: { x: 200, y: 0 },
        b: { x: 400, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const next = addOpeningToWall(walls, 'w1', {
      type: 'window',
      refid: 'window-ref',
      t: 1,
      width: 80,
    })
    expect(next[0]?.openings[0]?.t).toBeCloseTo(1, 6)
    expect(next[0]?.openings[0]?.width).toBe(80)
  })

  it('adds a window with default sill z and glass height', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 200, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]

    const next = addOpeningToWall(walls, 'w1', {
      type: 'window',
      refid: 'window-ref',
      t: 0.5,
      width: 100,
    })

    const opening = next[0]?.openings[0]
    expect(opening?.type).toBe('window')
    expect(opening?.z).toBe(70)
    expect(opening?.z_height).toBe(150)
    const id = buildWindowOpeningId('w1', opening, 0)
    expect(findOpeningById(next, id)?.opening.width).toBe(100)
  })
})

describe('updateOpeningById', () => {
  it('updates window sill z and glass height', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 200, y: 0 },
        thickness: 20,
        openings: [
          {
            type: 'window' as const,
            refid: 'window-ref',
            t: 0.5,
            width: 100,
            z: 70,
            z_height: 150,
            guid: 'win-1',
          },
        ],
      },
    ]
    const id = 'w1-window-win-1'
    const next = updateOpeningById(walls, id, { z: 90, z_height: 120, width: 110 })
    expect(next[0]?.openings[0]?.z).toBe(90)
    expect(next[0]?.openings[0]?.z_height).toBe(120)
    expect(next[0]?.openings[0]?.width).toBe(110)
  })

  it('patches per-opening bovenlicht height and gap', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 200, y: 0 },
        thickness: 20,
        openings: [
          {
            type: 'door' as const,
            refid: 'door-ref',
            t: 0.5,
            width: 90,
            z_height: 220,
            guid: 'door-1',
          },
        ],
      },
    ]
    const id = 'w1-door-door-1'
    const next = updateOpeningById(walls, id, {
      bovenlichtHeightCm: 25.4,
      bovenlichtGapCm: 0,
    })
    expect(next[0]?.openings[0]?.bovenlichtHeightCm).toBe(25)
    expect(next[0]?.openings[0]?.bovenlichtGapCm).toBe(0)
  })

  it('houdt een 10 cm-raamhoogte bij breedte-wijziging', () => {
    expect(clampOpeningHeight(10, 'window')).toBe(10)
    expect(clampOpeningHeight(9, 'window')).toBe(10)
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 200, y: 0 },
        thickness: 20,
        openings: [
          {
            type: 'window' as const,
            refid: 'window-ref',
            t: 0.5,
            width: 100,
            z: 220,
            z_height: 10,
            guid: 'win-low',
          },
        ],
      },
    ]
    const next = updateOpeningById(walls, 'w1-window-win-low', { width: 140, z_height: 10 })
    expect(next[0]?.openings[0]?.width).toBe(140)
    expect(next[0]?.openings[0]?.z_height).toBe(10)
  })

  it('schrijft mirrored ook op een raam (driehoek)', () => {
    const walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 200, y: 0 },
        thickness: 20,
        openings: [
          {
            type: 'window' as const,
            refid: 'window-ref',
            t: 0.5,
            width: 110,
            z: 70,
            z_height: 110,
            guid: 'win-tri',
          },
        ],
      },
    ]
    const next = updateOpeningById(walls, 'w1-window-win-tri', { mirrored: [1, 0] })
    expect(next[0]?.openings[0]?.mirrored).toEqual([1, 0])
  })
})

describe('bovenlicht marker constants', () => {
  it('houdt 3 px hartlijn-stroke voor preview-hint', () => {
    expect(BOVENLICHT_MARKER_STROKE_PX).toBe(3)
    expect(BOVENLICHT_MARKER_STROKE).toMatch(/^#/)
  })
})
