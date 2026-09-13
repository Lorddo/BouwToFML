import { describe, expect, it } from 'vitest'
import { createPlanCanvasSelection } from '@/ui/composables/plan-canvas/plan-canvas-selection'
import {
  clearPlanSelected,
  planStickySelectKind,
  setPlanSelected,
  togglePlanSelected,
} from '@/ui/composables/plan-canvas/plan-canvas-selected'
import { resolveFmlStickySelectKind } from '@/ui/composables/plan-canvas/plan-canvas-sticky-select'

/** De veertien Selected-refs, als leesbare momentopname. */
function snapshot(s: ReturnType<typeof createPlanCanvasSelection>) {
  return {
    settingsWallIds: s.settingsWallIds.value,
    moveWallId: s.moveWallId.value,
    settingsFacadeGroupId: s.settingsFacadeGroupId.value,
    settingsJunctionId: s.settingsJunctionId.value,
    pinnedJunctionId: s.pinnedJunctionId.value,
    settingsOpeningIds: s.settingsOpeningIds.value,
    moveOpeningId: s.moveOpeningId.value,
    settingsItemId: s.settingsItemId.value,
    moveItemId: s.moveItemId.value,
    settingsAreaId: s.settingsAreaId.value,
    settingsSurfaceId: s.settingsSurfaceId.value,
    settingsLabelId: s.settingsLabelId.value,
    settingsLineId: s.settingsLineId.value,
    moveDimensionId: s.moveDimensionId.value,
  }
}

const EMPTY = {
  settingsWallIds: [],
  moveWallId: null,
  settingsFacadeGroupId: null,
  settingsJunctionId: null,
  pinnedJunctionId: null,
  settingsOpeningIds: [],
  moveOpeningId: null,
  settingsItemId: null,
  moveItemId: null,
  settingsAreaId: null,
  settingsSurfaceId: null,
  settingsLabelId: null,
  settingsLineId: null,
  moveDimensionId: null,
}

/** Zet alle veertien refs, zodat elke test bewijst dát er gewist wordt. */
function fillEverything(s: ReturnType<typeof createPlanCanvasSelection>): void {
  s.settingsWallIds.value = ['w1']
  s.moveWallId.value = 'w1'
  s.settingsFacadeGroupId.value = 'g1'
  s.settingsJunctionId.value = 'j1'
  s.pinnedJunctionId.value = 'j1'
  s.settingsOpeningIds.value = ['o1']
  s.moveOpeningId.value = 'o1'
  s.settingsItemId.value = 'f1'
  s.moveItemId.value = 'f1'
  s.settingsAreaId.value = 'a1'
  s.settingsSurfaceId.value = 's1'
  s.settingsLabelId.value = 'l1'
  s.settingsLineId.value = 'ln1'
  s.moveDimensionId.value = 'd1'
}

describe('clearPlanSelected', () => {
  it('wist de veertien Selected-refs', () => {
    const s = createPlanCanvasSelection()
    fillEverything(s)
    clearPlanSelected(s)
    expect(snapshot(s)).toEqual(EMPTY)
  })

  it('laat drag-state en ToolSession met rust', () => {
    const s = createPlanCanvasSelection()
    s.draggingJunctionId.value = 'j1'
    s.surfaceEditId.value = 'sf1'
    s.activePlanTool.value = 'draw_wall'
    s.hoveredWallId.value = 'w9'
    clearPlanSelected(s)
    expect(s.draggingJunctionId.value).toBe('j1')
    expect(s.surfaceEditId.value).toBe('sf1')
    expect(s.activePlanTool.value).toBe('draw_wall')
    expect(s.hoveredWallId.value).toBe('w9')
  })
})

