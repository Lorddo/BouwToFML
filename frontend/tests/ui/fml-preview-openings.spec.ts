import { describe, expect, it } from 'vitest'
import {
  addOpeningToWall,
  buildWindowOpeningId,
  findOpeningById,
  projectPointToWallT,
  updateOpeningById,
} from '@/ui/components/fml-preview-openings'

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
  it('adds an opening with guid and clamps t by opening width', () => {
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
    expect(next[0]?.openings[0]?.t).toBeCloseTo(0.4, 6)
    expect(next[0]?.openings[0]?.z_height).toBe(220)
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
})
