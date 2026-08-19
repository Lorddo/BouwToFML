import { describe, expect, it } from 'vitest'
import {
  clampWallBalance,
  floorplannerLeftNormal,
  wallFaces,
  wallLeftNormal,
  wallVisualMid,
} from '@/core/fml/fml-wall-geom'

describe('floorplannerLeftNormal', () => {
  it('is visual left in Y-down for each cardinal a→b', () => {
    const cases: Array<{ dir: { x: number; y: number }; left: { x: number; y: number } }> = [
      { dir: { x: 1, y: 0 }, left: { x: 0, y: -1 } },
      { dir: { x: -1, y: 0 }, left: { x: 0, y: 1 } },
      { dir: { x: 0, y: 1 }, left: { x: 1, y: 0 } },
      { dir: { x: 0, y: -1 }, left: { x: -1, y: 0 } },
    ]
    for (const { dir, left } of cases) {
      const n = floorplannerLeftNormal(dir)
      expect(n.x).toBeCloseTo(left.x, 9)
      expect(n.y).toBeCloseTo(left.y, 9)
    }
  })

  it('is the opposite of the door swing right-normal', () => {
    const dir = { x: 1, y: 0 }
    const left = floorplannerLeftNormal(dir)
    const right = { x: -dir.y, y: dir.x }
    expect(left.x).toBeCloseTo(-right.x, 9)
    expect(left.y).toBeCloseTo(-right.y, 9)
  })

  it('wallLeftNormal matches floorplannerLeftNormal of a→b', () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }
    const n = wallLeftNormal(wall)
    expect(n.x).toBeCloseTo(0, 9)
    expect(n.y).toBeCloseTo(-1, 9)
  })
})

describe('wall balance keep-axis', () => {
  it('wallVisualMid offsets from the centerline along left normal', () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, balance: 0.8 }
    const mid = wallVisualMid(wall, 0.5)
    expect(mid.x).toBeCloseTo(50, 6)
    expect(mid.y).toBeCloseTo(-6, 6)
  })

  it('wallFaces at 0.5 span ±t/2; at 0 the axis is the left face', () => {
    const centered = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 30, balance: 0.5 }
    const faces = wallFaces(centered)
    expect(faces.left.a.y).toBeCloseTo(-15, 6)
    expect(faces.right.a.y).toBeCloseTo(15, 6)

    const flush = { ...centered, balance: 0 }
    const flushFaces = wallFaces(flush)
    expect(flushFaces.left.a.y).toBeCloseTo(0, 6)
    expect(flushFaces.right.a.y).toBeCloseTo(30, 6)
  })

  it('allows Floorplanner overshoot beyond 0–1 (clamped at ±1000%)', () => {
    expect(clampWallBalance(-2.5)).toBeCloseTo(-2.5, 6)
    expect(clampWallBalance(10)).toBe(10)
    expect(clampWallBalance(12)).toBe(10)
    expect(clampWallBalance(undefined)).toBe(0.5)

    const overshoot = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, balance: -2.5 }
    const faces = wallFaces(overshoot)
    expect(faces.left.a.y).toBeCloseTo(50, 6)
    expect(faces.right.a.y).toBeCloseTo(70, 6)
  })
})
