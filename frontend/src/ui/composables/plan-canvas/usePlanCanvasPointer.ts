import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { PLAN_CANVAS_CHROME_SELECTOR } from './plan-canvas-gestures'
import { allowsPlanStickyHit, type PlanStickySelectKind } from './plan-canvas-sticky-select'
import { planStickySelectKind } from './plan-canvas-selected'
import type { PlanViewContext } from './plan-view-context'
import {
  runPlanHitCascade,
  type PlanHitCascadeActions,
  type PlanHitCascadeModes,
} from './plan-canvas-hit-cascade'
import {
  dispatchPlanToolDblClick,
  dispatchPlanToolDown,
  dispatchPlanToolHover,
  resolvePlanToolCursor,
  type PlanToolEntry,
} from './plan-canvas-tool-registry'
import type { ThicknessBand } from '@/core/plan/wall-thickness-tiers'
import type { HitTestApi } from './plan-canvas-hit-test-api'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection-types'

/**
 * Sinds de tool-registry leest de pointer geen tool-booleans meer: de tien
 * `drawXMode` / `addXMode`-vlaggen zaten in `tools`. Wat overblijft is precies
 * wat de select-cascade nodig heeft, dus het is één contract geworden in plaats
 * van twee lijsten die synchroon gehouden moesten worden.
 */
export type PointerToolModes = PlanHitCascadeModes

export interface PointerDragState {
  draggingWall: ComputedRef<boolean> | Ref<boolean>
  draggingJunction: ComputedRef<boolean> | Ref<boolean>
  draggingOpening: ComputedRef<boolean> | Ref<boolean>
  isMeasureDragging: () => boolean
  isNulpuntDragging: () => boolean
  isUnderlayMoveDragging: () => boolean
  isPanDragging: Ref<boolean>
  draggingItem: ComputedRef<boolean> | Ref<boolean>
  draggingItemResize: ComputedRef<boolean> | Ref<boolean>
  draggingItemRotate: ComputedRef<boolean> | Ref<boolean>
  isWallMoveDrafting?: () => boolean
  isJunctionMoveDrafting?: () => boolean
  isOpeningMoveDrafting?: () => boolean
  draggingDimension?: ComputedRef<boolean> | Ref<boolean>
  draggingAreaLabel?: ComputedRef<boolean> | Ref<boolean>
}

/**
 * Wat de pointer zélf doet: pannen en de drie move-drafts afmaken. De
 * teken-tools zitten in `tools`; al het overige is cascade-werk.
 */
interface PointerOwnActions {
  beginPanDrag: (event: MouseEvent) => void
  stopContentGroupDrag: () => void
  updateWallMoveHover: (event: MouseEvent) => void
  updateJunctionMoveHover: (event: MouseEvent) => void
  updateOpeningMoveHover: (event: MouseEvent) => void
}

export type PointerActions = PlanHitCascadeActions & PointerOwnActions

