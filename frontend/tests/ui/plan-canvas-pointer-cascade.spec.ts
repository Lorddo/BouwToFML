import { describe, expect, it } from 'vitest'
import { makeJunction, makePointerHarness } from './plan-canvas-pointer-harness'

/**
 * Karakteriseringstests op `onWrapPointerDown` — fase 3.0 van de kernel-campagne.
 * Zie `.cursor/docs/refactor/lean/editor-kernel.md` §5 voor de kaart van de 28
 * exit-punten.
 *
 * Deze tests beschrijven het gedrag zoals het NU is, niet zoals het zou moeten
 * zijn. Ze bestaan om fase 3 (selectie-store) en 4 (hit-cascade + tool-registry)
 * te kunnen herschrijven zonder te gokken. Gaat er hier iets rood: eerst
 * uitzoeken of de wijziging bedoeld was, niet de verwachting aanpassen.
 */

describe('pointer-cascade — A. guards', () => {
  it('negeert alles behalve de linkermuisknop', () => {
    const h = makePointerHarness({ hits: { wall: 'w1' } })
    h.click({ button: 2 })
    expect(h.calls).toEqual([])
  })

  it('laat klikken op canvas-chrome (toolbelt) door aan de DOM', () => {
    const h = makePointerHarness({ hits: { wall: 'w1' } })
    h.click({ chrome: true })
    expect(h.calls).toEqual([])
  })

  it('pant met Space in plaats van te selecteren', () => {
    const h = makePointerHarness({ hits: { wall: 'w1' }, space: true })
    h.click()
    expect(h.calls).toEqual(['beginPanDrag'])
  })

  it('doet niets als de cursor buiten het canvas valt', () => {
    const h = makePointerHarness({ hits: { wall: 'w1' }, noCm: true })
    h.click()
    expect(h.calls).toEqual(['stopContentGroupDrag'])
  })
})

describe('pointer-cascade — B. lopende precise-move wint van alles', () => {
  it('muur-move: tweede klik plaatst, ook met een tool actief', () => {
    const h = makePointerHarness({
      drafts: { wallMove: true },
      modes: { tool: 'draw_wall' },
      hits: { wall: 'w1' },
    })
    h.click()
    expect(h.calls).toEqual(['stopContentGroupDrag', 'onWallMoveClick'])
  })

  it('knoop-move gaat vóór een knoop-hit', () => {
    const h = makePointerHarness({
      drafts: { junctionMove: true },
      hits: { junction: makeJunction('j1', ['w1']) },
    })
    h.click()
    expect(h.calls).toContain('onJunctionMoveClick')
    expect(h.calls).not.toContain('startJunctionDrag')
  })

  it('opening-move gaat vóór een opening-hit', () => {
    const h = makePointerHarness({
      drafts: { openingMove: true },
      hits: { opening: 'o1' },
    })
    h.click()
    expect(h.calls).toContain('onOpeningMoveClick')
    expect(h.calls).not.toContain('startOpeningDragPending')
  })
})

