import { computed, ref } from 'vue'
import type { FloorPlan, Point2D } from '@/core/plan/types'

export const SESSION_UNDO_MAX = 50

export type EditorSessionUndoSnapshot = {
  plan: FloorPlan
  floorIndex: number
  /**
   * Workspace stap-4: blob-id van de verdieping.
   * Editor negeert dit (één multi-floor plan).
   */
  floorId?: string | null
  /** Underlay origin bij nulpunt-edits; undefined = layout ongemoeid bij undo. */
  layoutOrigin?: Point2D | null
}

export type EditorSessionUndoPushOptions = {
  layoutOrigin?: Point2D | null
}

export type EditorSessionUndoDeps = {
  getPlan: () => FloorPlan | null
  getFloorIndex: () => number
  /** Workspace: actieve floor-blob id. */
  getFloorId?: () => string | null
  apply: (snapshot: EditorSessionUndoSnapshot) => void
}

export type EditorSessionUndoApi = ReturnType<typeof createEditorSessionUndo>

function clonePlan(plan: FloorPlan): FloorPlan {
  return JSON.parse(JSON.stringify(plan)) as FloorPlan
}

function snapshotPayload(snapshot: EditorSessionUndoSnapshot): EditorSessionUndoSnapshot {
  const next: EditorSessionUndoSnapshot = {
    plan: clonePlan(snapshot.plan),
    floorIndex: snapshot.floorIndex,
  }
  if ('floorId' in snapshot) next.floorId = snapshot.floorId
  if ('layoutOrigin' in snapshot) next.layoutOrigin = snapshot.layoutOrigin
  return next
}

export function createEditorSessionUndo(deps: EditorSessionUndoDeps) {
  const undoStack = ref<EditorSessionUndoSnapshot[]>([])
  const redoStack = ref<EditorSessionUndoSnapshot[]>([])

  function clearStacks(): void {
    undoStack.value = []
    redoStack.value = []
  }

  function captureSnapshot(options?: EditorSessionUndoPushOptions): EditorSessionUndoSnapshot | null {
    const plan = deps.getPlan()
    if (!plan) return null
    const snapshot: EditorSessionUndoSnapshot = {
      plan: clonePlan(plan),
      floorIndex: deps.getFloorIndex(),
    }
    if (deps.getFloorId) {
      snapshot.floorId = deps.getFloorId()
    }
    if (options && 'layoutOrigin' in options) {
      snapshot.layoutOrigin = options.layoutOrigin
        ? { x: options.layoutOrigin.x, y: options.layoutOrigin.y }
        : options.layoutOrigin
    }
    return snapshot
  }

  function pushUndo(options?: EditorSessionUndoPushOptions): void {
    const snapshot = captureSnapshot(options)
    if (!snapshot) return
    undoStack.value = [...undoStack.value.slice(-(SESSION_UNDO_MAX - 1)), snapshot]
    redoStack.value = []
  }

  function undo(): boolean {
    const previous = undoStack.value[undoStack.value.length - 1]
    if (!previous) return false
    const current = captureSnapshot()
    if (!current) return false
    undoStack.value = undoStack.value.slice(0, -1)
    redoStack.value = [...redoStack.value, current]
    deps.apply(snapshotPayload(previous))
    return true
  }

  function redo(): boolean {
    const next = redoStack.value[redoStack.value.length - 1]
    if (!next) return false
    const current = captureSnapshot()
    if (!current) return false
    redoStack.value = redoStack.value.slice(0, -1)
    undoStack.value = [...undoStack.value.slice(-(SESSION_UNDO_MAX - 1)), current]
    deps.apply(snapshotPayload(next))
    return true
  }

  function popLastUndo(): void {
    undoStack.value = undoStack.value.slice(0, -1)
  }

  function canUndo(): boolean {
    return undoStack.value.length > 0
  }

  function canRedo(): boolean {
    return redoStack.value.length > 0
  }

  const canUndoEdit = computed(() => undoStack.value.length > 0)
  const canRedoEdit = computed(() => redoStack.value.length > 0)

  return {
    undoStack,
    redoStack,
    clearStacks,
    popLastUndo,
    pushUndo,
    undo,
    redo,
    canUndo,
    canRedo,
    canUndoEdit,
    canRedoEdit,
  }
}
