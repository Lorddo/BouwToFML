import { describe, expect, it } from 'vitest'
import {
  resolveOpeningRects,
  resolveReferenceWallRect,
  resolveReferenceWallRects,
} from '@/ui/composables/workspace/workspace-dev-session-capture'
import { useExampleSelection } from '@/platform/selection/useExampleSelection'
import type { DevWallReferenceRect } from '@/platform/dev-workspace'

describe('DevSession multi-ref capture/restore helpers', () => {
  it('captures all wall bands + openings (not only one wall)', () => {
    const rects = [
      { type: 'wall', x: 0, y: 0, width: 10, height: 4, wallThicknessCm: 10 },
      { type: 'wall', x: 20, y: 0, width: 12, height: 5, wallThicknessCm: 20 },
      { type: 'wall', x: 40, y: 0, width: 14, height: 6, wallThicknessCm: 30 },
      { type: 'door', x: 5, y: 40, width: 16, height: 10, fmlRefId: 'door_8' },
      { type: 'door', x: 30, y: 40, width: 18, height: 10 },
      { type: 'window', x: 60, y: 8, width: 22, height: 7 },
      { type: 'window', x: 90, y: 8, width: 20, height: 7 },
    ]

    const walls = resolveReferenceWallRects(rects)
    expect(walls).toHaveLength(3)
    expect(walls.map((w) => w.wallThicknessCm)).toEqual([10, 20, 30])

    const primary = resolveReferenceWallRect(rects)
    expect(primary).toEqual({
      x: 40,
      y: 0,
      width: 14,
      height: 6,
      wallThicknessCm: 30,
    })

    const openings = resolveOpeningRects(rects)
    expect(openings).toHaveLength(4)
    expect(openings.filter((r) => r.type === 'door')).toHaveLength(2)
    expect(openings.filter((r) => r.type === 'window')).toHaveLength(2)
  })

  it('restores multi wall refs with bands via replaceWallRects', () => {
    const selection = useExampleSelection()
    const saved: DevWallReferenceRect[] = [
      { x: 1, y: 2, width: 10, height: 4, wallThicknessCm: 10 },
      { x: 20, y: 2, width: 12, height: 5, wallThicknessCm: 20 },
      { x: 40, y: 2, width: 14, height: 6, wallThicknessCm: 30 },
    ]

    selection.replaceWallRects(saved)

    const walls = selection.rects.value.filter((r) => r.type === 'wall')
    expect(walls).toHaveLength(3)
    expect(walls.map((w) => w.wallThicknessCm).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      10, 20, 30,
    ])
  })

  it('legacy singular referenceWallRect still restores as one wall', () => {
    const selection = useExampleSelection()
    const legacy = { x: 10, y: 20, width: 30, height: 8 }
    selection.replaceWallRects([legacy])
    expect(selection.rects.value.filter((r) => r.type === 'wall')).toHaveLength(1)
  })

  it('pending catalog-cm bindt de nieuwe muur-ref en vervangt dezelfde slot', () => {
    const selection = useExampleSelection()
    selection.setPendingWallThicknessCm(18)
    selection.addRect({ type: 'wall', x: 0, y: 0, width: 12, height: 6 })
    const first = selection.rects.value.filter((r) => r.type === 'wall')
    expect(first).toHaveLength(1)
    expect(first[0]?.wallThicknessCm).toBe(18)

    selection.setPendingWallThicknessCm(18)
    selection.addRect({ type: 'wall', x: 40, y: 8, width: 14, height: 7 })
    const walls = selection.rects.value.filter((r) => r.type === 'wall')
    expect(walls).toHaveLength(1)
    expect(walls[0]?.x).toBe(40)
    expect(walls[0]?.wallThicknessCm).toBe(18)
  })
})