describe('pointer-cascade — C. tool-dispatch gaat vóór selectie', () => {
  const cases: Array<[NonNullable<Parameters<typeof makePointerHarness>[0]>, string]> = [
    [{ modes: { tool: 'inspect' } }, 'applyInspectPick'],
    [{ modes: { tool: 'draw_wall' } }, 'onDrawWallClick'],
    [{ modes: { tool: 'measure' } }, 'beginMeasure'],
    [{ modes: { tool: 'nulpunt' } }, 'beginNulpuntDrag'],
    [{ modes: { tool: 'underlay_move' } }, 'beginUnderlayMoveDrag'],
    [{ modes: { tool: 'draw_room' } }, 'onDrawRoomClick'],
    [{ modes: { tool: 'draw_surface' } }, 'onDrawSurfaceClick'],
    [{ modes: { tool: 'draw_label' } }, 'onDrawLabelClick'],
    [{ modes: { tool: 'draw_line' } }, 'onDrawLineClick'],
  ]

  for (const [options, expected] of cases) {
    const tool = options.modes?.tool ?? 'geen'
    it(`${tool} pakt de klik, ook met een muur eronder`, () => {
      const h = makePointerHarness({ ...options, hits: { wall: 'w1', area: 'a1' } })
      h.click()
      expect(h.calls).toContain(expected)
      expect(h.calls).not.toContain('selectWall')
      expect(h.calls).not.toContain('selectSettingsArea')
    })
  }

  it('deur plaatsen vraagt een muur onder de cursor', () => {
    const met = makePointerHarness({ modes: { tool: 'add_door' }, hits: { wall: 'w1' } })
    met.click()
    expect(met.calls).toContain('placeDoor')
    // Geplaatst = tool klaar.
    expect(met.selection.activePlanTool.value).toBe(null)

    const zonder = makePointerHarness({ modes: { tool: 'add_door' }, hits: {} })
    zonder.click()
    expect(zonder.calls).not.toContain('placeDoor')
    // Geen muur: de klik valt weg, hij zakt niet door naar de selectie.
    expect(zonder.calls).not.toContain('clearSelection')
  })

  it('raam plaatsen gebruikt hetzelfde pad als de deur', () => {
    const h = makePointerHarness({ modes: { tool: 'add_window' }, hits: { wall: 'w1' } })
    h.click()
    expect(h.calls).toContain('placeWindow')
  })

  it('fixture plaatsen selecteert het nieuwe object en zet de tool uit', () => {
    const h = makePointerHarness({ modes: { tool: 'add_fixture' }, placed: 'f9' })
    h.click()
    expect(h.calls).toContain('placeFixture')
    expect(h.selection.settingsItemId.value).toBe('f9')
    expect(h.selection.activePlanTool.value).toBe(null)
  })

  it('surface-edit is het enige tool-punt dat kan doorvallen', () => {
    const consumeert = makePointerHarness({
      hits: { wall: 'w1' },
      handles: { surfaceEditConsumes: true },
    })
    consumeert.selection.surfaceEditId.value = 's1'
    consumeert.click()
    expect(consumeert.calls).toContain('onSurfaceEditPointerDown')
    expect(consumeert.calls).not.toContain('selectWall')

    const valtDoor = makePointerHarness({
      hits: { wall: 'w1' },
      handles: { surfaceEditConsumes: false },
    })
    valtDoor.selection.surfaceEditId.value = 's1'
    valtDoor.click()
    expect(valtDoor.calls).toContain('onSurfaceEditPointerDown')
    expect(valtDoor.calls).toContain('selectWall')
  })
})

