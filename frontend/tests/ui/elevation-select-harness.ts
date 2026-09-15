import { ref, type Ref } from 'vue'
import { createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import { encodePlanOpeningId } from '@/core/plan/opening-ids'
import type {
  ElevationJunction,
  ElevationOpeningRect,
  ElevationWallRect,
  FacadeElevation,
} from '@/core/plan/facade-elevation'
import type { ElevationSnapGuide } from '@/core/plan/elevation-opening-edit'
import { markWallAsRidge, setRidgeWallsOnFloor } from '@/core/plan/ridge-walls'
import type { FloorPlan, Opening, Point2D, Wall } from '@/core/plan/types'
import { useElevationSelectEdit } from '@/ui/composables/elevation/useElevationSelectEdit'
import type { ElevTool } from '@/ui/composables/elevation/elevation-tool'
import type { ElevationBovenlichtDefaults } from '@/core/plan/facade-elevation'

/**
 * Harnas voor de karakteriseringstests op SelectEdit.
 *
 * SelectEdit krijgt al zijn buitenwereld via één options-object, dus er is geen
 * Vue-mount nodig. Precise-callbacks en undo/commit worden opgenomen in `calls`.
 *
 * Vitest draait hier op `environment: 'node'`. SelectEdit hangt sleep-sessies
 * aan `window` — zonder shim knalt dat op een ReferenceError.
 */

type Listener = (event: PointerEvent) => void

const moveListeners = new Set<Listener>()
const upListeners = new Set<Listener>()

function ensureWindowShim(): void {
  const g = globalThis as unknown as { window?: Window }
  g.window = {
    addEventListener(type: string, fn: EventListenerOrEventListenerObject) {
      const listener = fn as Listener
      if (type === 'pointermove') moveListeners.add(listener)
      if (type === 'pointerup') upListeners.add(listener)
    },
    removeEventListener(type: string, fn: EventListenerOrEventListenerObject) {
      const listener = fn as Listener
      if (type === 'pointermove') moveListeners.delete(listener)
      if (type === 'pointerup') upListeners.delete(listener)
    },
  } as Window
}

export function resetElevationWindowListeners(): void {
  moveListeners.clear()
  upListeners.clear()
}

export function elevationWindowListenerCounts(): { move: number; up: number } {
  return { move: moveListeners.size, up: upListeners.size }
}

export const OPENING_ID = encodePlanOpeningId(0, 'w1-window-o1')
export const OPENING_ID_W2 = encodePlanOpeningId(0, 'w2-window-o1')

export function elevWall(opts: {
  wallId: string
  xa: number
  xb: number
  yTop?: number
  yBot?: number
  floorIndex?: number
  ridge?: boolean
  endOn?: boolean
  axisEdit?: boolean
}): ElevationWallRect {
  const yTop = opts.yTop ?? -280
  const yBot = opts.yBot ?? 0
  const xa = opts.xa
  const xb = opts.xb
  return {
    x0: Math.min(xa, xb),
    x1: Math.max(xa, xb),
    y0: yTop,
    y1: yBot,
    wallId: opts.wallId,
    floorIndex: opts.floorIndex ?? 0,
    xa,
    xb,
    ridge: opts.ridge,
    endOn: opts.endOn,
    aTop: { x: xa, y: yTop },
    aBottom: { x: xa, y: yBot },
    bTop: { x: xb, y: yTop },
    bBottom: { x: xb, y: yBot },
    innerATop: { x: xa, y: yTop },
    innerABottom: { x: xa, y: yBot },
    innerBTop: { x: xb, y: yTop },
    innerBBottom: { x: xb, y: yBot },
    depthCm: 0,
    axisEdit: opts.axisEdit,
  }
}

function planWall(id: string, a: Point2D, b: Point2D, openings: Opening[] = []): Wall {
  return { id, a, b, thickness: 20, openings }
}

function windowOpening(): Opening {
  return {
    type: 'window',
    id: 'o1',
    kind: 'window.single',
    t: 0.3,
    width: 80,
    z: 80,
    z_height: 120,
  }
}

export function openingRect(openingId: string, wallId: string): ElevationOpeningRect {
  return {
    openingId,
    openingGuid: 'o1',
    wallId,
    floorIndex: 0,
    type: 'window',
    kind: 'window.single',
    widthCm: 80,
    x0: 60,
    x1: 140,
    y0: -200,
    y1: -80,
    depthCm: 0,
    startOnLeft: true,
  }
}

export function makeElevationFixture(overrides: Partial<FacadeElevation> = {}): FacadeElevation {
  const w1 = elevWall({ wallId: 'w1', xa: 0, xb: 200 })
  const w2 = elevWall({ wallId: 'w2', xa: 200, xb: 400 })
  const junction: ElevationJunction = {
    id: 'j1',
    x: 0,
    floorIndex: 0,
    yTop: -280,
    yBot: 0,
    heightCm: 280,
    refs: [{ wallId: 'w1', end: 'a' }],
  }
  const ridgeJunction: ElevationJunction = {
    id: 'rj1',
    x: 200,
    floorIndex: 0,
    yTop: -450,
    yBot: -280,
    heightCm: 170,
    refs: [{ wallId: 'ridge-1', end: 'a' }],
    ridge: true,
  }
  return {
    groupId: 'g1',
    axis: { x: 1, y: 0 },
    origin: { x: 0, y: 0 },
    walls: [
      w1,
      w2,
      elevWall({ wallId: 'ridge-1', xa: 0, xb: 400, yTop: -450, yBot: -280, ridge: true, endOn: true }),
      elevWall({
        wallId: 'ridge-long',
        xa: 0,
        xb: 400,
        yTop: -450,
        yBot: -280,
        ridge: true,
        endOn: false,
      }),
    ],
    openings: [openingRect(OPENING_ID, 'w1')],
    transoms: [],
    bands: [],
    roofPlanes: [],
    junctions: [junction, ridgeJunction],
    bounds: { x0: 0, y0: -450, x1: 400, y1: 0 },
    ...overrides,
  }
}

export function makePlanFixture(): FloorPlan {
  const plan = createEmptyFloorPlan({ name: 'Elev', wallHeightCm: 280 })
  plan.floors[0].walls = [
    planWall('w1', { x: 0, y: 0 }, { x: 200, y: 0 }, [windowOpening()]),
    planWall('w2', { x: 200, y: 0 }, { x: 400, y: 0 }),
  ]
  plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [
    markWallAsRidge(planWall('ridge-1', { x: 0, y: 0 }, { x: 400, y: 0 })),
    markWallAsRidge(planWall('ridge-long', { x: 0, y: 0 }, { x: 400, y: 0 })),
  ])
  return plan
}

