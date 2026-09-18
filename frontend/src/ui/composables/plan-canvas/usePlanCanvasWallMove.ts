import { ref, type Ref } from 'vue'
import type { FloorArea, Point2D, Wall } from '@/core/plan/types'
import {
  resolveWallSlidePointerDelta,
  snapWallSlideDeltaToJunctions,
} from '@/core/plan/junctions'
import {
  pickRoomInteriorCm,
  roomSpanFromWall,
  wallSlideDeltaForInterior,
} from '@/core/plan/precise-move-room-span'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import { cloneAreasSnapshot } from './plan-canvas-area-live'
import {
  applyDrawTypeKey,
  isDrawTypeLengthKey,
  parseDrawLengthDraftToCm,
} from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'
import type { MeasureLine } from '@/ui/composables/canvas-kernel/plan-canvas-measure'

type EditorApi = ReturnType<typeof usePlanEditor>

interface WallMoveHitTestApi {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

/** Klik-jitter: negeer per ongeluk bijna-nul. Alleen getypt mag tot 1 mm (bewuste invoer). */
const CLICK_COMMIT_MIN_CM = 0.5
const TYPED_COMMIT_MIN_CM = 0.1

/**
 * Muur verschuiven: klik → richting → klik (of typ binnenmaat + Enter).
 * Typen = binnenmaat van de gekozen ruimte (hover-zijde); 2e klik zonder typen = delta.
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
  const spanMeasureLine = ref<MeasureLine | null>(null)

  let draft: {
    wallId: string
    wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>
    startCm: Point2D
    hoverCm: Point2D
    baseWalls: Wall[]
    baseAreas: FloorArea[] | undefined
    slideDir: Point2D
    delta: number
    overrideCm: number | null
    /** Getypte binnenmaat (label); null = toon |delta|. */
    typedInteriorCm: number | null
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
      spanMeasureLine.value = null
      return
    }
    const current = draft
    const wall =
      options.editor.selectableWalls.value.find((item) => item.id === current.wallId) ??
      current.wall
    const dx = current.hoverCm.x - current.startCm.x
    const dy = current.hoverCm.y - current.startCm.y
    const intoDir =
      Math.hypot(dx, dy) > 1e-9
        ? { x: dx, y: dy }
        : {
            x: current.slideDir.x * (Math.sign(current.delta) || 1),
            y: current.slideDir.y * (Math.sign(current.delta) || 1),
          }
    const room = pickRoomInteriorCm(
      wall,
      current.baseAreas ?? [],
      intoDir,
      current.baseWalls,
    )
    if (room) {
      const spanLen =
        current.typedInteriorCm != null
          ? Math.abs(current.typedInteriorCm)
          : room.interiorCm
      measureLengthCm.value = spanLen
      const span = roomSpanFromWall(wall, room.intoUnit, spanLen, room.spanOrigin)
      if (span) {
        labelCm.value = {
          x: (span.a.x + span.b.x) / 2,
          y: (span.a.y + span.b.y) / 2,
        }
        const typing = typeText.value.length > 0
        spanMeasureLine.value = {
          id: 'wall-move-span',
          a: span.a,
          b: span.b,
          emphasis: typing ? 'typing' : 'active',
          suppressLabel: true,
        }
        return
      }
    }
    measureLengthCm.value =
      current.typedInteriorCm != null
        ? Math.abs(current.typedInteriorCm)
        : Math.abs(current.delta)
    labelCm.value = wallMid(wall)
    spanMeasureLine.value = null
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
      const intoDir =
        Math.hypot(dx, dy) > 1e-9
          ? { x: dx, y: dy }
          : {
              x: resolved.slideDir.x * (Math.sign(draft.delta) || 1),
              y: resolved.slideDir.y * (Math.sign(draft.delta) || 1),
            }
      const room = pickRoomInteriorCm(
        draft.wall,
        draft.baseAreas ?? [],
        intoDir,
        draft.baseWalls,
      )
      if (room) {
        const typedI = Math.abs(draft.overrideCm)
        const delta = wallSlideDeltaForInterior(
          room.interiorCm,
          typedI,
          room.intoUnit,
          resolved.slideDir,
        )
        draft.typedInteriorCm = typedI
        applyDelta(delta, resolved.slideDir)
        return
      }
      draft.typedInteriorCm = null
      const sign =
        draft.overrideCm < 0
          ? -1
          : resolved.delta !== 0
            ? Math.sign(resolved.delta)
            : Math.sign(draft.delta) || 1
      applyDelta(Math.abs(draft.overrideCm) * sign, resolved.slideDir)
      return
    }
    draft.typedInteriorCm = null
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
    spanMeasureLine.value = null
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
      wall: {
        a: { ...wall.a },
        b: { ...wall.b },
        thickness: wall.thickness,
        balance: wall.balance,
      },
      startCm: cm,
      hoverCm: cm,
      baseWalls: JSON.parse(JSON.stringify(source)) as Wall[],
      baseAreas: cloneAreasSnapshot(options.editor.areas.value),
      slideDir: defaultSlideDir(wall),
      delta: 0,
      overrideCm: null,
      typedInteriorCm: null,
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
    spanMeasureLine,
    isDrafting: () => drafting.value,
    beginWallMove,
    updateWallMoveHover,
    onWallMoveClick,
    handleTypeKey,
    commitFromMeasure: commitWallMove,
    cancelWallMove,
  }
}
