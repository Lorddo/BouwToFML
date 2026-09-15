import { computed, ref, type Ref } from 'vue'
import type { FloorPlan, Opening, Point2D, Wall } from '@/core/plan/types'
import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  resolveDoorBovenlicht,
  resolveWindowBovenlicht,
  resolveBovenlichtGapCm,
  resolveBovenlichtHeightCm,
  clampBovenlichtGapCm,
  clampBovenlichtHeightCm,
} from '@/core/plan/bovenlicht'
import { DEFAULT_DOOR_HEIGHT_CM } from '@/core/plan/extraction-to-plan-types'
import {
  unprojectElevationAlong,
  ELEVATION_RETURN_MAX_DOT,
  type ElevationBovenlichtDefaults,
  type ElevationOpeningRect,
  type ElevationRect,
  type ElevationWallRect,
  type FacadeElevation,
} from '@/core/plan/facade-elevation'
import {
  collectElevationRoofSnapXs,
  collectElevationRoofSnapYs,
  collectElevationSegmentSnapYs,
  collectElevationWallSnapXs,
  ELEVATION_SEGMENT_SNAP_CM,
  hitElevationOpening,
  openingPatchFromElevationRect,
  snapElevationX,
  snapElevationY,
} from '@/core/plan/elevation-hit'
import {
  clampElevationOpeningMove,
  clampElevationOpeningResize,
  clampOpeningPatchKeepOppositeEdge,
  collectOpeningSnapTargets,
  elevationCollinearXBounds,
  elevationHandlePoints,
  elevationRectCenter,
  pickElevationWallForOpeningX,
  resizeElevationRect,
  snapElevationRect,
  translateElevationRect,
  type ElevResizeSide,
  type ElevationOpeningShapeHint,
  type ElevationSnapGuide,
} from '@/core/plan/elevation-opening-edit'
import {
  applyElevationRidgeEnd,
  applyElevationRidgeRect,
  collectElevationRidgeJunctionSnapXs,
  ELEVATION_RIDGE_MIN_SIZE_CM,
  elevationRidgeRectCenter,
  elevationRidgeRectOf,
  snapElevationRidgeCenter,
} from '@/core/plan/elevation-ridge-edit'
import { applyElevationWallEndAlongPlanAxis } from '@/core/plan/elevation-wall-end-edit'
import {
  findRidgeSurface,
  removeRidgeSurfaceOnPlan,
  roofVertexZMinCm,
  setRidgeSurfaceVertex,
  setRidgeSurfaceVertexZ,
  slabCmForRoofSurface,
} from '@/core/plan/roof-planes'
import {
  listRidgeWallsOnFloor,
  removeRidgeWallsFromPlan,
  ridgeEndpointZCm,
  setPlanRidgeJunctionZ,
} from '@/core/plan/ridge-walls'
import { buildMirrored, resolveHingeAtStart, resolveSwingSign } from '@/core/plan/door-swing-symbol'
import {
  findOpeningInPlan,
  movePlanOpening,
  removePlanOpening,
  setPlanJunctionBottomZ,
  setPlanJunctionElevationEdit,
  setPlanJunctionHeight,
  setPlanWallBottomZ,
  setPlanWallElevationEdit,
  setPlanWallHeight,
  updatePlanOpening,
} from '@/core/plan/elevation-openings'
import {
  wallEndpoint3D,
  wallEndpointHeightCm,
  wallUniformBottomZCm,
  wallUniformHeightCm,
  type WallElevationEditMode,
} from '@/core/plan/wall-endpoint-height'
import {
  floorWallBaseWorldZ,
  readFloorStack,
  setSlabThicknessCm,
  slabThicknessCm,
} from '@/core/plan/floor-stack'
import {
  clampOpeningHeight,
  clampOpeningSillZ,
  clampOpeningWidth,
  resolveOpeningHeight,
  resolveWindowSillZ,
} from '@/ui/components/plan-canvas-openings'
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
import { buildElevationOpeningMeasureLines } from './elevation-opening-measure'
import {
  buildElevationJunctionHeightMeasureLines,
  buildElevationRidgeHeightMeasureLines,
  buildElevationRoofVertexHeightMeasureLines,
  buildElevationWallFaceMeasureLines,
} from './elevation-wall-measure'
import { isSettingsMod } from '@/ui/composables/canvas-kernel/plan-canvas-mods'
import type {
  ElevSettings,
  ElevTool,
  ElevationInteractionProps,
} from './elevation-interaction-types'

