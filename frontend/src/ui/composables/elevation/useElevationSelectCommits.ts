import type { Ref } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import { clampBovenlichtGapCm, clampBovenlichtHeightCm } from '@/core/plan/bovenlicht'
import { DEFAULT_DOOR_HEIGHT_CM } from '@/core/plan/extraction-to-plan-types'
import { removeRidgeSurfaceOnPlan, setRidgeSurfaceVerticesZ } from '@/core/plan/roof-planes'
import { syncDormerAssemblyAfterRoofEdit } from '@/core/plan/bind-walls-to-roofs'
import { removeRidgeWallsFromPlan, setPlanRidgeJunctionZ } from '@/core/plan/ridge-walls'
import { buildMirrored, resolveHingeAtStart, resolveSwingSign } from '@/core/plan/door-swing-symbol'
import {
  removePlanOpening,
  setPlanJunctionBottomZ,
  setPlanJunctionHeight,
  setPlanWallBottomZ,
  setPlanWallHeight,
  updatePlanOpening,
} from '@/core/plan/elevation-openings'
import { deletePlanSkylight, updatePlanSkylight } from '@/core/plan/elevation-skylight-edit'
import { pairedElevationRoofVertexIndices } from '@/core/plan/elevation-hit'
import { setSlabThicknessCm } from '@/core/plan/floor-stack'
import {
  buildOpeningFramePatch,
  buildSkylightFramePatch,
  effectiveOpeningFrame,
  isFramelessOpeningKind,
  type OpeningFrameCm,
} from '@/core/plan/opening-display-geom'
import {
  clampOpeningHeight,
  clampOpeningSillZ,
  clampOpeningWidth,
  resolveOpeningHeight,
  resolveWindowSillZ,
} from '@/core/plan/opening-plan-ops'
import {
  isTriangleWindow,
  resolveDoorAddPreset,
  resolveDoorSubtypeFromRefid,
  resolveWindowAddPreset,
  resolveWindowSubtypeFromRefid,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/plan/opening-add-presets'
import type { OpeningSubtypeDraft } from '@/core/plan/opening-add-presets'
import type { ElevationInteractionProps } from './elevation-interaction-types'
import type { ElevTool } from './elevation-tool'
import type { ElevationSelectState } from './elevation-select-state'

export function useElevationSelectCommits(options: {
  props: ElevationInteractionProps
  state: ElevationSelectState
  pushUndo: () => void
  commitPlan: (next: FloorPlan) => void
  activeTool: Ref<ElevTool>
  addDoorSubtype: Ref<DoorAddSubtype>
  addDoorWidthCm: Ref<number>
  addDoorHeightCm: Ref<number>
  addDoorSillZCm: Ref<number>
  addWindowSubtype: Ref<WindowAddSubtype>
  addWindowWidthCm: Ref<number>
  addWindowSillZCm: Ref<number>
  addWindowHeightCm: Ref<number>
  pendingPlaceFrame: Ref<OpeningFrameCm | null>
}) {
  const {
    props,
    state,
    pushUndo,
    commitPlan,
    activeTool,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addDoorSillZCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    pendingPlaceFrame,
  } = options
  const {
    selectedOpeningId,
    selectedOpening,
    selectedSkylightId,
    selectedSkylight,
    selectedRoofPlane,
    settingsTarget,
    settingsJunction,
    selectOpening,
    selectSkylight,
    clearSettings,
  } = state

  function commitOpeningSubtype(subtype: OpeningSubtypeDraft): void {
    const id = selectedOpeningId.value
    const located = selectedOpening.value
    if (!id || !located) return
    const kind =
      located.opening.type === 'window'
        ? resolveWindowAddPreset(subtype as WindowAddSubtype).kind
        : resolveDoorAddPreset(subtype as DoorAddSubtype).kind
    pushUndo()
    commitPlan(updatePlanOpening(props.plan, id, { kind }))
  }

  function copySelectedOpening(): void {
    const located = selectedOpening.value
    if (!located) return
    pendingPlaceFrame.value = isFramelessOpeningKind(located.opening.kind)
      ? null
      : { ...effectiveOpeningFrame(located.opening) }
    if (located.opening.type === 'window') {
      const subtype = resolveWindowSubtypeFromRefid(located.opening.kind)
      const width = clampOpeningWidth(located.opening.width)
      const sillZ = resolveWindowSillZ(located.opening)
      const height = resolveOpeningHeight(located.opening)
      addWindowSubtype.value = subtype
      queueMicrotask(() => {
        addWindowWidthCm.value = width
        addWindowSillZCm.value = sillZ
        addWindowHeightCm.value = height
      })
      activeTool.value = 'add_window'
    } else {
      const subtype = resolveDoorSubtypeFromRefid(located.opening.kind)
      const width = clampOpeningWidth(located.opening.width)
      const doorHeight = Math.round(
        located.opening.z_height ?? props.defaultDoorHeightCm ?? DEFAULT_DOOR_HEIGHT_CM,
      )
      const doorSill = Math.round(located.opening.z ?? 0)
      addDoorSubtype.value = subtype
      queueMicrotask(() => {
        addDoorWidthCm.value = width
        addDoorHeightCm.value = doorHeight
        addDoorSillZCm.value = doorSill
      })
      activeTool.value = 'add_door'
    }
    selectOpening(null)
  }

  function deleteSelectedOpening(): void {
    const id = selectedOpeningId.value
    if (!id) return
    pushUndo()
    commitPlan(removePlanOpening(props.plan, id))
    selectOpening(null)
  }

  function deleteSelectedSkylight(): void {
    const id = selectedSkylightId.value
    if (!id) return
    pushUndo()
    commitPlan(deletePlanSkylight(props.plan, id))
    selectSkylight(null)
  }

  function deleteSelectedRidge(): void {
    const target = settingsTarget.value
    if (target?.kind === 'ridge') {
      pushUndo()
      commitPlan(removeRidgeWallsFromPlan(props.plan, [target.wallId]))
      clearSettings()
      return
    }
    const junction = settingsJunction.value
    if (!junction?.ridge) return
    const ids = [...new Set(junction.refs.map((r) => r.wallId))]
    if (ids.length === 0) return
    pushUndo()
    commitPlan(removeRidgeWallsFromPlan(props.plan, ids))
    clearSettings()
  }

  function deleteSelectedRoof(): void {
    const target = settingsTarget.value
    if (target?.kind !== 'roof') return
    pushUndo()
    commitPlan(removeRidgeSurfaceOnPlan(props.plan, target.id))
    clearSettings()
  }

  function commitSelectedField(kind: 'width' | 'height' | 'sill', cm: number): void {
    const id = selectedOpeningId.value
    const located = selectedOpening.value
    if (!id || !located) return
    pushUndo()
    if (kind === 'width') {
      commitPlan(updatePlanOpening(props.plan, id, { width: clampOpeningWidth(cm) }))
      return
    }
    if (kind === 'height') {
      commitPlan(
        updatePlanOpening(props.plan, id, {
          z_height: clampOpeningHeight(cm, located.opening.type),
        }),
      )
      return
    }
    commitPlan(updatePlanOpening(props.plan, id, { z: clampOpeningSillZ(cm) }))
  }

  function commitSelectedFrame(
    side: 'leftCm' | 'rightCm' | 'topCm' | 'bottomCm',
    cm: number,
  ): void {
    const id = selectedOpeningId.value
    const located = selectedOpening.value
    if (!id || !located) return
    if (located.opening.type !== 'door' && located.opening.type !== 'window') return
    if (isFramelessOpeningKind(located.opening.kind)) return
    pushUndo()
    commitPlan(
      updatePlanOpening(props.plan, id, {
        frame: buildOpeningFramePatch(located.opening, { [side]: Math.max(0, Math.round(cm)) }),
      }),
    )
  }

  function commitSelectedSkylightFrame(
    side: 'leftCm' | 'rightCm' | 'topCm' | 'bottomCm',
    cm: number,
  ): void {
    const id = selectedSkylightId.value
    const located = selectedSkylight.value
    if (!id || !located) return
    pushUndo()
    commitPlan(
      updatePlanSkylight(props.plan, id, {
        frame: buildSkylightFramePatch(located.item, { [side]: Math.max(0, Math.round(cm)) }),
      }),
    )
  }

  function commitSelectedBovenlicht(on: boolean): void {
    const id = selectedOpeningId.value
    if (!id) return
    pushUndo()
    commitPlan(updatePlanOpening(props.plan, id, { bovenlicht: on }))
  }

  function commitSelectedBovenlichtHeight(cm: number): void {
    const id = selectedOpeningId.value
    if (!id) return
    pushUndo()
    commitPlan(
      updatePlanOpening(props.plan, id, {
        bovenlicht: true,
        bovenlichtHeightCm: clampBovenlichtHeightCm(cm),
      }),
    )
  }

  function commitSelectedBovenlichtGap(cm: number): void {
    const id = selectedOpeningId.value
    if (!id) return
    pushUndo()
    commitPlan(
      updatePlanOpening(props.plan, id, {
        bovenlicht: true,
        bovenlichtGapCm: clampBovenlichtGapCm(cm),
      }),
    )
  }

  function toggleSelectedOpeningHinge(): void {
    const id = selectedOpeningId.value
    const located = selectedOpening.value
    if (!id || !located) return
    const canMirror =
      located.opening.type === 'door' ||
      isTriangleWindow(located.opening.type, located.opening.kind)
    if (!canMirror) return
    const nextHinge = !resolveHingeAtStart(located.opening.mirrored)
    const swingRight =
      located.opening.type === 'door' ? resolveSwingSign(located.opening.mirrored) > 0 : false
    pushUndo()
    commitPlan(
      updatePlanOpening(props.plan, id, { mirrored: buildMirrored(nextHinge, swingRight) }),
    )
  }

  function toggleSelectedOpeningSwing(): void {
    const id = selectedOpeningId.value
    const located = selectedOpening.value
    if (!id || !located || located.opening.type !== 'door') return
    const hingeAtStart = resolveHingeAtStart(located.opening.mirrored)
    const nextSwing = !(resolveSwingSign(located.opening.mirrored) > 0)
    pushUndo()
    commitPlan(
      updatePlanOpening(props.plan, id, { mirrored: buildMirrored(hingeAtStart, nextSwing) }),
    )
  }

  function commitWallHeight(cm: number): void {
    const target = settingsTarget.value
    if (target?.kind !== 'wall') return
    pushUndo()
    commitPlan(setPlanWallHeight(props.plan, target.wallId, target.floorIndex, cm))
  }

  function commitWallBottomZ(cm: number): void {
    const target = settingsTarget.value
    if (target?.kind !== 'wall') return
    pushUndo()
    commitPlan(setPlanWallBottomZ(props.plan, target.wallId, target.floorIndex, cm))
  }

  function commitJunctionHeight(cm: number): void {
    const junction = settingsJunction.value
    if (!junction) return
    pushUndo()
    commitPlan(
      junction.ridge
        ? setPlanRidgeJunctionZ(props.plan, junction.floorIndex, junction.refs, cm)
        : setPlanJunctionHeight(props.plan, junction.floorIndex, junction.refs, cm),
    )
  }

  function commitJunctionBottomZ(cm: number): void {
    const junction = settingsJunction.value
    if (!junction || junction.ridge) return
    pushUndo()
    commitPlan(setPlanJunctionBottomZ(props.plan, junction.floorIndex, junction.refs, cm))
  }

  function commitRidgeHeight(cm: number): void {
    const target = settingsTarget.value
    if (target?.kind !== 'ridge') return
    pushUndo()
    commitPlan(
      setPlanRidgeJunctionZ(
        props.plan,
        target.floorIndex,
        target.end
          ? [{ wallId: target.wallId, end: target.end }]
          : [
              { wallId: target.wallId, end: 'a' },
              { wallId: target.wallId, end: 'b' },
            ],
        cm,
      ),
    )
  }

  function commitRoofVertexHeight(cm: number): void {
    const target = settingsTarget.value
    if (target?.kind !== 'roof' || target.vertexIndex == null) return
    const plane = selectedRoofPlane.value
    const indices = plane
      ? pairedElevationRoofVertexIndices(plane, target.vertexIndex)
      : [target.vertexIndex]
    pushUndo()
    const withZ = setRidgeSurfaceVerticesZ(props.plan, target.id, indices, cm)
    commitPlan(syncDormerAssemblyAfterRoofEdit(withZ, target.id))
  }

  function commitSlabHeight(cm: number): void {
    const target = settingsTarget.value
    if (target?.kind !== 'slab') return
    const floor = props.plan.floors[target.floorIndex]
    if (!floor) return
    pushUndo()
    commitPlan(setSlabThicknessCm(props.plan, floor.level, cm))
  }

  return {
    commitOpeningSubtype,
    copySelectedOpening,
    deleteSelectedOpening,
    deleteSelectedSkylight,
    deleteSelectedRidge,
    deleteSelectedRoof,
    commitSelectedField,
    commitSelectedFrame,
    commitSelectedSkylightFrame,
    commitSelectedBovenlicht,
    commitSelectedBovenlichtHeight,
    commitSelectedBovenlichtGap,
    toggleSelectedOpeningHinge,
    toggleSelectedOpeningSwing,
    commitWallHeight,
    commitWallBottomZ,
    commitJunctionHeight,
    commitJunctionBottomZ,
    commitRidgeHeight,
    commitRoofVertexHeight,
    commitSlabHeight,
  }
}

export type ElevationSelectCommits = ReturnType<typeof useElevationSelectCommits>
