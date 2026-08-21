/**
 * Stap-2: groei de werk-onderlegger met wit als de stempel buiten de scan valt.
 * Verschuift linialen, LBE-refs, masks en nulpunt mee (px-dichtheid blijft).
 */
import type { Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import { canvasToDataUrl } from '@/cv/tools/maskImage'
import { INK_OVERLAY_NONE } from '@/cv/preprocess/compose-wall-bw'
import {
  canvasPadIsEmpty,
  computeStampOverflowPad,
  padHtmlCanvasWhite,
  paddedCanvasSize,
  paddedSizeExceedsMax,
  padPlaneIfSized,
  translateNulpuntImageCm,
  type CanvasPad,
} from '@/cv/preprocess/stamp-underlay-pad'
import { imageSourceToCanvas, transformHScaleState } from './imageUtils'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { SelectionRect } from '@/platform/selection'
import type { OcrTextCandidate } from '@/core/extraction'
import { tGlobal } from '@/ui/i18n'
import type { WorkspaceWallStamp } from './useWallStamp'
import type { WorkspaceWallBwCompose } from './useWorkspaceWallBwCompose'
import type { useWorkspaceImage } from './useWorkspaceImage'

export type ExpandUnderlayForStampResult = 'none' | 'expanded' | 'too-large' | 'failed'

export async function expandUnderlayForStamp(deps: {
  originalImageEl: Ref<HTMLImageElement | null>
  imageName: Ref<string | null>
  setImageSource: (src: string, name: string) => void
  image: ReturnType<typeof useWorkspaceImage>
  wallStamp: WorkspaceWallStamp
  wallBw: WorkspaceWallBwCompose
  scale: ReturnType<typeof useHScaleCalibration>
  rects: Ref<SelectionRect[]>
  eraserMask: Ref<Uint8Array | null>
  ocrMask: Ref<Uint8Array | null>
  ocrMaskedRegions: Ref<OcrTextCandidate[]>
  getFmlNulpuntImageCm: () => Point2D | null
  setFmlNulpuntImageCm: (point: Point2D | null) => void
  publishWallBwUnderlay: () => Promise<void>
}): Promise<ExpandUnderlayForStampResult> {
  const img = deps.originalImageEl.value
  const live = deps.wallStamp.bounds.value
  if (!img?.complete || !live) return 'none'
  const oldW = img.naturalWidth
  const oldH = img.naturalHeight
  if (!(oldW > 0) || !(oldH > 0)) return 'none'

  const pad = computeStampOverflowPad(live, oldW, oldH)
  if (canvasPadIsEmpty(pad)) return 'none'
  if (paddedSizeExceedsMax(oldW, oldH, pad)) {
    deps.wallStamp.error.value = tGlobal('preprocess.stampErrors.underlayPadTooLarge')
    return 'too-large'
  }

  const eraserSnap = deps.eraserMask.value
  const ocrSnap = deps.ocrMask.value
  const inkSnap = deps.wallBw.inkOverlay.value
  const bakedInkSnap = deps.wallBw.bakedInkOverlay.value
  const next = paddedCanvasSize(oldW, oldH, pad)

  try {
    const padded = padHtmlCanvasWhite(imageSourceToCanvas(img), pad)
    const dataUrl = canvasToDataUrl(padded)
    const name = deps.imageName.value ?? 'onderlegger.png'
    deps.image.prepareExactImageSrcLoad()
    deps.setImageSource(dataUrl, name)
    await deps.image.loadExactWorkingImage(dataUrl)
  } catch (err) {
    deps.wallStamp.error.value =
      err instanceof Error ? err.message : tGlobal('preprocess.stampErrors.underlayPadFailed')
    return 'failed'
  }

  applyPadToPixelState(deps, pad, oldW, oldH, next, {
    eraserSnap,
    ocrSnap,
    inkSnap,
    bakedInkSnap,
  })

  await deps.wallBw.rebuildBaseWallBw({ force: true })
  await deps.publishWallBwUnderlay()
  return 'expanded'
}

function applyPadToPixelState(
  deps: {
    wallStamp: WorkspaceWallStamp
    wallBw: WorkspaceWallBwCompose
    scale: ReturnType<typeof useHScaleCalibration>
    rects: Ref<SelectionRect[]>
    eraserMask: Ref<Uint8Array | null>
    ocrMask: Ref<Uint8Array | null>
    ocrMaskedRegions: Ref<OcrTextCandidate[]>
    getFmlNulpuntImageCm: () => Point2D | null
    setFmlNulpuntImageCm: (point: Point2D | null) => void
  },
  pad: CanvasPad,
  oldW: number,
  oldH: number,
  next: { width: number; height: number },
  snaps: {
    eraserSnap: Uint8Array | null
    ocrSnap: Uint8Array | null
    inkSnap: Uint8Array | null
    bakedInkSnap: Uint8Array | null
  },
): void {
  deps.eraserMask.value = padPlaneIfSized(snaps.eraserSnap, oldW, oldH, pad, 0)
  deps.ocrMask.value = padPlaneIfSized(snaps.ocrSnap, oldW, oldH, pad, 0)
  const paddedInk = padPlaneIfSized(snaps.inkSnap, oldW, oldH, pad, INK_OVERLAY_NONE)
  const paddedBaked = padPlaneIfSized(snaps.bakedInkSnap, oldW, oldH, pad, INK_OVERLAY_NONE)
  if (paddedInk) deps.wallBw.inkOverlay.value = paddedInk
  if (paddedBaked) deps.wallBw.bakedInkOverlay.value = paddedBaked

  deps.wallStamp.applyCanvasPad(pad, oldW, oldH)

  if (deps.scale.state.value) {
    deps.scale.state.value = transformHScaleState(
      deps.scale.state.value,
      { offsetX: -pad.left, offsetY: -pad.top, scale: 1 },
      next.width,
      next.height,
    )
  }

  deps.rects.value = deps.rects.value.map((rect) => ({
    ...rect,
    x: rect.x + pad.left,
    y: rect.y + pad.top,
  }))
  deps.ocrMaskedRegions.value = deps.ocrMaskedRegions.value.map((region) => ({
    ...region,
    x: region.x + pad.left,
    y: region.y + pad.top,
  }))

  const nulpunt = deps.getFmlNulpuntImageCm()
  const pxPerMmX = deps.scale.pixelsPerMillimeterX.value
  const pxPerMmY = deps.scale.pixelsPerMillimeterY.value
  if (nulpunt && pxPerMmX > 0 && pxPerMmY > 0) {
    deps.setFmlNulpuntImageCm(translateNulpuntImageCm(nulpunt, pad, pxPerMmX, pxPerMmY))
  }
}