export function mouseEvent(
  overrides: Partial<{
    clientX: number
    clientY: number
    shiftKey: boolean
    ctrlKey: boolean
    metaKey: boolean
  }> = {},
): { evt: MouseEvent } {
  return {
    evt: {
      clientX: overrides.clientX ?? 100,
      clientY: overrides.clientY ?? 140,
      shiftKey: overrides.shiftKey === true,
      ctrlKey: overrides.ctrlKey === true,
      metaKey: overrides.metaKey === true,
      stopPropagation() {},
    } as MouseEvent,
  }
}

export interface ElevationSelectHarnessOptions {
  preciseDraft?: boolean
  preciseIntent?: boolean
  locked?: boolean
  tool?: ElevTool
  settingsMod?: boolean
  pointerCm?: Point2D | null
}

export function makeElevationSelectHarness(options: ElevationSelectHarnessOptions = {}) {
  ensureWindowShim()
  resetElevationWindowListeners()

  const calls: string[] = []
  const planHolder = { plan: makePlanFixture(), groupId: 'g1' }
  const elevation = ref(makeElevationFixture()) as Ref<FacadeElevation | null>
  const canvasLocked = ref(options.locked === true)
  const activeTool = ref<ElevTool>(options.tool ?? 'select')
  const elevSettingsMod = ref(options.settingsMod === true)
  const snapGuide = ref<ElevationSnapGuide | null>(null)
  const addDoorSubtype = ref('standard' as const)
  const addDoorWidthCm = ref(90)
  const addDoorHeightCm = ref(210)
  const addDoorSillZCm = ref(0)
  const addWindowSubtype = ref('single' as const)
  const addWindowWidthCm = ref(80)
  const addWindowSillZCm = ref(80)
  const addWindowHeightCm = ref(120)

  const pointer =
    options.pointerCm === undefined ? { x: 100, y: -140 } : options.pointerCm

  const floorBovenlichtDefaults = (_floorIndex: number): ElevationBovenlichtDefaults => ({
    doorDefault: false,
    windowDefault: false,
    heightCm: 40,
    gapCm: 0,
  })

  const select = useElevationSelectEdit({
    props: planHolder,
    elevation,
    clientToCm: (clientX, clientY) => ({ x: clientX, y: -clientY }),
    pointerCm: () => pointer,
    canvasLocked,
    activeTool,
    elevSettingsMod,
    snapGuide,
    floorBovenlichtDefaults,
    pushUndo: () => {
      calls.push('pushUndo')
    },
    commitPlan: (next) => {
      calls.push('commitPlan')
      planHolder.plan = next
    },
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addDoorSillZCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    preciseIntent: () => options.preciseIntent === true,
    beginPreciseOpening: () => {
      calls.push('beginPreciseOpening')
    },
    beginPreciseRidge: () => {
      calls.push('beginPreciseRidge')
    },
    beginPreciseJunction: () => {
      calls.push('beginPreciseJunction')
    },
    hasPreciseDraft: () => options.preciseDraft === true,
    commitPreciseDraft: () => {
      calls.push('commitPreciseDraft')
      return true
    },
  })

  return {
    select,
    calls,
    planHolder,
    elevation,
    activeTool,
    canvasLocked,
    elevSettingsMod,
    snapGuide,
    dispose() {
      select.cleanupSelectListeners()
      resetElevationWindowListeners()
    },
  }
}
