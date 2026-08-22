import { computed, onMounted, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'
import {
  applyTwoFingerNav,
  FML_PREVIEW_CHROME_SELECTOR,
  isTapMove,
  shouldUseTouchNav,
  type GesturePoint,
} from './fml-preview-gestures'
import {
  isTouchHoverFollowTool,
  shouldCommitTouchTap,
  shouldOneFingerPan,
  shouldStartTouchHoldDrag,
} from './fml-preview-touch-tap'
import { clampViewScale } from './useFmlPreviewPanZoom'

const TOUCH_NAV_LISTENER_OPTS: AddEventListenerOptions = { passive: false }

export function syntheticMouseDown(clientX: number, clientY: number): MouseEvent {
  return new MouseEvent('mousedown', {
    bubbles: false,
    cancelable: true,
    view: window,
    clientX,
    clientY,
    button: 0,
    buttons: 1,
  })
}

export function useCoarsePointer(): Ref<boolean> {
  const coarsePointer = ref(false)
  let coarseMq: MediaQueryList | null = null

  function sync(): void {
    coarsePointer.value = coarseMq?.matches === true
  }

  onMounted(() => {
    coarseMq = window.matchMedia('(pointer: coarse)')
    sync()
    coarseMq.addEventListener('change', sync)
  })

  onUnmounted(() => {
    coarseMq?.removeEventListener('change', sync)
    coarseMq = null
  })

  return coarsePointer
}

export function useFmlCanvasTouch(options: {
  containerRef: Ref<HTMLElement | null>
  enabled: ComputedRef<boolean> | Ref<boolean>
  viewScale: Ref<number>
  viewPosition: Ref<{ x: number; y: number }>
  clampScale?: (scale: number) => number
  getTool: () => string | null
  moveMod: Ref<boolean> | ComputedRef<boolean>
  blockEdit: () => boolean
  onEditPointerDown: (event: MouseEvent) => void
  onEditPointerMove: (event: MouseEvent) => void
}): void {
  const touchPointers = new Map<number, GesturePoint>()
  let touchPrevPair: { a: GesturePoint; b: GesturePoint } | null = null
  let touchCommittedOne = false
  let touchNav = false
  let touchPending: {
    pointerId: number
    start: GesturePoint
    clientX: number
    clientY: number
  } | null = null
  let touchSloppy = false
  let touchOnePanLast: GesturePoint | null = null

  function touchIgnoreTarget(event: PointerEvent): boolean {
    const target = event.target as HTMLElement
    return Boolean(target.closest(FML_PREVIEW_CHROME_SELECTOR))
  }

  function touchLocalPoint(event: PointerEvent): GesturePoint {
    const rect = options.containerRef.value?.getBoundingClientRect()
    if (!rect) return { x: event.clientX, y: event.clientY }
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function resetTouchIdle(): void {
    if (touchPointers.size > 0) return
    touchPending = null
    touchSloppy = false
    touchCommittedOne = false
    touchOnePanLast = null
  }

  function endTouchEditDrag(): void {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  }

  function onTouchPointerDown(event: PointerEvent): void {
    if (!options.enabled.value) return
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    if (touchIgnoreTarget(event)) return
    if (options.blockEdit()) return
    event.preventDefault()
    options.containerRef.value?.setPointerCapture?.(event.pointerId)
    const local = touchLocalPoint(event)
    touchPointers.set(event.pointerId, local)
    if (touchPointers.size >= 2) {
      touchNav = true
      touchCommittedOne = false
      touchPending = null
      touchSloppy = false
      touchOnePanLast = null
      endTouchEditDrag()
      const pts = [...touchPointers.values()]
      touchPrevPair = { a: pts[0], b: pts[1] }
      return
    }
    touchPending = {
      pointerId: event.pointerId,
      start: local,
      clientX: event.clientX,
      clientY: event.clientY,
    }
    touchSloppy = false
    touchCommittedOne = false
    touchOnePanLast = null
  }

  function onTouchPointerMove(event: PointerEvent): void {
    if (!options.enabled.value) return
    if (!touchPointers.has(event.pointerId)) return
    event.preventDefault()
    const local = touchLocalPoint(event)
    touchPointers.set(event.pointerId, local)
    if (touchNav && touchPointers.size >= 2 && touchPrevPair) {
      const pts = [...touchPointers.values()]
      const next = applyTwoFingerNav({
        prevA: touchPrevPair.a,
        prevB: touchPrevPair.b,
        nextA: pts[0],
        nextB: pts[1],
        viewScale: options.viewScale.value,
        viewX: options.viewPosition.value.x,
        viewY: options.viewPosition.value.y,
        clampScale: options.clampScale ?? clampViewScale,
      })
      options.viewScale.value = next.scale
      options.viewPosition.value = { x: next.x, y: next.y }
      touchPrevPair = { a: pts[0], b: pts[1] }
      return
    }
    if (touchNav) return

    const tool = options.getTool()
    if (touchPending && event.pointerId === touchPending.pointerId && !touchSloppy) {
      if (!isTapMove(touchPending.start, local)) {
        touchSloppy = true
        if (
          shouldStartTouchHoldDrag({
            sloppy: true,
            moveMod: options.moveMod.value,
            tool,
            becameNav: false,
          })
        ) {
          touchCommittedOne = true
          options.onEditPointerDown(syntheticMouseDown(event.clientX, event.clientY))
        } else if (
          shouldOneFingerPan({
            sloppy: true,
            becameNav: false,
            holdDragStarted: false,
            hoverFollow: isTouchHoverFollowTool(tool),
          })
        ) {
          touchOnePanLast = local
        }
      }
    }

    if (touchOnePanLast && !touchCommittedOne) {
      options.viewPosition.value = {
        x: options.viewPosition.value.x + (local.x - touchOnePanLast.x),
        y: options.viewPosition.value.y + (local.y - touchOnePanLast.y),
      }
      touchOnePanLast = local
      return
    }

    if (touchCommittedOne || isTouchHoverFollowTool(tool)) {
      options.onEditPointerMove(event)
    }
  }

  function finishTouchPointer(event: PointerEvent, cancelled: boolean): void {
    if (!options.enabled.value) return
    const pending = touchPending
    const sloppy = touchSloppy
    const wasNav = touchNav
    const pointerId = event.pointerId
    touchPointers.delete(pointerId)
    if (touchNav) {
      if (touchPointers.size < 2) {
        touchNav = false
        touchPrevPair = null
      }
      resetTouchIdle()
      return
    }
    if (
      pending &&
      pointerId === pending.pointerId &&
      shouldCommitTouchTap({ becameNav: wasNav, sloppy, cancelled })
    ) {
      options.onEditPointerDown(syntheticMouseDown(pending.clientX, pending.clientY))
    }
    resetTouchIdle()
  }

  function attach(): void {
    const el = options.containerRef.value
    if (!el) return
    el.addEventListener('pointerdown', onTouchPointerDown, TOUCH_NAV_LISTENER_OPTS)
    el.addEventListener('pointermove', onTouchPointerMove, TOUCH_NAV_LISTENER_OPTS)
    el.addEventListener('pointerup', onTouchPointerUp)
    el.addEventListener('pointercancel', onTouchPointerCancel)
  }

  function detach(): void {
    const el = options.containerRef.value
    if (!el) return
    el.removeEventListener('pointerdown', onTouchPointerDown, TOUCH_NAV_LISTENER_OPTS)
    el.removeEventListener('pointermove', onTouchPointerMove, TOUCH_NAV_LISTENER_OPTS)
    el.removeEventListener('pointerup', onTouchPointerUp)
    el.removeEventListener('pointercancel', onTouchPointerCancel)
  }

  function onTouchPointerUp(event: PointerEvent): void {
    finishTouchPointer(event, false)
  }

  function onTouchPointerCancel(event: PointerEvent): void {
    finishTouchPointer(event, true)
  }

  onMounted(() => {
    if (options.enabled.value) attach()
  })
  onUnmounted(detach)

  watch(options.enabled, (on) => {
    if (on) attach()
    else detach()
  })
}

export function useFmlTouchNav(touchEditor: ComputedRef<boolean> | Ref<boolean>): {
  coarsePointer: Ref<boolean>
  useTouchNav: ComputedRef<boolean>
} {
  const coarsePointer = useCoarsePointer()
  const useTouchNav = computed(() => shouldUseTouchNav(touchEditor.value, coarsePointer.value))
  return { coarsePointer, useTouchNav }
}
