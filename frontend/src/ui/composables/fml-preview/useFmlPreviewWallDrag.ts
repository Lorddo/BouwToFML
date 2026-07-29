import { ref, type Ref } from 'vue'
import type { Point2D, Wall } from '@/core/fml/types'
import {
  type JunctionNode,
  type WallEndRef,
  resolveWallSlidePointerDelta,
} from '@/ui/components/fml-preview-junctions'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { RenderJunction } from './useFmlPreviewRenderModel'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface WallDragHitTestApi {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

export function useFmlPreviewWallDrag(options: {
  hitTest: WallDragHitTestApi
  editor: EditorApi
  selection: Pick<FmlPreviewSelectionRefs, 'draggingJunctionId' | 'moveWallId' | 'hoveredWallId'>
  spacePressed: Ref<boolean>
  syncPlanToParent: () => void
}) {
  const { hitTest, editor, selection, spacePressed, syncPlanToParent } = options
  const { draggingJunctionId } = selection

  const draggingJunction = ref(false)
  const draggingWall = ref(false)

  let junctionDrag:
    | {
        refs: WallEndRef[]
        originCm: Point2D
      }
    | null = null

  let wallDrag:
    | {
        wallId: string
        wall: { a: Point2D; b: Point2D }
        startCm: Point2D
        baseWalls: Wall[]
      }
    | null = null

  let moveDragPending:
    | {
        wallId: string
        startClientX: number
        startClientY: number
        onMove: (event: MouseEvent) => void
        onUp: () => void
      }
    | null = null

  function cancelMoveDragPending(): void {
    if (!moveDragPending) return
    window.removeEventListener('mousemove', moveDragPending.onMove)
    window.removeEventListener('mouseup', moveDragPending.onUp)
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
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp, { once: true })
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
    junctionDrag = {
      refs: junction.refs.map((ref) => ({ ...ref })),
      originCm: { x: junction.cmX, y: junction.cmY },
    }
    window.addEventListener('mousemove', onJunctionPointerMove)
    window.addEventListener('mouseup', onJunctionPointerUp, { once: true })
  }

  function onJunctionPointerMove(evt: MouseEvent): void {
    if (!junctionDrag) return
    const pointer = hitTest.clientToCm(evt.clientX, evt.clientY)
    if (!pointer) return
    const node = findJunctionByRefs(junctionDrag.refs)
    if (!node) return
    const next = editor.snapJunctionPoint(junctionDrag.refs, pointer)
    editor.applyJunctionMove(node, next)
  }

  function onJunctionPointerUp(): void {
    window.removeEventListener('mousemove', onJunctionPointerMove)
    if (junctionDrag) {
      const current = findJunctionByRefs(junctionDrag.refs)
      if (current) {
        const mergeTarget = editor.findMergeTarget(junctionDrag.refs, {
          x: current.x,
          y: current.y,
        })
        if (mergeTarget) {
          editor.applyJunctionMerge(current, mergeTarget)
        }
      }
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
    const wall = editor.walls.value.find((item) => item.id === wallId)
    if (!wall) return
    const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (len < 1e-6) return
    editor.pushUndo()
    draggingWall.value = true
    wallDrag = {
      wallId,
      wall: { a: wall.a, b: wall.b },
      startCm: cm,
      baseWalls: JSON.parse(JSON.stringify(editor.walls.value)) as Wall[],
    }
    window.addEventListener('mousemove', onWallDragMove)
    window.addEventListener('mouseup', onWallDragEnd, { once: true })
  }

  function onWallDragMove(evt: MouseEvent): void {
    if (!wallDrag) return
    const drag = wallDrag
    const cm = hitTest.clientToCm(evt.clientX, evt.clientY)
    if (!cm) return
    const dx = cm.x - drag.startCm.x
    const dy = cm.y - drag.startCm.y
    const { delta, slideDir } = resolveWallSlidePointerDelta({ x: dx, y: dy }, drag.wall)
    editor.previewWallSlideAlongAxis(drag.baseWalls, drag.wallId, delta, slideDir)
  }

  function endWallDrag(): void {
    window.removeEventListener('mousemove', onWallDragMove)
    if (wallDrag) {
      syncPlanToParent()
    }
    wallDrag = null
    draggingWall.value = false
  }

  function onWallDragEnd(): void {
    endWallDrag()
  }

  function cleanupWallDrag(): void {
    window.removeEventListener('mousemove', onJunctionPointerMove)
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
