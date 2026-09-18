import { ref, type Ref } from 'vue'
import type { FloorArea, Point2D, Wall } from '@/core/plan/types'
import {
  type JunctionNode,
  type WallEndRef,
  stableJunctionId,
} from '@/core/plan/junctions'
import {
  axisLockPoint,
  pickPointInteriorCm,
  pointDeltaForInterior,
  roomSpanFromPoint,
} from '@/core/plan/precise-move-room-span'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import type { RenderJunction } from './plan-canvas-render-types'
import { cloneAreasSnapshot } from './plan-canvas-area-live'
import { applyLengthTypeKey } from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'
import type { MeasureLine } from '@/ui/composables/canvas-kernel/plan-canvas-measure'

type EditorApi = ReturnType<typeof usePlanEditor>

interface JunctionMoveHitTestApi {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

/** Klik-jitter: negeer per ongeluk bijna-nul. Alleen getypt mag tot 1 mm (bewuste invoer). */
const CLICK_COMMIT_MIN_CM = 0.5
const TYPED_COMMIT_MIN_CM = 0.1
const MERGE_HIT_CM = 3

/**
 * Knoop verplaatsen: klik → richting → klik (of typ binnenmaat van de gekozen ruimte + Enter).
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
  const spanMeasureLine = ref<MeasureLine | null>(null)

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
    /** Getypte binnenmaat (label); null = toon |delta|. */
    typedInteriorCm: number | null
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

  function resolveTarget(snapDisabled: boolean): {
    target: Point2D
    typedInteriorCm: number | null
  } {
    if (!draft) return { target: { x: 0, y: 0 }, typedInteriorCm: null }
    const dx = draft.hoverCm.x - draft.originCm.x
    const dy = draft.hoverCm.y - draft.originCm.y
    const hoverLen = Math.hypot(dx, dy)
    let raw: Point2D
    let typedInteriorCm: number | null = null
    if (draft.overrideCm != null && draft.overrideCm !== 0) {
      // Negatieve typ = oude afstandssemantiek (richting omkeren).
      if (draft.overrideCm > 0) {
        const intoDir =
          hoverLen > 1e-9
            ? { x: dx, y: dy }
            : {
                x: draft.lastCm.x - draft.originCm.x,
                y: draft.lastCm.y - draft.originCm.y,
              }
        const room = pickPointInteriorCm(
          draft.originCm,
          draft.baseAreas ?? [],
          intoDir,
          draft.baseWalls,
        )
        if (room) {
          const typedI = draft.overrideCm
          const delta = pointDeltaForInterior(room.interiorCm, typedI, room.intoUnit)
          raw = {
            x: draft.originCm.x + delta.x,
            y: draft.originCm.y + delta.y,
          }
          typedInteriorCm = typedI
        } else {
          const dirLen = hoverLen > 1e-9 ? hoverLen : 1
          const ux = hoverLen > 1e-9 ? dx / dirLen : 1
          const uy = hoverLen > 1e-9 ? dy / dirLen : 0
          raw = {
            x: draft.originCm.x + ux * draft.overrideCm,
            y: draft.originCm.y + uy * draft.overrideCm,
          }
        }
      } else {
        const dirLen = hoverLen > 1e-9 ? hoverLen : 1
        const ux = hoverLen > 1e-9 ? dx / dirLen : 1
        const uy = hoverLen > 1e-9 ? dy / dirLen : 0
        const dist = Math.abs(draft.overrideCm)
        raw = {
          x: draft.originCm.x - ux * dist,
          y: draft.originCm.y - uy * dist,
        }
      }
    } else {
      raw = axisLockPoint(draft.originCm, draft.hoverCm)
    }
    if (snapDisabled) return { target: raw, typedInteriorCm }
    return {
      target: options.editor.snapJunctionPoint(draft.refs, raw, draft.baseWalls),
      typedInteriorCm,
    }
  }

  function applyTarget(target: Point2D, typedInteriorCm: number | null = null): void {
    if (!draft) return
    draft.lastCm = target
    draft.delta = Math.hypot(target.x - draft.originCm.x, target.y - draft.originCm.y)
    draft.typedInteriorCm = typedInteriorCm
    options.editor.previewJunctionMove(draft.baseWalls, nodeFromDraft(), target, draft.baseAreas)

    const dx = draft.hoverCm.x - draft.originCm.x
    const dy = draft.hoverCm.y - draft.originCm.y
    const intoDir =
      Math.hypot(dx, dy) > 1e-9
        ? { x: dx, y: dy }
        : {
            x: target.x - draft.originCm.x,
            y: target.y - draft.originCm.y,
          }
    const room = pickPointInteriorCm(
      draft.originCm,
      draft.baseAreas ?? [],
      intoDir,
      draft.baseWalls,
    )
    if (room) {
      const spanLen = typedInteriorCm != null ? Math.abs(typedInteriorCm) : room.interiorCm
      measureLengthCm.value = spanLen
      const span = roomSpanFromPoint(draft.originCm, room.intoUnit, spanLen)
      if (span) {
        labelCm.value = {
          x: (span.a.x + span.b.x) / 2,
          y: (span.a.y + span.b.y) / 2,
        }
        const typing = typeText.value.length > 0
        spanMeasureLine.value = {
          id: 'junction-move-span',
          a: span.a,
          b: span.b,
          emphasis: typing ? 'typing' : 'active',
          suppressLabel: true,
        }
        return
      }
    }
    measureLengthCm.value =
      typedInteriorCm != null ? Math.abs(typedInteriorCm) : Math.abs(draft.delta)
    labelCm.value = { ...target }
    spanMeasureLine.value = null
  }

  function rebuildFromHover(snapDisabled = false): void {
    if (!draft) return
    draft.snapDisabled = snapDisabled
    const resolved = resolveTarget(snapDisabled)
    applyTarget(resolved.target, resolved.typedInteriorCm)
  }

  function clearDraftUi(): void {
    draft = null
    drafting.value = false
    typeText.value = ''
    measureLengthCm.value = 0
    labelCm.value = null
    spanMeasureLine.value = null
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
      typedInteriorCm: null,
      snapDisabled: event.ctrlKey || event.metaKey,
    }
    drafting.value = true
    typeText.value = ''
    options.pinnedJunctionId.value = junction.id
    options.draggingJunctionId.value = junction.id
    measureLengthCm.value = 0
    labelCm.value = { ...origin }
    spanMeasureLine.value = null
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
    // Altijd echte verplaatsing (bij room-mode is overrideCm de binnenmaat, geen delta).
    const commitDelta = draft.delta
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
    const applied = applyLengthTypeKey(event, typeText.value, inputUnit())
    if (!applied) return false
    typeText.value = applied.text
    draft.overrideCm = applied.cm
    rebuildFromHover(draft.snapDisabled)
    return true
  }

  return {
    drafting,
    typeText,
    measureLengthCm,
    junctionMoveLabelCm: labelCm,
    spanMeasureLine,
    isDrafting: () => drafting.value,
    beginJunctionMove,
    updateJunctionMoveHover,
    onJunctionMoveClick,
    handleTypeKey,
    commitFromMeasure: commitJunctionMove,
    cancelJunctionMove,
  }
}
