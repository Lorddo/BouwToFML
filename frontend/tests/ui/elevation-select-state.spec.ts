import { afterEach, describe, expect, it } from 'vitest'
import { dakThicknessCmForPlan } from '@/core/plan/ridge-walls'
import { makeRoofSurface, setRidgeSurfacesOnFloor } from '@/core/plan/roof-planes'
import {
  makeElevationSelectHarness,
  OPENING_ID,
  OPENING_ID_W2,
  elevWall,
  transomRect,
} from './elevation-select-harness'

/**
 * Karakterisering van de aanzicht-selectie-lane — fase 1 van de SelectEdit-split.
 * Beschrijft het gedrag zoals het NU is. Gaat er hier iets rood: eerst
 * uitzoeken of de wijziging bedoeld was, niet de verwachting aanpassen.
 */

const harnesses: Array<{ dispose: () => void }> = []

function harness() {
  const h = makeElevationSelectHarness()
  harnesses.push(h)
  return h
}

afterEach(() => {
  for (const item of harnesses.splice(0)) item.dispose()
})

describe('elevation-select-state — één target', () => {
  it('selectOpening met modus zet opening én settings', () => {
    const { select } = harness()
    select.selectOpening(OPENING_ID, 'quick')
    expect(select.selectedOpeningId.value).toBe(OPENING_ID)
    expect(select.settingsTarget.value).toEqual({
      kind: 'opening',
      id: OPENING_ID,
      mode: 'quick',
    })
  })

  it('selectOpening zonder modus houdt de id maar wist settings', () => {
    const { select } = harness()
    select.selectOpening(OPENING_ID, 'edit')
    select.selectOpening(OPENING_ID)
    expect(select.selectedOpeningId.value).toBe(OPENING_ID)
    expect(select.settingsTarget.value).toBeNull()
  })

  it('selectWallSettings wist de opening', () => {
    const { select } = harness()
    select.selectOpening(OPENING_ID, 'edit')
    select.selectWallSettings('w1', 0)
    expect(select.selectedOpeningId.value).toBeNull()
    expect(select.settingsTarget.value).toEqual({
      kind: 'wall',
      wallId: 'w1',
      floorIndex: 0,
    })
  })

  it('selectOpening(null) wist settings', () => {
    const { select } = harness()
    select.selectWallSettings('w1', 0)
    select.selectOpening(null)
    expect(select.selectedOpeningId.value).toBeNull()
    expect(select.settingsTarget.value).toBeNull()
  })

  it('elke writer laat precies één settings-soort over', () => {
    const { select } = harness()
    select.selectOpening(OPENING_ID, 'quick')
    select.selectJunction('j1')
    expect(select.selectedOpeningId.value).toBeNull()
    expect(select.settingsTarget.value).toEqual({ kind: 'junction', id: 'j1' })

    select.selectRidge('ridge-1', 0, 'a')
    expect(select.settingsTarget.value).toEqual({
      kind: 'ridge',
      wallId: 'ridge-1',
      floorIndex: 0,
      end: 'a',
    })

    select.selectRoof('roof-1', 2)
    expect(select.settingsTarget.value).toEqual({
      kind: 'roof',
      id: 'roof-1',
      vertexIndex: 2,
    })

    select.selectSlabSettings(0)
    expect(select.settingsTarget.value).toEqual({ kind: 'slab', floorIndex: 0 })

    select.selectPlaceholderRoof(0)
    expect(select.settingsTarget.value).toEqual({ kind: 'placeholderRoof', floorIndex: 0 })
  })

  it('group-change wist opening én settings', () => {
    const { select } = harness()
    select.selectOpening(OPENING_ID, 'edit')
    select.clearSelectionOnGroupChange()
    expect(select.selectedOpeningId.value).toBeNull()
    expect(select.settingsTarget.value).toBeNull()
  })
})

