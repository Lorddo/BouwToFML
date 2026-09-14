/**
 * Karakteriseringstest op de settings-strip.
 *
 * Waarom deze spec bestaat: de strip in `PlanToolbarSettings.vue` **stapelt**
 * panelen. Alleen de gevelgroep onderdrukt de muur-strip; wall / opening /
 * area / label / line / dimension / item hebben elk een eigen `v-if` op hun
 * paneel. Blijft er na een klik een settings-ref van een ander soort staan, dan
 * ziet de tekenaar twee stroken naast elkaar.
 *
 * De vier selectie-ingangen (muur, knoop, opening, ruimte) wissen elk "alles
 * behalve mijn soort", maar met een **ander bereik**. Deze spec legt vast welk
 * bereik dat per ingang precies is, zodat de resterende ruwe schrijvers op de
 * schrijf-lane kunnen zonder blind gedrag te veranderen.
 *
 * Zie `.cursor/docs/refactor/lean/editor-kernel.md` §4.
 */
import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import { createPlanCanvasSelection } from '@/ui/composables/plan-canvas/plan-canvas-selection'
import { createPlanCanvasDraftCommitScheduler } from '@/ui/composables/plan-canvas/plan-canvas-draft-commit'
import { usePlanCanvasWallSelection } from '@/ui/composables/plan-canvas/usePlanCanvasWallSelection'
import { usePlanCanvasOpeningSelection } from '@/ui/composables/plan-canvas/usePlanCanvasOpeningSelection'
import { usePlanCanvasAreaSelection } from '@/ui/composables/plan-canvas/usePlanCanvasAreaSelection'
import { usePlanEditor } from '@/ui/composables/usePlanEditor'

type Selection = ReturnType<typeof createPlanCanvasSelection>

/**
 * Welke stroken openstaan. Bewust afgeleid uit de settings-refs en niet uit de
 * render-model-panelen: een paneel kan óók `null` zijn omdat het object niet in
 * het model staat, en dat is een andere vraag dan "wat is geselecteerd".
 *
 * De onderdrukkingsregel uit de template staat er wél in, want die is echt:
 * een gevelgroep-selectie verbergt de muur-strip.
 */
function openPanels(s: Selection): string[] {
  const open: string[] = []
  if (s.settingsFacadeGroupId.value != null) open.push('facadeGroup')
  else if (s.settingsWallIds.value.length > 0 || s.settingsJunctionId.value != null) {
    open.push('wall')
  }
  if (s.settingsOpeningIds.value.length > 0) open.push('opening')
  if (s.settingsAreaId.value != null || s.settingsSurfaceId.value != null) open.push('area')
  if (s.settingsLabelId.value != null) open.push('label')
  if (s.settingsLineId.value != null) open.push('line')
  if (s.moveDimensionId.value != null) open.push('dimension')
  if (s.settingsItemId.value != null) open.push('item')
  return open
}

function samplePlan(): FloorPlan {
  return {
    name: 'Test',
    floors: [
      {
        name: 'BG',
        level: 0,
        height: 280,
        walls: [
          {
            id: 'w1',
            a: { x: 0, y: 0 },
            b: { x: 400, y: 0 },
            thickness: 10,
            openings: [
              { id: 'o1', kind: 'door.single', t: 0.3, width: 90, type: 'door' },
              { id: 'o2', kind: 'window.single', t: 0.7, width: 120, type: 'window' },
              { id: 'o3', kind: 'window.single', t: 0.85, width: 60, type: 'window' },
            ],
          },
          { id: 'w2', a: { x: 400, y: 0 }, b: { x: 400, y: 300 }, thickness: 10, openings: [] },
        ],
        areas: [
          {
            id: 'a1',
            name: 'Woonkamer',
            poly: [
              { x: 0, y: 0 },
              { x: 400, y: 0 },
              { x: 400, y: 300 },
            ],
          },
          {
            id: 'a2',
            name: 'Keuken',
            poly: [
              { x: 0, y: 0 },
              { x: 200, y: 0 },
              { x: 200, y: 150 },
            ],
          },
        ],
      },
    ],
  } as unknown as FloorPlan
}

