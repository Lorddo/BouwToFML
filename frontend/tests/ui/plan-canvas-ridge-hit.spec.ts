import { describe, expect, it } from 'vitest'
import type { Wall } from '@/core/fml/types'
import {
  hitTestRidgeBeamAtCm,
  pickDakPlanOverlayHit,
  pointHitsRidgeBeam,
} from '@/ui/composables/plan-canvas/plan-canvas-ridge-hit'

function ridge(id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall {
  return {
    id,
    a,
    b,
    thickness: 0,
    openings: [],
    extras: { ridge: true },
  }
}

describe('pointHitsRidgeBeam', () => {
  it('raakt op de hartlijn en tot de stippellijn', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    expect(pointHitsRidgeBeam({ x: 50, y: 0 }, a, b, 10)).toBe(true)
    expect(pointHitsRidgeBeam({ x: 50, y: 5 }, a, b, 10)).toBe(true)
    expect(pointHitsRidgeBeam({ x: 50, y: -5 }, a, b, 10)).toBe(true)
  })

  it('mist net buiten de stippellijnen', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    expect(pointHitsRidgeBeam({ x: 50, y: 5.1 }, a, b, 10)).toBe(false)
    expect(pointHitsRidgeBeam({ x: 50, y: -6 }, a, b, 10)).toBe(false)
  })
})

describe('hitTestRidgeBeamAtCm', () => {
  const walls = [ridge('r1', { x: 0, y: 0 }, { x: 80, y: 0 })]

  it('pakt de nok binnen de balk, niet ernaast', () => {
    expect(hitTestRidgeBeamAtCm(walls, { x: 40, y: 3 }, 10)).toBe('r1')
    expect(hitTestRidgeBeamAtCm(walls, { x: 40, y: 8 }, 10)).toBeNull()
  })

  it('negeert gewone muren', () => {
    const mixed: Wall[] = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 80, y: 0 },
        thickness: 20,
        openings: [],
      },
      ...walls,
    ]
    expect(hitTestRidgeBeamAtCm(mixed, { x: 40, y: 0 }, 10)).toBe('r1')
  })
})

describe('pickDakPlanOverlayHit', () => {
  it('geeft de nok voorrang als die onder de klik zit', () => {
    expect(pickDakPlanOverlayHit({ ridgeId: 'r1', surfaceId: 's1' })).toEqual({
      kind: 'ridge',
      id: 'r1',
    })
  })

  it('valt terug op het dakvlak buiten de balk', () => {
    expect(pickDakPlanOverlayHit({ ridgeId: null, surfaceId: 's1' })).toEqual({
      kind: 'surface',
      id: 's1',
    })
  })

  it('leeg als geen van beide raakt', () => {
    expect(pickDakPlanOverlayHit({ ridgeId: null, surfaceId: null })).toBeNull()
  })
})