export function useElevationSelectEdit(options: {
  props: ElevationInteractionProps
  elevation: Ref<FacadeElevation | null>
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  pointerCm: (event: {
    evt?: MouseEvent
    target?: {
      getStage?: () => { getPointerPosition?: () => { x: number; y: number } | null } | null
    }
  }) => Point2D | null
  canvasLocked: Ref<boolean>
  activeTool: Ref<ElevTool>
  elevSettingsMod: Ref<boolean>
  snapGuide: Ref<ElevationSnapGuide | null>
  floorBovenlichtDefaults: (floorIndex: number) => ElevationBovenlichtDefaults
  pushUndo: () => void
  commitPlan: (next: FloorPlan) => void
  addDoorSubtype: Ref<DoorAddSubtype>
  addDoorWidthCm: Ref<number>
  addDoorHeightCm: Ref<number>
  addDoorSillZCm: Ref<number>
  addWindowSubtype: Ref<WindowAddSubtype>
  addWindowWidthCm: Ref<number>
  addWindowSillZCm: Ref<number>
  addWindowHeightCm: Ref<number>
  preciseIntent: (event: { shiftKey?: boolean }) => boolean
  beginPreciseOpening: (
    openingId: string,
    cm: Point2D,
    rect: ElevationRect,
    wallId: string,
    floorIndex: number,
  ) => void
  beginPreciseRidge: (wall: ElevationWallRect, cm: Point2D) => void
  beginPreciseJunction: (
    junction: { id: string; heightCm: number; floorIndex: number; ridge?: boolean },
    refs: Array<{ wallId: string; end: 'a' | 'b' }>,
    cm: Point2D,
  ) => void
  hasPreciseDraft: () => boolean
  commitPreciseDraft: () => boolean
}) {
  const {
    props,
    elevation,
    clientToCm,
    pointerCm,
    canvasLocked,
    activeTool,
    elevSettingsMod,
    snapGuide,
    floorBovenlichtDefaults,
    pushUndo,
    commitPlan,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addDoorSillZCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    preciseIntent,
    beginPreciseOpening,
    beginPreciseRidge,
    beginPreciseJunction,
    hasPreciseDraft,
    commitPreciseDraft,
  } = options

  const selectedOpeningId = ref<string | null>(null)
  const settingsTarget = ref<ElevSettings | null>(null)
  const elevSettingsOpen = computed(
    () => settingsTarget.value != null || activeTool.value !== 'select',
  )

  const selectedOpening = computed(() => {
    const id = selectedOpeningId.value
    if (!id) return null
    return findOpeningInPlan(props.plan, id)
  })

  const selectedOpeningRect = computed(() => {
    const id = selectedOpeningId.value
    if (!id || !elevation.value) return null
    return elevation.value.openings.find((item) => item.openingId === id) ?? null
  })

  const openingHandles = computed(() => {
    const rect = selectedOpeningRect.value
    if (!rect || settingsTarget.value?.kind !== 'opening' || settingsTarget.value.mode !== 'edit') {
      return []
    }
    return elevationHandlePoints(rect)
  })

  const openingMoveHandle = computed(() => {
    const rect = selectedOpeningRect.value
    if (!rect || settingsTarget.value?.kind !== 'opening') return null
    return elevationRectCenter(rect)
  })

  const openingMoveMeasureLines = computed(() => {
    if (settingsTarget.value?.kind !== 'opening') return []
    const rect = selectedOpeningRect.value
    const elev = elevation.value
    if (!rect || !elev) return []
    const wall = elev.walls.find(
      (item) => item.wallId === rect.wallId && item.floorIndex === rect.floorIndex && !item.ridge,
    )
    if (!wall) return []
    return buildElevationOpeningMeasureLines(wall, rect)
  })

  const selectedRidgeWall = computed(() => {
    const target = settingsTarget.value
    if (target?.kind !== 'ridge' || !elevation.value) return null
    return (
      elevation.value.walls.find(
        (item) =>
          item.ridge && item.wallId === target.wallId && item.floorIndex === target.floorIndex,
      ) ?? null
    )
  })

  const settingsRidge = computed(() => {
    const target = settingsTarget.value
    if (target?.kind !== 'ridge') return null
    const floor = props.plan.floors[target.floorIndex]
    const wall = floor
      ? listRidgeWallsOnFloor(floor).find((item) => item.id === target.wallId)
      : null
    if (!floor || !wall) return null
    return {
      ...target,
      name: floor.name,
      heightCm: Math.round(ridgeEndpointZCm(wall, target.end ?? 'a', floor.height)),
    }
  })

  const ridgeHandles = computed(() => {
    const wall = selectedRidgeWall.value
    if (!wall?.endOn) return []
    return elevationHandlePoints(elevationRidgeRectOf(wall))
  })

  const ridgeCenter = computed(() => {
    const wall = selectedRidgeWall.value
    if (!wall?.endOn) return null
    return elevationRidgeRectCenter(elevationRidgeRectOf(wall))
  })

  const ridgeEndHandles = computed(() => {
    const wall = selectedRidgeWall.value
    if (!wall || wall.endOn) return []
    return [
      { end: 'a' as const, x: wall.aBottom.x, y: wall.aBottom.y },
      { end: 'b' as const, x: wall.bBottom.x, y: wall.bBottom.y },
    ]
  })

  const selectedAxisEditWall = computed(() => {
    const target = settingsTarget.value
    const elev = elevation.value
    if (target?.kind !== 'wall' || !elev) return null
    const rect = elev.walls.find(
      (item) =>
        item.axisEdit === true &&
        item.wallId === target.wallId &&
        item.floorIndex === target.floorIndex &&
        item.ridge !== true,
    )
    if (!rect) return null
    const floor = props.plan.floors[rect.floorIndex]
    const wall = floor?.walls.find((item) => item.id === rect.wallId)
    if (!wall) return null
    const dx = wall.b.x - wall.a.x
    const dy = wall.b.y - wall.a.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return null
    const along = Math.abs((dx / len) * elev.axis.x + (dy / len) * elev.axis.y)
    if (along < ELEVATION_RETURN_MAX_DOT) return null
    return rect
  })

  const wallAxisEndHandles = computed(() => {
    const wall = selectedAxisEditWall.value
    if (!wall) return []
    return [
      { end: 'a' as const, x: wall.aTop.x, y: wall.aTop.y },
      { end: 'b' as const, x: wall.bTop.x, y: wall.bTop.y },
    ]
  })

  const openingSubtype = computed((): OpeningSubtypeDraft => {
    const opening = selectedOpening.value?.opening
    if (!opening) return 'standard'
    return opening.type === 'window'
      ? resolveWindowSubtypeFromRefid(opening.kind)
      : resolveDoorSubtypeFromRefid(opening.kind)
  })

  const selectedOpeningBovenlicht = computed(() => {
    const located = selectedOpening.value
    if (!located) return false
    const defaults = floorBovenlichtDefaults(located.floorIndex)
    return located.opening.type === 'window'
      ? resolveWindowBovenlicht(located.opening, defaults.windowDefault)
      : resolveDoorBovenlicht(located.opening, defaults.doorDefault)
  })

  const selectedOpeningBovenlichtHeightCm = computed(() => {
    const located = selectedOpening.value
    if (!located) return props.bovenlichtHeightCm ?? BOVENLICHT_HEIGHT_CM
    return resolveBovenlichtHeightCm(
      located.opening,
      floorBovenlichtDefaults(located.floorIndex).heightCm,
    )
  })

  const selectedOpeningBovenlichtGapCm = computed(() => {
    const located = selectedOpening.value
    if (!located) return props.bovenlichtGapCm ?? BOVENLICHT_GAP_CM
    return resolveBovenlichtGapCm(
      located.opening,
      floorBovenlichtDefaults(located.floorIndex).gapCm,
    )
  })

  const selectedOpeningHingeAtStart = computed(() =>
    resolveHingeAtStart(selectedOpening.value?.opening.mirrored),
  )
  const selectedOpeningSwingRight = computed(
    () => resolveSwingSign(selectedOpening.value?.opening.mirrored) > 0,
  )

  const settingsWall = computed(() => {
    const target = settingsTarget.value
    if (target?.kind !== 'wall') return null
    const floor = props.plan.floors[target.floorIndex]
    const wall = floor?.walls.find((item) => item.id === target.wallId)
    if (!floor || !wall) return null
    const heightCm =
      wallUniformHeightCm(wall, floor.height) ??
      Math.round(
        Math.max(
          wallEndpointHeightCm(wall, 'a', floor.height),
          wallEndpointHeightCm(wall, 'b', floor.height),
        ),
      )
    const bottomZCm = wallUniformBottomZCm(wall, floor.height) ?? 0
    return { ...target, name: floor.name, heightCm, bottomZCm }
  })

  const selectedPlanWall = computed(() => {
    const target = settingsTarget.value
    if (target?.kind !== 'wall' || !elevation.value) return null
    return (
      elevation.value.walls.find(
        (item) =>
          !item.ridge && item.wallId === target.wallId && item.floorIndex === target.floorIndex,
      ) ?? null
    )
  })

  const wallElevationHandles = computed(() => {
    const wall = selectedPlanWall.value
    if (!wall) return []
    const mx = (wall.xa + wall.xb) / 2
    const topY = (wall.aTop.y + wall.bTop.y) / 2
    const botY = (wall.aBottom.y + wall.bBottom.y) / 2
    const midY = (topY + botY) / 2
    return [
      { mode: 'height' as const, x: mx, y: topY },
      { mode: 'shift' as const, x: mx, y: midY },
      { mode: 'lift' as const, x: mx, y: botY },
    ]
  })

  const junctionElevationHandles = computed(() => {
    const junction = settingsJunction.value
    if (!junction || junction.ridge) return []
    const midY = (junction.yTop + junction.yBot) / 2
    return [
      { mode: 'shift' as const, x: junction.x, y: midY },
      { mode: 'lift' as const, x: junction.x, y: junction.yBot },
    ]
  })

  const settingsSlab = computed(() => {
    const target = settingsTarget.value
    if (target?.kind !== 'slab') return null
    const floor = props.plan.floors[target.floorIndex]
    if (!floor) return null
    return {
      ...target,
      name: floor.name,
      heightCm: slabThicknessCm(readFloorStack(props.plan), floor.level),
    }
  })

  const settingsJunction = computed(() => {
    const target = settingsTarget.value
    if (target?.kind !== 'junction' || !elevation.value) return null
    const junction = elevation.value.junctions.find((item) => item.id === target.id)
    if (!junction) return null
    const floor = props.plan.floors[junction.floorIndex]
    const floorH = floor?.height ?? 280
    const bottoms = junction.refs
      .map((wallRef) => {
        const wall = floor?.walls.find((item) => item.id === wallRef.wallId)
        if (!wall) return null
        return Math.round(wallEndpoint3D(wall, wallRef.end, floorH).z)
      })
      .filter((value): value is number => value != null)
    const firstBottom = bottoms[0] ?? 0
    return {
      ...junction,
      name: floor?.name ?? '',
      bottomZCm: firstBottom,
    }
  })

  const selectedRoofPlane = computed(() => {
    const target = settingsTarget.value
    if (target?.kind !== 'roof' || !elevation.value) return null
    return elevation.value.roofPlanes.find((plane) => plane.id === target.id) ?? null
  })

  const settingsRoof = computed(() => {
    const target = settingsTarget.value
    if (target?.kind !== 'roof') return null
    const surface = findRidgeSurface(props.plan, target.id)
    if (!surface) return null
    const plane = selectedRoofPlane.value
    const floor = plane ? props.plan.floors[plane.floorIndex] : null
    const z = target.vertexIndex != null ? surface.poly[target.vertexIndex]?.z : null
    return {
      id: target.id,
      name: floor?.name ?? '',
      vertexIndex: target.vertexIndex,
      heightCm: z != null ? Math.round(z) : null,
      minCm: roofVertexZMinCm(slabCmForRoofSurface(props.plan, target.id)),
    }
  })

  const wallFaceMeasureLines = computed(() => {
    const kind = settingsTarget.value?.kind
    if (kind === 'wall') {
      const wall = selectedPlanWall.value
      return wall ? buildElevationWallFaceMeasureLines(wall) : []
    }
    if (kind === 'ridge') {
      const wall = selectedRidgeWall.value
      return wall
        ? buildElevationRidgeHeightMeasureLines(wall, elevationStoreyFloorY(wall.floorIndex))
        : []
    }
    if (kind === 'junction') {
      const junction = settingsJunction.value
      return junction
        ? buildElevationJunctionHeightMeasureLines(
            junction,
            junction.ridge ? elevationStoreyFloorY(junction.floorIndex) : undefined,
          )
        : []
    }
    if (kind === 'roof') {
      const target = settingsTarget.value
      const plane = selectedRoofPlane.value
      const vertexIndex = target?.kind === 'roof' ? target.vertexIndex : null
      if (!plane || vertexIndex == null) return []
      const point = plane.points[vertexIndex]
      return point
        ? buildElevationRoofVertexHeightMeasureLines(
            point,
            elevationStoreyFloorY(plane.floorIndex),
            vertexIndex,
          )
        : []
    }
    return []
  })

  const elevationMeasureLines = computed(() => {
    if (settingsTarget.value?.kind === 'opening') return openingMoveMeasureLines.value
    return wallFaceMeasureLines.value
  })

  function elevationStoreyFloorY(floorIndex: number): number {
    return -floorWallBaseWorldZ(props.plan, floorIndex)
  }

  function clearSettings(): void {
    settingsTarget.value = null
  }

  function selectOpening(openingId: string | null, mode: 'quick' | 'edit' | null = null): void {
    selectedOpeningId.value = openingId
    settingsTarget.value =
      mode && openingId != null ? { kind: 'opening', id: openingId, mode } : null
  }

  function selectWallSettings(wallId: string, floorIndex: number): void {
    selectedOpeningId.value = null
    settingsTarget.value = { kind: 'wall', wallId, floorIndex }
  }

  function selectJunction(id: string | null): void {
    selectedOpeningId.value = null
    settingsTarget.value = id ? { kind: 'junction', id } : null
  }

  function selectRidge(wallId: string, floorIndex: number, end?: 'a' | 'b'): void {
    selectedOpeningId.value = null
    settingsTarget.value = { kind: 'ridge', wallId, floorIndex, end }
  }

  function selectRoof(id: string | null, vertexIndex: number | null = null): void {
    selectedOpeningId.value = null
    settingsTarget.value = id ? { kind: 'roof', id, vertexIndex } : null
  }

  function selectSlabSettings(floorIndex: number): void {
    selectedOpeningId.value = null
    settingsTarget.value = { kind: 'slab', floorIndex }
  }

  type OpeningDrag = {
    openingId: string
    mode: 'move' | ElevResizeSide
    startCm: Point2D
    startRect: ElevationRect
    startOpening: Opening
    wallId: string
    floorIndex: number
  }

  let drag: OpeningDrag | null = null

  function applyOpeningRect(
    openingId: string,
    wall: ElevationWallRect,
    rect: ElevationRect,
    snapOff: boolean,
  ): void {
    const elev = elevation.value
    const openingTargets = elev
      ? collectOpeningSnapTargets([...elev.openings, ...elev.transoms], openingId)
      : { xs: [], ys: [] }
    const floorWalls = props.plan.floors[wall.floorIndex]?.walls ?? []
    const xBounds = elevationCollinearXBounds(elev?.walls ?? [wall], wall, floorWalls)
    const moving = !drag || drag.mode === 'move'
    const shapeOpening = drag?.startOpening ?? findOpeningInPlan(props.plan, openingId)?.opening
    const shapeFor = (startOnLeft: boolean): ElevationOpeningShapeHint | undefined =>
      shapeOpening
        ? {
            type: shapeOpening.type,
            kind: shapeOpening.kind,
            mirrored: shapeOpening.mirrored,
            startOnLeft,
          }
        : undefined
    const snapShape = shapeFor(wall.xa <= wall.xb)
    const raw =
      snapOff || !elev
        ? { rect, guide: {} as ElevationSnapGuide }
        : snapElevationRect(
            rect,
            drag?.mode === 'move' || !drag ? 'move' : drag.mode,
            {
              xs: [...openingTargets.xs, ...collectElevationWallSnapXs(elev.walls)],
              ys: openingTargets.ys,
            },
            undefined,
            snapShape,
          )
    snapGuide.value = raw.guide.x != null || raw.guide.y != null ? raw.guide : null
    let nextRect = raw.rect
    if (drag && drag.mode !== 'move') {
      nextRect = clampElevationOpeningResize(
        wall,
        nextRect,
        drag.mode,
        undefined,
        undefined,
        xBounds,
        shapeFor(wall.xa <= wall.xb),
      )
    }
    let hostElev = moving
      ? pickElevationWallForOpeningX(
          elev?.walls ?? [wall],
          wall,
          (nextRect.x0 + nextRect.x1) / 2,
          floorWalls,
        )
      : wall
    if (moving) {
      const hostBounds = elevationCollinearXBounds(elev?.walls ?? [hostElev], hostElev, floorWalls)
      nextRect = clampElevationOpeningMove(
        hostElev,
        nextRect,
        hostBounds,
        shapeFor(hostElev.xa <= hostElev.xb),
      )
      const nextHost = pickElevationWallForOpeningX(
        elev?.walls ?? [hostElev],
        hostElev,
        (nextRect.x0 + nextRect.x1) / 2,
        floorWalls,
      )
      if (nextHost.wallId !== hostElev.wallId || nextHost.floorIndex !== hostElev.floorIndex) {
        hostElev = nextHost
        const nextBounds = elevationCollinearXBounds(
          elev?.walls ?? [hostElev],
          hostElev,
          floorWalls,
        )
        nextRect = clampElevationOpeningMove(
          hostElev,
          nextRect,
          nextBounds,
          shapeFor(hostElev.xa <= hostElev.xb),
        )
      }
    }
    let nextId = openingId
    let nextPlan = props.plan
    if (moving && hostElev.wallId !== wall.wallId) {
      const patchT = openingPatchFromElevationRect(
        hostElev,
        nextRect,
        floorWallBaseWorldZ(props.plan, hostElev.floorIndex),
      )
      const moved = movePlanOpening(props.plan, openingId, hostElev.wallId, patchT.t)
      nextId = moved.openingId
      nextPlan = moved.plan
      if (drag) {
        drag.openingId = nextId
        drag.wallId = hostElev.wallId
        drag.floorIndex = hostElev.floorIndex
      }
      if (selectedOpeningId.value === openingId) selectedOpeningId.value = nextId
      if (settingsTarget.value?.kind === 'opening' && settingsTarget.value.id === openingId) {
        settingsTarget.value = { ...settingsTarget.value, id: nextId }
      }
    }
    const patch = openingPatchFromElevationRect(
      hostElev,
      nextRect,
      floorWallBaseWorldZ(nextPlan, hostElev.floorIndex),
    )
    if (!drag || drag.mode === 'move') {
      commitPlan(
        updatePlanOpening(
          nextPlan,
          nextId,
          { t: patch.t, z: patch.z },
          { startOnLeft: hostElev.xa <= hostElev.xb },
        ),
      )
      return
    }
    const floor = nextPlan.floors[hostElev.floorIndex]
    const host = findOpeningInPlan(nextPlan, nextId)?.wall
    const resized =
      floor && host
        ? clampOpeningPatchKeepOppositeEdge(
            host,
            drag.startOpening,
            patch,
            drag.mode,
            floor.height,
            floor.walls,
            hostElev.xa <= hostElev.xb,
          )
        : patch
    commitPlan(updatePlanOpening(nextPlan, nextId, resized))
  }

  const OPENING_MOVE_PENDING_PX = 4
  let openingMovePending: {
    onMove: (event: PointerEvent) => void
    onUp: () => void
  } | null = null

  function cancelOpeningMovePending(): void {
    if (!openingMovePending) return
    window.removeEventListener('pointermove', openingMovePending.onMove)
    window.removeEventListener('pointerup', openingMovePending.onUp)
    openingMovePending = null
  }

  function startOpeningMovePending(
    openingId: string,
    rect: ElevationOpeningRect,
    cm: Point2D,
    event: { evt: MouseEvent },
  ): void {
    cancelOpeningMovePending()
    const startX = event.evt.clientX
    const startY = event.evt.clientY
    const onMove = (moveEvent: PointerEvent) => {
      if (
        Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < OPENING_MOVE_PENDING_PX
      ) {
        return
      }
      cancelOpeningMovePending()
      const nextCm = clientToCm(moveEvent.clientX, moveEvent.clientY) ?? cm
      beginOpeningDrag(openingId, 'move', nextCm, rect, rect.wallId, rect.floorIndex)
    }
    const onUp = () => cancelOpeningMovePending()
    openingMovePending = { onMove, onUp }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function beginOpeningDrag(
    openingId: string,
    mode: OpeningDrag['mode'],
    cm: Point2D,
    rect: ElevationRect,
    wallId: string,
    floorIndex: number,
  ): void {
    cancelOpeningMovePending()
    const located = findOpeningInPlan(props.plan, openingId)
    if (!located) return
    drag = {
      openingId,
      mode,
      startCm: cm,
      startRect: { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
      startOpening: { ...located.opening },
      wallId,
      floorIndex,
    }
    pushUndo()
    window.addEventListener('pointermove', onOpeningMove)
    window.addEventListener('pointerup', onOpeningUp, { once: true })
  }

  function onOpeningMove(event: PointerEvent): void {
    if (!drag) return
    const elev = elevation.value
    const wall = elev?.walls.find(
      (item) => item.wallId === drag!.wallId && item.floorIndex === drag!.floorIndex,
    )
    if (!elev || !wall) return
    const cm = clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const next =
      drag.mode === 'move'
        ? translateElevationRect(drag.startRect, cm.x - drag.startCm.x, cm.y - drag.startCm.y)
        : resizeElevationRect(drag.startRect, drag.mode, cm)
    applyOpeningRect(drag.openingId, wall, next, event.ctrlKey || event.metaKey)
  }

  function onOpeningUp(): void {
    window.removeEventListener('pointermove', onOpeningMove)
    cancelOpeningMovePending()
    drag = null
    snapGuide.value = null
  }

  function stopKonvaBubble(event: { cancelBubble?: boolean; evt?: Event | null }): void {
    event.cancelBubble = true
    const native = event.evt
    if (native && typeof native.stopPropagation === 'function') native.stopPropagation()
  }

  let ignoreContentClickUntil = 0

  function markOpeningPointerHandled(): void {
    ignoreContentClickUntil = Date.now() + 400
  }

  function isContentClickIgnored(): boolean {
    return Date.now() < ignoreContentClickUntil
  }

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
    selectedOpeningId.value = null
    settingsTarget.value = null
  }

  function deleteSelectedOpening(): void {
    const id = selectedOpeningId.value
    if (!id) return
    pushUndo()
    commitPlan(removePlanOpening(props.plan, id))
    selectOpening(null)
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
    pushUndo()
    commitPlan(setRidgeSurfaceVertexZ(props.plan, target.id, target.vertexIndex, cm))
  }

  function commitSlabHeight(cm: number): void {
    const target = settingsTarget.value
    if (target?.kind !== 'slab') return
    const floor = props.plan.floors[target.floorIndex]
    if (!floor) return
    pushUndo()
    commitPlan(setSlabThicknessCm(props.plan, floor.level, cm))
  }

  type RidgeRectDrag = {
    wallId: string
    floorIndex: number
    mode: 'move' | ElevResizeSide
    startCm: Point2D
    startRect: ElevationRect
    startWall: Wall
  }

  let ridgeRectDrag: RidgeRectDrag | null = null

  function beginRidgeRectDrag(
    wall: ElevationWallRect,
    mode: RidgeRectDrag['mode'],
    cm: Point2D,
  ): void {
    const floor = props.plan.floors[wall.floorIndex]
    const startWall = floor
      ? listRidgeWallsOnFloor(floor).find((item) => item.id === wall.wallId)
      : undefined
    if (!startWall) return
    selectRidge(wall.wallId, wall.floorIndex)
    ridgeRectDrag = {
      wallId: wall.wallId,
      floorIndex: wall.floorIndex,
      mode,
      startCm: cm,
      startRect: elevationRidgeRectOf(wall),
      startWall,
    }
    pushUndo()
    window.addEventListener('pointermove', onRidgeRectMove)
    window.addEventListener('pointerup', onRidgeRectUp, { once: true })
  }

  function onRidgeRectMove(event: PointerEvent): void {
    if (!ridgeRectDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!elev || !cm) return
    const raw =
      ridgeRectDrag.mode === 'move'
        ? translateElevationRect(
            ridgeRectDrag.startRect,
            cm.x - ridgeRectDrag.startCm.x,
            cm.y - ridgeRectDrag.startCm.y,
          )
        : resizeElevationRect(
            ridgeRectDrag.startRect,
            ridgeRectDrag.mode,
            cm,
            ELEVATION_RIDGE_MIN_SIZE_CM,
            ELEVATION_RIDGE_MIN_SIZE_CM,
          )
    const snapOff = event.ctrlKey || event.metaKey
    const snapped =
      ridgeRectDrag.mode === 'move' && !snapOff
        ? snapElevationRidgeCenter(raw, collectElevationRidgeJunctionSnapXs(elev))
        : { rect: raw, guide: {} as ElevationSnapGuide }
    snapGuide.value = snapped.guide.x != null ? snapped.guide : null
    commitPlan(
      applyElevationRidgeRect({
        plan: props.plan,
        axis: elev.axis,
        floorIndex: ridgeRectDrag.floorIndex,
        wallId: ridgeRectDrag.wallId,
        startWall: ridgeRectDrag.startWall,
        startRect: ridgeRectDrag.startRect,
        nextRect: snapped.rect,
      }),
    )
  }

  function onRidgeRectUp(): void {
    window.removeEventListener('pointermove', onRidgeRectMove)
    ridgeRectDrag = null
    snapGuide.value = null
  }

  type RidgeEndDrag = {
    floorIndex: number
    refs: Array<{ wallId: string; end: 'a' | 'b' }>
  }

  let ridgeEndDrag: RidgeEndDrag | null = null

  function ridgeRefsForEnd(
    wall: ElevationWallRect,
    end: 'a' | 'b',
  ): Array<{ wallId: string; end: 'a' | 'b' }> {
    const elev = elevation.value
    const fallback = [{ wallId: wall.wallId, end }]
    if (!elev) return fallback
    const x = end === 'a' ? wall.xa : wall.xb
    const junction = elev.junctions.find(
      (item) =>
        item.ridge === true && item.floorIndex === wall.floorIndex && Math.abs(item.x - x) < 0.75,
    )
    return junction?.refs.length ? [...junction.refs] : fallback
  }

  function beginRidgeEndDrag(
    floorIndex: number,
    refs: Array<{ wallId: string; end: 'a' | 'b' }>,
  ): void {
    if (refs.length === 0) return
    ridgeEndDrag = { floorIndex, refs }
    pushUndo()
    window.addEventListener('pointermove', onRidgeEndMove)
    window.addEventListener('pointerup', onRidgeEndUp, { once: true })
  }

  function onRidgeEndMove(event: PointerEvent): void {
    if (!ridgeEndDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!elev || !cm) return
    let x = cm.x
    let y = cm.y
    if (!(event.ctrlKey || event.metaKey)) {
      x = snapElevationX(x, collectElevationRidgeJunctionSnapXs(elev))
      y = snapElevationY(
        y,
        collectElevationSegmentSnapYs(elev, {
          wallIds: ridgeEndDrag.refs.map((r) => r.wallId),
        }),
        ELEVATION_SEGMENT_SNAP_CM,
      )
      const guide: ElevationSnapGuide = {}
      if (Math.abs(x - cm.x) >= 1e-6) guide.x = x
      if (Math.abs(y - cm.y) >= 1e-6) guide.y = y
      snapGuide.value = guide.x != null || guide.y != null ? guide : null
    } else {
      snapGuide.value = null
    }
    const z = -y - floorWallBaseWorldZ(props.plan, ridgeEndDrag.floorIndex)
    commitPlan(
      applyElevationRidgeEnd({
        plan: props.plan,
        elevation: elev,
        floorIndex: ridgeEndDrag.floorIndex,
        refs: ridgeEndDrag.refs,
        alongCm: x,
        zCm: z,
      }),
    )
  }

  function onRidgeEndUp(): void {
    window.removeEventListener('pointermove', onRidgeEndMove)
    ridgeEndDrag = null
    snapGuide.value = null
  }

  type WallAxisEndDrag = {
    wallId: string
    floorIndex: number
    end: 'a' | 'b'
  }

  let wallAxisEndDrag: WallAxisEndDrag | null = null

  function beginWallAxisEndDrag(wallId: string, floorIndex: number, end: 'a' | 'b'): void {
    wallAxisEndDrag = { wallId, floorIndex, end }
    pushUndo()
    window.addEventListener('pointermove', onWallAxisEndMove)
    window.addEventListener('pointerup', onWallAxisEndUp, { once: true })
  }

  function onWallAxisEndMove(event: PointerEvent): void {
    if (!wallAxisEndDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!elev || !cm) return
    let x = cm.x
    let y = cm.y
    if (!(event.ctrlKey || event.metaKey)) {
      x = snapElevationX(x, collectElevationWallSnapXs(elev.walls))
      y = snapElevationY(
        y,
        collectElevationSegmentSnapYs(elev, { wallId: wallAxisEndDrag.wallId }),
        ELEVATION_SEGMENT_SNAP_CM,
      )
      const guide: ElevationSnapGuide = {}
      if (Math.abs(x - cm.x) >= 1e-6) guide.x = x
      if (Math.abs(y - cm.y) >= 1e-6) guide.y = y
      snapGuide.value = guide.x != null || guide.y != null ? guide : null
    } else {
      snapGuide.value = null
    }
    const z = -y - floorWallBaseWorldZ(props.plan, wallAxisEndDrag.floorIndex)
    commitPlan(
      applyElevationWallEndAlongPlanAxis({
        plan: props.plan,
        elevation: elev,
        floorIndex: wallAxisEndDrag.floorIndex,
        wallId: wallAxisEndDrag.wallId,
        end: wallAxisEndDrag.end,
        alongCm: x,
        zCm: z,
      }),
    )
  }

  function onWallAxisEndUp(): void {
    window.removeEventListener('pointermove', onWallAxisEndMove)
    wallAxisEndDrag = null
    snapGuide.value = null
  }

  function onWallAxisEndHandleDown(end: 'a' | 'b', event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    markOpeningPointerHandled()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const wall = selectedAxisEditWall.value
    if (!wall) return
    selectWallSettings(wall.wallId, wall.floorIndex)
    beginWallAxisEndDrag(wall.wallId, wall.floorIndex, end)
  }

  type WallElevHandleDrag = {
    wallId: string
    floorIndex: number
    mode: WallElevationEditMode
    startBottomZ: number
  }

  let wallElevDrag: WallElevHandleDrag | null = null
  let wallElevDragStarted = false

  function elevCmToLocalZ(floorIndex: number, elevY: number): number {
    const base = floorWallBaseWorldZ(props.plan, floorIndex)
    return -elevY - base
  }

  function onWallElevHandleDown(mode: WallElevationEditMode, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const target = settingsTarget.value
    if (target?.kind !== 'wall') return
    const floor = props.plan.floors[target.floorIndex]
    const wall = floor?.walls.find((item) => item.id === target.wallId)
    if (!floor || !wall) return
    const startBottomZ = wallUniformBottomZCm(wall, floor.height) ?? 0
    wallElevDrag = {
      wallId: target.wallId,
      floorIndex: target.floorIndex,
      mode,
      startBottomZ,
    }
    wallElevDragStarted = false
    window.addEventListener('pointermove', onWallElevHandleMove)
    window.addEventListener('pointerup', onWallElevHandleUp, { once: true })
  }

  function onWallElevHandleMove(event: PointerEvent): void {
    if (!wallElevDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!cm) return
    let y = cm.y
    if (elev && !(event.ctrlKey || event.metaKey)) {
      y = snapElevationY(
        y,
        collectElevationSegmentSnapYs(elev, { wallId: wallElevDrag.wallId }),
        ELEVATION_SEGMENT_SNAP_CM,
      )
      snapGuide.value = Math.abs(y - cm.y) < 1e-6 ? null : { y }
    } else {
      snapGuide.value = null
    }
    const localZ = Math.max(0, Math.round(elevCmToLocalZ(wallElevDrag.floorIndex, y)))
    let targetCm: number
    if (wallElevDrag.mode === 'height') {
      targetCm = Math.max(1, localZ - wallElevDrag.startBottomZ)
    } else {
      targetCm = localZ
    }
    if (!wallElevDragStarted) {
      pushUndo()
      wallElevDragStarted = true
    }
    commitPlan(
      setPlanWallElevationEdit(
        props.plan,
        wallElevDrag.wallId,
        wallElevDrag.floorIndex,
        wallElevDrag.mode,
        targetCm,
      ),
    )
  }

  function onWallElevHandleUp(): void {
    window.removeEventListener('pointermove', onWallElevHandleMove)
    wallElevDrag = null
    wallElevDragStarted = false
    snapGuide.value = null
  }

  type JunctionDrag = {
    id: string
    startY: number
    startHeightCm: number
    startBottomZ: number
    mode: WallElevationEditMode
    floorIndex: number
    refs: Array<{ wallId: string; end: 'a' | 'b' }>
    ridge?: boolean
  }

  let junctionDrag: JunctionDrag | null = null

  function junctionBottomZOf(junction: {
    floorIndex: number
    refs: Array<{ wallId: string; end: 'a' | 'b' }>
  }): number {
    const floor = props.plan.floors[junction.floorIndex]
    const floorH = floor?.height ?? 280
    const bottoms = junction.refs
      .map((wallRef) => {
        const wall = floor?.walls.find((item) => item.id === wallRef.wallId)
        if (!wall) return null
        return Math.round(wallEndpoint3D(wall, wallRef.end, floorH).z)
      })
      .filter((value): value is number => value != null)
    return bottoms[0] ?? 0
  }

  function beginJunctionDrag(
    junction: { id: string; heightCm: number; floorIndex: number; ridge?: boolean },
    refs: Array<{ wallId: string; end: 'a' | 'b' }>,
    startY: number,
    mode: WallElevationEditMode = 'height',
  ): void {
    selectJunction(junction.id)
    junctionDrag = {
      id: junction.id,
      startY,
      startHeightCm: junction.heightCm,
      startBottomZ: junction.ridge
        ? 0
        : junctionBottomZOf({ floorIndex: junction.floorIndex, refs }),
      mode: junction.ridge ? 'height' : mode,
      floorIndex: junction.floorIndex,
      refs,
      ridge: junction.ridge,
    }
    pushUndo()
    window.addEventListener('pointermove', onJunctionMove)
    window.addEventListener('pointerup', onJunctionUp, { once: true })
  }

  function onJunctionMove(event: PointerEvent): void {
    if (!junctionDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!cm) return
    let y = cm.y
    if (elev && !(event.ctrlKey || event.metaKey)) {
      y = snapElevationY(
        y,
        collectElevationSegmentSnapYs(elev, {
          junctionId: junctionDrag.id,
          wallIds: junctionDrag.refs.map((r) => r.wallId),
        }),
        ELEVATION_SEGMENT_SNAP_CM,
      )
      snapGuide.value = Math.abs(y - cm.y) < 1e-6 ? null : { y }
    } else {
      snapGuide.value = null
    }
    if (junctionDrag.ridge) {
      const min = 0
      const heightCm = Math.max(
        min,
        Math.min(800, Math.round(junctionDrag.startHeightCm - (y - junctionDrag.startY))),
      )
      commitPlan(
        setPlanRidgeJunctionZ(props.plan, junctionDrag.floorIndex, junctionDrag.refs, heightCm),
      )
      return
    }
    const localZ = Math.max(0, Math.round(elevCmToLocalZ(junctionDrag.floorIndex, y)))
    let targetCm: number
    if (junctionDrag.mode === 'height') {
      targetCm = Math.max(1, localZ - junctionDrag.startBottomZ)
    } else {
      targetCm = localZ
    }
    commitPlan(
      setPlanJunctionElevationEdit(
        props.plan,
        junctionDrag.floorIndex,
        junctionDrag.refs,
        junctionDrag.mode,
        targetCm,
      ),
    )
  }

  function onJunctionUp(): void {
    window.removeEventListener('pointermove', onJunctionMove)
    junctionDrag = null
    snapGuide.value = null
  }

  type RoofVertexDrag = {
    surfaceId: string
    vertexIndex: number
    floorIndex: number
  }

  let roofVertexDrag: RoofVertexDrag | null = null

  function onRoofVertexDown(vertexIndex: number, event: { evt: MouseEvent }): void {
    stopKonvaBubble(event)
    markOpeningPointerHandled()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const plane = selectedRoofPlane.value
    const cm = pointerCm(event)
    if (!plane || !cm || !plane.points[vertexIndex]) return
    selectRoof(plane.id, vertexIndex)
    roofVertexDrag = {
      surfaceId: plane.id,
      vertexIndex,
      floorIndex: plane.floorIndex,
    }
    pushUndo()
    window.addEventListener('pointermove', onRoofVertexMove)
    window.addEventListener('pointerup', onRoofVertexUp, { once: true })
  }

  function onRoofVertexMove(event: PointerEvent): void {
    if (!roofVertexDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!elev || !cm) return
    const surface = findRidgeSurface(props.plan, roofVertexDrag.surfaceId)
    const keep = surface?.poly[roofVertexDrag.vertexIndex]
    if (!keep) return
    const skip = {
      planeId: roofVertexDrag.surfaceId,
      vertexIndex: roofVertexDrag.vertexIndex,
    }
    let x = cm.x
    let y = cm.y
    if (!(event.ctrlKey || event.metaKey)) {
      x = snapElevationX(x, collectElevationRoofSnapXs(elev, skip))
      y = snapElevationY(y, collectElevationRoofSnapYs(elev, skip))
      const guide: ElevationSnapGuide = {}
      if (Math.abs(x - cm.x) >= 1e-6) guide.x = x
      if (Math.abs(y - cm.y) >= 1e-6) guide.y = y
      snapGuide.value = guide.x != null || guide.y != null ? guide : null
    } else {
      snapGuide.value = null
    }
    const z = -y - floorWallBaseWorldZ(props.plan, roofVertexDrag.floorIndex)
    const xy = unprojectElevationAlong(x, keep, elev)
    commitPlan(
      setRidgeSurfaceVertex(props.plan, roofVertexDrag.surfaceId, roofVertexDrag.vertexIndex, {
        x: xy.x,
        y: xy.y,
        z,
      }),
    )
  }

  function onRoofVertexUp(): void {
    window.removeEventListener('pointermove', onRoofVertexMove)
    roofVertexDrag = null
    snapGuide.value = null
  }

  function onOpeningDown(openingId: string, event: { evt: MouseEvent }): void {
    stopKonvaBubble(event)
    markOpeningPointerHandled()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const elev = elevation.value
    const cm = pointerCm(event)
    const wantEdit = isSettingsMod(event.evt, elevSettingsMod.value)
    let id = openingId
    if (elev && cm && selectedOpeningId.value) {
      const preferred = hitElevationOpening(elev, cm, selectedOpeningId.value)
      if (preferred && (wantEdit || preferred.openingId === selectedOpeningId.value)) {
        id = preferred.openingId
      }
    }
    const rect = elev?.openings.find((item) => item.openingId === id)
    if (!elev || !rect || !cm) return
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (preciseIntent(event.evt)) {
      selectOpening(id, 'quick')
      beginPreciseOpening(id, cm, rect, rect.wallId, rect.floorIndex)
      return
    }
    const alreadyEdit =
      selectedOpeningId.value === id &&
      settingsTarget.value?.kind === 'opening' &&
      settingsTarget.value.mode === 'edit'
    if (!wantEdit && !alreadyEdit) {
      selectOpening(id, 'quick')
      return
    }
    selectOpening(id, 'edit')
    if (alreadyEdit) {
      beginOpeningDrag(id, 'move', cm, rect, rect.wallId, rect.floorIndex)
      return
    }
    startOpeningMovePending(id, rect, cm, event)
  }

  function onMoveHandleDown(event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const rect = selectedOpeningRect.value
    const cm = pointerCm(event)
    if (!rect || !cm) return
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (preciseIntent(event.evt)) {
      beginPreciseOpening(rect.openingId, cm, rect, rect.wallId, rect.floorIndex)
      return
    }
    beginOpeningDrag(rect.openingId, 'move', cm, rect, rect.wallId, rect.floorIndex)
  }

  function onHandleDown(side: ElevResizeSide, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    if (settingsTarget.value?.kind !== 'opening' || settingsTarget.value.mode !== 'edit') return
    const rect = selectedOpeningRect.value
    const cm = pointerCm(event)
    if (!rect || !cm) return
    beginOpeningDrag(rect.openingId, side, cm, rect, rect.wallId, rect.floorIndex)
  }

  function onJunctionDown(junctionId: string, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const elev = elevation.value
    const junction = elev?.junctions.find((item) => item.id === junctionId)
    const cm = pointerCm(event)
    if (!junction || !cm) return
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (preciseIntent(event.evt)) {
      beginPreciseJunction(junction, junction.refs, cm)
      return
    }
    if (junction.ridge) {
      const primary = junction.refs[0]
      if (primary) selectRidge(primary.wallId, junction.floorIndex, primary.end)
      beginRidgeEndDrag(junction.floorIndex, junction.refs)
      return
    }
    beginJunctionDrag(junction, junction.refs, cm.y, 'height')
  }

  function onJunctionElevHandleDown(mode: WallElevationEditMode, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const junction = settingsJunction.value
    const cm = pointerCm(event)
    if (!junction || junction.ridge || !cm) return
    beginJunctionDrag(junction, junction.refs, cm.y, mode)
  }

  function onRidgeWallDown(wall: ElevationWallRect, event: { evt: MouseEvent }): void {
    if (!wall.ridge || activeTool.value !== 'select' || canvasLocked.value) return
    const elev = elevation.value
    const cm = pointerCm(event)
    if (!elev || !cm) return
    event.evt.stopPropagation()
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (!wall.endOn) {
      selectRidge(wall.wallId, wall.floorIndex)
      return
    }
    if (preciseIntent(event.evt)) {
      beginPreciseRidge(wall, cm)
      return
    }
    beginRidgeRectDrag(wall, 'move', cm)
  }

  function onRidgeMoveHandleDown(event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const wall = selectedRidgeWall.value
    const cm = pointerCm(event)
    if (!wall?.endOn || !cm) return
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (preciseIntent(event.evt)) {
      beginPreciseRidge(wall, cm)
      return
    }
    beginRidgeRectDrag(wall, 'move', cm)
  }

  function onRidgeHandleDown(side: ElevResizeSide, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const wall = selectedRidgeWall.value
    const cm = pointerCm(event)
    if (!wall || !cm) return
    beginRidgeRectDrag(wall, side, cm)
  }

  function onRidgeEndHandleDown(end: 'a' | 'b', event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    markOpeningPointerHandled()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const wall = selectedRidgeWall.value
    if (!wall || wall.endOn) return
    selectRidge(wall.wallId, wall.floorIndex, end)
    beginRidgeEndDrag(wall.floorIndex, ridgeRefsForEnd(wall, end))
  }

  function cleanupSelectListeners(): void {
    cancelOpeningMovePending()
    window.removeEventListener('pointermove', onOpeningMove)
    window.removeEventListener('pointermove', onRidgeRectMove)
    window.removeEventListener('pointermove', onRidgeEndMove)
    window.removeEventListener('pointermove', onWallAxisEndMove)
    window.removeEventListener('pointermove', onWallElevHandleMove)
    window.removeEventListener('pointermove', onJunctionMove)
    window.removeEventListener('pointermove', onRoofVertexMove)
    drag = null
    ridgeRectDrag = null
    ridgeEndDrag = null
    wallAxisEndDrag = null
    wallElevDrag = null
    wallElevDragStarted = false
    junctionDrag = null
    roofVertexDrag = null
  }

  function clearSelectionOnGroupChange(): void {
    selectedOpeningId.value = null
    settingsTarget.value = null
  }

  return {
    selectedOpeningId,
    settingsTarget,
    elevSettingsOpen,
    selectedOpening,
    selectedOpeningRect,
    openingHandles,
    openingMoveHandle,
    openingMoveMeasureLines,
    selectedRidgeWall,
    settingsRidge,
    ridgeHandles,
    ridgeCenter,
    ridgeEndHandles,
    wallAxisEndHandles,
    openingSubtype,
    selectedOpeningBovenlicht,
    selectedOpeningBovenlichtHeightCm,
    selectedOpeningBovenlichtGapCm,
    selectedOpeningHingeAtStart,
    selectedOpeningSwingRight,
    settingsWall,
    selectedPlanWall,
    wallElevationHandles,
    junctionElevationHandles,
    settingsSlab,
    settingsJunction,
    selectedRoofPlane,
    settingsRoof,
    elevationMeasureLines,
    selectOpening,
    selectWallSettings,
    selectJunction,
    selectRidge,
    selectRoof,
    selectSlabSettings,
    clearSettings,
    applyOpeningRect,
    cancelOpeningMovePending,
    stopKonvaBubble,
    markOpeningPointerHandled,
    isContentClickIgnored,
    commitOpeningSubtype,
    copySelectedOpening,
    deleteSelectedOpening,
    deleteSelectedRidge,
    deleteSelectedRoof,
    commitSelectedField,
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
    onOpeningDown,
    onMoveHandleDown,
    onHandleDown,
    onJunctionDown,
    onJunctionElevHandleDown,
    onRidgeWallDown,
    onRidgeMoveHandleDown,
    onRidgeHandleDown,
    onRidgeEndHandleDown,
    onWallAxisEndHandleDown,
    onWallElevHandleDown,
    onRoofVertexDown,
    cleanupSelectListeners,
    clearSelectionOnGroupChange,
  }
}

export type ElevationSelectEdit = ReturnType<typeof useElevationSelectEdit>