/** Eén editor + één selectie-bak, met de drie echte selectie-composables erop. */
function setup() {
  const scope = effectScope()
  const built = scope.run(() => {
    const plan = ref(samplePlan())
    const floorIndex = ref(0)
    const editor = usePlanEditor(plan, floorIndex)
    const selection = createPlanCanvasSelection()
    const draftCommit = createPlanCanvasDraftCommitScheduler()
    const noop = () => {}

    const shared = {
      editor,
      selection,
      syncPlanToParent: noop,
      draftCommit,
      flushPendingFieldCommits: () => draftCommit.flushAll(),
      cancelMoveDragPending: noop,
      cancelOpeningDragPending: noop,
    }

    const wall = usePlanCanvasWallSelection({
      ...shared,
      hitTest: { containerRectToCmBBox: () => null },
      containerRef: ref(null),
      cancelDrawWallDrag: noop,
      cancelMeasureDrag: noop,
    })
    const opening = usePlanCanvasOpeningSelection(shared)
    const area = usePlanCanvasAreaSelection(shared)

    return { selection, wall, opening, area }
  })!
  return { ...built, stop: () => scope.stop() }
}

/**
 * Opening-selectie-ids zijn samengesteld (`buildLocalOpeningId`), niet de ruwe
 * `opening.id`. Met een ruw id valt `toggleSettingsOpening` in zijn fallback-tak
 * en test de spec de verkeerde helft.
 */
const DOOR_ID = 'w1-door-o1'
const WINDOW_ID = 'w1-window-o2'

/** Zet één settings-ref van elk ander soort, zodat elke test bewijst wát er blijft staan. */
function selectOneOfEverything(s: Selection): void {
  s.settingsWallIds.value = ['w1']
  s.settingsJunctionId.value = 'j1'
  s.settingsOpeningIds.value = [DOOR_ID]
  s.settingsAreaId.value = 'a1'
  s.settingsSurfaceId.value = 'sf1'
  s.settingsLabelId.value = 'l1'
  s.settingsLineId.value = 'ln1'
  s.settingsItemId.value = 'f1'
  s.moveDimensionId.value = 'd1'
}

