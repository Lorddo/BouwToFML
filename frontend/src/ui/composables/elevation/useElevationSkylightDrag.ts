import type { Ref } from 'vue'
import type { FloorItem, FloorPlan, Point2D } from '@/core/plan/types'
import type { ElevationSkylight, FacadeElevation } from '@/core/plan/facade-elevation'
import { listRidgeSurfacesOnFloor } from '@/core/plan/roof-planes'
import {
  findSkylightInPlan,
  moveSkylightFromElevation,
  resizeSkylightFromElevation,
  skylightElevBounds,
  updatePlanSkylight,
  type ElevResizeSide,
} from '@/core/plan/elevation-skylight-edit'
import type { ElevationSnapGuide } from '@/core/plan/elevation-opening-edit'
import type { ElevationInteractionProps } from './elevation-interaction-types'

type SkylightDrag = {
  itemId: string
  mode: 'move' | ElevResizeSide
  startCm: Point2D
  startItem: FloorItem
  surfaceId: string
  floorIndex: number
}

const MOVE_PENDING_PX = 4

export function useElevationSkylightDrag(options: {
  props: ElevationInteractionProps
  elevation: Ref<FacadeElevation | null>
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  snapGuide: Ref<ElevationSnapGuide | null>
  pushUndo: () => void
  commitPlan: (next: FloorPlan) => void
}) {
  const { props, elevation, clientToCm, snapGuide, pushUndo, commitPlan } = options
  let drag: SkylightDrag | null = null
  let pending: {
    itemId: string
    startClientX: number
    startClientY: number
    onMove: (event: PointerEvent) => void
    onUp: () => void
  } | null = null

  function cancelPending(): void {
    if (!pending) return
    window.removeEventListener('pointermove', pending.onMove)
    window.removeEventListener('pointerup', pending.onUp)
    pending = null
  }

  function findSurface(floorIndex: number, surfaceId: string) {
    const floor = props.plan.floors[floorIndex]
    if (!floor) return null
    return listRidgeSurfacesOnFloor(floor).find((surface) => surface.id === surfaceId) ?? null
  }

  function applyDrag(cm: Point2D): void {
    if (!drag) return
    const elev = elevation.value
    if (!elev) return
    const surface = findSurface(drag.floorIndex, drag.surfaceId)
    if (!surface) return
    const dElev = { x: cm.x - drag.startCm.x, y: cm.y - drag.startCm.y }
    const next =
      drag.mode === 'move'
        ? moveSkylightFromElevation(drag.startItem, surface, dElev, elev.axis)
        : resizeSkylightFromElevation(drag.startItem, surface, drag.mode, dElev, elev.axis)
    commitPlan(updatePlanSkylight(props.plan, drag.itemId, next))
    snapGuide.value = null
  }

  function beginSkylightDrag(
    skylight: ElevationSkylight,
    mode: 'move' | ElevResizeSide,
    event: { clientX: number; clientY: number; evt?: MouseEvent },
  ): void {
    const located = findSkylightInPlan(props.plan, skylight.itemId)
    if (!located) return
    const startCm = clientToCm(event.clientX, event.clientY)
    if (!startCm) return
    cancelPending()
    if (mode === 'move') {
      const onMove = (moveEvent: PointerEvent) => {
        if (!pending) return
        const dist = Math.hypot(
          moveEvent.clientX - pending.startClientX,
          moveEvent.clientY - pending.startClientY,
        )
        if (dist < MOVE_PENDING_PX) return
        const cm = clientToCm(moveEvent.clientX, moveEvent.clientY)
        if (!cm) return
        cancelPending()
        pushUndo()
        drag = {
          itemId: skylight.itemId,
          mode: 'move',
          startCm,
          startItem: { ...located.item },
          surfaceId: skylight.surfaceId,
          floorIndex: skylight.floorIndex,
        }
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp, { once: true })
        applyDrag(cm)
      }
      const onUp = () => {
        cancelPending()
      }
      pending = {
        itemId: skylight.itemId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        onMove,
        onUp,
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp, { once: true })
      return
    }
    pushUndo()
    drag = {
      itemId: skylight.itemId,
      mode,
      startCm,
      startItem: { ...located.item },
      surfaceId: skylight.surfaceId,
      floorIndex: skylight.floorIndex,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
  }

  function onPointerMove(event: PointerEvent): void {
    const cm = clientToCm(event.clientX, event.clientY)
    if (!cm) return
    applyDrag(cm)
  }

  function onPointerUp(): void {
    window.removeEventListener('pointermove', onPointerMove)
    drag = null
    snapGuide.value = null
  }

  function cleanup(): void {
    cancelPending()
    window.removeEventListener('pointermove', onPointerMove)
    drag = null
  }

  return {
    beginSkylightDrag,
    cleanup,
    skylightElevBounds,
  }
}
