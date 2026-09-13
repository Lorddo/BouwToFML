import { ref, type Ref } from 'vue'
import type { FloorArea, Point2D, Wall } from '@/core/fml/types'
import {
  resolveWallSlidePointerDelta,
  snapWallSlideDeltaToJunctions,
} from '@/ui/components/plan-canvas-junctions'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import { cloneAreasSnapshot } from './plan-canvas-area-live'
import {
  applyDrawTypeKey,
  isDrawTypeLengthKey,
  parseDrawLengthDraftToCm,
} from './plan-canvas-draw-measure'

type EditorApi = ReturnType<typeof usePlanEditor>

interface WallMoveHitTestApi {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

/** Klik-jitter: negeer per ongeluk bijna-nul. Alleen getypt mag tot 1 mm (bewuste invoer). */
const CLICK_COMMIT_MIN_CM = 0.5
const TYPED_COMMIT_MIN_CM = 0.1

/**
 * Muur verschuiven: klik → richting → klik (of typ verplaatsing + Enter).
 * Maat = afstand vanaf de startpositie (zelfde invoer als muur/kamer).
 */
export function usePlanCanvasWallMove(options: {
  hitTest: WallMoveHitTestApi
  editor: EditorApi
  moveWallId: Ref<string | null>
  spacePressed: Ref<boolean>
  getInputUnit?: () => ScaleInputUnit
  syncPlanToParent: () => void
}) {
  function inputUnit(): ScaleInputUnit {
    return options.getInputUnit?.() ?? 'm'
  }
  const drafting = ref(false)
  const typeText = ref('')
  const measureLengthCm = ref(0)
  const labelCm = ref<Point2D | null>(null)

  let draft: {
    wallId: string
    wall: { a: Point2D; b: Point2D }
    startCm: Point2D
    hoverCm: Point2D
    baseWalls: Wall[]
    baseAreas: FloorArea[] | undefined
    slideDir: Point2D
    delta: number
    overrideCm: number | null
  } | null = null

  function defaultSlideDir(wall: { a: Point2D; b: Point2D }): Point2D {
    return resolveWallSlidePointerDelta({ x: 1, y: 0 }, wall).slideDir
  }

  function wallMid(wall: { a: Point2D; b: Point2D }): Point2D {
    return { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  }

  function syncLabel(): void {
    if (!draft) {
      measureLengthCm.value = 0
      labelCm.value = null
      return
    }
    const current = draft
    measureLengthCm.value = Math.abs(current.delta)
    const wall =
      options.editor.selectableWalls.value.find((item) => item.id === current.wallId) ??
      current.wall
    labelCm.value = wallMid(wall)
  }

  function applyDelta(delta: number, slideDir: Point2D): void {
    if (!draft) return
    draft.delta = delta
    draft.slideDir = slideDir
    options.editor.previewWallSlideAlongAxis(
      draft.baseWalls,
      draft.wallId,
      delta,
      slideDir,
      draft.baseAreas,
    )
    syncLabel()
  }

  function rebuildFromHover(snapDisabled = false): void {
    if (!draft) return
    const dx = draft.hoverCm.x - draft.startCm.x
    const dy = draft.hoverCm.y - draft.startCm.y
    const resolved = resolveWallSlidePointerDelta({ x: dx, y: dy }, draft.wall)
    if (draft.overrideCm != null && draft.overrideCm !== 0) {
      const sign =
        draft.overrideCm < 0
          ? -1
          : resolved.delta !== 0
            ? Math.sign(resolved.delta)
            : Math.sign(draft.delta) || 1
      applyDelta(Math.abs(draft.overrideCm) * sign, resolved.slideDir)
      return
    }
    const delta = snapDisabled
      ? resolved.delta
      : snapWallSlideDeltaToJunctions(
          draft.wall,
          draft.wallId,
          draft.baseWalls,
          resolved.delta,
          resolved.slideDir,
        )
    applyDelta(delta, resolved.slideDir)
  }

  function cancelWallMove(): void {
    if (draft) options.editor.undo()
    draft = null
    drafting.value = false
    typeText.value = ''
    measureLengthCm.value = 0
    labelCm.value = null
  }

  function beginWallMove(wallId: string, event: MouseEvent): boolean {
    if (options.spacePressed.value || draft) return false
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return false
    const wall = options.editor.selectableWalls.value.find((item) => item.id === wallId)
    if (!wall) return false
    const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (len < 1e-6) return false
    options.editor.pushUndo()
    const ridge = options.editor.ridgeWalls.value.some((item) => item.id === wallId)
    const source = ridge ? options.editor.ridgeWalls.value : options.editor.walls.value
    draft = {
      wallId,
      wall: { a: { ...wall.a }, b: { ...wall.b } },
      startCm: cm,
      hoverCm: cm,
      baseWalls: JSON.parse(JSON.stringify(source)) as Wall[],
      baseAreas: cloneAreasSnapshot(options.editor.areas.value),
      slideDir: defaultSlideDir(wall),
      delta: 0,
      overrideCm: null,
    }
    drafting.value = true
    typeText.value = ''
    options.moveWallId.value = wallId
    syncLabel()
    return true
  }

  function updateWallMoveHover(event: MouseEvent): void {
    if (!draft || typeText.value) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    draft.hoverCm = cm
    rebuildFromHover(event.ctrlKey || event.metaKey)
  }

  function commitWallMove(): boolean {
    if (!draft) return false
    const minCm = draft.overrideCm != null ? TYPED_COMMIT_MIN_CM : CLICK_COMMIT_MIN_CM
    if (Math.abs(draft.delta) < minCm) {
      cancelWallMove()
      return false
    }
    options.editor.flushAreaRegen()
    options.syncPlanToParent()
    draft = null
    drafting.value = false
    typeText.value = ''
    labelCm.value = null
    return true
  }

  function onWallMoveClick(wallId: string, event: MouseEvent): boolean {
    if (draft) return commitWallMove()
    return beginWallMove(wallId, event)
  }

  function handleTypeKey(event: KeyboardEvent): boolean {
    if (!draft) return false
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) return true
    if (!isDrawTypeLengthKey(event)) return false
    const next = applyDrawTypeKey(typeText.value, event.key)
    if (next == null) return false
    typeText.value = next
    draft.overrideCm = parseDrawLengthDraftToCm(next, inputUnit())
    rebuildFromHover()
    return true
  }

  return {
    drafting,
    typeText,
    measureLengthCm,
    wallMoveLabelCm: labelCm,
    isDrafting: () => drafting.value,
    beginWallMove,
    updateWallMoveHover,
    onWallMoveClick,
    handleTypeKey,
    commitFromMeasure: commitWallMove,
    cancelWallMove,
  }
}
