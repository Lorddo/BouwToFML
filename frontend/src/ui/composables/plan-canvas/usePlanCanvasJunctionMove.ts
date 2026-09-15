import { ref, type Ref } from 'vue'
import type { FloorArea, Point2D, Wall } from '@/core/plan/types'
import {
  type JunctionNode,
  type WallEndRef,
  stableJunctionId,
} from '@/ui/components/plan-canvas-junctions'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import type { RenderJunction } from './plan-canvas-render-types'
import { cloneAreasSnapshot } from './plan-canvas-area-live'
import {
  applyDrawTypeKey,
  isDrawTypeLengthKey,
  parseDrawLengthDraftToCm,
} from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'

type EditorApi = ReturnType<typeof usePlanEditor>

interface JunctionMoveHitTestApi {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

/** Klik-jitter: negeer per ongeluk bijna-nul. Alleen getypt mag tot 1 mm (bewuste invoer). */
const CLICK_COMMIT_MIN_CM = 0.5
const TYPED_COMMIT_MIN_CM = 0.1
const MERGE_HIT_CM = 3

/**
 * Knoop verplaatsen: klik → richting → klik (of typ afstand vanaf start + Enter).
 * Zelfde UX als muur-precise / muur tekenen.
 */
export function usePlanCanvasJunctionMove(options: {
  hitTest: JunctionMoveHitTestApi
  editor: EditorApi
  pinnedJunctionId: Ref<string | null>
  draggingJunctionId: Ref<string | null>
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
    refs: WallEndRef[]
    originCm: Point2D
    startCm: Point2D
    hoverCm: Point2D
    lastCm: Point2D
    baseWalls: Wall[]
    baseAreas: FloorArea[] | undefined
    delta: number
    overrideCm: number | null
    snapDisabled: boolean
  } | null = null

  function nodeFromDraft(): JunctionNode {
    if (!draft) throw new Error('no draft')
    return {
      id: stableJunctionId(draft.refs),
      refs: draft.refs,
      x: draft.originCm.x,
      y: draft.originCm.y,
    }
  }

  function resolveTarget(snapDisabled: boolean): Point2D {
    if (!draft) return { x: 0, y: 0 }
    const dx = draft.hoverCm.x - draft.originCm.x
    const dy = draft.hoverCm.y - draft.originCm.y
    const hoverLen = Math.hypot(dx, dy)
    let raw: Point2D
    if (draft.overrideCm != null && draft.overrideCm !== 0) {
      const dirLen = hoverLen > 1e-9 ? hoverLen : 1
      const ux = hoverLen > 1e-9 ? dx / dirLen : 1
      const uy = hoverLen > 1e-9 ? dy / dirLen : 0
      const sign = draft.overrideCm < 0 ? -1 : 1
      const dist = Math.abs(draft.overrideCm) * sign
      raw = {
        x: draft.originCm.x + ux * dist,
        y: draft.originCm.y + uy * dist,
      }
    } else {
      raw = { ...draft.hoverCm }
    }
    if (snapDisabled) return raw
    return options.editor.snapJunctionPoint(draft.refs, raw, draft.baseWalls)
  }

  function applyTarget(target: Point2D): void {
    if (!draft) return
    draft.lastCm = target
    draft.delta = Math.hypot(target.x - draft.originCm.x, target.y - draft.originCm.y)
    options.editor.previewJunctionMove(draft.baseWalls, nodeFromDraft(), target, draft.baseAreas)
    measureLengthCm.value = Math.abs(
      draft.overrideCm != null && draft.overrideCm !== 0 ? draft.overrideCm : draft.delta,
    )
    labelCm.value = { ...target }
  }

  function rebuildFromHover(snapDisabled = false): void {
    if (!draft) return
    draft.snapDisabled = snapDisabled
    applyTarget(resolveTarget(snapDisabled))
  }

  function clearDraftUi(): void {
    draft = null
    drafting.value = false
    typeText.value = ''
    measureLengthCm.value = 0
    labelCm.value = null
    options.draggingJunctionId.value = null
  }

  function cancelJunctionMove(): void {
    if (draft) options.editor.undo()
    clearDraftUi()
  }

  function beginJunctionMove(junction: RenderJunction, event: MouseEvent): boolean {
    if (options.spacePressed.value || draft) return false
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return false
    options.editor.pushUndo()
    const ridgeGraph = junction.refs.some((ref) =>
      options.editor.ridgeWalls.value.some((wall) => wall.id === ref.wallId),
    )
    const origin = { x: junction.cmX, y: junction.cmY }
    draft = {
      refs: junction.refs.map((ref) => ({ ...ref })),
      originCm: origin,
      startCm: cm,
      hoverCm: cm,
      lastCm: { ...origin },
      baseWalls: JSON.parse(
        JSON.stringify(ridgeGraph ? options.editor.ridgeWalls.value : options.editor.walls.value),
      ) as Wall[],
      baseAreas: cloneAreasSnapshot(options.editor.areas.value),
      delta: 0,
      overrideCm: null,
      snapDisabled: event.ctrlKey || event.metaKey,
    }
    drafting.value = true
    typeText.value = ''
    options.pinnedJunctionId.value = junction.id
    options.draggingJunctionId.value = junction.id
    measureLengthCm.value = 0
    labelCm.value = { ...origin }
    return true
  }

  function updateJunctionMoveHover(event: MouseEvent): void {
    if (!draft || typeText.value) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    draft.hoverCm = cm
    rebuildFromHover(event.ctrlKey || event.metaKey)
  }

  function findJunctionByRefs(refs: WallEndRef[]): JunctionNode | null {
    return (
      options.editor.junctions.value.find(
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

  function commitJunctionMove(): boolean {
    if (!draft) return false
    const minCm = draft.overrideCm != null ? TYPED_COMMIT_MIN_CM : CLICK_COMMIT_MIN_CM
    const commitDelta =
      draft.overrideCm != null && draft.overrideCm !== 0 ? Math.abs(draft.overrideCm) : draft.delta
    if (commitDelta < minCm) {
      cancelJunctionMove()
      return false
    }
    const snapDisabled = draft.snapDisabled
    const pos = draft.lastCm
    const refs = draft.refs
    const current =
      options.editor.junctions.value.find(
        (junction) => Math.hypot(junction.x - pos.x, junction.y - pos.y) <= MERGE_HIT_CM,
      ) ?? findJunctionByRefs(refs)
    if (current && !snapDisabled) {
      const mergeTarget = options.editor.findMergeTarget(current.refs, {
        x: current.x,
        y: current.y,
      })
      if (mergeTarget) {
        options.editor.applyJunctionMerge(current, mergeTarget)
      }
    }
    options.editor.flushAreaRegen()
    options.syncPlanToParent()
    clearDraftUi()
    return true
  }

  function onJunctionMoveClick(junction: RenderJunction, event: MouseEvent): boolean {
    if (draft) return commitJunctionMove()
    return beginJunctionMove(junction, event)
  }

  function handleTypeKey(event: KeyboardEvent): boolean {
    if (!draft) return false
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) return true
    if (!isDrawTypeLengthKey(event)) return false
    const next = applyDrawTypeKey(typeText.value, event.key)
    if (next == null) return false
    typeText.value = next
    draft.overrideCm = parseDrawLengthDraftToCm(next, inputUnit())
    rebuildFromHover(draft.snapDisabled)
    return true
  }

  return {
    drafting,
    typeText,
    measureLengthCm,
    junctionMoveLabelCm: labelCm,
    isDrafting: () => drafting.value,
    beginJunctionMove,
    updateJunctionMoveHover,
    onJunctionMoveClick,
    handleTypeKey,
    commitFromMeasure: commitJunctionMove,
    cancelJunctionMove,
  }
}
