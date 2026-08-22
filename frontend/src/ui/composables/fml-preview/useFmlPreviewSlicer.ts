import type { Ref } from 'vue'
import type { Point2D, Wall } from '@/core/fml/types'
import { bakeSliceDimensions } from '@/core/fml/slice-dimension-lines'
import { readDimensionSettings } from '@/core/fml/fml-dimension-settings'
import {
  DEFAULT_SLICER_OFFSET_SNAP_CM,
  slicePlaceStripAxis,
  snapSliceHandleAxis,
  snapSlicerPPoint,
} from '@/core/fml/slice-offset-snap'
import type { BtfSlice } from '@/core/fml/btf-slices'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import type { FloorPlan } from '@/core/fml/types'

const SLICE_LINE_HIT_CM = 8
const SLICE_HANDLE_HIT_STAGE = 12

export function hitSliceIndexAtCm(
  cm: Point2D,
  slices: ReadonlyArray<BtfSlice>,
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>,
  plan: FloorPlan | null,
  floorIndex: number,
): number {
  if (slices.length === 0) return -1
  const settings = readDimensionSettings(plan, floorIndex)
  for (let i = 0; i < slices.length; i += 1) {
    const dims = bakeSliceDimensions(
      [slices[i]],
      walls as Wall[],
      settings.dimensionMode,
      `hit-${i}`,
    )
    for (const dim of dims) {
      const dx = dim.b.x - dim.a.x
      const dy = dim.b.y - dim.a.y
      const len2 = dx * dx + dy * dy
      if (len2 < 1e-6) continue
      let t = ((cm.x - dim.a.x) * dx + (cm.y - dim.a.y) * dy) / len2
      t = Math.max(0, Math.min(1, t))
      const px = dim.a.x + t * dx
      const py = dim.a.y + t * dy
      if (Math.hypot(cm.x - px, cm.y - py) <= SLICE_LINE_HIT_CM) return i
    }
  }
  return -1
}

export function useFmlPreviewSlicer(options: {
  getSlices: () => ReadonlyArray<BtfSlice>
  getWalls: () => ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>
  getPlan: () => FloorPlan | null
  getFloorIndex: () => number
  selectedSliceIndex: Ref<number>
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  toStagePoint: (x: number, y: number) => { x: number; y: number }
  shiftPressed: Ref<boolean>
  pushUndo: () => void
  updateSlice: (index: number, slice: BtfSlice) => void
  syncPlan: () => void
}): {
  tryPointerDown: (event: MouseEvent) => boolean
} {
  let sliceHandleDrag: { index: number; which: 'm' | 'p' } | null = null

  function onSliceHandleMove(event: MouseEvent): void {
    if (!sliceHandleDrag) return
    const cm = options.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const slice = options.getSlices()[sliceHandleDrag.index]
    if (!slice) return
    const disableSnap = options.shiftPressed.value || event.shiftKey
    let point = { ...cm }
    if (!disableSnap) {
      const anchor = sliceHandleDrag.which === 'm' ? slice.p : slice.m
      point = snapSliceHandleAxis(anchor, point)
      if (sliceHandleDrag.which === 'p') {
        const preferred =
          loadUserSettings().fmlViewer.slicerOffsetSnapCm ?? DEFAULT_SLICER_OFFSET_SNAP_CM
        const draft = { m: slice.m, p: point }
        point = snapSlicerPPoint({
          point,
          slices: options.getSlices(),
          preferredCm: preferred,
          excludeIndex: sliceHandleDrag.index,
          forceAxis: slicePlaceStripAxis(draft),
        })
      }
    }
    const next: BtfSlice =
      sliceHandleDrag.which === 'm'
        ? { m: point, p: { ...slice.p } }
        : { m: { ...slice.m }, p: point }
    if (Math.hypot(next.p.x - next.m.x, next.p.y - next.m.y) < 1) return
    options.updateSlice(sliceHandleDrag.index, next)
  }

  function onSliceHandleUp(): void {
    window.removeEventListener('pointermove', onSliceHandleMove)
    if (sliceHandleDrag) {
      sliceHandleDrag = null
      options.syncPlan()
    }
  }

  function tryPointerDown(event: MouseEvent): boolean {
    const cm = options.clientToCm(event.clientX, event.clientY)
    if (!cm) return false
    const selected = options.selectedSliceIndex.value
    const slices = options.getSlices()
    if (selected >= 0 && slices[selected]) {
      const toStage = options.toStagePoint
      const m = toStage(slices[selected].m.x, slices[selected].m.y)
      const p = toStage(slices[selected].p.x, slices[selected].p.y)
      const local = toStage(cm.x, cm.y)
      if (Math.hypot(local.x - m.x, local.y - m.y) <= SLICE_HANDLE_HIT_STAGE) {
        sliceHandleDrag = { index: selected, which: 'm' }
        options.pushUndo()
        window.addEventListener('pointermove', onSliceHandleMove)
        window.addEventListener('pointerup', onSliceHandleUp, { once: true })
        event.preventDefault()
        return true
      }
      if (Math.hypot(local.x - p.x, local.y - p.y) <= SLICE_HANDLE_HIT_STAGE) {
        sliceHandleDrag = { index: selected, which: 'p' }
        options.pushUndo()
        window.addEventListener('pointermove', onSliceHandleMove)
        window.addEventListener('pointerup', onSliceHandleUp, { once: true })
        event.preventDefault()
        return true
      }
    }
    const hit = hitSliceIndexAtCm(
      cm,
      slices,
      options.getWalls(),
      options.getPlan(),
      options.getFloorIndex(),
    )
    if (hit >= 0) {
      options.selectedSliceIndex.value = hit
      event.preventDefault()
      return true
    }
    if (selected >= 0) {
      options.selectedSliceIndex.value = -1
      return true
    }
    return false
  }

  return { tryPointerDown }
}
