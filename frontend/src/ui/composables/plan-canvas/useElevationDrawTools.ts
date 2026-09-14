import { ref, type Ref } from 'vue'
import type { FloorPlan, Opening, Point2D } from '@/core/plan/types'
import { maybeAddSiblingBovenlicht } from '@/core/plan/bovenlicht'
import { DEFAULT_DOOR_HEIGHT_CM } from '@/core/plan/extraction-to-plan-types'
import {
  projectFacadeElevation,
  type ElevationBovenlichtDefaults,
  type ElevationWallRect,
  type FacadeElevation,
} from '@/core/plan/facade-elevation'
import {
  collectElevationSplitSnapXs,
  elevationSplitPreviewAt,
  hitElevationWall,
  type ElevationSplitPreview,
} from '@/core/plan/elevation-hit'
import {
  pickElevationWallForOpeningX,
  type ElevationSnapGuide,
} from '@/core/plan/elevation-opening-edit'
import {
  placeRidgeFromElevation,
  previewRidgeFromElevation,
  type ElevationRidgePlacePreview,
} from '@/core/plan/elevation-ridge-place'
import {
  beginRoofPlaceFromElevation,
  placeRoofFromElevation,
  previewRoofFromElevation,
  roofPlaceHoverElevPoint,
  type ElevationRoofPlaceDraft,
  type ElevationRoofPlacePreview,
} from '@/core/plan/elevation-roof-place'
import { addPlanOpening, splitPlanWallAtT } from '@/core/plan/elevation-openings'
import {
  clampOpeningSillZ,
  clampOpeningWidth,
  clampWindowOpeningHeight,
} from '@/ui/components/plan-canvas-openings'
import { type DoorAddSubtype, type WindowAddSubtype } from '@/core/plan/opening-add-presets'
import { buildOpeningFromPreset } from '@/core/plan/opening-from-preset'
import { splitWallAtT } from '@/ui/components/plan-canvas-wall-edit'
import type { ElevTool } from './elevation-tool'
import type { ElevationInteractionProps } from './elevation-interaction-types'

