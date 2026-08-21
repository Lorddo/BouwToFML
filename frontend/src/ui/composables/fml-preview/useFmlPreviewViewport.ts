import { computed, ref, watch, type Ref } from 'vue'
import type { FloorItem, Point2D, Wall } from '@/core/fml/types'
import {
  FIT_CONTENT_PAD,
  layoutInFitInsets,
  measureFitChromeInsets,
} from '@/platform/canvas/fit-chrome-insets'

/** Leeg plan zonder onderlegger: tekenwereld zodat 1 cm ≠ 1 stage-px. */
const EMPTY_WORLD_SPAN_X = 2000
const EMPTY_WORLD_SPAN_Y = 1500

export type ExtraContentBounds = {
  minX: number
  minY: number
  spanX: number
  spanY: number
}

export interface ContentLayout {
  minX: number
  minY: number
  spanX: number
  spanY: number
  scale: number
  offsetX: number
  offsetY: number
}

function contentBounds(
  walls: Wall[],
  items: FloorItem[] = [],
): { minX: number; minY: number; spanX: number; spanY: number } {
  const points = walls.flatMap((wall) => [wall.a, wall.b])
  for (const item of items) {
    const halfW = Math.max(0, item.width) / 2
    const halfH = Math.max(0, item.height) / 2
    points.push({ x: item.x - halfW, y: item.y - halfH }, { x: item.x + halfW, y: item.y + halfH })
  }
  const minX = Math.min(...points.map((p) => p.x))
  const minY = Math.min(...points.map((p) => p.y))
  const maxX = Math.max(...points.map((p) => p.x))
  const maxY = Math.max(...points.map((p) => p.y))
  return {
    minX,
    minY,
    spanX: Math.max(1, maxX - minX),
    spanY: Math.max(1, maxY - minY),
  }
}

export function layoutTransform(layout: ContentLayout) {
  return {
    toStagePoint(x: number, y: number) {
      return {
        x: layout.offsetX + (x - layout.minX) * layout.scale,
        y: layout.offsetY + (y - layout.minY) * layout.scale,
      }
    },
    toCmPoint(stageX: number, stageY: number): Point2D {
      return {
        x: layout.minX + (stageX - layout.offsetX) / layout.scale,
        y: layout.minY + (stageY - layout.offsetY) / layout.scale,
      }
    },
  }
}

/** true als `bounds` buiten de huidige fit-world valt (import/generate/onderlegger groter). */
export function worldOverflowsLayout(
  layout: ContentLayout,
  bounds: ExtraContentBounds,
  padCm = 1,
): boolean {
  return (
    bounds.minX < layout.minX - padCm ||
    bounds.minY < layout.minY - padCm ||
    bounds.minX + bounds.spanX > layout.minX + layout.spanX + padCm ||
    bounds.minY + bounds.spanY > layout.minY + layout.spanY + padCm
  )
}

function mergeBounds(
  a: ExtraContentBounds | null,
  b: ExtraContentBounds | null,
): ExtraContentBounds | null {
  if (!a) return b
  if (!b) return a
  const minX = Math.min(a.minX, b.minX)
  const minY = Math.min(a.minY, b.minY)
  const maxX = Math.max(a.minX + a.spanX, b.minX + b.spanX)
  const maxY = Math.max(a.minY + a.spanY, b.minY + b.spanY)
  return { minX, minY, spanX: Math.max(1, maxX - minX), spanY: Math.max(1, maxY - minY) }
}

