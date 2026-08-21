import { ref, type Ref } from 'vue'
import type { Point2D, Wall } from '@/core/fml/types'
import { snapDrawWallEndpoint } from '@/ui/components/fml-preview-junction-snap'
import {
  MANUAL_DIM_FACE_SNAP_CM,
  snapPointToWallFaces,
  WALL_FACE_SNAP_CM,
} from '@/ui/components/fml-preview-wall-face-snap'
import { DEFAULT_SLICER_OFFSET_SNAP_CM, snapSlicerPPoint } from '@/core/fml/slice-offset-snap'
import type { BtfSlice } from '@/core/fml/btf-slices'
import type { RenderJunction } from './useFmlPreviewRenderModel'
import { type MeasureLine, measureDistanceCm } from './fml-preview-measure'

let measureIdCounter = 0

export type MeasureDrawMode = 'tape' | 'manual' | 'slicer'

interface MeasureHitTestApi {
  hitTestJunctionAtCm: (cm: Point2D) => RenderJunction | null
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

/**
 * Maatlijn-tool.
 * Tape = sessie; Manual = dimensions[]; Slicer = eerste punt P (plaats), tweede M (meet).
 */
export function useFmlPreviewMeasure(options: {
  hitTest: MeasureHitTestApi
  hoveredJunctionId: Ref<string | null>
  getWalls: () => ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>
  shiftPressed: Ref<boolean>
  beforeBegin: () => void
  getMode: () => MeasureDrawMode
  /** Alleen editor: commit permanente maten. */
  canPersist: () => boolean
  onCommitManual?: (a: Point2D, b: Point2D) => void
  /** p = plaatsing (eerste), m = meten (tweede). */
  onCommitSlicer?: (p: Point2D, m: Point2D) => void
  /** Slicer offset-snap: bestaande slices + voorkeursafstand. */
  getSlicerSlices?: () => ReadonlyArray<BtfSlice>
  getSlicerOffsetSnapCm?: () => number
}) {
  const measurePreview = ref<{ a: Point2D; b: Point2D } | null>(null)
  const measureLines = ref<MeasureLine[]>([])
  /** Hover-punt in measure-mode vóór/tijdens tekenen (gesnapte cursor). */
  const measureHoverCm = ref<Point2D | null>(null)
  let measureDrag: { startCm: Point2D } | null = null

  function resolveMeasureCm(
    cm: Point2D,
    opts?: { axisAnchor?: Point2D; snapDisabled?: boolean },
  ): Point2D {
    const mode = options.getMode()
    const snapDisabled = opts?.snapDisabled === true
    const infiniteAxes = mode === 'manual'
    const radius = mode === 'manual' ? MANUAL_DIM_FACE_SNAP_CM : WALL_FACE_SNAP_CM
    let point = snapPointToWallFaces(options.getWalls(), cm, radius, {
      disabled: snapDisabled,
      infiniteAxes,
    })
    const anchor = opts?.axisAnchor
    // Slicer: standaard H/V (offset P–M); Shift uitzetten heeft geen effect — Ctrl = vrij.
    // Overige modes: Shift = H/V.
    const lockAxis = mode === 'slicer' ? !snapDisabled : options.shiftPressed.value
    if (anchor && lockAxis) {
      point = snapDrawWallEndpoint(anchor, point, true)
      if (!snapDisabled) {
        const resnap = snapPointToWallFaces(options.getWalls(), point, radius, {
          infiniteAxes,
        })
        if (Math.abs(point.y - anchor.y) <= 1e-9) {
          point = { x: resnap.x, y: point.y }
        } else if (Math.abs(point.x - anchor.x) <= 1e-9) {
          point = { x: point.x, y: resnap.y }
        }
      }
    }
    // Slicer: P↔P soft-snap (onderlinge place-offset). P↔M niet forceren.
    if (mode === 'slicer' && !snapDisabled && !anchor) {
      point = snapSlicerPPoint({
        point,
        slices: options.getSlicerSlices?.() ?? [],
        preferredCm: options.getSlicerOffsetSnapCm?.() ?? DEFAULT_SLICER_OFFSET_SNAP_CM,
      })
    }
    return point
  }

  function cancelMeasureDrag(): void {
    window.removeEventListener('pointermove', onMeasurePointerMove)
    measureDrag = null
    measurePreview.value = null
  }

  function updateMeasureHover(event: MouseEvent): void {
    if (measureDrag) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) {
      measureHoverCm.value = null
      return
    }
    measureHoverCm.value = resolveMeasureCm(cm, {
      snapDisabled: event.ctrlKey || event.metaKey,
    })
  }

  function clearMeasureHover(): void {
    measureHoverCm.value = null
  }

  function beginMeasure(event: MouseEvent): void {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    cancelMeasureDrag()
    options.beforeBegin()
    const snapDisabled = event.ctrlKey || event.metaKey
    const startCm = resolveMeasureCm(cm, { snapDisabled })
    measureDrag = { startCm }
    measureHoverCm.value = startCm
    measurePreview.value = { a: startCm, b: startCm }
    window.addEventListener('pointermove', onMeasurePointerMove)
    window.addEventListener('pointerup', onMeasurePointerUp, { once: true })
  }

  function onMeasurePointerMove(event: MouseEvent): void {
    if (!measureDrag) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const snapDisabled = event.ctrlKey || event.metaKey
    const endCm = resolveMeasureCm(cm, {
      axisAnchor: measureDrag.startCm,
      snapDisabled,
    })
    measureHoverCm.value = endCm
    measurePreview.value = { a: measureDrag.startCm, b: endCm }
    const junction = options.hitTest.hitTestJunctionAtCm(cm)
    options.hoveredJunctionId.value = junction?.id ?? null
  }

  function onMeasurePointerUp(event: MouseEvent): void {
    window.removeEventListener('pointermove', onMeasurePointerMove)
    const drag = measureDrag
    measureDrag = null
    const preview = measurePreview.value
    measurePreview.value = null
    options.hoveredJunctionId.value = null
    if (!drag || !preview) return

    const snapDisabled = event.ctrlKey || event.metaKey
    const raw = options.hitTest.clientToCm(event.clientX, event.clientY) ?? preview.b
    const endCm = resolveMeasureCm(raw, {
      axisAnchor: drag.startCm,
      snapDisabled,
    })
    measureHoverCm.value = endCm
    if (measureDistanceCm(drag.startCm, endCm) < 1) return

    const mode = options.getMode()
    if (mode === 'manual' && options.canPersist()) {
      options.onCommitManual?.(drag.startCm, endCm)
      return
    }
    if (mode === 'slicer' && options.canPersist()) {
      // Eerste = P (plaats), tweede = M (meet)
      options.onCommitSlicer?.(drag.startCm, endCm)
      return
    }

    measureLines.value = [
      ...measureLines.value,
      {
        id: `measure-${++measureIdCounter}`,
        a: drag.startCm,
        b: endCm,
      },
    ]
  }

  function clearMeasureLines(): void {
    measureLines.value = []
  }

  return {
    measurePreview,
    measureLines,
    measureHoverCm,
    isDragging: () => measureDrag != null,
    beginMeasure,
    cancelMeasureDrag,
    clearMeasureLines,
    updateMeasureHover,
    clearMeasureHover,
    /** Exported for unit tests. */
    resolveMeasureCm,
  }
}
