import { afterEach, describe, expect, it } from 'vitest'
import {
  elevationWindowListenerCounts,
  makeElevationSelectHarness,
  mouseEvent,
  OPENING_ID,
} from './elevation-select-harness'

/**
 * Karakterisering van de Konva-routing in SelectEdit — fase 1 van de split.
 * Prioriteit, niet geometrie: wie de klik wint. De core-specs dekken de sleep.
 */

const harnesses: Array<{ dispose: () => void }> = []

function harness(options?: Parameters<typeof makeElevationSelectHarness>[0]) {
  const h = makeElevationSelectHarness(options)
  harnesses.push(h)
  return h
}

afterEach(() => {
  for (const item of harnesses.splice(0)) item.dispose()
})

describe('elevation-select-pointer — onOpeningDown prioriteit', () => {
  it('precise-draft commit wint: geen selectie, geen precise-start, geen sleep', () => {
    const h = harness({ preciseDraft: true })
    h.select.onOpeningDown(OPENING_ID, mouseEvent())
    expect(h.calls).toEqual(['commitPreciseDraft'])
    expect(h.select.selectedOpeningId.value).toBeNull()
    expect(h.select.settingsTarget.value).toBeNull()
    expect(elevationWindowListenerCounts().move).toBe(0)
  })

  it('Shift/Move precise: quick-select + beginPreciseOpening, geen sleep', () => {
    const h = harness({ preciseIntent: true })
    h.select.onOpeningDown(OPENING_ID, mouseEvent({ shiftKey: true }))
    expect(h.calls).toEqual(['beginPreciseOpening'])
    expect(h.select.settingsTarget.value).toEqual({
      kind: 'opening',
      id: OPENING_ID,
      mode: 'quick',
    })
    expect(elevationWindowListenerCounts().move).toBe(0)
  })

  it('gewone klik = quick, geen sleep', () => {
    const h = harness()
    h.select.onOpeningDown(OPENING_ID, mouseEvent())
    expect(h.calls).toEqual([])
    expect(h.select.settingsTarget.value).toEqual({
      kind: 'opening',
      id: OPENING_ID,
      mode: 'quick',
    })
    expect(elevationWindowListenerCounts().move).toBe(0)
  })

  it('Ctrl/edit eerste keer: edit + pending (luisteraar, nog geen undo)', () => {
    const h = harness()
    h.select.onOpeningDown(OPENING_ID, mouseEvent({ ctrlKey: true }))
    expect(h.calls).toEqual([])
    expect(h.select.settingsTarget.value).toEqual({
      kind: 'opening',
      id: OPENING_ID,
      mode: 'edit',
    })
    expect(elevationWindowListenerCounts().move).toBe(1)
    expect(elevationWindowListenerCounts().up).toBe(1)
  })

  it('al-edit = meteen drag (undo + luisteraar)', () => {
    const h = harness()
    h.select.selectOpening(OPENING_ID, 'edit')
    h.select.onOpeningDown(OPENING_ID, mouseEvent())
    expect(h.calls).toEqual(['pushUndo'])
    expect(h.select.settingsTarget.value?.kind).toBe('opening')
    expect(elevationWindowListenerCounts().move).toBe(1)
  })

  it('niet-select tool of locked canvas doet niets', () => {
    const locked = harness({ locked: true })
    locked.select.onOpeningDown(OPENING_ID, mouseEvent({ ctrlKey: true }))
    expect(locked.calls).toEqual([])
    expect(locked.select.selectedOpeningId.value).toBeNull()

    const tool = harness({ tool: 'add_door' })
    tool.select.onOpeningDown(OPENING_ID, mouseEvent({ ctrlKey: true }))
    expect(tool.calls).toEqual([])
    expect(tool.select.selectedOpeningId.value).toBeNull()
  })
})

