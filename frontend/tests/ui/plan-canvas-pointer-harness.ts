import { computed, ref, type Ref } from 'vue'
import {
  usePlanCanvasPointer,
  type PointerActions,
  type PointerDragState,
  type PointerToolModes,
} from '@/ui/composables/plan-canvas/usePlanCanvasPointer'
import {
  createPlanCanvasSelection,
  type PlanCanvasSelectionRefs,
} from '@/ui/composables/plan-canvas/plan-canvas-selection'
import {
  createPlanViewContext,
  type PlanViewContext,
} from '@/ui/composables/plan-canvas/plan-view-context'
import type { HitTestApi } from '@/ui/composables/plan-canvas/plan-canvas-hit-test-api'
import type { RenderJunction } from '@/ui/composables/plan-canvas/plan-canvas-render-types'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'

/**
 * Harnas voor de karakteriseringstests op `onWrapPointerDown`.
 *
 * De pointer krijgt al zijn buitenwereld via één options-object, dus er is geen
 * component-mount nodig. Elke actie wordt geregistreerd in `calls`; een test zegt
 * "deze actie won, die andere niet" en dat is precies wat prioriteit betekent.
 */

/**
 * De pointer leest `document.activeElement` en doet `target instanceof Element`,
 * terwijl vitest hier op `environment: 'node'` staat. Zonder shim knalt de guard
 * op een ReferenceError — dat is de reden dat deze keten nooit een test had.
 * Bij de kernel-extractie (fase 4a) hoort die DOM-afhankelijkheid uit de cascade.
 */
class FakeElement {
  constructor(private readonly isChrome = false) {}
  closest(_selector: string): FakeElement | null {
    return this.isChrome ? this : null
  }
  contains(_other: unknown): boolean {
    return false
  }
}

function ensureDomShim(): void {
  const g = globalThis as unknown as Record<string, unknown>
  g.Element ??= FakeElement
  g.HTMLElement ??= FakeElement
  g.document ??= { activeElement: null }
}

/** Wat de hit-test onder de cursor vindt. Alles leeg = klik in het niets. */
export interface HitFixture {
  wall?: string | null
  opening?: string | null
  surface?: string | null
  area?: string | null
  areaName?: { kind: 'area' | 'surface'; id: string } | null
  label?: string | null
  line?: string | null
  junction?: RenderJunction | null
  item?: string | null
}

/** Losse handles die de pointer los van de hit-test opvraagt. */
export interface HandleFixture {
  openingHandle?: 'move' | 'start' | 'end' | null
  itemResize?: 'n' | 's' | 'e' | 'w' | null
  itemRotate?: 'nw' | 'ne' | 'se' | 'sw' | null
  dimension?: string | null
  dimensionEnd?: { id: string; end: 'a' | 'b' } | null
  /** `onSurfaceEditPointerDown`: true = klik geconsumeerd, false = valt door. */
  surfaceEditConsumes?: boolean
}

export interface ModeFixture {
  tool?:
    | 'draw_wall'
    | 'draw_room'
    | 'draw_surface'
    | 'draw_label'
    | 'draw_line'
    | 'add_door'
    | 'add_window'
    | 'add_fixture'
    | 'measure'
    | 'nulpunt'
    | 'underlay_move'
    | 'selection_box'
    | 'inspect'
    | null
  dak?: boolean
  /** Muur-ids die als nok gelden (bepaalt wat op de Dak-tab te pakken is). */
  ridgeWallIds?: string[]
  areaSurfaceEdit?: boolean
  annotationEdit?: boolean
  labelsVisible?: boolean
  manualDimensions?: boolean
  /** Ctrl — settings-modifier. */
  ctrl?: boolean
  /** Move-modifier (mobiele Move-knop). */
  moveMod?: boolean
  /** Touch-navigatie: tik = selecteren, niet slepen. */
  touchNav?: boolean
}

export interface DraftFixture {
  wallMove?: boolean
  junctionMove?: boolean
  openingMove?: boolean
}

export function makeJunction(id: string, wallIds: string[] = []): RenderJunction {
  return {
    id,
    x: 0,
    y: 0,
    cmX: 0,
    cmY: 0,
    refs: wallIds.map((wallId) => ({ wallId, end: 'a' as const })),
    wallCount: wallIds.length,
  } as unknown as RenderJunction
}

function makeHitTest(hits: HitFixture, noCm: boolean): HitTestApi {
  const at = <T>(value: T | null | undefined): T | null => value ?? null
  return {
    hitTestWallAtCm: () => at(hits.wall),
    hitTestDoorAtCm: () => at(hits.opening),
    hitTestOpeningAtCm: () => at(hits.opening),
    hitTestSurfaceAtCm: () => at(hits.surface),
    hitTestAreaAtCm: () => at(hits.area),
    hitTestAreaNameAtCm: () => at(hits.areaName),
    hitTestLabelAtCm: () => at(hits.label),
    hitTestLineAtCm: () => at(hits.line),
    hitTestJunctionAtCm: () => at(hits.junction),
    hitTestItemAtCm: () => at(hits.item),
    handleHitTolCm: () => 10,
    clientToCm: (clientX, clientY) => (noCm ? null : { x: clientX, y: clientY }),
    containerRectToCmBBox: (rect) => rect,
  }
}

