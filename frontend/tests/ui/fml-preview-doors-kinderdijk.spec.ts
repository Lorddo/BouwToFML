import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { samplePlanArc, type PlanArcGlyph } from '@/core/fml/opening-plan-symbol'
import { groupDoorOpeningsOnWall } from '@/ui/components/fml-preview-doors'

const KINDERDIJK = resolve(
  __dirname,
  '../../examples/FML(current)/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam.json.fml',
)

function arcMatchesClosedLeaf(arc: PlanArcGlyph, leafPoints: number[]): boolean {
  const hingeX = (leafPoints[0] + leafPoints[6]) / 2
  const hingeY = (leafPoints[1] + leafPoints[7]) / 2
  const tipX = (leafPoints[2] + leafPoints[4]) / 2
  const tipY = (leafPoints[3] + leafPoints[5]) / 2
  const closedAngle = Math.atan2(tipY - hingeY, tipX - hingeX)
  const arcStart = Math.atan2(Math.sin(arc.startRad), Math.cos(arc.startRad))
  // Start of arc ≈ closed leaf direction; radius matches tip distance.
  const tipDist = Math.hypot(tipX - hingeX, tipY - hingeY)
  let d = closedAngle - arc.startRad
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d) < 0.25 && Math.abs(arc.r - tipDist) < 2 && Math.abs(arcStart) >= 0
}

describe('Kinderdijkstraat door symbols', () => {
  const { plan } = importFmlV3(readFileSync(KINDERDIJK, 'utf8'))
  const walls = plan.floors[0].walls

  it('all swing doors have arcs starting from closed leaf tips', () => {
    for (const wall of walls) {
      const groups = groupDoorOpeningsOnWall(wall.id, wall.a, wall.b, wall.openings)
      for (const group of groups) {
        const leaves = group.glyphs.filter(
          (g) => g.kind === 'polyline' && g.role === 'leaf' && g.closed,
        )
        const arcs = group.glyphs.filter((g): g is PlanArcGlyph => g.kind === 'arc')
        const n = Math.min(leaves.length, arcs.length)
        for (let i = 0; i < n; i += 1) {
          const leaf = leaves[i]
          if (leaf.kind !== 'polyline') continue
          expect(arcMatchesClosedLeaf(arcs[i], leaf.points)).toBe(true)
          // Arc is a real arc entity (sampleable)
          expect(samplePlanArc(arcs[i]).length).toBeGreaterThan(4)
        }
      }
    }
  })
})
