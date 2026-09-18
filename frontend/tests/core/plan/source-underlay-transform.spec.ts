import { describe, expect, it } from 'vitest'
import {
  applyInputRotationToTransform,
  bakeRotationDeg,
  composeSourceToWorkingBake,
  hasBakeRotation,
  identitySourceToWorkingTransform,
  resolveSourceUnderlayLayout,
  sourceLayoutFromWorking,
  type SourceToWorkingTransform,
} from '@/core/plan/source-underlay-transform'
import type { UnderlayOriginLayout } from '@/core/plan/translate-floor-plan'

const working: UnderlayOriginLayout = {
  origin: { x: 10, y: 20 },
  pxPerMmX: 2,
  pxPerMmY: 2,
}

function cropTransform(partial?: Partial<SourceToWorkingTransform>): SourceToWorkingTransform {
  return {
    sourceWidthPx: 2000,
    sourceHeightPx: 1000,
    workingWidthPx: 800,
    workingHeightPx: 600,
    offsetX: 100,
    offsetY: 50,
    scale: 1,
    rotationDeg: 0,
    rotate180: false,
    ...partial,
  }
}

describe('sourceLayoutFromWorking', () => {
  it('identity: zelfde origin en px/mm', () => {
    const t = identitySourceToWorkingTransform(800, 600)
    const layout = sourceLayoutFromWorking(working, t)
    expect(layout).not.toBeNull()
    expect(layout!.origin).toEqual({ x: 10, y: 20 })
    expect(layout!.pxPerMmX).toBe(2)
    expect(layout!.pxPerMmY).toBe(2)
    expect(layout!.rotationDeg).toBeUndefined()
  })

  it('crop-offset zonder rotatie: origin schuift in cm; muren-ruimte ongewijzigd', () => {
    const layout = sourceLayoutFromWorking(working, cropTransform())
    expect(layout).not.toBeNull()
    // offset 100 px / (2 px/mm * 10) = 5 cm
    expect(layout!.origin.x).toBeCloseTo(15)
    expect(layout!.origin.y).toBeCloseTo(22.5)
    expect(layout!.pxPerMmX).toBe(2)
  })

  it('nulpunt (working origin) schuift de bronplaat mee', () => {
    const moved: UnderlayOriginLayout = { ...working, origin: { x: 40, y: 80 } }
    const layout = sourceLayoutFromWorking(moved, cropTransform())
    expect(layout!.origin.x).toBeCloseTo(45)
    expect(layout!.origin.y).toBeCloseTo(82.5)
  })

  it('herschalen (px/mm) schaalt de bronplaat mee', () => {
    const scaled: UnderlayOriginLayout = { ...working, pxPerMmX: 4, pxPerMmY: 4 }
    const layout = sourceLayoutFromWorking(scaled, cropTransform())
    expect(layout!.pxPerMmX).toBe(4)
    expect(layout!.pxPerMmY).toBe(4)
    expect(layout!.origin.x).toBeCloseTo(10 + 100 / 40)
    expect(layout!.origin.y).toBeCloseTo(20 + 50 / 40)
  })

  it('kopieert flipX', () => {
    const layout = sourceLayoutFromWorking({ ...working, flipX: true }, cropTransform())
    expect(layout!.flipX).toBe(true)
  })

  it('90°: middelpunten vallen samen; rotatie op de layout', () => {
    const t = cropTransform({
      sourceWidthPx: 1000,
      sourceHeightPx: 800,
      workingWidthPx: 800,
      workingHeightPx: 1000,
      offsetX: 0,
      offsetY: 0,
      rotationDeg: 90,
    })
    const layout = sourceLayoutFromWorking(
      { origin: { x: 0, y: 0 }, pxPerMmX: 1, pxPerMmY: 1 },
      t,
    )
    expect(layout).not.toBeNull()
    expect(layout!.rotationDeg).toBe(90)
    const workCenter = { x: 800 / 10 / 2, y: 1000 / 10 / 2 }
    const srcWcm = 1000 / 10
    const srcHcm = 800 / 10
    expect(layout!.origin.x).toBeCloseTo(-(workCenter.x - srcWcm / 2))
    expect(layout!.origin.y).toBeCloseTo(-(workCenter.y - srcHcm / 2))
  })

  it('PDF-ROI identity: plaat ≈ werkmaat, offset 0', () => {
    const t = identitySourceToWorkingTransform(1200, 900)
    const layout = sourceLayoutFromWorking(working, t)
    expect(layout!.origin).toEqual(working.origin)
    expect(layout!.pxPerMmX).toBe(working.pxPerMmX)
  })

  it('ongeldige maten → null', () => {
    expect(sourceLayoutFromWorking(working, cropTransform({ sourceWidthPx: 0 }))).toBeNull()
    expect(sourceLayoutFromWorking({ ...working, pxPerMmX: 0 }, cropTransform())).toBeNull()
  })
})

