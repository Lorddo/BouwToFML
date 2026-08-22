import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { listRidgeWallsOnFloor, ridgeDisplayWidthCm } from '@/core/fml/ridge-walls'
import { listBlockedRoofRings, listSkyExposedWalls } from '@/core/fml/ridge-floor'
import { listRidgeSurfacesOnFloor } from '@/core/fml/roof-planes'
import type { Floor, FloorPlan, FloorSurface, Wall } from '@/core/fml/types'
import { buildAutoDimensionLines } from '@/core/fml/auto-dimension-lines'
import { filterManualDimensions, readBtfSlices } from '@/core/fml/btf-slices'
import { readDimensionSettings } from '@/core/fml/fml-dimension-settings'
import type { DimensionVis } from '@/core/fml/fml-dimension-vis'
import { bakeSliceDimensions } from '@/core/fml/slice-dimension-lines'
import { junctionIdsForWall, type WallEndRef } from '@/ui/components/fml-preview-junctions'
import {
  buildWallRenderGeometry,
  wallFillComponentsToPathData,
} from '@/ui/components/fml-preview-wall-polygons'
import { loadImage } from '@/platform/image'
import type { ContentLayout } from './useFmlPreviewViewport'
import { layoutTransform } from './useFmlPreviewViewport'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'
import { buildRenderDoorGroupsAndWindows, buildRenderFixtures } from './fml-preview-render-openings'
import { buildRenderAreaSideDims } from './fml-preview-area-side-dims'
import {
  buildAllCornerMarkers,
  buildRenderCornerMarkers,
  type RenderCornerMarker,
} from './fml-preview-corner-markers'
import { buildRenderAreas, buildRenderSurfaces } from './fml-preview-render-areas'
import {
  buildRenderDimensions,
  buildRenderLabels,
  buildRenderLines,
} from './fml-preview-render-annotations'
import type {
  RenderJunction,
  RenderModel,
  RenderWall,
  RenderWallPolygon,
} from './fml-preview-render-types'
import {
  buildSelectedInfo,
  buildSelectedJunctionPanel,
  buildSelectedOpeningPanel,
  buildSelectedWallPanel,
} from './fml-preview-selected-panels'
import { buildUnderlayStageGeom } from './fml-preview-underlay-layout'

export type {
  RenderArea,
  RenderDoorGroup,
  RenderFixture,
  RenderJunction,
  RenderLabel,
  RenderLine,
  RenderModel,
  RenderSurface,
  RenderWall,
  RenderWallPolygon,
  RenderWindowOpening,
} from './fml-preview-render-types'
export type { RenderCornerMarker } from './fml-preview-corner-markers'

interface ViewportApi {
  stageSize: Ref<{ width: number; height: number }>
  viewScale: Ref<number>
  viewPosition: Ref<{ x: number; y: number }>
  contentLayout: Ref<ContentLayout | null>
  renderTransform: ComputedRef<{
    toStagePoint: (x: number, y: number) => { x: number; y: number }
    toCmPoint: (x: number, y: number) => { x: number; y: number }
  }>
  ensureContentLayout: () => void
}

interface EditorApi {
  walls: ComputedRef<Wall[]>
  ridgeWalls: ComputedRef<Wall[]>
  selectableWalls: ComputedRef<Wall[]>
  ridgeSurfaces: ComputedRef<FloorSurface[]>
  floorHeightCm: ComputedRef<number>
  floorIndex: Ref<number>
  junctions: ComputedRef<{ id: string; x: number; y: number; refs: WallEndRef[] }[]>
  localPlan: Ref<FloorPlan | null>
}

interface UnderlayProps {
  underlaySrc: string | null
  underlayWidthPx: number
  underlayHeightPx: number
  cmOrigin: { x: number; y: number } | null
  pxPerMmX: number
  pxPerMmY: number
  /** Onderlegger-rotatie in graden; ontbrekend/0 = as-aligned. */
  rotationDeg?: number
  /** Display-only X-flip om bitmap-midden. */
  flipX?: boolean
  /** 0 = uit, 1 = volledig opaque. */
  opacity: number
}

