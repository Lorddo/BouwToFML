import { describe, expect, it } from 'vitest'

import { resolveMergedWallCloseRadiusPx } from '@/cv/walls/rooms/room-wall-close-radius'

describe('resolveMergedWallCloseRadiusPx', () => {
  it('schaalt open walls mee met referentiedikte', () => {
    expect(
      resolveMergedWallCloseRadiusPx({ wallStyle: 'open', referenceWallThicknessPx: 30 }),
    ).toBe(1)
  })

  it('houdt solid walls conservatief bij referentiedikte', () => {
    expect(
      resolveMergedWallCloseRadiusPx({ wallStyle: 'solid', referenceWallThicknessPx: 30 }),
    ).toBe(1)
  })

  it('clamped op veilige maxima voor extreme dikte', () => {
    expect(
      resolveMergedWallCloseRadiusPx({ wallStyle: 'open', referenceWallThicknessPx: 200 }),
    ).toBe(5)

    expect(
      resolveMergedWallCloseRadiusPx({ wallStyle: 'solid', referenceWallThicknessPx: 200 }),
    ).toBe(5)
  })

  it('valt terug op legacy radius zonder referentie', () => {
    expect(resolveMergedWallCloseRadiusPx({ wallStyle: 'open' })).toBe(3)
  })

  it('negeert preprocessThickenPx na ink-resolve (geen 2× bonus)', () => {
    expect(
      resolveMergedWallCloseRadiusPx({
        wallStyle: 'open',

        referenceWallThicknessPx: 30,

        preprocessThickenPx: 4,
      }),
    ).toBe(1)

    expect(
      resolveMergedWallCloseRadiusPx({
        wallStyle: 'solid',

        referenceWallThicknessPx: 30,

        preprocessThickenPx: 3,
      }),
    ).toBe(1)
  })
})
