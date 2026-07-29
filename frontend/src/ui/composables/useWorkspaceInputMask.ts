import { ref, computed, type Ref } from 'vue'
import { createEraserMask, applyBrushStroke, applyPolygonErase, applyIncludeCropToMask, applyRectRegionsToMask } from '@/cv/tools/eraser'
import type { OcrTextCandidate } from '@/core/extraction'
import { bakeMaskIntoCanvas, canvasToDataUrl } from '@/cv/tools/maskImage'
import { createByteArrayHistory } from '@/cv/tools/maskHistory'
import type { PolygonPoint, PolygonToolMode } from '@/cv/tools/polygon'
import { maskHasInk } from '@/cv/tools/polygon'
import { yieldToMain } from '@/platform/image'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import type { WorkspaceFlowStep } from './workspace/constants'
import { isUndoKey } from './workspace/isUndoKey'

export function useWorkspaceInputMask(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  inputTab: Ref<'origineel'>
  originalImageEl: Ref<HTMLImageElement | null>
  preprocessPreview: { clearPreview: () => void; clearOcrPreview: () => void }
  onMaskChanged?: () => void
  onOcrMaskChanged?: () => void
  imageDimensions: (img: HTMLImageElement | HTMLCanvasElement) => { width: number; height: number }
}) {
  const maskedWorkingCanvas = ref<HTMLCanvasElement | null>(null)
  const maskedWorkingSrc = ref<string | null>(null)
  const maskHistory = createByteArrayHistory({ maxSteps: 40 })
  const canUndoMask = ref(false)
  const eraserMask = ref<Uint8Array | null>(null)
  const ocrMask = ref<Uint8Array | null>(null)
  const ocrMaskedRegions = ref<OcrTextCandidate[]>([])
  const eraserTouched = ref(false)
  const eraserEnabled = ref(false)
  const polygonEraserEnabled = ref(false)
  const cropIncludeEnabled = ref(false)
  const polygonToolMode = ref<PolygonToolMode>(null)
  const polygonDraftPoints = ref<PolygonPoint[]>([])
  const eraserRadius = ref(10)

  const canvasEraserEnabled = computed(
    () => deps.flowStep.value === 'input' && deps.inputTab.value === 'origineel' && eraserEnabled.value,
  )
  const canvasPolygonToolMode = computed(() =>
    deps.flowStep.value === 'input' && deps.inputTab.value === 'origineel' ? polygonToolMode.value : null,
  )

  function syncCanUndoMask() {
    canUndoMask.value = maskHistory.canUndo()
  }

  function pushMaskUndoSnapshot() {
    if (!eraserMask.value) return
    maskHistory.push(eraserMask.value)
    syncCanUndoMask()
  }

  function refreshMaskedWorkingImage() {
    const source = deps.originalImageEl.value
    if (!source?.complete || !eraserMask.value || !eraserTouched.value || !maskHasInk(eraserMask.value)) {
      maskedWorkingCanvas.value = null
      maskedWorkingSrc.value = null
      return
    }
    const baked = bakeMaskIntoCanvas(source, eraserMask.value)
    maskedWorkingCanvas.value = baked
    maskedWorkingSrc.value = canvasToDataUrl(baked)
  }

  function undoMaskEdit() {
    if (!eraserMask.value || !maskHistory.undo(eraserMask.value)) return
    eraserTouched.value = maskHasInk(eraserMask.value)
    syncCanUndoMask()
    refreshMaskedWorkingImage()
    deps.preprocessPreview.clearPreview()
    deps.onMaskChanged?.()
  }

  function clearMaskHistory() {
    maskHistory.clear()
    syncCanUndoMask()
  }

  function onMaskUndoKeydown(event: KeyboardEvent) {
    if (deps.flowStep.value !== 'input') return
    if (!isUndoKey(event) || !canUndoMask.value) return
    event.preventDefault()
    undoMaskEdit()
  }

  function ensureEraserMask(width: number, height: number) {
    if (!eraserMask.value || eraserMask.value.length !== width * height) {
      eraserMask.value = createEraserMask(width, height)
    }
  }

  function ensureOcrMask(width: number, height: number) {
    if (!ocrMask.value || ocrMask.value.length !== width * height) {
      ocrMask.value = createEraserMask(width, height)
    }
  }

  function clearMaskAfterCommit(width: number, height: number) {
    maskedWorkingCanvas.value = null
    maskedWorkingSrc.value = null
    clearMaskHistory()
    ensureEraserMask(width, height)
    eraserMask.value?.fill(0)
    eraserTouched.value = false
    clearPolygonToolMode()
  }

  function resetMaskState() {
    maskedWorkingCanvas.value = null
    maskedWorkingSrc.value = null
    clearMaskHistory()
    eraserMask.value = null
    ocrMask.value = null
    ocrMaskedRegions.value = []
    eraserTouched.value = false
    clearPolygonToolMode()
  }

  function preprocessMaskArgs(): PreprocessMaskInput {
    if (eraserTouched.value && maskedWorkingCanvas.value) {
      return { ocrMask: ocrMask.value ?? undefined }
    }
    return {
      eraserMask: eraserMask.value ?? undefined,
      ocrMask: ocrMask.value ?? undefined,
    }
  }

  function clearPolygonToolMode() {
    polygonToolMode.value = null
    polygonDraftPoints.value = []
    eraserEnabled.value = false
    polygonEraserEnabled.value = false
    cropIncludeEnabled.value = false
  }

  function setPolygonToolMode(mode: PolygonToolMode) {
    polygonDraftPoints.value = []
    polygonToolMode.value = mode
    eraserEnabled.value = false
    polygonEraserEnabled.value = mode === 'erase'
    cropIncludeEnabled.value = mode === 'crop-include'
  }

  function toggleCropInclude() {
    if (cropIncludeEnabled.value) {
      clearPolygonToolMode()
      return
    }
    setPolygonToolMode('crop-include')
  }

  function togglePolygonEraser() {
    if (polygonEraserEnabled.value) {
      clearPolygonToolMode()
      return
    }
    setPolygonToolMode('erase')
  }

  function onPolygonPoint(x: number, y: number) {
    polygonDraftPoints.value = [...polygonDraftPoints.value, { x, y }]
  }

  function onPolygonUndoPoint() {
    if (polygonDraftPoints.value.length === 0) return
    polygonDraftPoints.value = polygonDraftPoints.value.slice(0, -1)
  }

  function onPolygonCancel() {
    polygonDraftPoints.value = []
    if (polygonToolMode.value === 'crop-include') {
      return
    }
    clearPolygonToolMode()
  }

  async function onPolygonComplete(points: PolygonPoint[]) {
    if (points.length < 3) return
    const mode = polygonToolMode.value
    const img = deps.originalImageEl.value
    if (!img?.complete || !eraserMask.value) return
    const { width, height } = deps.imageDimensions(img)

    pushMaskUndoSnapshot()
    if (mode === 'crop-include') {
      applyIncludeCropToMask({
        mask: eraserMask.value,
        width,
        height,
        polygon: points,
      })
    } else if (mode === 'erase') {
      applyPolygonErase({
        mask: eraserMask.value,
        width,
        height,
        polygon: points,
      })
    } else {
      return
    }

    eraserTouched.value = true
    polygonDraftPoints.value = []
    clearPolygonToolMode()
    await yieldToMain()
    refreshMaskedWorkingImage()
    deps.preprocessPreview.clearPreview()
  }

  function onResetMask() {
    if (!eraserMask.value) return
    pushMaskUndoSnapshot()
    eraserMask.value.fill(0)
    eraserTouched.value = false
    refreshMaskedWorkingImage()
    deps.preprocessPreview.clearPreview()
    polygonDraftPoints.value = []
    clearPolygonToolMode()
  }

  function toggleEraser() {
    if (eraserEnabled.value) {
      clearPolygonToolMode()
      return
    }
    clearPolygonToolMode()
    eraserEnabled.value = true
  }

  async function onEraseStroke(points: Array<{ x: number; y: number }>, radius: number) {
    const img = deps.originalImageEl.value
    if (!img?.complete || !eraserMask.value) return
    const { width, height } = deps.imageDimensions(img)

    pushMaskUndoSnapshot()
    applyBrushStroke({
      mask: eraserMask.value,
      width,
      height,
      points,
      radius,
    })
    eraserTouched.value = true
    refreshMaskedWorkingImage()
    deps.preprocessPreview.clearPreview()
  }

  async function applyOcrTextMask(regions: OcrTextCandidate[], options?: { replace?: boolean }): Promise<void> {
    const img = deps.originalImageEl.value
    if (!img?.complete) throw new Error('Laad eerst een tekening.')
    const { width, height } = deps.imageDimensions(img)
    ensureOcrMask(width, height)
    if (!ocrMask.value) return

    if (options?.replace !== false) {
      ocrMask.value.fill(0)
    }
    applyRectRegionsToMask({
      mask: ocrMask.value,
      width,
      height,
      regions,
      padding: 2,
    })
    ocrMaskedRegions.value = regions.map((region) => ({ ...region }))
    deps.onOcrMaskChanged?.()
    deps.onMaskChanged?.()
  }

  function clearOcrTextMask(): void {
    ocrMask.value?.fill(0)
    ocrMaskedRegions.value = []
    deps.onOcrMaskChanged?.()
  }

  function hydrateMaskState(args: {
    width: number
    height: number
    eraserMaskBytes?: Uint8Array
    eraserTouched: boolean
    ocrMaskBytes?: Uint8Array
    ocrMaskedRegions?: OcrTextCandidate[]
  }): void {
    const pixelCount = args.width * args.height
    clearMaskHistory()
    ensureEraserMask(args.width, args.height)
    if (!eraserMask.value) return

    if (args.eraserMaskBytes) {
      if (args.eraserMaskBytes.length !== pixelCount) {
        throw new Error('Eraser-mask dimensie komt niet overeen met afbeelding.')
      }
      eraserMask.value.set(args.eraserMaskBytes)
    } else {
      eraserMask.value.fill(0)
    }

    eraserTouched.value = args.eraserTouched
    if (args.ocrMaskBytes) {
      if (args.ocrMaskBytes.length !== pixelCount) {
        throw new Error('OCR-mask dimensie komt niet overeen met afbeelding.')
      }
      ensureOcrMask(args.width, args.height)
      if (ocrMask.value) {
        ocrMask.value.set(args.ocrMaskBytes)
      }
    } else {
      ocrMask.value = null
    }
    ocrMaskedRegions.value = args.ocrMaskedRegions?.map((region) => ({ ...region })) ?? []
    clearPolygonToolMode()
    refreshMaskedWorkingImage()
  }

  return {
    maskedWorkingCanvas,
    maskedWorkingSrc,
    canUndoMask,
    eraserMask,
    ocrMask,
    ocrMaskedRegions,
    eraserTouched,
    eraserEnabled,
    polygonEraserEnabled,
    cropIncludeEnabled,
    polygonToolMode,
    polygonDraftPoints,
    eraserRadius,
    canvasEraserEnabled,
    canvasPolygonToolMode,
    refreshMaskedWorkingImage,
    clearMaskHistory,
    onMaskUndoKeydown,
    ensureEraserMask,
    resetMaskState,
    preprocessMaskArgs,
    clearPolygonToolMode,
    toggleCropInclude,
    togglePolygonEraser,
    onPolygonPoint,
    onPolygonUndoPoint,
    onPolygonCancel,
    onPolygonComplete,
    onResetMask,
    toggleEraser,
    onEraseStroke,
    undoMaskEdit,
    applyOcrTextMask,
    clearOcrTextMask,
    hydrateMaskState,
    clearMaskAfterCommit,
  }
}