export function useElevationDrawTools(options: {
  props: ElevationInteractionProps
  elevation: Ref<FacadeElevation | null>
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  activeTool: Ref<ElevTool>
  snapGuide: Ref<ElevationSnapGuide | null>
  floorBovenlichtDefaults: (floorIndex: number) => ElevationBovenlichtDefaults
  pushUndo: () => void
  commitPlan: (next: FloorPlan) => void
  selectOpening: (openingId: string | null, mode?: 'quick' | 'edit' | null) => void
  selectRidge: (wallId: string, floorIndex: number, end?: 'a' | 'b') => void
  selectRoof: (id: string | null, vertexIndex?: number | null) => void
  selectJunction: (id: string | null) => void
  addDoorSubtype: Ref<DoorAddSubtype>
  addDoorWidthCm: Ref<number>
  addDoorHeightCm: Ref<number>
  addDoorSillZCm: Ref<number>
  addWindowSubtype: Ref<WindowAddSubtype>
  addWindowWidthCm: Ref<number>
  addWindowSillZCm: Ref<number>
  addWindowHeightCm: Ref<number>
}) {
  const {
    props,
    elevation,
    clientToCm,
    activeTool,
    snapGuide,
    floorBovenlichtDefaults,
    pushUndo,
    commitPlan,
    selectOpening,
    selectRidge,
    selectRoof,
    selectJunction,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addDoorSillZCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
  } = options

  const splitDraft = ref<ElevationSplitPreview | null>(null)
  const ridgePlacePreview = ref<ElevationRidgePlacePreview | null>(null)
  const roofPlaceDraft = ref<ElevationRoofPlaceDraft | null>(null)
  const roofPlacePreview = ref<ElevationRoofPlacePreview | null>(null)
  const roofPlaceHover = ref<Point2D | null>(null)

  function clearRoofPlaceDraft(): void {
    roofPlaceDraft.value = null
    roofPlacePreview.value = null
    roofPlaceHover.value = null
    snapGuide.value = null
  }

  function placeOpening(elev: FacadeElevation, cm: Point2D, type: 'door' | 'window'): void {
    const hit = hitElevationWall(elev, cm)
    if (!hit || hit.ridge) return
    const floorWalls = props.plan.floors[hit.floorIndex]?.walls ?? []
    const wall = pickElevationWallForOpeningX(elev.walls, hit, cm.x, floorWalls)
    const width = clampOpeningWidth(type === 'door' ? addDoorWidthCm.value : addWindowWidthCm.value)
    if (type === 'door') addDoorWidthCm.value = width
    else addWindowWidthCm.value = width
    const height =
      type === 'door'
        ? Math.max(
            1,
            Math.round(
              addDoorHeightCm.value || (props.defaultDoorHeightCm ?? DEFAULT_DOOR_HEIGHT_CM),
            ),
          )
        : clampWindowOpeningHeight(addWindowHeightCm.value)
    const z =
      type === 'door'
        ? clampOpeningSillZ(addDoorSillZCm.value)
        : clampOpeningSillZ(addWindowSillZCm.value)
    if (type === 'window') {
      addWindowSillZCm.value = z
      addWindowHeightCm.value = height
    } else {
      addDoorSillZCm.value = z
      addDoorHeightCm.value = height
    }
    const xSpan = wall.xb - wall.xa
    const t = Math.abs(xSpan) < 1e-6 ? 0.5 : (cm.x - wall.xa) / xSpan
    const opening: Opening = buildOpeningFromPreset({
      type,
      doorSubtype: addDoorSubtype.value,
      windowSubtype: addWindowSubtype.value,
      widthCm: width,
      heightCm: height,
      sillZCm: z,
      t,
    })
    pushUndo()
    const result = addPlanOpening(props.plan, wall.wallId, opening, wall.floorIndex)
    let nextPlan = result.plan
    if (props.bovenlichtPacked === false) {
      const host = nextPlan.floors[wall.floorIndex]?.walls.find((w) => w.id === wall.wallId)
      const floorHeight = props.plan.floors[wall.floorIndex]?.height ?? 280
      const defaults = floorBovenlichtDefaults(wall.floorIndex)
      if (host) {
        const sibling = maybeAddSiblingBovenlicht(host, opening, floorHeight, defaults)
        if (sibling) {
          nextPlan = addPlanOpening(nextPlan, wall.wallId, sibling, wall.floorIndex).plan
        }
      }
    }
    if (result.openingId) selectOpening(result.openingId)
    commitPlan(nextPlan)
    activeTool.value = 'select'
  }

  function placeRidge(elev: FacadeElevation, cm: Point2D, snapOff = false): void {
    const result = placeRidgeFromElevation(props.plan, elev, cm, { snapOff })
    if (!result) return
    pushUndo()
    commitPlan(result.plan)
    selectRidge(result.wallId, result.floorIndex)
    ridgePlacePreview.value = null
    activeTool.value = 'select'
  }

  function updateRidgePlacePreview(elev: FacadeElevation, cm: Point2D, snapOff = false): void {
    ridgePlacePreview.value = previewRidgeFromElevation(props.plan, elev, cm, { snapOff })
    const midX =
      ridgePlacePreview.value != null
        ? (ridgePlacePreview.value.rect.x0 + ridgePlacePreview.value.rect.x1) / 2
        : null
    snapGuide.value = midX != null && Math.abs(midX - cm.x) > 1e-6 ? { x: midX } : null
  }

  function onRoofPlaceClick(
    elev: FacadeElevation,
    cm: Point2D,
    snapOff = false,
    freeZ = false,
  ): void {
    if (!roofPlaceDraft.value) {
      const draft = beginRoofPlaceFromElevation(props.plan, elev, cm, { snapOff })
      if (!draft) return
      roofPlaceDraft.value = draft
      roofPlacePreview.value = null
      roofPlaceHover.value = draft.eaveElev
      return
    }
    const result = placeRoofFromElevation(props.plan, elev, roofPlaceDraft.value, cm, {
      snapOff,
      freeZ,
    })
    if (!result) return
    pushUndo()
    commitPlan(result.plan)
    selectRoof(result.surfaceId, null)
    clearRoofPlaceDraft()
    activeTool.value = 'select'
  }

  function updateRoofPlacePreview(
    elev: FacadeElevation,
    cm: Point2D,
    snapOff = false,
    freeZ = false,
  ): void {
    const draft = roofPlaceDraft.value
    if (!draft) {
      roofPlacePreview.value = null
      const preview = beginRoofPlaceFromElevation(props.plan, elev, cm, { snapOff })
      roofPlaceHover.value = preview?.eaveElev ?? null
      snapGuide.value =
        preview != null && Math.abs(preview.eaveElev.x - cm.x) > 1e-6
          ? { x: preview.eaveElev.x }
          : null
      return
    }
    roofPlaceHover.value = roofPlaceHoverElevPoint(props.plan, elev, draft, cm, { snapOff, freeZ })
    roofPlacePreview.value = previewRoofFromElevation(props.plan, elev, draft, cm, {
      snapOff,
      freeZ,
    })
    const hoverX = roofPlaceHover.value?.x
    snapGuide.value = hoverX != null && Math.abs(hoverX - cm.x) > 1e-6 ? { x: hoverX } : null
  }

  function splitPreviewForWall(
    elev: FacadeElevation,
    wall: ElevationWallRect,
    x: number,
  ): ElevationSplitPreview {
    return elevationSplitPreviewAt(wall, x, collectElevationSplitSnapXs(elev, wall.wallId))
  }

  function updateSplitDraft(elev: FacadeElevation, x: number): void {
    const draft = splitDraft.value
    if (!draft) return
    const wall = elev.walls.find(
      (item) => item.wallId === draft.wallId && item.floorIndex === draft.floorIndex,
    )
    if (!wall || wall.ridge) return
    const next = splitPreviewForWall(elev, wall, x)
    splitDraft.value = next
    snapGuide.value = next.snapped ? { x: next.x } : null
  }

  function onSplitMove(event: PointerEvent): void {
    if (!splitDraft.value || activeTool.value !== 'split') return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!elev || !cm) return
    updateSplitDraft(elev, cm.x)
  }

  function beginSplitDraft(elev: FacadeElevation, wall: ElevationWallRect, x: number): void {
    window.removeEventListener('pointermove', onSplitMove)
    splitDraft.value = splitPreviewForWall(elev, wall, x)
    snapGuide.value = splitDraft.value.snapped ? { x: splitDraft.value.x } : null
    window.addEventListener('pointermove', onSplitMove)
  }

  function clearSplitDraft(): void {
    window.removeEventListener('pointermove', onSplitMove)
    splitDraft.value = null
    snapGuide.value = null
  }

  function commitSplitDraft(): void {
    const draft = splitDraft.value
    if (!draft) return
    const result = splitPlanWallAtT(props.plan, draft.wallId, draft.t, splitWallAtT)
    if (!result) return
    pushUndo()
    commitPlan(result.plan)
    const nextElev = projectFacadeElevation(result.plan, props.groupId, floorBovenlichtDefaults)
    const junction = nextElev?.junctions.find(
      (item) =>
        !item.ridge && item.floorIndex === result.floorIndex && Math.abs(item.x - draft.x) < 8,
    )
    clearSplitDraft()
    selectJunction(junction?.id ?? null)
    activeTool.value = 'select'
  }

  function onSplitClick(elev: FacadeElevation, cm: { x: number; y: number }): void {
    const wall = hitElevationWall(elev, cm)
    if (!splitDraft.value) {
      if (!wall || wall.ridge) return
      beginSplitDraft(elev, wall, cm.x)
      return
    }
    if (wall && !wall.ridge && wall.wallId !== splitDraft.value.wallId) {
      beginSplitDraft(elev, wall, cm.x)
      return
    }
    updateSplitDraft(elev, cm.x)
    commitSplitDraft()
  }

  function clearDrawPreviews(): void {
    clearSplitDraft()
    ridgePlacePreview.value = null
    clearRoofPlaceDraft()
  }

  return {
    splitDraft,
    ridgePlacePreview,
    roofPlaceDraft,
    roofPlacePreview,
    roofPlaceHover,
    clearRoofPlaceDraft,
    clearSplitDraft,
    clearDrawPreviews,
    placeOpening,
    placeRidge,
    updateRidgePlacePreview,
    onRoofPlaceClick,
    updateRoofPlacePreview,
    updateSplitDraft,
    beginSplitDraft,
    commitSplitDraft,
    onSplitClick,
    onSplitMove,
  }
}

export type ElevationDrawTools = ReturnType<typeof useElevationDrawTools>
