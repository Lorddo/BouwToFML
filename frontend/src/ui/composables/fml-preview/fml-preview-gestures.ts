/** Pure gesture math for the FML canvas. No DOM. */

export const TAP_SLOP_PX = 10

/** Chrome overlays that must not start canvas edit/place. */
export const FML_PREVIEW_CHROME_SELECTOR =
  '.fml-preview-hint, .canvas-toolbelt-dock, .canvas-toolbelt, .fixture-palette, .fixture-palette-dock, .fml-editor-topbar, .fml-help-modal, .fml-chrome-dialog, .fml-mod-rail, .item-settings, button, input, label, select'

/** Touch-nav + modifier rail: only real coarse pointers, never a mouse desktop. */
export function shouldUseTouchNav(touchEditor: boolean, coarsePointer: boolean): boolean {
  return touchEditor === true && coarsePointer === true
}

export type GesturePoint = { x: number; y: number }

export function gestureDistance(a: GesturePoint, b: GesturePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function gestureMidpoint(a: GesturePoint, b: GesturePoint): GesturePoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function isTapMove(
  start: GesturePoint,
  current: GesturePoint,
  slopPx = TAP_SLOP_PX,
): boolean {
  return gestureDistance(start, current) < slopPx
}

export function applyWheelLikeZoom(options: {
  pointerX: number
  pointerY: number
  oldScale: number
  nextScale: number
  viewX: number
  viewY: number
}): { scale: number; x: number; y: number } {
  const { pointerX, pointerY, oldScale, nextScale, viewX, viewY } = options
  const origin = {
    x: (pointerX - viewX) / oldScale,
    y: (pointerY - viewY) / oldScale,
  }
  return {
    scale: nextScale,
    x: pointerX - origin.x * nextScale,
    y: pointerY - origin.y * nextScale,
  }
}

/** Two-finger pan + pinch from previous pair → next pair. */
export function applyTwoFingerNav(options: {
  prevA: GesturePoint
  prevB: GesturePoint
  nextA: GesturePoint
  nextB: GesturePoint
  viewScale: number
  viewX: number
  viewY: number
  clampScale: (scale: number) => number
}): { scale: number; x: number; y: number } {
  const prevMid = gestureMidpoint(options.prevA, options.prevB)
  const nextMid = gestureMidpoint(options.nextA, options.nextB)
  const prevDist = gestureDistance(options.prevA, options.prevB)
  const nextDist = gestureDistance(options.nextA, options.nextB)
  const zoomFactor = prevDist > 1e-6 ? nextDist / prevDist : 1
  const nextScale = options.clampScale(options.viewScale * zoomFactor)
  const zoomed = applyWheelLikeZoom({
    pointerX: nextMid.x,
    pointerY: nextMid.y,
    oldScale: options.viewScale,
    nextScale,
    viewX: options.viewX + (nextMid.x - prevMid.x),
    viewY: options.viewY + (nextMid.y - prevMid.y),
  })
  return zoomed
}

export type GestureKind = 'pending' | 'one' | 'nav'

export interface GestureTracker {
  pointers: Map<number, GesturePoint>
  kind: GestureKind
  start: GesturePoint | null
}

export function createGestureTracker(): GestureTracker {
  return { pointers: new Map(), kind: 'pending', start: null }
}

export function gesturePointerCount(tracker: GestureTracker): number {
  return tracker.pointers.size
}
