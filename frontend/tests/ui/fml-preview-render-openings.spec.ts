import { describe, expect, it } from 'vitest'
import { type Opening, type Wall } from '@/core/fml/types'
import { buildRenderDoorGroupsAndWindows } from '@/ui/composables/fml-preview/fml-preview-render-openings'
import type { RenderWall } from '@/ui/composables/fml-preview/fml-preview-render-types'
import { wallBalanceMidOffsetCm } from '@/ui/components/fml-preview-wall-polygons'

const toStage = (x: number, y: number) => ({ x, y })

function windowOnWall(balance: number): RenderWall {
  const opening: Opening = {
    type: 'window',
    kind: 'window.single',
    t: 0.5,
    width: 80,
    id: 'w1',
  }
  const wall: Wall = {
    id: 'wall-h',
    a: { x: 0, y: 0 },
    b: { x: 200, y: 0 },
    thickness: 20,
    balance,
    openings: [opening],
  }
  return {
    id: wall.id,
    wall,
    points: [0, 0, 200, 0],
    strokeWidth: 2,
    a: wall.a,
    b: wall.b,
  }
}

function glyphMeanY(glyphs: { points?: number[] }[]): number {
  let sum = 0
  let n = 0
  for (const glyph of glyphs) {
    const pts = glyph.points
    if (!pts) continue
    for (let i = 1; i < pts.length; i += 2) {
      sum += pts[i] ?? 0
      n += 1
    }
  }
  return n === 0 ? 0 : sum / n
}

describe('buildRenderDoorGroupsAndWindows — balance', () => {
  it('raam-glyphs één keer naar mid-dikte (niet dubbel buiten het gat)', () => {
    const centered = buildRenderDoorGroupsAndWindows([windowOnWall(0.5)], toStage).windows[0]
    const flush = buildRenderDoorGroupsAndWindows([windowOnWall(0)], toStage).windows[0]
    expect(centered).toBeDefined()
    expect(flush).toBeDefined()

    const y50 = glyphMeanY(centered.glyphs)
    const y0 = glyphMeanY(flush.glyphs)
    // Y-down: balance 0 → mid = −thickness/2 langs left-normal (−Y) → +10
    const expected = wallBalanceMidOffsetCm(20, 0) * -1
    expect(y50).toBeCloseTo(0, 5)
    expect(y0).toBeCloseTo(expected, 5)
    expect(Math.abs(y0)).toBeCloseTo(10, 5)
  })
})
