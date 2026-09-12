import { computed, ref, watch, type Ref } from 'vue'
import type { FloorPlan, Point2D, Wall } from '@/core/fml/types'
import {
  elevationAxisPlanSides,
  projectFacadeElevation,
  type ElevationBovenlichtDefaults,
  type ElevationOpeningRect,
  type ElevationPlanSide,
  type ElevationRect,
  type ElevationRoofPlane,
  type ElevationWallRect,
} from '@/core/fml/facade-elevation'
import {
  elevationWallFillPoints,
  elevationWallFillRings,
  elevationWallInnerStrokes,
  groupElevationPaintPlanes,
} from '@/core/fml/elevation-paint'
import {
  elevationOpeningHoleIsRect,
  elevationOpeningHolePoints,
  glyphFromElevationRect,
} from '@/core/fml/elevation-opening-symbol'
import { listElevationFacadeGroups } from '@/core/fml/facade-groups'
import { loadImage } from '@/platform/image'
import {
  buildUnderlayStageGeom,
  underlayContentBoundsCm,
} from '@/ui/composables/fml-preview/fml-preview-underlay-layout'
import {
  OPENING_ARC_DASH_CM,
  OPENING_STROKE_CM,
  OPENING_STROKE_HEAVY_CM,
  SELECTION_HIGHLIGHT_PAD_PX,
  worldDashStage,
  worldStrokeStage,
} from '@/ui/composables/fml-preview/fml-preview-world-stroke'
import {
  layoutTransform,
  useFmlPreviewViewport,
} from '@/ui/composables/fml-preview/useFmlPreviewViewport'
import {
  ARCHITECT_AREA_FILL,
  isArchitectPlanStyle,
  isLinePlanStyle,
  planLineStroke,
  type PlanDisplayStyleChoice,
} from '@/ui/composables/settings/plan-display-style'
import { FACTORY_OPENING_COLORS } from '@/ui/composables/settings/opening-display-colors'
import {
  FML_PLAN_HANDLE_RADIUS_PX,
  FML_PLAN_HANDLE_HIT_PX,
} from '@/ui/composables/fml-preview/fml-preview-vertex-hit'
import { floorWallBaseWorldZ } from '@/core/fml/floor-stack'
export type ElevSettingsRef =
  | { kind: 'opening'; id: string; mode: 'quick' | 'edit' }
  | { kind: 'wall'; wallId: string; floorIndex: number }
  | { kind: 'slab'; floorIndex: number }
  | { kind: 'junction'; id: string }
  | { kind: 'ridge'; wallId: string; floorIndex: number; end?: 'a' | 'b' }
  | { kind: 'roof'; id: string; vertexIndex: number | null }
  | null

export interface ElevationRenderModelProps {
  plan: FloorPlan
  groupId: string
  underlaySrc?: string | null
  underlayWidthPx?: number
  underlayHeightPx?: number
  underlayOpacity?: number
  contentOpacity?: number
  cmOrigin?: { x: number; y: number } | null
  pxPerMmX?: number
  pxPerMmY?: number
  rotationDeg?: number
  flipX?: boolean
  resolveBovenlichtDefaults?: (floorIndex: number) => ElevationBovenlichtDefaults
}

export interface ElevationRenderModelOptions {
  props: ElevationRenderModelProps
  containerRef: Ref<HTMLDivElement | null>
  settingsTarget: Ref<ElevSettingsRef>
  selectedOpeningId: Ref<string | null>
  splitDraft: Ref<{ wallId: string; floorIndex: number } | null>
  planDisplayStyle: Ref<PlanDisplayStyleChoice>
  floorBovenlichtDefaults: (floorIndex: number) => ElevationBovenlichtDefaults
  t: (key: string, params?: Record<string, unknown>) => string
}

