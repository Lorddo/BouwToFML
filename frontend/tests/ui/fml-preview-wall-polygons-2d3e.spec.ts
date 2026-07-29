import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildWallRenderGeometry,
  pointInFillComponents,
} from '@/ui/components/fml-preview-wall-polygons'

describe('2D_3E wall union (real FML)', () => {
  it('unions all walls without clipper ring errors', () => {
    const walls = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../fixtures/2d3e-walls.json'), 'utf8'),
    ) as Array<{
      id: string
      a: { x: number; y: number }
      b: { x: number; y: number }
      thickness: number
      balance?: number
    }>

    expect(walls.length).toBe(52)
    const geometry = buildWallRenderGeometry(walls)
    expect(geometry.fillComponents.length).toBeGreaterThan(0)
    expect(geometry.fillComponents.length).toBeLessThan(walls.length / 2)
    // Sample mid-wall points should be solid after union
    expect(pointInFillComponents({ x: 570, y: 357 }, geometry.fillComponents)).toBe(true)
  })
})
