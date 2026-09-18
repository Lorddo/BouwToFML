import { computed, ref, type Ref } from 'vue'
import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  resolveDoorBovenlicht,
  resolveWindowBovenlicht,
  resolveBovenlichtGapCm,
  resolveBovenlichtHeightCm,
} from '@/core/plan/bovenlicht'
import {
  ELEVATION_RETURN_MAX_DOT,
  type ElevationBovenlichtDefaults,
  type FacadeElevation,
} from '@/core/plan/facade-elevation'
import { elevationRidgeRectCenter, elevationRidgeRectOf } from '@/core/plan/elevation-ridge-edit'
import { findRidgeSurface, roofVertexZMinCm, slabCmForRoofSurface } from '@/core/plan/roof-planes'
import { listRidgeWallsOnFloor, ridgeEndpointZCm } from '@/core/plan/ridge-walls'
import { resolveHingeAtStart, resolveSwingSign } from '@/core/plan/door-swing-symbol'
import { findOpeningInPlan } from '@/core/plan/elevation-openings'
import {
  wallEndpoint3D,
  wallEndpointHeightCm,
  wallUniformBottomZCm,
  wallUniformHeightCm,
} from '@/core/plan/wall-endpoint-height'
import { floorWallBaseWorldZ, readFloorStack, slabThicknessCm } from '@/core/plan/floor-stack'
import {
  resolveDoorSubtypeFromRefid,
  resolveWindowSubtypeFromRefid,
} from '@/core/plan/opening-add-presets'
import type { OpeningSubtypeDraft } from '@/core/plan/opening-add-presets'
import { elevationHandlePoints, elevationRectCenter } from '@/core/plan/elevation-opening-edit'
import {
  findSkylightInPlan,
  skylightElevBounds,
} from '@/core/plan/elevation-skylight-edit'
import { buildElevationOpeningMeasureLines } from './elevation-opening-measure'
import {
  buildElevationJunctionHeightMeasureLines,
  buildElevationRidgeHeightMeasureLines,
  buildElevationRoofVertexHeightMeasureLines,
  buildElevationWallFaceMeasureLines,
} from './elevation-wall-measure'
import type { ElevSettings, ElevationInteractionProps } from './elevation-interaction-types'
import type { ElevTool } from './elevation-tool'

/**
 * Enige schrijf-lane van de aanzicht-selectie: twee refs + writers + afgeleiden.
 * Zelfde rol als `plan-canvas-selected.ts` op de plattegrond.
 */