describe('pointer-cascade — D. select-cascade', () => {
  it('13 — grepen van de geselecteerde fixture: rotatie vóór resize', () => {
    const beide = makePointerHarness({ handles: { itemRotate: 'nw', itemResize: 'n' } })
    beide.selection.settingsItemId.value = 'f1'
    beide.click()
    expect(beide.calls).toContain('beginItemRotate')
    expect(beide.calls).not.toContain('beginItemResize')

    const alleenResize = makePointerHarness({ handles: { itemResize: 'n' } })
    alleenResize.selection.settingsItemId.value = 'f1'
    alleenResize.click()
    expect(alleenResize.calls).toContain('beginItemResize')
  })

  it('14 — opening-grepen: move sleept, start/end verschaalt', () => {
    const move = makePointerHarness({ handles: { openingHandle: 'move' } })
    move.selection.moveOpeningId.value = 'o1'
    move.click()
    expect(move.calls).toContain('beginOpeningDrag')

    const resize = makePointerHarness({ handles: { openingHandle: 'end' } })
    resize.selection.moveOpeningId.value = 'o1'
    resize.click()
    expect(resize.calls).toContain('beginOpeningResize')
  })

  it('14 — opening-greep alleen bij precies één settings-selectie', () => {
    const twee = makePointerHarness({ handles: { openingHandle: 'end' } })
    twee.selection.settingsOpeningIds.value = ['o1', 'o2']
    twee.click()
    expect(twee.calls).not.toContain('beginOpeningResize')
  })

  it('15 — knoop: Ctrl = settings, Shift = precise, touch = pinnen, anders slepen', () => {
    const junction = makeJunction('j1', ['w1'])

    const ctrl = makePointerHarness({ hits: { junction }, modes: { ctrl: true } })
    ctrl.click()
    expect(ctrl.calls).toEqual(['stopContentGroupDrag', 'toggleSettingsJunction'])

    const shift = makePointerHarness({ hits: { junction } })
    shift.click({ shift: true })
    expect(shift.calls).toContain('onJunctionMoveClick')

    const touch = makePointerHarness({ hits: { junction }, modes: { touchNav: true } })
    touch.click()
    expect(touch.calls).not.toContain('startJunctionDrag')
    expect(touch.selection.pinnedJunctionId.value).toBe('j1')

    const desktop = makePointerHarness({ hits: { junction } })
    desktop.click()
    expect(desktop.calls).toContain('startJunctionDrag')
  })

  it('16 — dikte-pick staat vóór box-select én vóór de opening (anomalie)', () => {
    const h = makePointerHarness({
      hits: { wall: 'w1', opening: 'o1' },
      modes: { tool: 'selection_box' },
      thicknessTier: 'mid',
    })
    h.click()
    expect(h.emitted).toEqual(['w1'])
    expect(h.calls).not.toContain('beginSelectionBoxDrag')
    expect(h.calls).not.toContain('startOpeningDragPending')
  })

  it('17 — box-select gaat vóór de opening, maar niet vóór de knoop', () => {
    const opening = makePointerHarness({
      hits: { opening: 'o1' },
      modes: { tool: 'selection_box' },
    })
    opening.click()
    expect(opening.calls).toContain('beginSelectionBoxDrag')

    const knoop = makePointerHarness({
      hits: { junction: makeJunction('j1', ['w1']) },
      modes: { tool: 'selection_box' },
    })
    knoop.click()
    expect(knoop.calls).toContain('startJunctionDrag')
    expect(knoop.calls).not.toContain('beginSelectionBoxDrag')
  })

  it('18 — opening wist de andere selecties en gaat vóór fixture en muur', () => {
    const h = makePointerHarness({ hits: { opening: 'o1', item: 'f1', wall: 'w1' } })
    h.selection.settingsAreaId.value = 'a1'
    h.click()
    expect(h.calls).toContain('startOpeningDragPending')
    expect(h.calls).not.toContain('selectWall')
    expect(h.calls).not.toContain('startItemDragPending')
    expect(h.selection.moveOpeningId.value).toBe('o1')
    // De opening-tak wist twaalf refs met de hand; de ruimte hoort daarbij.
    expect(h.selection.settingsAreaId.value).toBe(null)
  })

  it('19 — fixture gaat vóór ruimte en muur', () => {
    const h = makePointerHarness({ hits: { item: 'f1', area: 'a1', wall: 'w1' } })
    h.click()
    expect(h.calls).toContain('startItemDragPending')
    expect(h.calls).not.toContain('selectWall')
    expect(h.selection.moveItemId.value).toBe('f1')
  })

  it('20 — maatlijn: eindpunt gaat vóór de lijn zelf', () => {
    const eind = makePointerHarness({
      handles: { dimension: 'd1', dimensionEnd: { id: 'd1', end: 'b' } },
    })
    eind.click()
    expect(eind.calls).toContain('beginDimensionEndpointDrag')
    expect(eind.calls).not.toContain('startDimensionDragPending')

    const lijn = makePointerHarness({ handles: { dimension: 'd1' } })
    lijn.click()
    expect(lijn.calls).toContain('startDimensionDragPending')
    expect(lijn.selection.moveDimensionId.value).toBe('d1')
  })

  it('21/22 — label en lijn reageren alleen op Ctrl', () => {
    const zonder = makePointerHarness({ hits: { label: 'l1', line: 'ln1' } })
    zonder.click()
    expect(zonder.calls).not.toContain('toggleSettingsLabel')
    expect(zonder.calls).not.toContain('toggleSettingsLine')

    const met = makePointerHarness({ hits: { label: 'l1' }, modes: { ctrl: true } })
    met.click()
    expect(met.calls).toContain('toggleSettingsLabel')

    const lijn = makePointerHarness({ hits: { line: 'ln1' }, modes: { ctrl: true } })
    lijn.click()
    expect(lijn.calls).toContain('toggleSettingsLine')
  })

  it('23 — naam van de al geselecteerde ruimte sleept het label', () => {
    const h = makePointerHarness({
      hits: { area: 'a1', areaName: { kind: 'area', id: 'a1' } },
    })
    h.selection.settingsAreaId.value = 'a1'
    h.click()
    expect(h.calls).toContain('beginAreaLabelDrag')
  })

  it('24/25/26 — surface vóór ruimte; Ctrl toggelt, gewone klik selecteert', () => {
    const surface = makePointerHarness({ hits: { surface: 's1', area: 'a1' } })
    surface.click()
    expect(surface.calls).toContain('toggleSettingsSurface')
    expect(surface.calls).not.toContain('selectSettingsArea')

    const ruimte = makePointerHarness({ hits: { area: 'a1' } })
    ruimte.click()
    expect(ruimte.calls).toContain('selectSettingsArea')

    const ctrl = makePointerHarness({ hits: { area: 'a1' }, modes: { ctrl: true } })
    ctrl.click()
    expect(ctrl.calls).toContain('toggleSettingsArea')
  })

  it('24/26 — zonder areaSurfaceEdit blijft ruimte en surface onaanraakbaar', () => {
    const h = makePointerHarness({
      hits: { area: 'a1', surface: 's1' },
      modes: { areaSurfaceEdit: false },
    })
    h.click()
    expect(h.calls).toContain('clearSelection')
    expect(h.calls).not.toContain('selectSettingsArea')
    expect(h.calls).not.toContain('toggleSettingsSurface')
  })

  it('28 — muur onder de cursor wint van de ruimte (wallPreemptsAreaHit)', () => {
    const h = makePointerHarness({ hits: { wall: 'w1', area: 'a1', surface: 's1' } })
    h.click()
    expect(h.calls).toContain('selectWall')
    expect(h.calls).not.toContain('selectSettingsArea')
    expect(h.calls).not.toContain('toggleSettingsSurface')
  })

  it('28 — muur: Ctrl = settings-toggle, Shift = precise, anders drag-pending', () => {
    const ctrl = makePointerHarness({ hits: { wall: 'w1' }, modes: { ctrl: true } })
    ctrl.click()
    expect(ctrl.calls).toEqual(['stopContentGroupDrag', 'toggleSettingsWall'])

    const shift = makePointerHarness({ hits: { wall: 'w1' } })
    shift.click({ shift: true })
    expect(shift.calls).toContain('onWallMoveClick')

    const desktop = makePointerHarness({ hits: { wall: 'w1' } })
    desktop.click()
    expect(desktop.calls).toEqual([
      'stopContentGroupDrag',
      'clearOpeningSelectionState',
      'cancelItemDragPending',
      'selectWall',
      'startMoveDragPending',
    ])
  })

  it('27 — leeg in een ruimte deselecteert, en steelt de muur niet', () => {
    const h = makePointerHarness({ hits: { area: 'a1' }, modes: { areaSurfaceEdit: false } })
    h.click()
    expect(h.calls).toContain('clearSelection')
  })

  it('klik in het niets deselecteert', () => {
    const h = makePointerHarness({ hits: {} })
    h.click()
    expect(h.calls).toEqual(['stopContentGroupDrag', 'clearSelection'])
  })
})

