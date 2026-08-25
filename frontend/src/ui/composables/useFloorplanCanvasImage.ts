import { ref, watch } from 'vue'
import type Konva from 'konva'
import { isCanvasLike } from '@/cv/port/canvasEnv'
import type { ViewportTransform } from '@/ui/components/canvas/canvas-guide-grid'
import { readStageViewport } from '@/ui/components/canvas/canvas-guide-grid'

export type FloorplanRasterOverlaySrc = CanvasImageSource | string | null | undefined

function isRasterImageSource(src: FloorplanRasterOverlaySrc): src is CanvasImageSource {
  if (!src || typeof src === 'string') return false
  return isCanvasLike(src) || (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap)
}

export function useFloorplanCanvasImage(deps: {
  imageSrc: () => string | undefined
  rasterOverlaySrc: () => FloorplanRasterOverlaySrc
  rasterOverlayRevision?: () => number
  getStage: () => Konva.Stage | undefined
  fitToScreen: (stage: Konva.Stage, width: number, height: number) => void
  onImageLoaded: (width: number, height: number) => void
}) {
  const imageObj = ref<HTMLImageElement | null>(null)
  const rasterOverlayObj = ref<CanvasImageSource | null>(null)
  /** Alleen ophogen bij nieuwe string-URL (decode); canvas in-place gebruikt revision + batchDraw. */
  const rasterOverlayKey = ref(0)
  const imgSize = ref({ w: 800, h: 600 })
  const stageScale = ref(1)
  const stageViewport = ref<ViewportTransform>({ x: 0, y: 0, scale: 1 })
  let rasterOverlayLoadGen = 0

  function syncStageViewport() {
    const stage = deps.getStage()
    if (!stage) return
    const next = readStageViewport(stage)
    stageScale.value = next.scale
    stageViewport.value = next
  }

  watch(
    deps.imageSrc,
    (src) => {
      if (!src) return
      const prevSize = { ...imgSize.value }
      const hadImage = !!imageObj.value
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        imageObj.value = img
        imgSize.value = { w: img.naturalWidth, h: img.naturalHeight }
        deps.onImageLoaded(img.naturalWidth, img.naturalHeight)
        const stage = deps.getStage()
        if (stage) {
          const sameSize =
            hadImage && prevSize.w === img.naturalWidth && prevSize.h === img.naturalHeight
          if (!sameSize) {
            deps.fitToScreen(stage, img.naturalWidth, img.naturalHeight)
            syncStageViewport()
          }
        }
      }
      img.src = src
    },
    { immediate: true },
  )

  function redrawRasterOverlay() {
    const stage = deps.getStage()
    if (!stage) return
    const node = stage.findOne('.rasterOverlay')
    if (node && typeof node.isCached === 'function' && node.isCached()) {
      node.clearCache()
    }
    const layer = node && typeof node.getLayer === 'function' ? node.getLayer() : null
    if (layer) {
      layer.batchDraw()
      return
    }
    stage.batchDraw()
  }

  watch(
    [deps.rasterOverlaySrc, () => deps.rasterOverlayRevision?.() ?? 0],
    ([src]) => {
      rasterOverlayLoadGen += 1
      const loadGen = rasterOverlayLoadGen
      if (!src) {
        rasterOverlayObj.value = null
        return
      }

      if (isRasterImageSource(src)) {
        rasterOverlayObj.value = src
        redrawRasterOverlay()
        return
      }

      if (typeof src !== 'string') {
        rasterOverlayObj.value = null
        return
      }

      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (loadGen !== rasterOverlayLoadGen) return
        rasterOverlayObj.value = img
        rasterOverlayKey.value += 1
        deps.getStage()?.batchDraw()
      }
      img.onerror = () => {
        if (loadGen !== rasterOverlayLoadGen) return
        rasterOverlayObj.value = null
      }
      img.src = src
    },
    { immediate: true },
  )

  function fit() {
    const stage = deps.getStage()
    if (stage && imageObj.value) {
      deps.fitToScreen(stage, imageObj.value.naturalWidth, imageObj.value.naturalHeight)
      syncStageViewport()
    }
  }

  /** Zoom around stage center (same factor as FML topbar ±). */
  function zoomBy(factor: number) {
    const stage = deps.getStage()
    if (!stage) return
    const oldScale = stage.scaleX()
    const next = Math.max(0.05, Math.min(20, oldScale * factor))
    const center = {
      x: stage.width() / 2,
      y: stage.height() / 2,
    }
    const mousePointTo = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    }
    stage.scale({ x: next, y: next })
    stage.position({
      x: center.x - mousePointTo.x * next,
      y: center.y - mousePointTo.y * next,
    })
    syncStageViewport()
  }

  return {
    imageObj,
    rasterOverlayObj,
    rasterOverlayKey,
    imgSize,
    stageScale,
    stageViewport,
    syncStageViewport,
    fit,
    zoomBy,
  }
}
