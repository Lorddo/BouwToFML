import { describe, expect, it } from 'vitest'
import type { FloorArea } from '@/core/plan/types'
import {
  areaGrowSign,
  areaSpanAlongDir,
  pickWallMoveArea,
  resolveWallMoveMeasure,
  slideDeltaFromTypedCm,
} from '@/ui/composables/plan-canvas/plan-canvas-wall-move-measure'

function room(id: string, x0: number, y0: number, w: number, h: number): FloorArea {
  return {
    id,
    poly: [
      { x: x0, y: y0 },
      { x: x0 + w, y: y0 },
      { x: x0 + w, y: y0 + h },
      { x: x0, y: y0 + h },
    ],
    color: '#fff',
    showAreaLabel: true,
  }
}

const eastWall = { a: { x: 400, y: 0 }, b: { x: 400, y: 300 } }

describe('wall-move measure', () => {
  it('meet de kamer-span langs de slide-as', () => {
    expect(areaSpanAlongDir(room('r', 0, 0, 400, 300).poly, { x: 1, y: 0 })).toBe(400)
  })

  it('kiest de kamer aan de pointer-kant', () => {
    const left = room('L', 0, 0, 400, 300)
    const right = room('R', 400, 0, 250, 300)
    const picked = pickWallMoveArea([left, right], eastWall, { x: 1, y: 0 }, -1)
    expect(picked?.id).toBe('L')
  })

  it('+X groeit de kamer links van een verticale muur', () => {
    expect(areaGrowSign(room('L', 0, 0, 400, 300).poly, eastWall, { x: 1, y: 0 })).toBe(1)
    expect(areaGrowSign(room('R', 400, 0, 250, 300).poly, eastWall, { x: 1, y: 0 })).toBe(-1)
  })

  it('zet getypte kamermaat om naar slide-delta vanaf de basis', () => {
    const measure = resolveWallMoveMeasure({
      areas: [room('L', 0, 0, 400, 300)],
      wall: eastWall,
      slideDir: { x: 1, y: 0 },
      delta: 0,
      pointerSide: -1,
    })
    expect(measure.kind).toBe('area')
    expect(measure.lengthCm).toBe(400)
    expect(
      slideDeltaFromTypedCm({
        kind: measure.kind,
        typedCm: 450,
        currentDelta: 0,
        currentLengthCm: measure.lengthCm,
        growSign: measure.growSign,
      }),
    ).toBe(50)
  })

  it('valt terug op verplaatsing zonder area', () => {
    const measure = resolveWallMoveMeasure({
      areas: [],
      wall: eastWall,
      slideDir: { x: 1, y: 0 },
      delta: 80,
      pointerSide: 80,
    })
    expect(measure.kind).toBe('delta')
    expect(measure.lengthCm).toBe(80)
    expect(
      slideDeltaFromTypedCm({
        kind: 'delta',
        typedCm: -30,
        currentDelta: 80,
        currentLengthCm: 80,
        growSign: 1,
      }),
    ).toBe(-30)
  })
})