function makeView(fx: ModeFixture): PlanViewContext {
  const ridge = new Set(fx.ridgeWallIds ?? [])
  return createPlanViewContext({
    isDak: () => fx.dak === true,
    isRidgeWallId: (wallId) => ridge.has(wallId),
  })
}

function makeModes(fx: ModeFixture, handles: HandleFixture): PointerToolModes {
  const tool = fx.tool ?? null
  const is = (name: NonNullable<ModeFixture['tool']>) => computed(() => tool === name)
  return {
    drawWallMode: is('draw_wall'),
    drawRoomMode: is('draw_room'),
    drawSurfaceMode: is('draw_surface'),
    drawLabelMode: is('draw_label'),
    drawLineMode: is('draw_line'),
    addDoorMode: is('add_door'),
    addWindowMode: is('add_window'),
    addFixtureMode: is('add_fixture'),
    measureMode: is('measure'),
    nulpuntMode: is('nulpunt'),
    underlayMoveMode: is('underlay_move'),
    selectionBoxMode: is('selection_box'),
    inspectMode: is('inspect'),
    areaSurfaceEditEnabled: computed(() => fx.areaSurfaceEdit ?? true),
    annotationEditEnabled: computed(() => fx.annotationEdit ?? true),
    labelsVisible: computed(() => fx.labelsVisible ?? true),
    settingsMod: computed(() => fx.ctrl ?? false),
    moveMod: computed(() => fx.moveMod ?? false),
    touchNav: computed(() => fx.touchNav ?? false),
    manualDimensionsEnabled: computed(() => fx.manualDimensions ?? true),
    hitTestDimensionAtCm: () => handles.dimension ?? null,
    hitTestDimensionEndpointAtCm: () => handles.dimensionEnd ?? null,
  }
}

function makeDrag(fx: DraftFixture): PointerDragState {
  const no = computed(() => false)
  return {
    draggingWall: no,
    draggingJunction: no,
    draggingOpening: no,
    draggingItem: no,
    draggingItemResize: no,
    draggingItemRotate: no,
    draggingDimension: no,
    draggingAreaLabel: no,
    isMeasureDragging: () => false,
    isNulpuntDragging: () => false,
    isUnderlayMoveDragging: () => false,
    isPanDragging: ref(false),
    isWallMoveDrafting: () => fx.wallMove === true,
    isJunctionMoveDrafting: () => fx.junctionMove === true,
    isOpeningMoveDrafting: () => fx.openingMove === true,
  }
}

/**
 * Elke actie wordt een recorder. Handle-lookups en plaatsingen geven een echte
 * waarde terug, want de cascade leest die om te beslissen of hij doorloopt.
 */
function makeActions(calls: string[], handles: HandleFixture, placed: string | null): PointerActions {
  const returns: Record<string, unknown> = {
    hitOpeningHandle: handles.openingHandle ?? null,
    hitItemResizeHandle: handles.itemResize ?? null,
    hitItemRotateHandle: handles.itemRotate ?? null,
    onSurfaceEditPointerDown: handles.surfaceEditConsumes === true,
    placeDoor: placed,
    placeWindow: placed,
    placeFixture: placed,
  }
  return new Proxy({} as Record<string, unknown>, {
    get: (_target, prop: string) => {
      return (...args: unknown[]) => {
        void args
        calls.push(prop)
        return prop in returns ? returns[prop] : null
      }
    },
  }) as unknown as PointerActions
}

export function makePointerHarness(
  options: {
    hits?: HitFixture
    handles?: HandleFixture
    modes?: ModeFixture
    drafts?: DraftFixture
    space?: boolean
    thicknessTier?: FmlThicknessBand | null
    /** Terugwaarde van placeDoor/placeWindow/placeFixture. */
    placed?: string | null
    /** Cursor buiten het canvas: `clientToCm` geeft niets. */
    noCm?: boolean
  } = {},
) {
  ensureDomShim()
  const hits = options.hits ?? {}
  const handles = options.handles ?? {}
  const calls: string[] = []
  const emitted: string[] = []
  const selection: PlanCanvasSelectionRefs = createPlanCanvasSelection()
  const spacePressed: Ref<boolean> = ref(options.space === true)
  const thicknessPickTier = ref<FmlThicknessBand | null>(options.thicknessTier ?? null)

  const pointer = usePlanCanvasPointer({
    hitTest: makeHitTest(hits, options.noCm === true),
    selection,
    view: makeView(options.modes ?? {}),
    modes: makeModes(options.modes ?? {}, handles),
    drag: makeDrag(options.drafts ?? {}),
    actions: makeActions(calls, handles, options.placed ?? 'new-id'),
    spacePressed,
    thicknessPickTier,
    emit: (_event, payload) => {
      emitted.push(payload)
    },
  })

  /** Linkerklik op het canvas. `chrome: true` = klik op een toolbelt-element. */
  function click(
    mods: { ctrl?: boolean; shift?: boolean; button?: number; chrome?: boolean } = {},
  ): void {
    pointer.onWrapPointerDown({
      button: mods.button ?? 0,
      target: mods.chrome === true ? new FakeElement(true) : null,
      clientX: 100,
      clientY: 200,
      shiftKey: mods.shift === true,
      ctrlKey: mods.ctrl === true,
      metaKey: false,
      preventDefault: () => {},
    } as unknown as MouseEvent)
  }

  return { pointer, selection, calls, emitted, click, spacePressed, thicknessPickTier }
}
