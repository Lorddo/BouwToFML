import { computed, ref, type Ref } from 'vue'
import type {
  FloorArea,
  FloorDesign,
  FloorDimension,
  FloorItem,
  FloorLabel,
  FloorLine,
  FloorPlan,
  FloorSurface,
  Point2D,
  Wall,
} from '@/core/plan/types'

const MAX_UNDO = 50

export { MAX_UNDO }

export type PlanCanvasUndoSnapshot = {
  walls: Wall[]
  items?: FloorItem[]
  areas?: FloorArea[]
  surfaces?: FloorSurface[]
  labels?: FloorLabel[]
  lines?: FloorLine[]
  dimensions?: FloorDimension[]
  designs?: FloorDesign[]
  activeDesignIndex?: number
  /** Project-source (facadeGroups e.d.); null = expliciet wissen. */
  planSource?: FloorPlan['source'] | null
  /** Underlay origin bij nulpunt-edits; undefined = layout ongemoeid bij undo. */
  layoutOrigin?: Point2D | null
}

export interface EditorUndoDeps {
  localPlan: Ref<FloorPlan | null>
  floorIndex: Ref<number>
  walls: () => Wall[]
  patchActiveFloor: (
    patch: Partial<{
      walls: Wall[]
      items: FloorItem[] | undefined
      areas: FloorArea[] | undefined
      surfaces: FloorSurface[] | undefined
      labels: FloorLabel[] | undefined
      lines: FloorLine[] | undefined
      dimensions: FloorDimension[] | undefined
      designs: FloorDesign[] | undefined
      activeDesignIndex: number | undefined
    }>,
  ) => void
}

export function createEditorUndo(deps: EditorUndoDeps) {
  const undoStack = ref<PlanCanvasUndoSnapshot[]>([])
  const redoStack = ref<PlanCanvasUndoSnapshot[]>([])
  const pendingUndoLayoutOrigin = ref<Point2D | null | undefined>(undefined)

  function clearStacks(): void {
    undoStack.value = []
    redoStack.value = []
    pendingUndoLayoutOrigin.value = undefined
  }

  function captureSnapshot(options?: { layoutOrigin?: Point2D | null }): PlanCanvasUndoSnapshot {
    const floor =
      deps.localPlan.value?.floors[deps.floorIndex.value] ?? deps.localPlan.value?.floors[0]
    const snapshot: PlanCanvasUndoSnapshot = {
      walls: JSON.parse(JSON.stringify(deps.walls())) as Wall[],
      items: floor?.items ? (JSON.parse(JSON.stringify(floor.items)) as FloorItem[]) : undefined,
      areas: floor?.areas ? (JSON.parse(JSON.stringify(floor.areas)) as FloorArea[]) : undefined,
      surfaces: floor?.surfaces
        ? (JSON.parse(JSON.stringify(floor.surfaces)) as FloorSurface[])
        : undefined,
      labels: floor?.labels
        ? (JSON.parse(JSON.stringify(floor.labels)) as FloorLabel[])
        : undefined,
      lines: floor?.lines ? (JSON.parse(JSON.stringify(floor.lines)) as FloorLine[]) : undefined,
      dimensions: floor?.dimensions
        ? (JSON.parse(JSON.stringify(floor.dimensions)) as FloorDimension[])
        : undefined,
      designs: floor?.designs
        ? (JSON.parse(JSON.stringify(floor.designs)) as FloorDesign[])
        : undefined,
      activeDesignIndex: floor?.activeDesignIndex,
      planSource: deps.localPlan.value?.source
        ? (JSON.parse(JSON.stringify(deps.localPlan.value.source)) as FloorPlan['source'])
        : null,
    }
    if (options && 'layoutOrigin' in options) {
      snapshot.layoutOrigin = options.layoutOrigin
        ? { x: options.layoutOrigin.x, y: options.layoutOrigin.y }
        : options.layoutOrigin
    }
    return snapshot
  }

  function applySnapshot(snapshot: PlanCanvasUndoSnapshot): void {
    deps.patchActiveFloor({
      walls: snapshot.walls,
      items: snapshot.items,
      areas: snapshot.areas,
      surfaces: snapshot.surfaces,
      labels: snapshot.labels,
      lines: snapshot.lines,
      dimensions: snapshot.dimensions,
      designs: snapshot.designs,
      activeDesignIndex: snapshot.activeDesignIndex,
    })
    if (deps.localPlan.value && 'planSource' in snapshot) {
      deps.localPlan.value = {
        ...deps.localPlan.value,
        source: snapshot.planSource ?? undefined,
      }
    }
    pendingUndoLayoutOrigin.value = 'layoutOrigin' in snapshot ? snapshot.layoutOrigin : undefined
  }

  function pushUndo(options?: { layoutOrigin?: Point2D | null }): void {
    undoStack.value = [...undoStack.value.slice(-(MAX_UNDO - 1)), captureSnapshot(options)]
    redoStack.value = []
  }

  function undo(): boolean {
    const previous = undoStack.value.pop()
    if (!previous) return false
    redoStack.value = [...redoStack.value, captureSnapshot()]
    applySnapshot(previous)
    return true
  }

  function redo(): boolean {
    const next = redoStack.value.pop()
    if (!next) return false
    undoStack.value = [...undoStack.value.slice(-(MAX_UNDO - 1)), captureSnapshot()]
    applySnapshot(next)
    return true
  }

  function consumePendingUndoLayoutOrigin(): Point2D | null | undefined {
    const value = pendingUndoLayoutOrigin.value
    pendingUndoLayoutOrigin.value = undefined
    return value
  }

  function canUndo(): boolean {
    return undoStack.value.length > 0
  }

  function canRedo(): boolean {
    return redoStack.value.length > 0
  }

  const canUndoEdit = computed(() => undoStack.value.length > 0)
  const canRedoEdit = computed(() => redoStack.value.length > 0)

  function popLastUndo(): void {
    undoStack.value = undoStack.value.slice(0, -1)
  }

  return {
    undoStack,
    redoStack,
    clearStacks,
    popLastUndo,
    captureSnapshot,
    applySnapshot,
    pushUndo,
    undo,
    redo,
    consumePendingUndoLayoutOrigin,
    canUndo,
    canRedo,
    canUndoEdit,
    canRedoEdit,
  }
}