describe('setPlanSelected — precies één soort blijft over', () => {
  it('muur: settings-lijst en move-doel kunnen samen', () => {
    const s = createPlanCanvasSelection()
    fillEverything(s)
    setPlanSelected(s, { kind: 'wall', settingsIds: ['w7', 'w8'], moveId: 'w7' })
    expect(snapshot(s)).toEqual({
      ...EMPTY,
      settingsWallIds: ['w7', 'w8'],
      moveWallId: 'w7',
    })
  })

  it('knoop: move-doel is de pinned-stand', () => {
    const s = createPlanCanvasSelection()
    fillEverything(s)
    setPlanSelected(s, { kind: 'junction', moveId: 'j7' })
    expect(snapshot(s)).toEqual({ ...EMPTY, pinnedJunctionId: 'j7' })
  })

  it('opening', () => {
    const s = createPlanCanvasSelection()
    fillEverything(s)
    setPlanSelected(s, { kind: 'opening', moveId: 'o7' })
    expect(snapshot(s)).toEqual({ ...EMPTY, moveOpeningId: 'o7' })
  })

  it('fixture', () => {
    const s = createPlanCanvasSelection()
    fillEverything(s)
    setPlanSelected(s, { kind: 'item', moveId: 'f7' })
    expect(snapshot(s)).toEqual({ ...EMPTY, moveItemId: 'f7' })
  })

  it('enkelvoudige soorten pakken het eerste id', () => {
    const cases = [
      ['area', 'settingsAreaId'],
      ['surface', 'settingsSurfaceId'],
      ['label', 'settingsLabelId'],
      ['line', 'settingsLineId'],
      ['facadeGroup', 'settingsFacadeGroupId'],
    ] as const
    for (const [kind, ref] of cases) {
      const s = createPlanCanvasSelection()
      fillEverything(s)
      setPlanSelected(s, { kind, settingsIds: ['x1'] })
      expect(snapshot(s)).toEqual({ ...EMPTY, [ref]: 'x1' })
    }
  })

  it('maatlijn landt op moveDimensionId, ook via settingsIds', () => {
    const viaMove = createPlanCanvasSelection()
    setPlanSelected(viaMove, { kind: 'dimension', moveId: 'd7' })
    expect(viaMove.moveDimensionId.value).toBe('d7')

    const viaIds = createPlanCanvasSelection()
    setPlanSelected(viaIds, { kind: 'dimension', settingsIds: ['d8'] })
    expect(viaIds.moveDimensionId.value).toBe('d8')
  })

  it('null wist alles', () => {
    const s = createPlanCanvasSelection()
    fillEverything(s)
    setPlanSelected(s, null)
    expect(snapshot(s)).toEqual(EMPTY)
  })

  it('kopieert de id-lijst (geen gedeelde array met de aanroeper)', () => {
    const s = createPlanCanvasSelection()
    const ids = ['w1']
    setPlanSelected(s, { kind: 'wall', settingsIds: ids })
    ids.push('w2')
    expect(s.settingsWallIds.value).toEqual(['w1'])
  })
})

describe('togglePlanSelected', () => {
  it('tweede keer op hetzelfde id deselecteert', () => {
    const s = createPlanCanvasSelection()
    togglePlanSelected(s, 'label', 'l1')
    expect(s.settingsLabelId.value).toBe('l1')
    togglePlanSelected(s, 'label', 'l1')
    expect(s.settingsLabelId.value).toBe(null)
  })

  it('ander id wisselt de selectie', () => {
    const s = createPlanCanvasSelection()
    togglePlanSelected(s, 'label', 'l1')
    togglePlanSelected(s, 'label', 'l2')
    expect(s.settingsLabelId.value).toBe('l2')
  })

  it('wist ook de knoop-settings — dat deed de label-toggle eerder niet', () => {
    const s = createPlanCanvasSelection()
    s.settingsJunctionId.value = 'j1'
    togglePlanSelected(s, 'label', 'l1')
    expect(s.settingsJunctionId.value).toBe(null)
    expect(s.settingsLabelId.value).toBe('l1')
  })
})

describe('planStickySelectKind — gelijk aan de losse booleans', () => {
  it('muur wint van opening', () => {
    const s = createPlanCanvasSelection()
    s.settingsWallIds.value = ['w1']
    s.moveOpeningId.value = 'o1'
    expect(planStickySelectKind(s)).toBe('wall')
  })

  it('een knoop telt als muur', () => {
    const s = createPlanCanvasSelection()
    s.pinnedJunctionId.value = 'j1'
    expect(planStickySelectKind(s)).toBe('wall')
  })

  it('een gevelgroep alleen levert geen sticky-kind', () => {
    const s = createPlanCanvasSelection()
    s.settingsFacadeGroupId.value = 'g1'
    expect(planStickySelectKind(s)).toBe(null)
  })

  it('een ruimte of dakvlak levert geen sticky-kind (ruimte is niet sticky)', () => {
    const s = createPlanCanvasSelection()
    s.settingsAreaId.value = 'a1'
    s.settingsSurfaceId.value = 's1'
    expect(planStickySelectKind(s)).toBe(null)
  })

  it('leeg is null', () => {
    expect(planStickySelectKind(createPlanCanvasSelection())).toBe(null)
  })

  /**
   * Het echte bewijs: over alle combinaties van de zes sticky-ingangen moet de
   * store-versie hetzelfde antwoord geven als de bestaande pure functie.
   */
  it('is gelijk aan resolveFmlStickySelectKind over alle 64 combinaties', () => {
    for (let mask = 0; mask < 64; mask += 1) {
      const flags = {
        hasWall: (mask & 1) !== 0,
        hasJunction: (mask & 2) !== 0,
        hasOpening: (mask & 4) !== 0,
        hasItem: (mask & 8) !== 0,
        hasAnnotation: (mask & 16) !== 0,
        hasDimension: (mask & 32) !== 0,
      }
      const s = createPlanCanvasSelection()
      if (flags.hasWall) s.settingsWallIds.value = ['w1']
      if (flags.hasJunction) s.settingsJunctionId.value = 'j1'
      if (flags.hasOpening) s.moveOpeningId.value = 'o1'
      if (flags.hasItem) s.settingsItemId.value = 'f1'
      if (flags.hasAnnotation) s.settingsLineId.value = 'ln1'
      if (flags.hasDimension) s.moveDimensionId.value = 'd1'
      expect(planStickySelectKind(s)).toBe(resolveFmlStickySelectKind(flags))
    }
  })
})
