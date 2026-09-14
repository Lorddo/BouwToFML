import { describe, expect, it } from 'vitest'
import { toLayer14WindowsForPlan } from '@/core/plan/layer-openings-to-plan'
import type { BoundWindow } from '@/cv/windows/types'

function makeBound(
  partial: Partial<BoundWindow> & Pick<BoundWindow, 'windowId' | 't' | 'openingBBox'>,
): BoundWindow {
  const bbox = partial.openingBBox
  return {
    segmentIndex: partial.segmentIndex ?? 0,
    openingAxis: partial.openingAxis ?? 'h',
    openingStartPx: partial.openingStartPx ?? { x: bbox.x, y: bbox.y + bbox.height / 2 },
    openingEndPx: partial.openingEndPx ?? { x: bbox.x + bbox.width, y: bbox.y + bbox.height / 2 },
    widthPx: partial.widthPx ?? bbox.width,
    widthCm: partial.widthCm ?? bbox.width / 5,
    fmlRefId: partial.fmlRefId ?? 'window.single',
    evidence: partial.evidence ?? 'framing',
    faceIds: partial.faceIds ?? [1],
    ...partial,
  }
}

describe('toLayer14WindowsForPlan mergeMultiWindows', () => {
  const pair = [
    makeBound({
      windowId: 'a',
      t: 0.2,
      openingBBox: { x: 10, y: 40, width: 40, height: 20 },
      widthPx: 40,
      widthCm: 80,
    }),
    makeBound({
      windowId: 'b',
      t: 0.4,
      openingBBox: { x: 50, y: 40, width: 40, height: 20 },
      widthPx: 40,
      widthCm: 80,
    }),
  ]

  it('merges adjacent windows by default (R-27 in FML path)', () => {
    const layer14 = toLayer14WindowsForPlan(pair)
    expect(layer14).toHaveLength(1)
    expect(layer14[0].fmlRefId).toBe('window.double')
  })

  it('keeps singles when mergeMultiWindows is false', () => {
    const layer14 = toLayer14WindowsForPlan(pair, { mergeMultiWindows: false })
    expect(layer14).toHaveLength(2)
    expect(layer14.every((w) => w.fmlRefId === 'window.single')).toBe(true)
  })
})