export function useFmlElevationRenderModel(options: ElevationRenderModelOptions) {
  const {
    props,
    containerRef,
    settingsTarget,
    selectedOpeningId,
    splitDraft,
    planDisplayStyle,
    floorBovenlichtDefaults,
    t,
  } = options

  const architectStyle = computed(() => isArchitectPlanStyle(planDisplayStyle.value))
  const lineStyle = computed(() => isLinePlanStyle(planDisplayStyle.value))
  const elevLineColor = computed(() => planLineStroke(planDisplayStyle.value))

  const elevation = computed(() =>
    projectFacadeElevation(props.plan, props.groupId, floorBovenlichtDefaults),
  )

  const groups = computed(() => listElevationFacadeGroups(props.plan))

  const planSideLabels = computed(() => {
    const axis = elevation.value?.axis
    return axis ? elevationAxisPlanSides(axis) : null
  })

  function planSideLetter(side: ElevationPlanSide): string {
    return t(`viewer.elevationPlanSide.${side}`)
  }

  const ELEVATION_PLAN_SIDE_GAP_CM = 56

  // --- Underlay ---
  const underlayImage = ref<HTMLImageElement | null>(null)
  watch(
    () => props.underlaySrc,
    async (src) => {
      if (!src) {
        underlayImage.value = null
        return
      }
      try {
        underlayImage.value = await loadImage(src)
      } catch {
        underlayImage.value = null
      }
    },
    { immediate: true },
  )

  // --- Viewport ---
  const extraBounds = computed(() => {
    const bounds = elevation.value?.bounds
    const elev = bounds
      ? {
          minX: bounds.x0 - ELEVATION_PLAN_SIDE_GAP_CM,
          minY: bounds.y0,
          spanX: Math.max(1, bounds.x1 - bounds.x0) + ELEVATION_PLAN_SIDE_GAP_CM * 2,
          spanY: Math.max(1, bounds.y1 - bounds.y0),
        }
      : null
    const underlay =
      props.cmOrigin && (props.underlayOpacity ?? 0) > 0
        ? underlayContentBoundsCm({
            cmOrigin: props.cmOrigin,
            underlayWidthPx: props.underlayWidthPx ?? 0,
            underlayHeightPx: props.underlayHeightPx ?? 0,
            pxPerMmX: props.pxPerMmX ?? 1,
            pxPerMmY: props.pxPerMmY ?? 1,
            rotationDeg: props.rotationDeg,
            flipX: props.flipX,
          })
        : null
    if (!elev) return underlay
    if (!underlay) return elev
    const minX = Math.min(elev.minX, underlay.minX)
    const minY = Math.min(elev.minY, underlay.minY)
    const maxX = Math.max(elev.minX + elev.spanX, underlay.minX + underlay.spanX)
    const maxY = Math.max(elev.minY + elev.spanY, underlay.minY + underlay.spanY)
    return { minX, minY, spanX: Math.max(1, maxX - minX), spanY: Math.max(1, maxY - minY) }
  })

  const emptyWalls = ref<Wall[]>([])
  const viewport = useFmlPreviewViewport(containerRef, emptyWalls, undefined, extraBounds)
  const {
    stageSize,
    viewScale,
    viewPosition,
    contentLayout,
    resetView,
    mountResizeObserver,
    unmountResizeObserver,
  } = viewport

  const layoutXform = computed(() => {
    const layout = contentLayout.value
    if (!layout) {
      return layoutTransform({
        minX: 0,
        minY: 0,
        spanX: 1,
        spanY: 1,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      })
    }
    return layoutTransform(layout)
  })

  // --- Underlay config ---
  const underlayConfig = computed(() => {
    const img = underlayImage.value
    const elev = elevation.value
    if (!img || !elev || !props.underlaySrc || (props.underlayOpacity ?? 0) <= 0) return null
    const layout = props.cmOrigin
      ? {
          origin: props.cmOrigin,
          pxPerMmX: props.pxPerMmX ?? 1,
          pxPerMmY: props.pxPerMmY ?? 1,
        }
      : null
    const widthCm =
      layout && layout.pxPerMmX > 0 && (props.underlayWidthPx ?? 0) > 0
        ? (props.underlayWidthPx ?? 0) / layout.pxPerMmX / 10
        : elev.bounds.x1 - elev.bounds.x0
    const heightCm =
      layout && layout.pxPerMmY > 0 && (props.underlayHeightPx ?? 0) > 0
        ? (props.underlayHeightPx ?? 0) / layout.pxPerMmY / 10
        : elev.bounds.y1 - elev.bounds.y0
    const origin = layout?.origin ?? { x: 0, y: 0 }
    const topLeft = layoutXform.value.toStagePoint(-origin.x, -origin.y)
    const br = layoutXform.value.toStagePoint(-origin.x + widthCm, -origin.y + heightCm)
    const geom = buildUnderlayStageGeom({
      topLeftStage: topLeft,
      widthStage: br.x - topLeft.x,
      heightStage: br.y - topLeft.y,
      rotationDeg: props.rotationDeg,
      flipX: props.flipX,
    })
    return {
      flip: { ...geom.flip, listening: false },
      rotate: { ...geom.rotate, listening: false },
      image: {
        image: img,
        ...geom.image,
        opacity: props.underlayOpacity ?? 0.45,
        listening: false,
      },
    }
  })

  // --- Stage geometry helpers ---
  function stageRect(rect: ElevationRect) {
    const a = layoutXform.value.toStagePoint(rect.x0, rect.y0)
    const b = layoutXform.value.toStagePoint(rect.x1, rect.y1)
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.max(1, Math.abs(b.x - a.x)),
      height: Math.max(1, Math.abs(b.y - a.y)),
    }
  }

  function stageWallPoly(wall: ElevationWallRect): number[] {
    return elevationWallFillPoints(wall).flatMap((point) => {
      const stage = layoutXform.value.toStagePoint(point.x, point.y)
      return [stage.x, stage.y]
    })
  }

  function stageWallFillPath(wall: ElevationWallRect, holes: readonly ElevationRect[]): string {
    return elevationWallFillRings(wall, wall.ridge ? [] : holes)
      .map((ring) => {
        const pts = ring.map((point) => layoutXform.value.toStagePoint(point.x, point.y))
        const first = pts[0]
        if (!first || pts.length < 3) return ''
        return `M${first.x} ${first.y}${pts
          .slice(1)
          .map((point) => `L${point.x} ${point.y}`)
          .join('')}Z`
      })
      .join('')
  }

  function stagePoly(points: ReadonlyArray<{ x: number; y: number }>): number[] {
    return points.flatMap((point) => {
      const stage = layoutXform.value.toStagePoint(point.x, point.y)
      return [stage.x, stage.y]
    })
  }

  function stagePoints(a: { x: number; y: number }, b: { x: number; y: number }): number[] {
    const sa = layoutXform.value.toStagePoint(a.x, a.y)
    const sb = layoutXform.value.toStagePoint(b.x, b.y)
    return [sa.x, sa.y, sb.x, sb.y]
  }

  function openingGhostStage(rect: ElevationOpeningRect) {
    const x0 = Math.min(rect.x0, rect.x1)
    const x1 = Math.max(rect.x0, rect.x1)
    const y0 = Math.min(rect.y0, rect.y1)
    const y1 = Math.max(rect.y0, rect.y1)
    const shaped = !elevationOpeningHoleIsRect(rect.type, rect.kind)
    return {
      shaped,
      points: shaped
        ? stagePoly(
            elevationOpeningHolePoints({ x0, y0, x1, y1 }, rect.type, rect.kind, {
              mirrored: rect.mirrored,
              startOnLeft: rect.startOnLeft,
            }),
          )
        : [],
    }
  }

  // --- Strokes ---
  const layoutScale = computed(() => contentLayout.value?.scale ?? 1)
  const roofVertexHitTolCm = computed(() => {
    const scale = Math.max(1e-6, layoutScale.value * Math.max(0.01, viewScale.value))
    return FML_PLAN_HANDLE_HIT_PX / scale
  })
  const elevStroke = computed(() => worldStrokeStage(OPENING_STROKE_CM, layoutScale.value))
  const elevStrokeHeavy = computed(() =>
    worldStrokeStage(OPENING_STROKE_HEAVY_CM, layoutScale.value),
  )
  const elevHighlightStroke = computed(() => {
    const pad = SELECTION_HIGHLIGHT_PAD_PX / Math.max(viewScale.value, 0.01)
    return elevStroke.value + pad
  })
  const elevDash = computed(() => worldDashStage(OPENING_ARC_DASH_CM, layoutScale.value))

  // --- Glyph helpers ---
  function glyphOpacity(role: string, transom: boolean): number {
    if (role === 'glass') return transom ? 0.55 : 0.85
    if (transom) return 0.7
    return 0.95
  }

  function glyphFill(role: string, transom: boolean, type: 'door' | 'window'): string {
    if (transom) {
      if (role === 'glass') return '#86efac'
      if (role === 'frame') return '#15803d'
      return FACTORY_OPENING_COLORS.bovenlicht
    }
    if (type === 'door') {
      if (role === 'handle') return '#431407'
      if (role === 'glass') return '#fde68a'
      if (role === 'frame') return '#b45309'
      return '#f59e0b'
    }
    if (role === 'glass') return '#bae6fd'
    if (role === 'frame') return '#0369a1'
    if (role === 'leaf') return '#94a3b8'
    return '#38bdf8'
  }

  // --- Opening glyphs ---
  const openingGlyphs = computed(() => {
    const elev = elevation.value
    if (!elev) return []
    const xform = layoutXform.value
    const toStage = (x: number, y: number) => xform.toStagePoint(x, y)
    const toPoints = (flat: number[]) => {
      const out: number[] = []
      for (let i = 0; i < flat.length; i += 2) {
        const px = flat[i]
        const py = flat[i + 1]
        if (px == null || py == null) continue
        const point = toStage(px, py)
        out.push(point.x, point.y)
      }
      return out
    }
    const mapRect = (rect: ElevationOpeningRect, transom: boolean, index: number) => {
      const symbol = glyphFromElevationRect(rect)
      return {
        id: `${transom ? 't' : 'o'}-${rect.openingId}-${index}`,
        wallId: rect.wallId,
        floorIndex: rect.floorIndex,
        transom,
        type: rect.type,
        polys: symbol.polys.map((poly, i) => ({
          key: `${i}-${poly.role}`,
          points: toPoints(poly.points),
          closed: poly.closed !== false,
          fill: poly.fill === true,
          role: poly.role,
        })),
        circles: symbol.circles.map((circle, i) => {
          const center = toStage(circle.cx, circle.cy)
          const rim = toStage(circle.cx + circle.radius, circle.cy)
          return {
            key: `c-${i}-${circle.role}`,
            x: center.x,
            y: center.y,
            radius: Math.hypot(rim.x - center.x, rim.y - center.y),
            fill: circle.fill === true,
            role: circle.role,
          }
        }),
      }
    }
    return [
      ...elev.openings.map((rect, index) => mapRect(rect, false, index)),
      ...elev.transoms.map((rect, index) => mapRect(rect, true, index)),
    ]
  })

  // --- Paint planes ---
  const innerStrokes = computed(() => {
    const elev = elevation.value
    if (!elev) return []
    return elev.walls.flatMap((wall) =>
      elevationWallInnerStrokes(wall).map((stroke, index) => ({
        key: `inner-${wall.floorIndex}-${wall.wallId}-${index}`,
        wallId: wall.wallId,
        floorIndex: wall.floorIndex,
        a: stroke.a,
        b: stroke.b,
      })),
    )
  })

  const elevationPlanes = computed(() => {
    const elev = elevation.value
    if (!elev) return []
    const glyphs = openingGlyphs.value
    const strokes = innerStrokes.value
    return groupElevationPaintPlanes(elev).map((plane, planeIndex) => ({
      key: `plane-${planeIndex}`,
      layers: plane.walls.map((wall) => ({
        wall,
        fillPath: stageWallFillPath(wall, [...plane.openings, ...plane.transoms]),
        innerStrokes: strokes.filter(
          (item) => item.wallId === wall.wallId && item.floorIndex === wall.floorIndex,
        ),
      })),
      endOnRidges: plane.endOnRidges.map((wall) => ({
        wall,
        fillPath: stageWallFillPath(wall, []),
      })),
      openings: plane.openings.map((opening) => ({
        ...opening,
        ghost: openingGhostStage(opening),
      })),
      transoms: plane.transoms.map((transom) => ({
        ...transom,
        ghost: openingGhostStage(transom),
      })),
      glyphs: glyphs.filter((item) =>
        plane.walls.some(
          (wall) => wall.wallId === item.wallId && wall.floorIndex === item.floorIndex,
        ),
      ),
    }))
  })

  // --- Plan-side label marks ---
  const planSideLabelMarks = computed(() => {
    const elev = elevation.value
    const sides = planSideLabels.value
    if (!elev || !sides) return []
    const inv = 1 / Math.max(1e-6, viewScale.value)
    const font = 14 * inv
    const width = 36 * inv
    const midY = (elev.bounds.y0 + elev.bounds.y1) / 2
    const xform = layoutXform.value
    const left = xform.toStagePoint(elev.bounds.x0 - ELEVATION_PLAN_SIDE_GAP_CM, midY)
    const right = xform.toStagePoint(elev.bounds.x1 + ELEVATION_PLAN_SIDE_GAP_CM, midY)
    const base = {
      fontSize: font,
      fontStyle: 'bold' as const,
      fill: '#334155',
      align: 'center' as const,
      width,
      offsetX: width / 2,
      offsetY: font / 2,
      listening: false,
      perfectDrawEnabled: false,
    }
    return [
      { key: 'left', config: { ...base, x: left.x, y: left.y, text: planSideLetter(sides.left) } },
      {
        key: 'right',
        config: { ...base, x: right.x, y: right.y, text: planSideLetter(sides.right) },
      },
    ]
  })

  // --- Selection-based helpers ---
  function wallOrRidgeSelected(wall: ElevationWallRect): boolean {
    const target = settingsTarget.value
    if (
      (target?.kind === 'wall' || target?.kind === 'ridge') &&
      target.wallId === wall.wallId &&
      target.floorIndex === wall.floorIndex
    ) {
      return true
    }
    const draft = splitDraft.value
    return Boolean(draft && draft.wallId === wall.wallId && draft.floorIndex === wall.floorIndex)
  }

  function slabSelected(floorIndex: number): boolean {
    const target = settingsTarget.value
    return target?.kind === 'slab' && target.floorIndex === floorIndex
  }

  function roofSelected(id: string): boolean {
    const target = settingsTarget.value
    return target?.kind === 'roof' && target.id === id
  }

  function junctionSelected(id: string): boolean {
    const target = settingsTarget.value
    return target?.kind === 'junction' && target.id === id
  }

  // --- Fill/stroke color helpers ---
  function wallBodyFill(): string {
    return architectStyle.value ? ARCHITECT_AREA_FILL : '#94a3b8'
  }

  function ridgeEndFill(): string {
    return architectStyle.value ? ARCHITECT_AREA_FILL : '#7b8ea6'
  }

  function bandBodyFill(kind: 'slab' | 'nok'): string {
    if (architectStyle.value) return ARCHITECT_AREA_FILL
    return kind === 'nok' ? '#cbd5e1' : '#e2e8f0'
  }

  function roofBodyFill(color: string): string {
    return architectStyle.value ? ARCHITECT_AREA_FILL : color
  }

  function wallOuterStroke(): string {
    return lineStyle.value ? elevLineColor.value : '#334155'
  }

  function wallInnerStroke(): string {
    return lineStyle.value ? elevLineColor.value : '#0f172a'
  }

  function roofOuterStroke(): string {
    return wallOuterStroke()
  }

  function roofRingPoints(plane: ElevationRoofPlane): ReadonlyArray<Point2D> {
    return plane.fillPoints.length >= 3 ? plane.fillPoints : plane.points
  }

  function openingGhostFill(openingId: string, type: 'door' | 'window'): string | undefined {
    if (architectStyle.value) return ARCHITECT_AREA_FILL
    if (selectedOpeningId.value === openingId) return '#f97316'
    return type === 'door' ? '#f59e0b' : '#38bdf8'
  }

  function openingGhostOpacity(openingId: string): number {
    if (architectStyle.value) return 1
    return selectedOpeningId.value === openingId ? 0.55 : 0.08
  }

  function glyphStrokeColor(transom: boolean): string {
    if (architectStyle.value) return elevLineColor.value
    return transom ? '#14532d' : '#0c4a6e'
  }

  function glyphPolyFill(
    role: string,
    transom: boolean,
    type: 'door' | 'window',
    filled: boolean,
  ): string | undefined {
    if (!filled) return undefined
    if (architectStyle.value) return ARCHITECT_AREA_FILL
    return glyphFill(role, transom, type)
  }

  // --- Measure lines ---
  function elevationStoreyFloorY(floorIndex: number): number {
    return -floorWallBaseWorldZ(props.plan, floorIndex)
  }

  function cmToScreen(x: number, y: number): Point2D {
    const stage = layoutXform.value.toStagePoint(x, y)
    return {
      x: viewPosition.value.x + stage.x * viewScale.value,
      y: viewPosition.value.y + stage.y * viewScale.value,
    }
  }

  function screenToCm(screenX: number, screenY: number): Point2D {
    const local = {
      x: (screenX - viewPosition.value.x) / viewScale.value,
      y: (screenY - viewPosition.value.y) / viewScale.value,
    }
    return layoutXform.value.toCmPoint(local.x, local.y)
  }

  return {
    // Projection
    elevation,
    groups,
    planSideLabels,
    planSideLabelMarks,
    // Viewport
    viewport,
    stageSize,
    viewScale,
    viewPosition,
    contentLayout,
    resetView,
    mountResizeObserver,
    unmountResizeObserver,
    layoutXform,
    layoutScale,
    // Underlay
    underlayImage,
    underlayConfig,
    // Paint
    elevationPlanes,
    openingGlyphs,
    innerStrokes,
    // Stage helpers
    stageRect,
    stageWallPoly,
    stageWallFillPath,
    stagePoly,
    stagePoints,
    openingGhostStage,
    // Strokes
    elevStroke,
    elevStrokeHeavy,
    elevHighlightStroke,
    elevDash,
    roofVertexHitTolCm,
    // Fill/stroke
    architectStyle,
    lineStyle,
    elevLineColor,
    wallBodyFill,
    ridgeEndFill,
    bandBodyFill,
    roofBodyFill,
    wallOuterStroke,
    wallInnerStroke,
    roofOuterStroke,
    roofRingPoints,
    openingGhostFill,
    openingGhostOpacity,
    glyphStrokeColor,
    glyphPolyFill,
    glyphOpacity,
    // Selection paint
    wallOrRidgeSelected,
    slabSelected,
    roofSelected,
    junctionSelected,
    // Measure
    elevationStoreyFloorY,
    cmToScreen,
    screenToCm,
    // Constants
    ELEVATION_PLAN_SIDE_GAP_CM,
    FML_PLAN_HANDLE_RADIUS_PX,
  }
}

export type ElevationRenderModel = ReturnType<typeof useFmlElevationRenderModel>