describe('elevation-select-pointer — onJunctionDown', () => {
  it('precise-draft commit wint', () => {
    const h = harness({ preciseDraft: true })
    h.select.onJunctionDown('j1', mouseEvent())
    expect(h.calls).toEqual(['commitPreciseDraft'])
    expect(h.select.settingsTarget.value).toBeNull()
  })

  it('precise-intent start knoop-precise, geen height-drag', () => {
    const h = harness({ preciseIntent: true })
    h.select.onJunctionDown('j1', mouseEvent({ shiftKey: true }))
    expect(h.calls).toEqual(['beginPreciseJunction'])
    expect(h.select.settingsTarget.value).toBeNull()
    expect(elevationWindowListenerCounts().move).toBe(0)
  })

  it('gewone knoop = height-drag (select + undo)', () => {
    const h = harness()
    h.select.onJunctionDown('j1', mouseEvent())
    expect(h.calls).toEqual(['pushUndo'])
    expect(h.select.settingsTarget.value).toEqual({ kind: 'junction', id: 'j1' })
    expect(elevationWindowListenerCounts().move).toBe(1)
  })

  it('nok-knoop = ridge-end drag, geen height-drag', () => {
    const h = harness()
    h.select.onJunctionDown('rj1', mouseEvent())
    expect(h.calls).toEqual(['pushUndo'])
    expect(h.select.settingsTarget.value).toEqual({
      kind: 'ridge',
      wallId: 'ridge-1',
      floorIndex: 0,
      end: 'a',
    })
    expect(elevationWindowListenerCounts().move).toBe(1)
  })
})

describe('elevation-select-pointer — onRidgeWallDown', () => {
  it('precise-draft commit wint', () => {
    const h = harness({ preciseDraft: true })
    const wall = h.elevation.value!.walls.find((item) => item.wallId === 'ridge-1')!
    h.select.onRidgeWallDown(wall, mouseEvent())
    expect(h.calls).toEqual(['commitPreciseDraft'])
    expect(h.select.settingsTarget.value).toBeNull()
  })

  it('lange nok (geen endOn) = alleen selectie, geen drag', () => {
    const h = harness()
    const wall = h.elevation.value!.walls.find((item) => item.wallId === 'ridge-long')!
    h.select.onRidgeWallDown(wall, mouseEvent())
    expect(h.calls).toEqual([])
    expect(h.select.settingsTarget.value).toEqual({
      kind: 'ridge',
      wallId: 'ridge-long',
      floorIndex: 0,
    })
    expect(elevationWindowListenerCounts().move).toBe(0)
  })

  it('precise-intent op kopse nok = beginPreciseRidge', () => {
    const h = harness({ preciseIntent: true })
    const wall = h.elevation.value!.walls.find((item) => item.wallId === 'ridge-1')!
    h.select.onRidgeWallDown(wall, mouseEvent({ shiftKey: true }))
    expect(h.calls).toEqual(['beginPreciseRidge'])
    expect(elevationWindowListenerCounts().move).toBe(0)
  })

  it('gewone klik op kopse nok = ridge-rect drag', () => {
    const h = harness()
    const wall = h.elevation.value!.walls.find((item) => item.wallId === 'ridge-1')!
    h.select.onRidgeWallDown(wall, mouseEvent())
    expect(h.calls).toEqual(['pushUndo'])
    expect(h.select.settingsTarget.value).toEqual({
      kind: 'ridge',
      wallId: 'ridge-1',
      floorIndex: 0,
    })
    expect(elevationWindowListenerCounts().move).toBe(1)
  })
})

describe('elevation-select-pointer — onRoofDown', () => {
  it('gewone klik selecteert het dakvlak', () => {
    const h = harness()
    h.select.onRoofDown('roof-1', mouseEvent())
    expect(h.select.settingsTarget.value).toEqual({
      kind: 'roof',
      id: 'roof-1',
      vertexIndex: null,
    })
  })

  it('overlapping: Konva-ouder-id wijkt voor dakkapel (ook Ctrl)', () => {
    const parent = [
      { x: 0, y: -200 },
      { x: 400, y: -200 },
      { x: 400, y: 0 },
      { x: 0, y: 0 },
    ]
    const cap = [
      { x: 80, y: -160 },
      { x: 180, y: -160 },
      { x: 180, y: -80 },
      { x: 80, y: -80 },
    ]
    const h = harness({ pointerCm: { x: 100, y: -140 } })
    const elev = h.elevation.value
    if (!elev) throw new Error('expected elevation')
    elev.roofPlanes = [
      {
        id: 'main',
        floorIndex: 0,
        points: parent,
        fillPoints: parent,
        color: '#888',
        depthCm: 80,
      },
      {
        id: 'cap',
        floorIndex: 0,
        points: cap,
        fillPoints: cap,
        color: '#b88',
        depthCm: 0,
        dormer: true,
        parentId: 'main',
      },
    ]
    h.select.onRoofDown('main', mouseEvent({ ctrlKey: true }))
    expect(h.select.settingsTarget.value).toEqual({
      kind: 'roof',
      id: 'cap',
      vertexIndex: null,
    })
  })
})