describe('settings-strip: welke stroken staan open na één klik', () => {
  it('muur-klik sluit elke andere strook', () => {
    const { selection, wall, stop } = setup()
    selectOneOfEverything(selection)

    // 'w1' stond al geselecteerd, dus dit is de deselect-tak: niets meer open.
    wall.toggleSettingsWall('w1')

    expect(openPanels(selection)).toEqual([])
    expect(selection.settingsWallIds.value).toEqual([])
    stop()
  })

  it('muur-klik op een andere muur laat alleen de muur-strook open', () => {
    const { selection, wall, stop } = setup()
    selectOneOfEverything(selection)

    wall.toggleSettingsWall('w2')

    expect(openPanels(selection)).toEqual(['wall'])
    expect(selection.settingsWallIds.value).toEqual(['w1', 'w2'])
    stop()
  })

  it('knoop-klik sluit elke andere strook', () => {
    const { selection, wall, stop } = setup()
    selectOneOfEverything(selection)

    wall.toggleSettingsJunction('j9')

    expect(openPanels(selection)).toEqual(['wall'])
    expect(selection.settingsJunctionId.value).toBe('j9')
    expect(selection.pinnedJunctionId.value).toBe('j9')
    stop()
  })

  it('opening-klik sluit elke andere strook', () => {
    const { selection, opening, stop } = setup()
    selectOneOfEverything(selection)

    opening.toggleSettingsOpening(WINDOW_ID)

    expect(openPanels(selection)).toEqual(['opening'])
    stop()
  })

  it('deur plus raam vervangt de selectie in plaats van te stapelen', () => {
    // De type-guard: gemengde soorten kunnen geen gedeeld paneel vullen.
    const { selection, opening, stop } = setup()
    selection.settingsOpeningIds.value = [DOOR_ID]

    opening.toggleSettingsOpening(WINDOW_ID)

    expect(selection.settingsOpeningIds.value).toEqual([WINDOW_ID])
    stop()
  })

  it('twee ramen stapelen wel', () => {
    const { selection, opening, stop } = setup()

    opening.toggleSettingsOpening(WINDOW_ID)
    opening.toggleSettingsOpening('w1-window-o3')

    expect(selection.settingsOpeningIds.value).toEqual([WINDOW_ID, 'w1-window-o3'])
    stop()
  })

  it('een onbekend opening-id komt zonder type-guard in de lijst', () => {
    // Bewust vastgelegd: de fallback-tak slaat de soort-controle over. In
    // productie komen ids uit een hit-test, dus dit is geen live bug — maar het
    // is wel de reden dat een ruw `opening.id` in een test stil doorglipt.
    const { selection, opening, stop } = setup()
    selection.settingsOpeningIds.value = [DOOR_ID]

    opening.toggleSettingsOpening('bestaat-niet')

    expect(selection.settingsOpeningIds.value).toEqual([DOOR_ID, 'bestaat-niet'])
    stop()
  })

  it('ruimte-klik sluit elke andere strook', () => {
    const { selection, area, stop } = setup()
    selectOneOfEverything(selection)

    area.toggleSettingsArea('a2')

    expect(openPanels(selection)).toEqual(['area'])
    expect(selection.settingsAreaId.value).toBe('a2')
    stop()
  })

  it('tweede klik op dezelfde ruimte sluit de strook', () => {
    const { selection, area, stop } = setup()
    selectOneOfEverything(selection)

    area.toggleSettingsArea('a1')

    expect(selection.settingsAreaId.value).toBeNull()
    stop()
  })

  it('de vier ingangen wissen nu hetzelfde: precies één strook blijft over', () => {
    // Vóór 2026-09-14 wisten ze elk een ánder bereik: de muur pakte de ruimte,
    // knoop en opening lieten die staan, en niemand raakte label/lijn/maatlijn.
    // Dat gaf twee stroken naast elkaar. Nu loopt alles via één schrijf-lane.
    const cases: Array<[string, (h: ReturnType<typeof setup>) => void]> = [
      ['muur', (h) => h.wall.toggleSettingsWall('w2')],
      ['knoop', (h) => h.wall.toggleSettingsJunction('j9')],
      ['opening', (h) => h.opening.toggleSettingsOpening(WINDOW_ID)],
      ['ruimte', (h) => h.area.toggleSettingsArea('a2')],
    ]

    for (const [name, act] of cases) {
      const h = setup()
      selectOneOfEverything(h.selection)
      act(h)
      expect(openPanels(h.selection), `${name}-klik laat meer dan één strook open`).toHaveLength(1)
      h.stop()
    }
  })

  it('tweede klik op dezelfde knoop sluit de strook', () => {
    const { selection, wall, stop } = setup()

    wall.toggleSettingsJunction('j9')
    expect(selection.settingsJunctionId.value).toBe('j9')

    wall.toggleSettingsJunction('j9')
    expect(selection.settingsJunctionId.value).toBeNull()
    stop()
  })

  it('muur-klik met een gevelgroep open verlaat de groep en pakt één muur', () => {
    const { selection, wall, stop } = setup()
    selection.settingsFacadeGroupId.value = 'g1'
    selection.settingsWallIds.value = ['w1', 'w2']

    wall.toggleSettingsWall('w2')

    // Niet toevoegen aan de groepsselectie, maar er uit stappen naar één muur.
    expect(selection.settingsFacadeGroupId.value).toBeNull()
    expect(selection.settingsWallIds.value).toEqual(['w2'])
    expect(openPanels(selection)).toEqual(['wall'])
    stop()
  })

  it('muren stapelen bij Ctrl-klik, en klikken op een geselecteerde haalt hem eruit', () => {
    const { selection, wall, stop } = setup()

    wall.toggleSettingsWall('w1')
    wall.toggleSettingsWall('w2')
    expect(selection.settingsWallIds.value).toEqual(['w1', 'w2'])

    wall.toggleSettingsWall('w1')
    expect(selection.settingsWallIds.value).toEqual(['w2'])
    stop()
  })

  it('left-klik op een muur zet een verplaats-doel zonder settings-lijst', () => {
    const { selection, wall, stop } = setup()
    selectOneOfEverything(selection)

    wall.selectWall('w1', { x: 10, y: 0 })

    expect(selection.settingsWallIds.value).toEqual([])
    expect(selection.moveWallId.value).toBe('w1')
    expect(selection.settingsAreaId.value).toBeNull()
    stop()
  })

  it('clearSelection sluit alles, inclusief annotatie en maatlijn', () => {
    const { selection, wall, stop } = setup()
    selectOneOfEverything(selection)

    wall.clearSelection()

    expect(openPanels(selection)).toEqual([])
    stop()
  })
})