export function useFmlPreviewRenderModel(
  viewport: ViewportApi,
  editor: EditorApi,
  floor: ComputedRef<Floor | null>,
  underlayProps: Ref<UnderlayProps>,
  selection: FmlPreviewSelectionRefs,
  dimensionVis?: ComputedRef<DimensionVis>,
  dakMode?: ComputedRef<boolean>,
) {
  const underlayImageObj = ref<HTMLImageElement | null>(null)

  watch(
    () => underlayProps.value.underlaySrc,
    (src) => {
      if (!src) {
        underlayImageObj.value = null
        return
      }
      let cancelled = false
      void loadImage(src).then((img) => {
        if (!cancelled) underlayImageObj.value = img
      })
      return () => {
        cancelled = true
      }
    },
    { immediate: true },
  )

  const renderModel = computed((): RenderModel | null => {
    viewport.ensureContentLayout()
    const layout = viewport.contentLayout.value
    const activeFloor = floor.value
    if (!layout || !activeFloor) return null
    const dak = dakMode?.value === true
    const walls = dak ? [] : editor.walls.value
    const { toStagePoint, toCmPoint } = layoutTransform(layout)
    const scale = layout.scale
    const plan = editor.localPlan.value

    const mapWallLine = (wall: Wall, index: number, prefix: string): RenderWall => {
      const a = toStagePoint(wall.a.x, wall.a.y)
      const b = toStagePoint(wall.b.x, wall.b.y)
      return {
        id: wall.id || `${prefix}-${index}`,
        wall,
        points: [a.x, a.y, b.x, b.y],
        strokeWidth: Math.max(1.5, wall.thickness * scale),
        a: wall.a,
        b: wall.b,
      }
    }

    const wallLines: RenderWall[] = walls.map((wall, index) => mapWallLine(wall, index, 'wall'))
    const ghostWallLines: RenderWall[] = []
    const ghostWallPolygons: RenderWallPolygon[] = []
    const blockedRoofPolygons: RenderWallPolygon[] = []
    if (dak && plan) {
      listBlockedRoofRings(plan, editor.floorIndex.value).forEach((ring, index) => {
        if (ring.length < 3) return
        blockedRoofPolygons.push({
          id: `blocked-roof-${index}`,
          points: ring.flatMap((point) => {
            const stage = toStagePoint(point.x, point.y)
            return [stage.x, stage.y]
          }),
        })
      })
      const ghostInputs = listSkyExposedWalls(plan, editor.floorIndex.value).map((wall, index) => ({
        id: wall.id || `ghost-${index}`,
        a: wall.a,
        b: wall.b,
        thickness: wall.thickness,
        balance: wall.balance,
      }))
      if (ghostInputs.length > 0) {
        const geometry = buildWallRenderGeometry(ghostInputs)
        let ringIndex = 0
        for (const component of geometry.fillComponents) {
          for (const ring of component.rings) {
            if (ring.length < 2) continue
            ghostWallPolygons.push({
              id: `ghost-ring-${ringIndex}`,
              points: ring.flatMap((point) => {
                const stage = toStagePoint(point.x, point.y)
                return [stage.x, stage.y]
              }),
            })
            ringIndex += 1
          }
        }
      }
    }

    const displayWidth = ridgeDisplayWidthCm(plan)
    const half = displayWidth / 2
    const ridgeSource = listRidgeWallsOnFloor(activeFloor)
    const ridgeLines = ridgeSource.map((wall, index) => {
      const a = toStagePoint(wall.a.x, wall.a.y)
      const b = toStagePoint(wall.b.x, wall.b.y)
      const dx = wall.b.x - wall.a.x
      const dy = wall.b.y - wall.a.y
      const len = Math.hypot(dx, dy) || 1
      const nx = (-dy / len) * half
      const ny = (dx / len) * half
      const a1 = toStagePoint(wall.a.x + nx, wall.a.y + ny)
      const b1 = toStagePoint(wall.b.x + nx, wall.b.y + ny)
      const a2 = toStagePoint(wall.a.x - nx, wall.a.y - ny)
      const b2 = toStagePoint(wall.b.x - nx, wall.b.y - ny)
      return {
        id: wall.id || `ridge-${index}`,
        wall,
        points: [a.x, a.y, b.x, b.y],
        outlinePoints: [
          [a1.x, a1.y, b1.x, b1.y],
          [a2.x, a2.y, b2.x, b2.y],
        ] as [number[], number[]],
        a: wall.a,
        b: wall.b,
      }
    })

    let wallPolygons: RenderWallPolygon[] = []
    let wallFillPathData = ''
    if (walls.length > 0) {
      const geometry = buildWallRenderGeometry(
        walls.map((wall, index) => ({
          id: wall.id || `wall-${index}`,
          a: wall.a,
          b: wall.b,
          thickness: wall.thickness,
          balance: wall.balance,
        })),
      )
      wallPolygons = geometry.wallPolygons.map((polygon) => ({
        id: polygon.id,
        points: polygon.points.flatMap((point) => {
          const stage = toStagePoint(point.x, point.y)
          return [stage.x, stage.y]
        }),
      }))
      wallFillPathData = wallFillComponentsToPathData(
        geometry.fillComponents.map((component) => ({
          rings: component.rings.map((ring) => ring.map((point) => toStagePoint(point.x, point.y))),
        })),
      )
      if (!wallFillPathData) {
        throw new Error('fml-walls: empty union path — refusing per-wall fallback')
      }
    }

    const { doorGroups, windows } = dak
      ? { doorGroups: [], windows: [] }
      : buildRenderDoorGroupsAndWindows(wallLines, toStagePoint)
    const fixtures = dak ? [] : buildRenderFixtures(activeFloor, toStagePoint)
    const areas = dak ? [] : buildRenderAreas(activeFloor.areas, toStagePoint)
    const surfaces = buildRenderSurfaces(
      dak ? listRidgeSurfacesOnFloor(activeFloor) : (activeFloor.surfaces ?? []),
      toStagePoint,
    )
    const labels = dak ? [] : buildRenderLabels(activeFloor.labels, toStagePoint)
    const lines = dak ? [] : buildRenderLines(activeFloor.lines, toStagePoint)
    const dimSettings = readDimensionSettings(editor.localPlan.value, editor.floorIndex.value)
    const slices = readBtfSlices(activeFloor)
    const vis = dak ? 'none' : (dimensionVis?.value ?? 'none')

    const manualDims =
      vis === 'manual' ? filterManualDimensions(activeFloor.dimensions, slices) : []
    const dimensions = buildRenderDimensions(manualDims, toStagePoint)

    const areaSideDims = dak ? [] : buildRenderAreaSideDims(activeFloor.areas, toStagePoint)

    let autoDimensions: ReturnType<typeof buildRenderDimensions> = []
    if (!dak && vis === 'autogen' && dimSettings.engineAutoDims) {
      const autoLines = buildAutoDimensionLines(walls, activeFloor.areas, {
        dimensionMode: dimSettings.dimensionMode,
        generateOuterDimension: dimSettings.generateOuterDimension,
      })
      autoDimensions = buildRenderDimensions(
        autoLines.map((line, index) => ({
          id: `auto-dim-${index}`,
          type: 'custom_dimension' as const,
          a: line.a,
          b: line.b,
        })),
        toStagePoint,
      )
    }

    let sliceDimensions: ReturnType<typeof buildRenderDimensions> = []
    if (vis === 'slicer' && slices.length > 0) {
      sliceDimensions = buildRenderDimensions(
        bakeSliceDimensions(slices, walls, dimSettings.dimensionMode, 'slice-live'),
        toStagePoint,
      )
    }

    return {
      wallLines,
      ghostWallLines,
      ghostWallPolygons,
      blockedRoofPolygons,
      ridgeLines,
      wallPolygons,
      wallFillPathData,
      doorGroups,
      windows,
      fixtures,
      areas,
      surfaces,
      labels,
      lines,
      dimensions,
      autoDimensions,
      sliceDimensions,
      areaSideDims,
      toCmPoint,
      panRect: {
        x: layout.offsetX - 48,
        y: layout.offsetY - 48,
        width: layout.spanX * layout.scale + 96,
        height: layout.spanY * layout.scale + 96,
      },
    }
  })

  const underlayConfig = computed(() => {
    const layout = viewport.contentLayout.value
    const image = underlayImageObj.value
    const props = underlayProps.value
    const opacity = Math.min(1, Math.max(0, props.opacity))
    if (!layout || !image || !props.underlayWidthPx || !props.underlayHeightPx || opacity <= 0) {
      return null
    }
    const origin = props.cmOrigin ?? { x: 0, y: 0 }
    const { toStagePoint } = layoutTransform(layout)
    const topLeftCm = { x: -origin.x, y: -origin.y }
    const sizeCm = {
      w: props.underlayWidthPx / props.pxPerMmX / 10,
      h: props.underlayHeightPx / props.pxPerMmY / 10,
    }
    const topLeft = toStagePoint(topLeftCm.x, topLeftCm.y)
    const bottomRight = toStagePoint(topLeftCm.x + sizeCm.w, topLeftCm.y + sizeCm.h)
    const geom = buildUnderlayStageGeom({
      topLeftStage: topLeft,
      widthStage: bottomRight.x - topLeft.x,
      heightStage: bottomRight.y - topLeft.y,
      rotationDeg: props.rotationDeg,
      flipX: props.flipX,
    })
    return {
      flip: { ...geom.flip, listening: false },
      rotate: { ...geom.rotate, listening: false },
      image: { ...geom.image, image, opacity, listening: false },
    }
  })

  const settingsWallIds = computed(() => selection.settingsWallIds.value)
  const settingsOpeningIds = computed(() => selection.settingsOpeningIds.value)

  const settingsWallPolygons = computed(() => {
    if (!renderModel.value || settingsWallIds.value.length === 0) return []
    const idSet = new Set(settingsWallIds.value)
    const fromWalls = renderModel.value.wallPolygons.filter((item) => idSet.has(item.id))
    const fromRidges = renderModel.value.ridgeLines
      .filter((line) => idSet.has(line.id))
      .map((line) => {
        const [left, right] = line.outlinePoints
        return {
          id: line.id,
          points: [left[0], left[1], left[2], left[3], right[2], right[3], right[0], right[1]],
        }
      })
    return [...fromWalls, ...fromRidges]
  })

  const settingsWallPolygon = computed(() => settingsWallPolygons.value[0] ?? null)

  const moveWallPolygon = computed(() => {
    if (!selection.moveWallId.value || !renderModel.value) return null
    if (settingsWallIds.value.includes(selection.moveWallId.value)) return null
    const fromWalls = renderModel.value.wallPolygons.find(
      (item) => item.id === selection.moveWallId.value,
    )
    if (fromWalls) return fromWalls
    const ridge = renderModel.value.ridgeLines.find(
      (line) => line.id === selection.moveWallId.value,
    )
    if (!ridge) return null
    const [left, right] = ridge.outlinePoints
    return {
      id: ridge.id,
      points: [left[0], left[1], left[2], left[3], right[2], right[3], right[0], right[1]],
    }
  })

  const moveOpeningId = computed(() => selection.moveOpeningId.value)

  function junctionStagePoint(cmX: number, cmY: number): { x: number; y: number } {
    const local = viewport.renderTransform.value.toStagePoint(cmX, cmY)
    return {
      x: viewport.viewPosition.value.x + local.x * viewport.viewScale.value,
      y: viewport.viewPosition.value.y + local.y * viewport.viewScale.value,
    }
  }

  const renderJunctions = computed((): RenderJunction[] => {
    if (!renderModel.value) return []
    const dak = dakMode?.value === true
    const visibleIds = new Set<string>()
    if (dak) {
      for (const wall of listRidgeWallsOnFloor(floor.value)) visibleIds.add(wall.id)
    } else {
      for (const wall of editor.walls.value) visibleIds.add(wall.id)
      for (const wall of listRidgeWallsOnFloor(floor.value)) visibleIds.add(wall.id)
    }
    return editor.junctions.value
      .filter((junction) => junction.refs.some((ref) => visibleIds.has(ref.wallId)))
      .map((junction) => {
        const stage = junctionStagePoint(junction.x, junction.y)
        return {
          id: junction.id,
          x: stage.x,
          y: stage.y,
          cmX: junction.x,
          cmY: junction.y,
          refs: junction.refs,
          wallCount: junction.refs.length,
        }
      })
  })

  const visibleJunctionIds = computed(() => {
    const showAllDrawJunctions =
      selection.activeFmlTool.value === 'draw_room' ||
      (selection.activeFmlTool.value === 'draw_wall' && selection.drawWallKind.value !== 'ridge')
    if (showAllDrawJunctions) {
      return new Set(renderJunctions.value.map((junction) => junction.id))
    }
    const ids = new Set<string>()
    const addWall = (wallId: string | null) => {
      if (!wallId) return
      const planWall = editor.walls.value.find((item) => item.id === wallId)
      if (planWall) {
        const [a, b] = junctionIdsForWall(planWall, editor.walls.value)
        ids.add(a)
        ids.add(b)
        return
      }
      const ridgeWall = editor.ridgeWalls.value.find((item) => item.id === wallId)
      if (!ridgeWall) return
      const [a, b] = junctionIdsForWall(ridgeWall, editor.ridgeWalls.value)
      ids.add(a)
      ids.add(b)
    }
    addWall(selection.hoveredWallId.value)
    addWall(selection.moveWallId.value)
    for (const wallId of settingsWallIds.value) addWall(wallId)
    if (selection.draggingJunctionId.value) ids.add(selection.draggingJunctionId.value)
    if (selection.hoveredJunctionId.value) ids.add(selection.hoveredJunctionId.value)
    if (selection.pinnedJunctionId.value) ids.add(selection.pinnedJunctionId.value)
    if (selection.settingsJunctionId.value) ids.add(selection.settingsJunctionId.value)
    return ids
  })

  const visibleJunctions = computed(() =>
    renderJunctions.value.filter((junction) => visibleJunctionIds.value.has(junction.id)),
  )

  const renderCornerMarkers = computed((): RenderCornerMarker[] => {
    if (!renderModel.value) return []
    return buildRenderCornerMarkers(buildAllCornerMarkers(editor.walls.value), (x, y) =>
      junctionStagePoint(x, y),
    )
  })

  const groupDraggable = computed(() => false)

  const junctionMarkerRadius = computed(() => 7)
  const junctionMarkerStroke = computed(() => 2)
  const junctionHitRadius = computed(() => 14)

  const junctionOverlayGroup = computed(() => ({
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
  }))

  const activeJunctionId = computed(() => {
    if (selection.draggingJunctionId.value) return selection.draggingJunctionId.value
    if (selection.settingsJunctionId.value) return selection.settingsJunctionId.value
    return selection.hoveredJunctionId.value
  })

  const selectedWallPanel = computed(() => {
    const model = renderModel.value
    if (!model) return null
    return buildSelectedWallPanel(model, settingsWallIds.value, editor.floorHeightCm.value)
  })

  const selectedJunctionPanel = computed(() => {
    const junctionId = selection.settingsJunctionId.value
    if (!junctionId) return null
    const junction = editor.junctions.value.find((item) => item.id === junctionId)
    return buildSelectedJunctionPanel(
      editor.selectableWalls.value,
      junction,
      editor.floorHeightCm.value,
    )
  })

  const selectedInfo = computed(() => {
    const model = renderModel.value
    if (!model) return null
    const selectedOpeningId = moveOpeningId.value ?? settingsOpeningIds.value[0] ?? null
    return buildSelectedInfo(model, selectedOpeningId)
  })

  const selectedOpeningPanel = computed(() => {
    const model = renderModel.value
    if (!model) return null
    return buildSelectedOpeningPanel(model, settingsOpeningIds.value)
  })

  return {
    renderModel,
    underlayConfig,
    settingsWallPolygon,
    settingsWallPolygons,
    settingsWallIds,
    settingsOpeningIds,
    moveWallPolygon,
    moveOpeningId,
    renderJunctions,
    visibleJunctions,
    renderCornerMarkers,
    groupDraggable,
    junctionMarkerRadius,
    junctionMarkerStroke,
    junctionHitRadius,
    junctionOverlayGroup,
    activeJunctionId,
    selectedWallPanel,
    selectedJunctionPanel,
    selectedOpeningPanel,
    selectedInfo,
  }
}
