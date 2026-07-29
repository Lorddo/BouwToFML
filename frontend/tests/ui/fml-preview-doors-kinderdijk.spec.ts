import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { groupDoorOpeningsOnWall } from '@/ui/components/fml-preview-doors'

const KINDERDIJK = resolve(
  __dirname,
  '../../../examples/FML(current)/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam.json.fml',
)

function arcMatchesLeafTip(arc: number[], leaf: number[]): boolean {
  const hingeX = leaf[0]
  const hingeY = leaf[1]
  const tipX = leaf[2]
  const tipY = leaf[3]
  const tipAngle = Math.atan2(tipY - hingeY, tipX - hingeX)
  const arcEndX = arc[arc.length - 2]
  const arcEndY = arc[arc.length - 1]
  const arcEnd = Math.atan2(arcEndY - hingeY, arcEndX - hingeX)
  return Math.abs(angleDiff(arcEnd, tipAngle)) < 0.2
}

function angleDiff(a: number, b: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

describe('Kinderdijkstraat door symbols', () => {
  const { plan } = importFmlV3(readFileSync(KINDERDIJK, 'utf8'))
  const walls = plan.floors[0].walls

  it('all swing doors have arcs aligned with leaf tips', () => {
    for (const wall of walls) {
      const groups = groupDoorOpeningsOnWall(wall.id, wall.a, wall.b, wall.openings)
      for (const group of groups) {
        for (let i = 0; i < group.leafLines.length; i += 1) {
          if (!group.arcPoints[i]?.length) continue
          expect(arcMatchesLeafTip(group.arcPoints[i], group.leafLines[i])).toBe(true)
        }
      }
    }
  })
})
