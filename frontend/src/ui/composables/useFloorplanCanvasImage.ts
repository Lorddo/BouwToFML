import { ref, watch } from 'vue'
import type Konva from 'konva'
import { isCanvasLike } from '@/cv/port/canvasEnv'

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
  let rasterOverlayLoadGen = 0

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
            stageScale.value = Math.max(0.01, stage.scaleX())
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
      stageScale.value = Math.max(0.01, stage.scaleX())
    }
  }

  return { imageObj, rasterOverlayObj, rasterOverlayKey, imgSize, stageScale, fit }
}
