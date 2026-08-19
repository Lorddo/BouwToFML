import type { ComputedRef, Ref } from 'vue'
import type Konva from 'konva'
import type { FloorItem, Point2D, Wall } from '@/core/fml/types'
import { normalizeCmBBox } from './fml-preview-wall-select'
import type { ContentLayout } from './useFmlPreviewViewport'
import type {
  RenderArea,
  RenderDoorGroup,
  RenderFixture,
  RenderJunction,
  RenderLabel,
  RenderLine,
  RenderSurface,
  RenderWindowOpening,
} from './useFmlPreviewRenderModel'

interface ViewportApi {
  contentLayout: Ref<ContentLayout | null>
  viewScale: Ref<number>
  viewPosition: Ref<{ x: number; y: number }>
  renderTransform: ComputedRef<{
    toStagePoint: (x: number, y: number) => { x: number; y: number }
    toCmPoint: (x: number, y: number) => { x: number; y: number }
  }>
}

function distancePointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersects) inside = !inside
  }
  return inside
}

type OpeningHitTarget = Pick<
  RenderDoorGroup | RenderWindowOpening,
  'id' | 'hitPoints' | 'gapPoints'
>

export function useFmlPreviewHitTest(
  viewport: ViewportApi,
  walls: ComputedRef<Wall[]>,
  renderJunctions: ComputedRef<RenderJunction[]>,
  renderDoorGroups: ComputedRef<RenderDoorGroup[]>,
  containerRef: Ref<HTMLDivElement | null>,
  stageRef: Ref<{ getNode: () => Konva.Stage } | null>,
  renderWindows?: ComputedRef<RenderWindowOpening[]>,
  renderAreas?: ComputedRef<RenderArea[]>,
  renderSurfaces?: ComputedRef<RenderSurface[]>,
  renderLabels?: ComputedRef<RenderLabel[]>,
  renderLines?: ComputedRef<RenderLine[]>,
  items?: ComputedRef<FloorItem[]>,
  coarseHits?: ComputedRef<boolean> | Ref<boolean>,
  renderFixtures?: ComputedRef<RenderFixture[]>,
) {
  function hitPx(fine: number, coarse: number): number {
    return coarseHits?.value === true ? coarse : fine
  }

  function screenPxToCmTolerance(px: number): number {
    const layout = viewport.contentLayout.value
    if (!layout) return 10
    return px / layout.scale / viewport.viewScale.value
  }

  function hitTestWallAtCm(cm: Point2D): string | null {
    const wallList = walls.value
    if (wallList.length === 0) return null
    const tol = screenPxToCmTolerance(hitPx(16, 32))
    let bestId: string | null = null
    let bestDist = Number.POSITIVE_INFINITY
    wallList.forEach((wall, index) => {
      const id = wall.id || `wall-${index}`
      const dist = distancePointToSegment(cm, wall.a, wall.b)
      const hitDist = Math.max(0, dist - wall.thickness / 2)
      if (hitDist <= tol && hitDist < bestDist) {
        bestId = id
        bestDist = hitDist
      }
    })
    return bestId
  }

  function hitTestJunctionAtCm(cm: Point2D): RenderJunction | null {
    const tol = screenPxToCmTolerance(hitPx(18, 32))
    let best: RenderJunction | null = null
    let bestDist = tol
    for (const junction of renderJunctions.value) {
      const dist = Math.hypot(junction.cmX - cm.x, junction.cmY - cm.y)
      if (dist <= bestDist) {
        best = junction
        bestDist = dist
      }
    }
    return best
  }

  function hitTestOpeningTargetsAtCm(cm: Point2D, targets: OpeningHitTarget[]): string | null {
    if (targets.length === 0) return null
    const tol = screenPxToCmTolerance(hitPx(16, 32))
    let bestId: string | null = null
    let bestScore = Number.POSITIVE_INFINITY

    for (const target of targets) {
      if (target.hitPoints.length < 4 || target.gapPoints.length < 6) continue
      const a = viewport.renderTransform.value.toCmPoint(target.hitPoints[0], target.hitPoints[1])
      const b = viewport.renderTransform.value.toCmPoint(target.hitPoints[2], target.hitPoints[3])
      const polygon: Point2D[] = []
      for (let idx = 0; idx + 1 < target.gapPoints.length; idx += 2) {
        polygon.push(
          viewport.renderTransform.value.toCmPoint(
            target.gapPoints[idx],
            target.gapPoints[idx + 1],
          ),
        )
      }

      if (pointInPolygon(cm, polygon)) {
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const score = Math.hypot(cm.x - center.x, cm.y - center.y)
        if (score < bestScore) {
          bestId = target.id
          bestScore = score
        }
        continue
      }

      const dist = distancePointToSegment(cm, a, b)
      if (dist <= tol && dist < bestScore) {
        bestId = target.id
        bestScore = dist
      }
    }

    return bestId
  }

  function hitTestDoorAtCm(cm: Point2D): string | null {
    return hitTestOpeningTargetsAtCm(cm, renderDoorGroups.value)
  }

  function hitTestOpeningAtCm(cm: Point2D): string | null {
    const doors = renderDoorGroups.value
    const windows = renderWindows?.value ?? []
    return hitTestOpeningTargetsAtCm(cm, [...doors, ...windows])
  }

  function clientToCm(clientX: number, clientY: number): Point2D | null {
    const container = containerRef.value
    if (!container) return null
    const rect = container.getBoundingClientRect()
    const stageX = clientX - rect.left
    const stageY = clientY - rect.top
    const localX = (stageX - viewport.viewPosition.value.x) / viewport.viewScale.value
    const localY = (stageY - viewport.viewPosition.value.y) / viewport.viewScale.value
    return viewport.renderTransform.value.toCmPoint(localX, localY)
  }

  function containerPointToCm(containerX: number, containerY: number): Point2D | null {
    const container = containerRef.value
    if (!container) return null
    const rect = container.getBoundingClientRect()
    return clientToCm(rect.left + containerX, rect.top + containerY)
  }

  function containerRectToCmBBox(rect: {
    x: number
    y: number
    width: number
    height: number
  }): { x: number; y: number; width: number; height: number } | null {
    const n = normalizeCmBBox(rect)
    const tl = containerPointToCm(n.x, n.y)
    const br = containerPointToCm(n.x + n.width, n.y + n.height)
    if (!tl || !br) return null
    return {
      x: Math.min(tl.x, br.x),
      y: Math.min(tl.y, br.y),
      width: Math.abs(br.x - tl.x),
      height: Math.abs(br.y - tl.y),
    }
  }

  function pointerToCm(evt?: MouseEvent | TouchEvent): Point2D | null {
    if (evt && 'clientX' in evt) {
      return clientToCm(evt.clientX, evt.clientY)
    }
    const stage = stageRef.value?.getNode()
    if (!stage) return null
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    const localX = (pointer.x - viewport.viewPosition.value.x) / viewport.viewScale.value
    const localY = (pointer.y - viewport.viewPosition.value.y) / viewport.viewScale.value
    return viewport.renderTransform.value.toCmPoint(localX, localY)
  }

  function hitTestSurfaceAtCm(cm: Point2D): string | null {
    const list = renderSurfaces?.value ?? []
    // Top-most last drawn wins — reverse scan
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (pointInPolygon(cm, list[i].polyCm)) return list[i].id
    }
    return null
  }

  function hitTestAreaAtCm(cm: Point2D): string | null {
    const list = renderAreas?.value ?? []
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (pointInPolygon(cm, list[i].polyCm)) return list[i].id
    }
    return null
  }

  function hitTestItemAtCm(cm: Point2D): string | null {
    const drawn = renderFixtures?.value ?? []
    const tol = screenPxToCmTolerance(hitPx(4, 8))
    const toStage = viewport.renderTransform.value.toStagePoint
    if (drawn.length > 0) {
      let bestId: string | null = null
      let bestDist = Number.POSITIVE_INFINITY
      const stage = toStage(cm.x, cm.y)
      for (let i = drawn.length - 1; i >= 0; i -= 1) {
        const fixture = drawn[i]
        const scaleX = fixture.scaleX || 1
        const scaleY = fixture.scaleY || 1
        const rad = (-fixture.rotationDeg * Math.PI) / 180
        const dx = stage.x - fixture.x
        const dy = stage.y - fixture.y
        const localX = (dx * Math.cos(rad) - dy * Math.sin(rad)) / scaleX
        const localY = (dx * Math.sin(rad) + dy * Math.cos(rad)) / scaleY
        if (
          localX < fixture.localX - tol ||
          localY < fixture.localY - tol ||
          localX > fixture.localX + fixture.localWidth + tol ||
          localY > fixture.localY + fixture.localHeight + tol
        ) {
          continue
        }
        const dist = Math.hypot(
          localX - (fixture.localX + fixture.localWidth / 2),
          localY - (fixture.localY + fixture.localHeight / 2),
        )
        if (dist < bestDist) {
          bestId = fixture.id
          bestDist = dist
        }
      }
      return bestId
    }

    const list = items?.value ?? []
    if (list.length === 0) return null
    let bestId: string | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const item of list) {
      const guid = item.guid?.trim()
      if (!guid) continue
      const rot = ((item.rotation ?? 0) * Math.PI) / 180
      const dx = cm.x - item.x
      const dy = cm.y - item.y
      const localX = dx * Math.cos(-rot) - dy * Math.sin(-rot)
      const localY = dx * Math.sin(-rot) + dy * Math.cos(-rot)
      const hw = Math.max(0, item.width) / 2 + tol
      const hh = Math.max(0, item.height) / 2 + tol
      if (Math.abs(localX) > hw || Math.abs(localY) > hh) continue
      const dist = Math.hypot(localX, localY)
      if (dist < bestDist) {
        bestId = guid
        bestDist = dist
      }
    }
    return bestId
  }

  function hitTestLabelAtCm(cm: Point2D): string | null {
    const list = renderLabels?.value ?? []
    const tol = screenPxToCmTolerance(hitPx(20, 28))
    let bestId: string | null = null
    let bestDist = tol
    for (const label of list) {
      const dist = Math.hypot(label.cmX - cm.x, label.cmY - cm.y)
      if (dist <= bestDist) {
        bestId = label.id
        bestDist = dist
      }
    }
    return bestId
  }

  function hitTestLineAtCm(cm: Point2D): string | null {
    const list = renderLines?.value ?? []
    const tol = screenPxToCmTolerance(hitPx(12, 20))
    let bestId: string | null = null
    let bestDist = tol
    for (const line of list) {
      const dist = distancePointToSegment(cm, line.aCm, line.bCm)
      if (dist <= bestDist) {
        bestId = line.id
        bestDist = dist
      }
    }
    return bestId
  }

  return {
    screenPxToCmTolerance,
    hitTestWallAtCm,
    hitTestDoorAtCm,
    hitTestOpeningAtCm,
    hitTestJunctionAtCm,
    hitTestItemAtCm,
    hitTestSurfaceAtCm,
    hitTestAreaAtCm,
    hitTestLabelAtCm,
    hitTestLineAtCm,
    clientToCm,
    containerPointToCm,
    containerRectToCmBBox,
    pointerToCm,
  }
}