export function usePlanCanvasPointer(options: {
  hitTest: HitTestApi
  selection: PlanCanvasSelectionRefs
  /** Welke tab open staat; bepaalt wat te pakken is. Niet wie het canvas embedt. */
  view: PlanViewContext
  modes: PointerToolModes
  drag: PointerDragState
  actions: PointerActions
  /** Geordende tool-lijst; de volgorde ís de prioriteit. */
  tools: ReadonlyArray<PlanToolEntry>
  spacePressed: Ref<boolean>
  thicknessPickTier: Ref<ThicknessBand | null>
  emit: (event: 'thicknessWallPick', payload: string) => void
}) {
  const {
    hitTest,
    selection,
    view,
    modes,
    drag,
    actions,
    tools,
    spacePressed,
    thicknessPickTier,
    emit,
  } = options

  const {
    moveWallId,
    moveOpeningId,
    settingsItemId,
    moveItemId,
    hoveredWallId,
    hoveredItemId,
    hoveredOpeningId,
    hoveredJunctionId,
    pinnedJunctionId,
  } = selection

  const hoverItemHandle = ref<'rotate' | 'resize' | null>(null)
  const hoverAreaLabel = ref(false)

  const canvasCursor = computed(() => {
    if (!spacePressed.value && !thicknessPickTier.value) {
      const toolCursor = resolvePlanToolCursor(tools)
      if (toolCursor) return toolCursor
    }
    if (selection.surfaceEditId.value && !spacePressed.value) return 'crosshair'
    if (modes.selectionBoxMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (thicknessPickTier.value) return 'crosshair'
    if (modes.inspectMode.value && !spacePressed.value) return 'pointer'
    if (drag.draggingItemRotate?.value === true) return 'grabbing'
    if (
      drag.draggingWall.value ||
      drag.draggingJunction.value ||
      drag.draggingOpening.value ||
      drag.draggingItem.value
    ) {
      return 'grabbing'
    }
    if (spacePressed.value) return drag.isPanDragging.value ? 'grabbing' : 'grab'
    if (hoveredJunctionId.value) return 'grab'
    if (moveOpeningId.value && hoveredOpeningId.value === moveOpeningId.value) return 'grab'
    if (moveWallId.value && hoveredWallId.value === moveWallId.value) return 'grab'
    if (moveItemId.value && hoveredItemId.value === moveItemId.value) return 'grab'
    if (
      selection.moveDimensionId.value &&
      (selection.hoveredDimensionId.value === selection.moveDimensionId.value ||
        selection.hoveredDimensionEnd.value != null)
    ) {
      return 'grab'
    }
    if (drag.draggingDimension?.value === true) return 'grabbing'
    if (drag.draggingAreaLabel?.value === true) return 'grabbing'
    if (hoverAreaLabel.value) return 'grab'
    if (hoverItemHandle.value) return 'grab'
    return 'default'
  })

  function currentStickyKind(): PlanStickySelectKind | null {
    return planStickySelectKind(selection)
  }

  function onWrapPointerDown(event: MouseEvent): void {
    if (event.button !== 0) return
    // Touch synthesizes an undispatched MouseEvent — target is null, niet chrome.
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest(PLAN_CANVAS_CHROME_SELECTOR)) {
      return
    }

    // Sidebar-controls (opacity e.d.) verliezen focus zodat Space+pan meteen werkt.
    const active = document.activeElement
    if (
      target &&
      active instanceof HTMLElement &&
      active !== target &&
      !target.contains(active) &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable)
    ) {
      active.blur()
    }

    if (spacePressed.value) {
      actions.beginPanDrag(event)
      return
    }

    event.preventDefault()
    actions.stopContentGroupDrag()

    const cm = hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return

    if (drag.isWallMoveDrafting?.() === true) {
      actions.onWallMoveClick(moveWallId.value ?? '', event)
      return
    }
    if (drag.isJunctionMoveDrafting?.() === true) {
      actions.onJunctionMoveClick(
        {
          id: pinnedJunctionId.value ?? '',
          x: cm.x,
          y: cm.y,
          cmX: cm.x,
          cmY: cm.y,
          refs: [],
          wallCount: 0,
        },
        event,
      )
      return
    }
    if (drag.isOpeningMoveDrafting?.() === true) {
      actions.onOpeningMoveClick(moveOpeningId.value ?? '', event)
      return
    }

    if (dispatchPlanToolDown(tools, cm, event)) return

    runPlanHitCascade({
      cm,
      event,
      hitTest,
      selection,
      view,
      modes,
      actions,
      thicknessPickTier,
      emit,
    })
  }

  function onWrapPointerMove(event: MouseEvent): void {
    const moveTarget = event.target instanceof Element ? event.target : null
    if (moveTarget?.closest(PLAN_CANVAS_CHROME_SELECTOR)) return
    if (drag.isWallMoveDrafting?.() === true) {
      actions.updateWallMoveHover(event)
      return
    }
    if (drag.isJunctionMoveDrafting?.() === true) {
      actions.updateJunctionMoveHover(event)
      return
    }
    if (drag.isOpeningMoveDrafting?.() === true) {
      actions.updateOpeningMoveHover(event)
      return
    }
    if (
      drag.draggingWall.value ||
      drag.draggingJunction.value ||
      drag.draggingOpening.value ||
      drag.isMeasureDragging() ||
      drag.isNulpuntDragging() ||
      drag.isUnderlayMoveDragging() ||
      drag.draggingItem.value ||
      drag.draggingItemResize.value ||
      drag.draggingItemRotate?.value === true ||
      drag.draggingDimension?.value === true ||
      drag.draggingAreaLabel?.value === true ||
      spacePressed.value
    ) {
      return
    }
    if (dispatchPlanToolHover(tools, event)) return

    pendingMoveEvent = event
    if (moveRaf != null) return
    moveRaf = requestAnimationFrame(() => {
      moveRaf = null
      const e = pendingMoveEvent
      pendingMoveEvent = null
      if (!e) return
      const cm = hitTest.clientToCm(e.clientX, e.clientY)
      if (!cm) return
      const selectedItem = view.canSelect('item')
        ? (settingsItemId.value ?? moveItemId.value)
        : null
      if (selectedItem && !modes.inspectMode.value) {
        if (actions.hitItemRotateHandle(cm)) hoverItemHandle.value = 'rotate'
        else if (actions.hitItemResizeHandle(cm)) hoverItemHandle.value = 'resize'
        else hoverItemHandle.value = null
      } else {
        hoverItemHandle.value = null
      }
      const nameHover =
        modes.areaSurfaceEditEnabled.value && !modes.inspectMode.value && modes.labelsVisible.value
          ? hitTest.hitTestAreaNameAtCm(cm)
          : null
      hoverAreaLabel.value =
        nameHover != null &&
        ((nameHover.kind === 'area' && nameHover.id === selection.settingsAreaId.value) ||
          (nameHover.kind === 'surface' && nameHover.id === selection.settingsSurfaceId.value))
      const allowHover = (hit: PlanStickySelectKind): boolean =>
        allowsPlanStickyHit(currentStickyKind(), hit)
      const junction = modes.selectionBoxMode.value
        ? null
        : hitTest.hitTestJunctionAtCm(cm)
      hoveredJunctionId.value = junction && allowHover('wall') ? junction.id : null
      const doorId = hitTest.hitTestOpeningAtCm(cm)
      hoveredOpeningId.value = doorId && allowHover('opening') ? doorId : null
      hoveredItemId.value = null
      hoveredWallId.value = hoveredOpeningId.value != null ? null : hitTest.hitTestWallAtCm(cm)
      if (
        modes.manualDimensionsEnabled?.value === true &&
        !modes.inspectMode.value &&
        !modes.measureMode.value
      ) {
        const endpoint = modes.hitTestDimensionEndpointAtCm?.(cm) ?? null
        if (endpoint && allowHover('dimension')) {
          selection.hoveredDimensionId.value = endpoint.id
          selection.hoveredDimensionEnd.value = endpoint.end
        } else {
          const dimId = modes.hitTestDimensionAtCm?.(cm) ?? null
          selection.hoveredDimensionId.value = dimId && allowHover('dimension') ? dimId : null
          selection.hoveredDimensionEnd.value = null
        }
      } else {
        selection.hoveredDimensionId.value = null
        selection.hoveredDimensionEnd.value = null
      }
    })
  }

  function cancelPendingMove(): void {
    if (moveRaf != null) {
      cancelAnimationFrame(moveRaf)
      moveRaf = null
    }
    pendingMoveEvent = null
  }

  let moveRaf: number | null = null
  let pendingMoveEvent: MouseEvent | null = null

  return {
    canvasCursor,
    onWrapPointerDown,
    onWrapPointerMove,
    cancelPendingMove,
    onWrapDblClick(event: MouseEvent): void {
      dispatchPlanToolDblClick(tools, event)
    },
  }
}