export function createElevationSelectState(options: {
  props: ElevationInteractionProps
  elevation: Ref<FacadeElevation | null>
  activeTool: Ref<ElevTool>
  floorBovenlichtDefaults: (floorIndex: number) => ElevationBovenlichtDefaults
}) {
  const { props, elevation, activeTool, floorBovenlichtDefaults } = options

  const selectedOpeningId = ref<string | null>(null)
  const selectedSkylightId = ref<string | null>(null)
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

  const selectedSkylight = computed(() => {
    const id = selectedSkylightId.value
    if (!id) return null
    return findSkylightInPlan(props.plan, id)
  })

  const selectedSkylightElev = computed(() => {
    const id = selectedSkylightId.value
    if (!id || !elevation.value) return null
    return elevation.value.skylights.find((item) => item.itemId === id) ?? null
  })

  const selectedSkylightRect = computed(() => {
    const elev = selectedSkylightElev.value
    if (!elev) return null
    return skylightElevBounds(elev.points)
  })

  const skylightHandles = computed(() => {
    const rect = selectedSkylightRect.value
    if (
      !rect ||
      settingsTarget.value?.kind !== 'skylight' ||
      settingsTarget.value.mode !== 'edit'
    ) {
      return []
    }
    return elevationHandlePoints(rect)
  })

  const skylightMoveHandle = computed(() => {
    const rect = selectedSkylightRect.value
    if (!rect || settingsTarget.value?.kind !== 'skylight') return null
    return elevationRectCenter(rect)
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

  /** XY van dakkapel-muren loopt via het dakvlak, niet via as-einden. */
  const wallAxisEndHandles = computed(() => [] as Array<{ end: 'a' | 'b'; x: number; y: number }>)

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
    return [
      { mode: 'height' as const, x: mx, y: topY },
      { mode: 'lift' as const, x: mx, y: botY },
    ]
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

  const junctionElevationHandles = computed(() => {
    const junction = settingsJunction.value
    if (!junction || junction.ridge) return []
    return [{ mode: 'lift' as const, x: junction.x, y: junction.yBot }]
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

  function elevationStoreyFloorY(floorIndex: number): number {
    return -floorWallBaseWorldZ(props.plan, floorIndex)
  }

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

  function clearSettings(): void {
    settingsTarget.value = null
  }

  function selectOpening(openingId: string | null, mode: 'quick' | 'edit' | null = null): void {
    selectedSkylightId.value = null
    selectedOpeningId.value = openingId
    settingsTarget.value =
      mode && openingId != null ? { kind: 'opening', id: openingId, mode } : null
  }

  function selectSkylight(itemId: string | null): void {
    selectedOpeningId.value = null
    selectedSkylightId.value = itemId
    settingsTarget.value = itemId ? { kind: 'skylight', id: itemId, mode: 'edit' } : null
  }

  function selectWallSettings(wallId: string, floorIndex: number): void {
    selectedOpeningId.value = null
    selectedSkylightId.value = null
    settingsTarget.value = { kind: 'wall', wallId, floorIndex }
  }

  function selectJunction(id: string | null): void {
    selectedOpeningId.value = null
    selectedSkylightId.value = null
    settingsTarget.value = id ? { kind: 'junction', id } : null
  }

  function selectRidge(wallId: string, floorIndex: number, end?: 'a' | 'b'): void {
    selectedOpeningId.value = null
    selectedSkylightId.value = null
    settingsTarget.value = { kind: 'ridge', wallId, floorIndex, end }
  }

  function selectRoof(id: string | null, vertexIndex: number | null = null): void {
    selectedOpeningId.value = null
    selectedSkylightId.value = null
    settingsTarget.value = id ? { kind: 'roof', id, vertexIndex } : null
  }

  function selectSlabSettings(floorIndex: number): void {
    selectedOpeningId.value = null
    selectedSkylightId.value = null
    settingsTarget.value = { kind: 'slab', floorIndex }
  }

  function retargetOpeningId(fromId: string, toId: string): void {
    if (selectedOpeningId.value === fromId) selectedOpeningId.value = toId
    const target = settingsTarget.value
    if (target?.kind === 'opening' && target.id === fromId) {
      settingsTarget.value = { ...target, id: toId }
    }
  }

  function clearSelectionOnGroupChange(): void {
    selectedOpeningId.value = null
    selectedSkylightId.value = null
    settingsTarget.value = null
  }

  return {
    selectedOpeningId,
    selectedSkylightId,
    settingsTarget,
    elevSettingsOpen,
    selectedOpening,
    selectedOpeningRect,
    selectedSkylight,
    selectedSkylightElev,
    selectedSkylightRect,
    skylightHandles,
    skylightMoveHandle,
    openingHandles,
    openingMoveHandle,
    openingMoveMeasureLines,
    selectedRidgeWall,
    settingsRidge,
    ridgeHandles,
    ridgeCenter,
    ridgeEndHandles,
    selectedAxisEditWall,
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
    selectSkylight,
    selectWallSettings,
    selectJunction,
    selectRidge,
    selectRoof,
    selectSlabSettings,
    clearSettings,
    retargetOpeningId,
    clearSelectionOnGroupChange,
  }
}

export type ElevationSelectState = ReturnType<typeof createElevationSelectState>