describe('composeSourceToWorkingBake', () => {
  it('telt drie baktes op en houdt de bronplaat', () => {
    const first = cropTransform({
      sourceWidthPx: 2000,
      sourceHeightPx: 1000,
      workingWidthPx: 2140,
      workingHeightPx: 1180,
      rotationDeg: 5,
      scale: 1,
    })
    const second = cropTransform({
      sourceWidthPx: 2140,
      sourceHeightPx: 1180,
      workingWidthPx: 2144,
      workingHeightPx: 1182,
      rotationDeg: 0.1,
      scale: 1,
    })
    const third = cropTransform({
      sourceWidthPx: 2144,
      sourceHeightPx: 1182,
      workingWidthPx: 2146,
      workingHeightPx: 1183,
      rotationDeg: 0.1,
      scale: 1,
    })
    const composed = composeSourceToWorkingBake(
      composeSourceToWorkingBake(first, second),
      third,
    )
    expect(composed.sourceWidthPx).toBe(2000)
    expect(composed.sourceHeightPx).toBe(1000)
    expect(composed.workingWidthPx).toBe(2146)
    expect(composed.rotationDeg).toBeCloseTo(5.2)
    expect(bakeRotationDeg(composed)).toBeCloseTo(5.2)
  })

  it('XOR-t rotate180 over opeenvolgende baktes', () => {
    const first = cropTransform({ rotationDeg: 5, rotate180: true })
    const second = cropTransform({ rotationDeg: 0.1, rotate180: true })
    const composed = composeSourceToWorkingBake(first, second)
    expect(composed.rotationDeg).toBeCloseTo(5.1)
    expect(composed.rotate180).toBe(false)
  })

  it('eerste bake of identity-prev blijft de increment', () => {
    const increment = cropTransform({ rotationDeg: 5 })
    expect(composeSourceToWorkingBake(null, increment)).toBe(increment)
    expect(composeSourceToWorkingBake(identitySourceToWorkingTransform(2000, 1000), increment)).toBe(
      increment,
    )
  })
})

describe('applyInputRotationToTransform', () => {
  it('zet slider-rotatie op een identity-transform', () => {
    const next = applyInputRotationToTransform(identitySourceToWorkingTransform(800, 600), {
      rotationDeg: 12,
      rotate180: false,
    })
    expect(next.rotationDeg).toBe(12)
    expect(hasBakeRotation(next)).toBe(true)
  })

  it('laat een echte bake met rust', () => {
    const baked = cropTransform({ rotationDeg: 90 })
    expect(applyInputRotationToTransform(baked, { rotationDeg: 12, rotate180: false })).toBe(baked)
  })

  it('identity blijft identity zonder hoek', () => {
    const id = identitySourceToWorkingTransform(800, 600)
    expect(hasBakeRotation(id)).toBe(false)
    expect(applyInputRotationToTransform(id, { rotationDeg: 0, rotate180: false })).toBe(id)
  })
})

describe('resolveSourceUnderlayLayout', () => {
  it('zonder transform: working terug', () => {
    expect(resolveSourceUnderlayLayout(working, null)).toEqual(working)
  })

  it('zonder working: null', () => {
    expect(resolveSourceUnderlayLayout(null, cropTransform())).toBeNull()
  })
})
