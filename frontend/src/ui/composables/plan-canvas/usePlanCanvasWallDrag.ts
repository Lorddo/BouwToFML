import { ref, type Ref } from 'vue'
import type { FloorArea, Point2D, Wall } from '@/core/plan/types'
import { cloneAreasSnapshot } from './plan-canvas-area-live'
import {
  type JunctionNode,
  type WallEndRef,
  resolveWallSlidePointerDelta,
  snapWallSlideDeltaToJunctions,
  stableJunctionId,
} from '@/core/plan/junctions'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import type { RenderJunction } from './usePlanCanvasRenderModel'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection-types'

type EditorApi = ReturnType<typeof usePlanEditor>

interface WallDragHitTestApi {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

export function usePlanCanvasWallDrag(options: {
  hitTest: WallDragHitTestApi
  editor: EditorApi
  selection: Pick<PlanCanvasSelectionRefs, 'draggingJunctionId' | 'moveWallId' | 'hoveredWallId'>
  spacePressed: Ref<boolean>
  syncPlanToParent: () => void
}) {
  const { hitTest, editor, selection, spacePressed, syncPlanToParent } = options
  const { draggingJunctionId } = selection

  const draggingJunction = ref(false)
  const draggingWall = ref(false)

  let junctionDrag: {
    refs: WallEndRef[]
    originCm: Point2D
    lastCm: Point2D
    baseWalls: Wall[]
    baseAreas: FloorArea[] | undefined
    /** Laatste Ctrl/Meta tijdens sleep — ook gebruikt bij pointerup (merge skip). */
    snapDisabled: boolean
  } | null = null

  let wallDrag: {
    wallId: string
    wall: { a: Point2D; b: Point2D }
    startCm: Point2D
    baseWalls: Wall[]
    baseAreas: FloorArea[] | undefined
  } | null = null

  let moveDragPending: {
    wallId: string
    startClientX: number
    startClientY: number
    onMove: (event: MouseEvent) => void
    onUp: () => void
  } | null = null

  function cancelMoveDragPending(): void {
    if (!moveDragPending) return
    window.removeEventListener('pointermove', moveDragPending.onMove)
    window.removeEventListener('pointerup', moveDragPending.onUp)
    moveDragPending = null
  }

  function startMoveDragPending(wallId: string, event: MouseEvent): void {
    cancelMoveDragPending()
    const startClientX = event.clientX
    const startClientY = event.clientY
    const onMove = (moveEvent: MouseEvent) => {
      if (!moveDragPending) return
      const dist = Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY)
      if (dist < 4) return
      cancelMoveDragPending()
      beginWallDrag(wallId, moveEvent)
    }
    const onUp = () => {
      cancelMoveDragPending()
    }
    moveDragPending = { wallId, startClientX, startClientY, onMove, onUp }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function findJunctionByRefs(refs: WallEndRef[]): JunctionNode | null {
    return (
      editor.junctions.value.find(
        (junction) =>
          junction.refs.length === refs.length &&
          refs.every((ref) =>
            junction.refs.some(
              (candidate) => candidate.wallId === ref.wallId && candidate.end === ref.end,
            ),
          ),
      ) ?? null
    )
  }

  function startJunctionDrag(junction: RenderJunction, evt: MouseEvent): void {
    if (spacePressed.value || draggingWall.value) return
    evt.preventDefault()
    editor.pushUndo()
    draggingJunction.value = true
    draggingJunctionId.value = junction.id
    const ridgeGraph = junction.refs.some((ref) =>
      editor.ridgeWalls.value.some((wall) => wall.id === ref.wallId),
    )
    junctionDrag = {
      refs: junction.refs.map((ref) => ({ ...ref })),
      originCm: { x: junction.cmX, y: junction.cmY },
      lastCm: { x: junction.cmX, y: junction.cmY },
      baseWalls: JSON.parse(
        JSON.stringify(ridgeGraph ? editor.ridgeWalls.value : editor.walls.value),
      ) as Wall[],
      baseAreas: cloneAreasSnapshot(editor.areas.value),
      snapDisabled: evt.ctrlKey || evt.metaKey,
    }
    window.addEventListener('pointermove', onJunctionPointerMove)
    window.addEventListener('pointerup', onJunctionPointerUp, { once: true })
  }

  function onJunctionPointerMove(evt: MouseEvent): void {
    if (!junctionDrag) return
    const pointer = hitTest.clientToCm(evt.clientX, evt.clientY)
    if (!pointer) return
    junctionDrag.snapDisabled = evt.ctrlKey || evt.metaKey
    const node: JunctionNode = {
      id: stableJunctionId(junctionDrag.refs),
      refs: junctionDrag.refs,
      x: junctionDrag.originCm.x,
      y: junctionDrag.originCm.y,
    }
    const next = junctionDrag.snapDisabled
      ? pointer
      : editor.snapJunctionPoint(junctionDrag.refs, pointer, junctionDrag.baseWalls)
    junctionDrag.lastCm = next
    editor.previewJunctionMove(junctionDrag.baseWalls, node, next, junctionDrag.baseAreas)
  }

  function onJunctionPointerUp(evt: MouseEvent): void {
    window.removeEventListener('pointermove', onJunctionPointerMove)
    if (junctionDrag) {
      const snapDisabled = junctionDrag.snapDisabled || evt.ctrlKey || evt.metaKey
      const pos = junctionDrag.lastCm
      // Na crossing-split wijzen de originele refs mogelijk naar een mid-junction;
      // zoek daarom op eindpositie.
      const current =
        editor.junctions.value.find(
          (junction) => Math.hypot(junction.x - pos.x, junction.y - pos.y) <= 3,
        ) ?? findJunctionByRefs(junctionDrag.refs)
      if (current && !snapDisabled) {
        const mergeTarget = editor.findMergeTarget(current.refs, {
          x: current.x,
          y: current.y,
        })
        if (mergeTarget) {
          editor.applyJunctionMerge(current, mergeTarget)
        }
      }
      editor.flushAreaRegen()
      syncPlanToParent()
    }
    draggingJunctionId.value = null
    draggingJunction.value = false
    junctionDrag = null
  }

  function beginWallDrag(wallId: string, evt: MouseEvent): void {
    cancelMoveDragPending()
    const cm = hitTest.clientToCm(evt.clientX, evt.clientY)
    if (!cm) return
    const wall = editor.selectableWalls.value.find((item) => item.id === wallId)
    if (!wall) return
    const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (len < 1e-6) return
    editor.pushUndo()
    draggingWall.value = true
    const sourceWalls = editor.ridgeWalls.value.some((item) => item.id === wallId)
      ? editor.ridgeWalls.value
      : editor.walls.value
    wallDrag = {
      wallId,
      wall: { a: wall.a, b: wall.b },
      startCm: cm,
      baseWalls: JSON.parse(JSON.stringify(sourceWalls)) as Wall[],
      baseAreas: cloneAreasSnapshot(editor.areas.value),
    }
    window.addEventListener('pointermove', onWallDragMove)
    window.addEventListener('pointerup', onWallDragEnd, { once: true })
  }

  function onWallDragMove(evt: MouseEvent): void {
    if (!wallDrag) return
    const drag = wallDrag
    const cm = hitTest.clientToCm(evt.clientX, evt.clientY)
    if (!cm) return
    const dx = cm.x - drag.startCm.x
    const dy = cm.y - drag.startCm.y
    const { delta: rawDelta, slideDir } = resolveWallSlidePointerDelta({ x: dx, y: dy }, drag.wall)
    const delta =
      evt.ctrlKey || evt.metaKey
        ? rawDelta
        : snapWallSlideDeltaToJunctions(drag.wall, drag.wallId, drag.baseWalls, rawDelta, slideDir)
    editor.previewWallSlideAlongAxis(drag.baseWalls, drag.wallId, delta, slideDir, drag.baseAreas)
  }

  function endWallDrag(): void {
    window.removeEventListener('pointermove', onWallDragMove)
    if (wallDrag) {
      editor.flushAreaRegen()
      syncPlanToParent()
    }
    wallDrag = null
    draggingWall.value = false
  }

  function onWallDragEnd(): void {
    endWallDrag()
  }

  function cleanupWallDrag(): void {
    window.removeEventListener('pointermove', onJunctionPointerMove)
    draggingJunctionId.value = null
    draggingJunction.value = false
    junctionDrag = null
    endWallDrag()
    cancelMoveDragPending()
  }

  return {
    draggingJunction,
    draggingWall,
    cancelMoveDragPending,
    startMoveDragPending,
    startJunctionDrag,
    beginWallDrag,
    onWallDragEnd,
    cleanupWallDrag,
  }
}
