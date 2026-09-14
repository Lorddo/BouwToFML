import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import {
  createPlanSnapResolve,
  type PlanSnapEditor,
} from '@/ui/composables/plan-canvas/plan-canvas-snap-resolve'
import { createPlanViewContext } from '@/ui/composables/plan-canvas/plan-view-context'
import type { RenderJunction } from '@/ui/composables/plan-canvas/plan-canvas-render-types'
import type { Point2D } from '@/core/plan/types'

/**
 * De snap-service is in fase 4b uit de ToolCoordinator getild. Deze tests pinnen
 * de vier ingangen die alle teken-tools delen — zodat de latere tool-registry
 * niet stilletjes een eigen variant kan introduceren.
 */

function makeSnap(options: {
  junctions?: Array<{ x: number; y: number }>
  walls?: Array<{ a: Point2D; b: Point2D; thickness: number; balance: number }>
  /** Wat `hitTestJunctionAtCm` teruggeeft (de harde greep op een knoop). */
  junctionHit?: { cmX: number; cmY: number } | null
  kind?: 'wall' | 'ridge'
  axisLocked?: boolean
  drawingRoof?: boolean
  dak?: boolean
}) {
  const editor = {
    localPlan: ref(null),
    floorIndex: ref(0),
    walls: ref(options.walls ?? []),
    junctions: ref(options.junctions ?? []),
    surfaces: ref([]),
    areas: ref([]),
  } as unknown as PlanSnapEditor

  return createPlanSnapResolve({
    editor,
    hitTest: {
      hitTestJunctionAtCm: () =>
        options.junctionHit ? (options.junctionHit as unknown as RenderJunction) : null,
    },
    view: createPlanViewContext({ isDak: () => options.dak === true }),
    drawWallKind: ref(options.kind ?? 'wall'),
    activePlanTool: ref(options.drawingRoof === true ? 'draw_roof' : null),
    axisLocked: computed(() => options.axisLocked === true),
    // Geen overlay: houdt de dakvlak-snap uit de muur-tak, zodat deze tests
    // over knoop-snap gaan en niet over gebruikersinstellingen.
    roofOverlayOnPlan: ref(false),
  })
}

describe('resolveRoomStartPoint', () => {
  it('pakt een aangeklikte knoop exact', () => {
    const snap = makeSnap({ junctionHit: { cmX: 300, cmY: 400 } })
    expect(snap.resolveRoomStartPoint({ x: 305, y: 402 })).toEqual({ x: 300, y: 400 })
  })

  it('snapt binnen 4 cm naar een knoop, daarbuiten niet', () => {
    const snap = makeSnap({ junctions: [{ x: 100, y: 100 }] })
    expect(snap.resolveRoomStartPoint({ x: 103, y: 100 })).toEqual({ x: 100, y: 100 })
    expect(snap.resolveRoomStartPoint({ x: 112, y: 100 })).toEqual({ x: 112, y: 100 })
  })
})

describe('resolveDrawPoint', () => {
  it('een knoop onder de cursor wint van alle andere snap', () => {
    const snap = makeSnap({
      junctionHit: { cmX: 250, cmY: 250 },
      junctions: [{ x: 0, y: 0 }],
    })
    expect(snap.resolveDrawPoint({ x: 256, y: 249 })).toEqual({ x: 250, y: 250 })
  })

  it('snapt zonder knoop-hit binnen 15 cm naar een knoop', () => {
    const snap = makeSnap({ junctions: [{ x: 500, y: 500 }] })
    expect(snap.resolveDrawPoint({ x: 510, y: 500 })).toEqual({ x: 500, y: 500 })
    expect(snap.resolveDrawPoint({ x: 530, y: 500 })).toEqual({ x: 530, y: 500 })
  })

  it('trekt met een anker en Shift recht op de as', () => {
    const snap = makeSnap({ axisLocked: true })
    const point = snap.resolveDrawPoint({ x: 200, y: 6 }, { x: 0, y: 0 })
    expect(point.y).toBe(0)
    expect(point.x).toBe(200)
  })

  it('nok-tekenen gaat langs het nok-recept, niet langs de knoop-hit', () => {
    // Zonder plan levert het nok-pad de rauwe cursor; het punt is dat de
    // knoop-hit hier bewust niet gebruikt wordt.
    const snap = makeSnap({ kind: 'ridge', junctionHit: { cmX: 1, cmY: 1 } })
    expect(snap.resolveDrawPoint({ x: 700, y: 800 })).toEqual({ x: 700, y: 800 })
  })
})

describe('resolveSurfacePoint', () => {
  it('Ctrl (snapDisabled) geeft de rauwe cursor terug', () => {
    const snap = makeSnap({ junctionHit: { cmX: 10, cmY: 10 }, junctions: [{ x: 10, y: 10 }] })
    expect(snap.resolveSurfacePoint({ x: 640, y: 480 }, true)).toEqual({ x: 640, y: 480 })
  })

  it('pakt een aangeklikte knoop exact', () => {
    const snap = makeSnap({ junctionHit: { cmX: 120, cmY: 340 } })
    expect(snap.resolveSurfacePoint({ x: 125, y: 338 }, false)).toEqual({ x: 120, y: 340 })
  })

  it('valt zonder knoop terug op as-snap van muureindpunten', () => {
    const snap = makeSnap({
      walls: [{ a: { x: 0, y: 0 }, b: { x: 0, y: 500 }, thickness: 10, balance: 0.5 }],
    })
    // Vlak naast de muur-as: x wordt op de as getrokken.
    expect(snap.resolveSurfacePoint({ x: 3, y: 250 }, false).x).toBe(0)
  })
})
