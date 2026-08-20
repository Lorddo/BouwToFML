import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { Floor, Wall } from '@/core/fml/types'
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
  floorHeightCm: ComputedRef<number>
  junctions: ComputedRef<{ id: string; x: number; y: number; refs: WallEndRef[] }[]>
  localPlan: Ref<{ floors: Floor[] } | null>
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
    const walls = editor.walls.value
    const { toStagePoint, toCmPoint } = layoutTransform(layout)
    const scale = layout.scale

    const wallLines: RenderWall[] = walls.map((wall, index) => {
      const a = toStagePoint(wall.a.x, wall.a.y)
      const b = toStagePoint(wall.b.x, wall.b.y)
      return {
        id: wall.id || `wall-${index}`,
        wall,
        points: [a.x, a.y, b.x, b.y],
        strokeWidth: Math.max(1.5, wall.thickness * scale),
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

    const { doorGroups, windows } = buildRenderDoorGroupsAndWindows(wallLines, toStagePoint)
    const fixtures = buildRenderFixtures(activeFloor, toStagePoint)
    const areas = buildRenderAreas(activeFloor.areas, toStagePoint)
    const surfaces = buildRenderSurfaces(activeFloor.surfaces, toStagePoint)
    const labels = buildRenderLabels(activeFloor.labels, toStagePoint)
    const lines = buildRenderLines(activeFloor.lines, toStagePoint)
    const dimensions = buildRenderDimensions(activeFloor.dimensions, toStagePoint)
    const areaSideDims = buildRenderAreaSideDims(activeFloor.areas, toStagePoint)

    return {
      wallLines,
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
    return renderModel.value.wallPolygons.filter((item) => idSet.has(item.id))
  })

  const settingsWallPolygon = computed(() => settingsWallPolygons.value[0] ?? null)

  const moveWallPolygon = computed(() => {
    if (!selection.moveWallId.value || !renderModel.value) return null
    if (settingsWallIds.value.includes(selection.moveWallId.value)) return null
    return (
      renderModel.value.wallPolygons.find((item) => item.id === selection.moveWallId.value) ?? null
    )
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
    return editor.junctions.value.map((junction) => {
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
    if (
      selection.activeFmlTool.value === 'draw_wall' ||
      selection.activeFmlTool.value === 'draw_room'
    ) {
      return new Set(renderJunctions.value.map((junction) => junction.id))
    }
    const ids = new Set<string>()
    const walls = editor.walls.value
    const addWall = (wallId: string | null) => {
      if (!wallId) return
      const wall = walls.find((item) => item.id === wallId)
      if (!wall) return
      const [a, b] = junctionIdsForWall(wall, walls)
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
    return buildSelectedJunctionPanel(editor.walls.value, junction, editor.floorHeightCm.value)
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