describe('pointer-cascade — sticky selectie', () => {
  it('houdt een muur vast bij een klik op een deur', () => {
    const h = makePointerHarness({ hits: { opening: 'o1', wall: 'w1' } })
    h.selection.settingsWallIds.value = ['w1']
    h.click()
    expect(h.calls).not.toContain('startOpeningDragPending')
    expect(h.calls).toContain('selectWall')
  })

  it('houdt een opening vast bij een klik op de muur eronder', () => {
    const h = makePointerHarness({ hits: { opening: null, wall: 'w1' } })
    h.selection.moveOpeningId.value = 'o1'
    h.click()
    expect(h.calls).not.toContain('selectWall')
  })

  it('een geselecteerde fixture blokkeert de opening eronder', () => {
    const h = makePointerHarness({ hits: { opening: 'o1', item: 'f1' } })
    h.selection.settingsItemId.value = 'f1'
    h.click()
    expect(h.calls).not.toContain('startOpeningDragPending')
    expect(h.calls).toContain('startItemDragPending')
  })
})

describe('pointer-cascade — dak-as (view, geen capability)', () => {
  const junction = makeJunction('j1', ['w1'])

  it('geen fixture-grepen op de Dak-tab', () => {
    const h = makePointerHarness({
      handles: { itemRotate: 'nw' },
      modes: { dak: true },
    })
    h.selection.settingsItemId.value = 'f1'
    h.click()
    expect(h.calls).not.toContain('beginItemRotate')
  })

  it('fixtures zijn niet aan te klikken op de Dak-tab', () => {
    const plan = makePointerHarness({ hits: { item: 'f1' } })
    plan.click()
    expect(plan.calls).toContain('startItemDragPending')

    const dak = makePointerHarness({ hits: { item: 'f1' }, modes: { dak: true } })
    dak.click()
    expect(dak.calls).not.toContain('startItemDragPending')
  })

  it('knoop alleen als er een nok-muur aan hangt', () => {
    const nok = makePointerHarness({
      hits: { junction },
      modes: { dak: true, ridgeWallIds: ['w1'] },
    })
    nok.click()
    expect(nok.calls).toContain('startJunctionDrag')

    const gewoon = makePointerHarness({ hits: { junction }, modes: { dak: true } })
    gewoon.click()
    expect(gewoon.calls).not.toContain('startJunctionDrag')
  })

  it('niet-nok-muur deselecteert in plaats van te selecteren', () => {
    const h = makePointerHarness({ hits: { wall: 'w1' }, modes: { dak: true } })
    h.click()
    expect(h.calls).toContain('clearSelection')
    expect(h.calls).not.toContain('selectWall')
  })

  it('nok-muur is wel te pakken op de Dak-tab', () => {
    const h = makePointerHarness({
      hits: { wall: 'r1' },
      modes: { dak: true, ridgeWallIds: ['r1'] },
    })
    h.click()
    expect(h.calls).toContain('selectWall')
  })

  it('een nok onder de cursor gaat vóór het dakvlak', () => {
    const h = makePointerHarness({
      hits: { wall: 'r1', surface: 's1' },
      modes: { dak: true, ridgeWallIds: ['r1'] },
    })
    h.click()
    expect(h.calls).toContain('selectWall')
    expect(h.calls).not.toContain('toggleSettingsSurface')
  })
})
