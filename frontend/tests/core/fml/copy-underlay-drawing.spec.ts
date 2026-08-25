import { describe, expect, it } from 'vitest'
import {
  cloneDrawingMeta,
  copyElevationUnderlay,
  copyFloorUnderlay,
  copyUnderlayFromDonor,
  encodeUnderlayDonorId,
  isReusableUnderlayDrawing,
  listUnderlayReuseDonors,
} from '@/core/fml/copy-underlay-drawing'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { elevationViewForGroup, setElevationViewDrawing } from '@/core/fml/elevation-views'
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

describe('listUnderlayReuseDonors', () => {
  it('op een lege doel-floor: bronnen zijn floors mét onderlegger', () => {
    const plan = planWithFloors()
    expect(listUnderlayReuseDonors(plan, { floorIndex: 1 })).toEqual([
      { id: 'floor:0', name: 'Begane grond', kind: 'floor' },
    ])
    expect(listUnderlayReuseDonors(plan, { floorIndex: 0 })).toEqual([])
  })

  it('op een gevel zonder scan: verdiepingen mét onderlegger zijn bron', () => {
    const plan = planWithFloors()
    const voor = createFacadeGroup(plan, { name: 'Voorgevel' })
    expect(listUnderlayReuseDonors(plan, { elevationGroupId: voor.id })).toEqual([
      { id: 'floor:0', name: 'Begane grond', kind: 'floor' },
    ])
  })
})

describe('copyFloorUnderlay', () => {
  it('zet een kloon van de donor-drawing op een floor zonder onderlegger', () => {
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
    plan = setElevationViewDrawing(plan, voor.id, DRAWING_B)
    return { plan, voorId: voor.id, achterId: achter.id }
  }

  it('lijst floors én andere gevels met onderlegger', () => {
    const { plan, voorId, achterId } = planWithGevels()
    expect(listUnderlayReuseDonors(plan, { elevationGroupId: achterId })).toEqual([
      { id: 'floor:0', name: 'Begane grond', kind: 'floor' },
      { id: encodeUnderlayDonorId('elevation', voorId), name: 'Voorgevel', kind: 'elevation' },
    ])
  })

  it('kopieert een floor-onderlegger naar een gevel zonder scan', () => {
    const { plan, achterId } = planWithGevels()
    const next = copyUnderlayFromDonor(plan, 'floor:0', { kind: 'elevation', groupId: achterId })
    expect(next).not.toBeNull()
    expect(elevationViewForGroup(next, achterId)?.drawing).toEqual(DRAWING_A)
  })

  it('kopieert drawing naar de actieve gevelgroep', () => {
    const { plan, voorId, achterId } = planWithGevels()
    const next = copyElevationUnderlay(plan, voorId, achterId)
    expect(next).not.toBeNull()
    expect(elevationViewForGroup(next, achterId)?.drawing).toEqual(DRAWING_B)
  })

  it('weigert dezelfde groep of ontbrekende donor', () => {
    const { plan, voorId, achterId } = planWithGevels()
    expect(copyElevationUnderlay(plan, voorId, voorId)).toBeNull()
    expect(copyElevationUnderlay(plan, 'missing', achterId)).toBeNull()
  })
})
