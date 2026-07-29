import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import {
  buildWallRenderGeometry,
  maxFillVertexDistanceFromWallEnds,
} from '@/ui/components/fml-preview-wall-polygons'

const KINDERDIJK = resolve(
  __dirname,
  '../../examples/FML(current)/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam.json.fml',
)

describe('buildWallRenderGeometry Kinderdijkstraat', () => {
  it('has no runaway fill vertices', () => {
    const { plan } = importFmlV3(JSON.parse(readFileSync(KINDERDIJK, 'utf8')))
    const walls = plan.floors[0].walls.map((wall) => ({
      id: wall.id,
      a: wall.a,
      b: wall.b,
      thickness: wall.thickness,
      balance: wall.balance,
    }))
    const xs = walls.flatMap((wall) => [wall.a.x, wall.b.x])
    const ys = walls.flatMap((wall) => [wall.a.y, wall.b.y])
    const maxThickness = Math.max(...walls.map((wall) => wall.thickness), 20)
    const pad = maxThickness * 2 + 40
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad

    const geometry = buildWallRenderGeometry(walls)
    expect(geometry.fillComponents.length).toBeGreaterThan(0)

    for (const component of geometry.fillComponents) {
      for (const ring of component.rings) {
        for (const point of ring) {
          expect(point.x).toBeGreaterThan(minX)
          expect(point.x).toBeLessThan(maxX)
          expect(point.y).toBeGreaterThan(minY)
          expect(point.y).toBeLessThan(maxY)
        }
      }
    }

    expect(maxFillVertexDistanceFromWallEnds(geometry.fillComponents, walls)).toBeLessThan(
      maxThickness * 2 + 25,
    )
  })
})