export function useFmlPreviewViewport(
  containerRef: Ref<HTMLDivElement | null>,
  walls: Ref<Wall[]>,
  items: Ref<FloorItem[]> = ref([]),
  extraBounds: Ref<ExtraContentBounds | null> = ref(null),
) {
  const stageSize = ref({ width: 960, height: 640 })
  const viewScale = ref(1)
  const viewPosition = ref({ x: 0, y: 0 })
  const contentLayout = ref<ContentLayout | null>(null)

  let resizeObserver: ResizeObserver | null = null

  function resolveBounds(wallList: Wall[], itemList: FloorItem[]): ExtraContentBounds {
    const extra = extraBounds.value
    const extraOk = extra && extra.spanX > 0 && extra.spanY > 0 ? extra : null
    const hasGeom = wallList.length > 0 || itemList.length > 0
    const geom = hasGeom ? contentBounds(wallList, itemList) : null
    return (
      mergeBounds(geom, extraOk) ?? {
        minX: 0,
        minY: 0,
        spanX: EMPTY_WORLD_SPAN_X,
        spanY: EMPTY_WORLD_SPAN_Y,
      }
    )
  }

  function buildContentLayout(wallList: Wall[], itemList: FloorItem[]): ContentLayout {
    const { minX, minY, spanX, spanY } = resolveBounds(wallList, itemList)
    const insets = measureFitChromeInsets(containerRef.value, FIT_CONTENT_PAD)
    const fitted = layoutInFitInsets(
      stageSize.value.width,
      stageSize.value.height,
      spanX,
      spanY,
      insets,
    )
    return {
      minX,
      minY,
      spanX,
      spanY,
      scale: fitted.scale,
      offsetX: fitted.x,
      offsetY: fitted.y,
    }
  }

  function refitContentLayout(): void {
    contentLayout.value = buildContentLayout(walls.value, items.value)
  }

  /**
   * Na nulpunt-translate: schuif de content-layout mee i.p.v. herfitten.
   * Zo blijft de tekening op het scherm staan (alleen FML-(0,0) verandert).
   */
  function nudgeContentLayout(dxCm: number, dyCm: number): void {
    const current = contentLayout.value
    if (!current) {
      refitContentLayout()
      return
    }
    contentLayout.value = {
      ...current,
      minX: current.minX + dxCm,
      minY: current.minY + dyCm,
    }
  }

  function ensureContentLayout(): void {
    if (!contentLayout.value) refitContentLayout()
  }

  function updateStageSize(): void {
    const container = containerRef.value
    if (!container) return
    const width = Math.max(360, Math.floor(container.clientWidth))
    const height = Math.max(320, Math.floor(container.clientHeight))
    const sizeChanged = width !== stageSize.value.width || height !== stageSize.value.height
    stageSize.value = { width, height }
    // Alleen herfitten bij echte container-resize of ontbrekende layout —
    // niet bij elke ResizeObserver-callback na muur-edit (dat voelt als uitzoomen).
    if (sizeChanged || !contentLayout.value) {
      refitContentLayout()
    }
  }

  function resetView(): void {
    refitContentLayout()
    viewScale.value = 1
    viewPosition.value = { x: 0, y: 0 }
  }

  function worldOverflowsCurrentLayout(): boolean {
    const layout = contentLayout.value
    if (!layout) return true
    return worldOverflowsLayout(layout, resolveBounds(walls.value, items.value))
  }

  const renderTransform = computed(() => {
    const layout = contentLayout.value
    if (!layout) {
      return {
        toStagePoint: (x: number, y: number) => ({ x, y }),
        toCmPoint: (x: number, y: number) => ({ x, y }),
      }
    }
    return layoutTransform(layout)
  })

  watch(extraBounds, (next, prev) => {
    if (!next || next.spanX <= 0 || next.spanY <= 0) return
    const appeared = !prev || prev.spanX <= 0 || prev.spanY <= 0
    if (!appeared) return
    // Onderlegger komt later binnen dan muren: herfit alleen als die de world vergroot.
    if (!contentLayout.value || worldOverflowsCurrentLayout()) resetView()
  })

  function mountResizeObserver(): void {
    updateStageSize()
    const container = containerRef.value
    if (!container) return
    resizeObserver = new ResizeObserver(() => updateStageSize())
    resizeObserver.observe(container)
  }

  function unmountResizeObserver(): void {
    if (resizeObserver && containerRef.value) {
      resizeObserver.unobserve(containerRef.value)
    }
    resizeObserver = null
  }

  return {
    stageSize,
    viewScale,
    viewPosition,
    contentLayout,
    renderTransform,
    refitContentLayout,
    nudgeContentLayout,
    ensureContentLayout,
    resetView,
    worldOverflowsCurrentLayout,
    updateStageSize,
    mountResizeObserver,
    unmountResizeObserver,
  }
}