describe('elevation-select-state — muur-grepen', () => {
  it('muur heeft alleen hoogte + lift, geen midden-shift en geen XY-as-einden', () => {
    const { select } = harness()
    select.selectWallSettings('w1', 0)
    expect(select.wallElevationHandles.value.map((handle) => handle.mode)).toEqual([
      'height',
      'lift',
    ])
    expect(select.wallAxisEndHandles.value).toEqual([])
  })

  it('knoop heeft alleen lift, geen midden-shift', () => {
    const { select } = harness()
    select.selectJunction('j1')
    expect(select.junctionElevationHandles.value.map((handle) => handle.mode)).toEqual(['lift'])
  })
})

describe('elevation-select-state — wall-hop herschrijft de selectie', () => {
  it('applyOpeningRect op een buurmuur zet opening-id én settings-id', () => {
    const { select } = harness()
    select.selectOpening(OPENING_ID, 'edit')
    const host = elevWall({ wallId: 'w1', xa: 0, xb: 200 })
    select.applyOpeningRect(
      OPENING_ID,
      host,
      { x0: 260, y0: -200, x1: 340, y1: -80 },
      true,
    )
    expect(select.selectedOpeningId.value).toBe(OPENING_ID_W2)
    expect(select.settingsTarget.value).toEqual({
      kind: 'opening',
      id: OPENING_ID_W2,
      mode: 'edit',
    })
  })
})

describe('elevation-select-state — packed bovenlicht', () => {
  it('transom-edit toont alleen N/S-grepen op het bovenlicht', () => {
    const { select, elevation } = harness()
    elevation.value = {
      ...elevation.value!,
      transoms: [transomRect(OPENING_ID, 'w1')],
    }
    select.selectOpening(OPENING_ID, 'edit', 'transom')
    expect(select.editingTransom.value).toBe(true)
    expect(select.openingHandles.value.map((handle) => handle.side)).toEqual(['n', 's'])
    expect(select.openingMoveHandle.value).toEqual({ x: 100, y: -230 })
  })

  it('ouder-edit houdt vier grepen op de deur/raam', () => {
    const { select, elevation } = harness()
    elevation.value = {
      ...elevation.value!,
      transoms: [transomRect(OPENING_ID, 'w1')],
    }
    select.selectOpening(OPENING_ID, 'edit')
    expect(select.editingTransom.value).toBe(false)
    expect(select.openingHandles.value.map((handle) => handle.side)).toEqual(['n', 's', 'e', 'w'])
  })
})

describe('elevation-select-state — dakdikte', () => {
  function attachRoofSurface(h: ReturnType<typeof harness>): void {
    h.planHolder.plan.floors[0] = setRidgeSurfacesOnFloor(h.planHolder.plan.floors[0], [
      makeRoofSurface({
        id: 'roof-1',
        origin: 'manual',
        poly: [
          { x: 0, y: 0, z: 280 },
          { x: 400, y: 0, z: 400 },
          { x: 400, y: 200, z: 400 },
          { x: 0, y: 200, z: 280 },
        ],
      }),
    ])
  }

  it('settingsRoof leest dakdikte uit de stack', () => {
    const h = harness()
    attachRoofSurface(h)
    const { select, planHolder } = h
    select.selectRoof('roof-1', null)
    expect(select.settingsRoof.value?.thicknessCm).toBe(dakThicknessCmForPlan(planHolder.plan))
  })

  it('settingsPlaceholderRoof leest dezelfde dakdikte', () => {
    const { select, planHolder } = harness()
    select.selectPlaceholderRoof(0)
    expect(select.settingsPlaceholderRoof.value).toEqual({
      kind: 'placeholderRoof',
      floorIndex: 0,
      name: planHolder.plan.floors[0].name,
      thicknessCm: dakThicknessCmForPlan(planHolder.plan),
    })
  })

  it('commitRoofThickness schrijft stack + nokspan', () => {
    const { select, planHolder, calls } = harness()
    select.selectPlaceholderRoof(0)
    select.commitRoofThickness(42)
    expect(calls).toEqual(['pushUndo', 'commitPlan'])
    expect(dakThicknessCmForPlan(planHolder.plan)).toBe(42)
  })
})
