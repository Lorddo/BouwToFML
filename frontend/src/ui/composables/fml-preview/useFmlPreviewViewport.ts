import { computed, ref, type Ref } from 'vue'
import type { FloorItem, Point2D, Wall } from '@/core/fml/types'

const CONTENT_PADDING = 24

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

export function useFmlPreviewViewport(
  containerRef: Ref<HTMLDivElement | null>,
  walls: Ref<Wall[]>,
  items: Ref<FloorItem[]> = ref([]),
) {
  const stageSize = ref({ width: 960, height: 640 })
  const viewScale = ref(1)
  const viewPosition = ref({ x: 0, y: 0 })
  const contentLayout = ref<ContentLayout | null>(null)

  let resizeObserver: ResizeObserver | null = null

  function buildContentLayout(wallList: Wall[], itemList: FloorItem[]): ContentLayout | null {
    if (wallList.length === 0) return null
    const { minX, minY, spanX, spanY } = contentBounds(wallList, itemList)
    const availableW = Math.max(1, stageSize.value.width - CONTENT_PADDING * 2)
    const availableH = Math.max(1, stageSize.value.height - CONTENT_PADDING * 2)
    const scale = Math.min(availableW / spanX, availableH / spanY)
    const contentW = spanX * scale
    const contentH = spanY * scale
    return {
      minX,
      minY,
      spanX,
      spanY,
      scale,
      offsetX: CONTENT_PADDING + (availableW - contentW) / 2,
      offsetY: CONTENT_PADDING + (availableH - contentH) / 2,
    }
  }

  function refitContentLayout(): void {
    contentLayout.value = buildContentLayout(walls.value, items.value)
  }

  function ensureContentLayout(): void {
    if (walls.value.length === 0) {
      contentLayout.value = null
      return
    }
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
    if (walls.value.length > 0 && (sizeChanged || !contentLayout.value)) {
      refitContentLayout()
    }
  }

  function resetView(): void {
    refitContentLayout()
    viewScale.value = 1
    viewPosition.value = { x: 0, y: 0 }
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
    ensureContentLayout,
    resetView,
    updateStageSize,
    mountResizeObserver,
    unmountResizeObserver,
  }
}