describe('settings-strip: verplaats-modus versus paneel', () => {
  it('een verplaats-doel alleen opent geen strook', () => {
    const { selection, stop } = setup()
    selection.moveWallId.value = 'w1'
    selection.moveOpeningId.value = 'o1'
    selection.pinnedJunctionId.value = 'j1'

    // De strip kijkt naar settings-refs; move-refs tekenen alleen grepen.
    // Uitzondering: de maatlijn heeft geen settings-ref en gebruikt moveDimensionId.
    expect(openPanels(selection)).toEqual([])
    stop()
  })

  it('de maatlijn is de uitzondering: die opent op zijn move-ref', () => {
    const { selection, stop } = setup()
    selection.moveDimensionId.value = 'd1'
    expect(openPanels(selection)).toEqual(['dimension'])
    stop()
  })
})

describe('settings-strip: annotatie en muur zijn nu symmetrisch', () => {
  it('label-dan-muur en muur-dan-label geven hetzelfde resultaat', async () => {
    const { togglePlanSelected } = await import(
      '@/ui/composables/plan-canvas/plan-canvas-selected'
    )

    const labelFirst = setup()
    togglePlanSelected(labelFirst.selection, 'label', 'l9')
    labelFirst.wall.toggleSettingsWall('w1')
    expect(openPanels(labelFirst.selection)).toEqual(['wall'])
    labelFirst.stop()

    const wallFirst = setup()
    wallFirst.wall.toggleSettingsWall('w1')
    togglePlanSelected(wallFirst.selection, 'label', 'l9')
    expect(openPanels(wallFirst.selection)).toEqual(['label'])
    wallFirst.stop()
  })
})

describe('settings-strip: geen onbedoelde plan-mutatie', () => {
  it('selecteren muteert het plan niet', () => {
    const scope = effectScope()
    scope.run(() => {
      const plan = ref(samplePlan())
      const before = JSON.stringify(plan.value)
      const floorIndex = ref(0)
      const editor = usePlanEditor(plan, floorIndex)
      const selection = createPlanCanvasSelection()
      const draftCommit = createPlanCanvasDraftCommitScheduler()
      const syncPlanToParent = vi.fn()
      const noop = () => {}

      const wall = usePlanCanvasWallSelection({
        editor,
        selection,
        syncPlanToParent,
        draftCommit,
        flushPendingFieldCommits: () => draftCommit.flushAll(),
        hitTest: { containerRectToCmBBox: () => null },
        containerRef: ref(null),
        cancelMoveDragPending: noop,
        cancelDrawWallDrag: noop,
        cancelMeasureDrag: noop,
      })

      wall.toggleSettingsWall('w1')
      wall.toggleSettingsJunction('j1')
      wall.clearSelection()

      expect(JSON.stringify(plan.value)).toBe(before)
    })
    scope.stop()
  })
})
