import { describe, expect, it } from 'vitest'
import {
  cloneDrawingMeta,
  copyElevationUnderlay,
  copyFloorUnderlay,
  isReusableUnderlayDrawing,
  listElevationUnderlayDonors,
  listFloorUnderlayDonors,
} from '@/core/fml/copy-underlay-drawing'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { setElevationViewDrawing } from '@/core/fml/elevation-views'
import { createFacadeGroup } from '@/core/fml/facade-groups'
import type { DrawingMeta, FloorPlan } from '@/core/fml/types'

const DRAWING_A: DrawingMeta = {
  x: 10,
  y: 20,
  width: 400,
  height: 300,
  rotation: 90,
  url: 'data:image/png;base64,aaa',
  alpha: 40,
  visible: true,
  extras: { keep: 1 },
}

const DRAWING_B: DrawingMeta = {
  x: 5,
  y: 8,
  width: 200,
  height: 150,
  rotation: 0,
  url: 'data:image/png;base64,bbb',
}

function planWithFloors(): FloorPlan {
  const plan = createEmptyFloorPlan({ floorName: 'Begane grond' })
  const first = { ...plan.floors[0], drawing: DRAWING_A }
  const second = createBlankFloor({ name: '1e verdieping', level: 1 })
  return { ...plan, floors: [first, second] }
}

describe('isReusableUnderlayDrawing', () => {
  it('eist url + positieve maat', () => {
    expect(isReusableUnderlayDrawing(DRAWING_A)).toBe(true)
    expect(isReusableUnderlayDrawing({ ...DRAWING_A, url: '' })).toBe(false)
    expect(isReusableUnderlayDrawing({ ...DRAWING_A, width: 0 })).toBe(false)
    expect(isReusableUnderlayDrawing({ ...DRAWING_A, url: undefined })).toBe(false)
  })
})

describe('cloneDrawingMeta', () => {
  it('kloont extras zonder donor te muteren', () => {
    const clone = cloneDrawingMeta(DRAWING_A)
    expect(clone).toEqual(DRAWING_A)
    expect(clone.extras).not.toBe(DRAWING_A.extras)
    if (clone.extras) clone.extras.keep = 9
    expect(DRAWING_A.extras?.keep).toBe(1)
  })
})

describe('listFloorUnderlayDonors', () => {
  it('slaat de actieve floor over en floors zonder url', () => {
    const plan = planWithFloors()
    expect(listFloorUnderlayDonors(plan, 1)).toEqual([{ id: '0', name: 'Begane grond' }])
    expect(listFloorUnderlayDonors(plan, 0)).toEqual([])
  })
})

describe('copyFloorUnderlay', () => {
  it('zet een kloon van de donor-drawing op de doel-floor', () => {
    const plan = planWithFloors()
    const next = copyFloorUnderlay(plan, 0, 1)
    expect(next).not.toBeNull()
    expect(next!.floors[1]?.drawing).toEqual(DRAWING_A)
    expect(next!.floors[1]?.drawing).not.toBe(plan.floors[0]?.drawing)
    expect(plan.floors[1]?.drawing).toBeUndefined()
  })

  it('weigert dezelfde floor of een donor zonder url', () => {
    const plan = planWithFloors()
    expect(copyFloorUnderlay(plan, 0, 0)).toBeNull()
    expect(copyFloorUnderlay(plan, 1, 0)).toBeNull()
  })
})

describe('elevation underlay reuse', () => {
  function planWithGevels(): { plan: FloorPlan; voorId: string; achterId: string } {
    let plan = planWithFloors()
    const voor = createFacadeGroup(plan, { name: 'Voorgevel' })
    const achter = createFacadeGroup(plan, { name: 'Achtergevel' })
    voor.wallGuids.push('w1')
    achter.wallGuids.push('w2')
    plan = setElevationViewDrawing(plan, voor.id, DRAWING_A)
    plan = setElevationViewDrawing(plan, achter.id, DRAWING_B)
    return { plan, voorId: voor.id, achterId: achter.id }
  }

  it('lijst andere gevels met onderlegger', () => {
    const { plan, voorId, achterId } = planWithGevels()
    expect(listElevationUnderlayDonors(plan, voorId)).toEqual([
      { id: achterId, name: 'Achtergevel' },
    ])
  })

  it('kopieert drawing naar de actieve gevelgroep', () => {
    const { plan, voorId, achterId } = planWithGevels()
    const next = copyElevationUnderlay(plan, voorId, achterId)
    expect(next).not.toBeNull()
    const views = next!.source?.settings?.elevationViews as Array<{
      facadeGroupId: string
      drawing?: DrawingMeta
    }>
    const target = views.find((view) => view.facadeGroupId === achterId)
    expect(target?.drawing).toEqual(DRAWING_A)
    expect(target?.drawing).not.toBe(DRAWING_A)
  })

  it('weigert dezelfde groep of ontbrekende donor', () => {
    const { plan, voorId, achterId } = planWithGevels()
    expect(copyElevationUnderlay(plan, voorId, voorId)).toBeNull()
    expect(copyElevationUnderlay(plan, 'missing', achterId)).toBeNull()
  })
})
